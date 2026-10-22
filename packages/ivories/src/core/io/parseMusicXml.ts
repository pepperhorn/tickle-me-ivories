// MusicXML (partwise .xml / .musicxml, and zipped .mxl) -> ScoreDocument.
// Spec §6.2 (2026-09-12 design). Pure apart from DOMParser, which exists in
// every browser and in jsdom; a caller may inject its own.
//
// v1 decisions (see the task report for the reasoning):
// - Each part + staff with at least one sounding note becomes a Voice.
// - Grace notes are skipped (they carry no <duration>, so they have no
//   musical time of their own); cue notes advance time but are not played.
// - Repeats and endings are NOT unrolled: the score plays straight through.
// - Ties (<tie type="start|stop">, the sounding element, not <tied>) are
//   merged into one NoteEvent per tied chain.
// - Velocity is 80 unless a <sound dynamics> (or a note's own dynamics
//   attribute) says otherwise: dynamics is a percentage of forte, and forte is
//   MIDI velocity 90 (MusicXML's own definition).
// - A part with unpitched (percussion) notes, or only channel-10 instruments,
//   is kept as a visible, audible voice flagged `percussion` (spec §6.1): its
//   bars fall on the roll but it never lights keyboard keys. Its pitch is the
//   instrument's <midi-unpitched> (a GM drum key) when present.
// - Time signatures follow part 1's bar grid. A bar whose real length differs
//   from its signature (a pickup, a short final bar) gets a signature of its
//   own that exactly spans it, so the metronome's accents stay on bar lines.

import { strFromU8, unzipSync } from 'fflate'
import { Key } from 'tonal'
import { buildTempoMap } from '../model/tempoMap'
import { normaliseTimeSignatures } from '../model/timeSignatures'
import { makeVoice, retimeScore } from './parseMidi'
import type { NoteEvent, ScoreDocument, TempoSetting, TimeSigEvent, Voice } from '../model/types'

/** Fixed tick resolution; each part's <divisions> are scaled into it. */
export const MUSICXML_PPQ = 960
/** The largest score XML accepted, plain or (decompressed) from inside an .mxl. */
export const MAX_XML_BYTES = 16 * 1024 * 1024
/** Zip-bomb guards for .mxl: the score file's decompressed size, and the entry count. */
export const MAX_MXL_XML_BYTES = MAX_XML_BYTES
export const MAX_MXL_ENTRIES = 1000

const DEFAULT_VELOCITY = 80
/** MusicXML: dynamics="100" is forte, which is MIDI velocity 90. */
const FORTE_VELOCITY = 90

export const MUSICXML_FILE_ACCEPT =
  '.xml,.musicxml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,application/xml,text/xml'

type XmlParse = (xml: string) => Document

/** An .mxl refusal whose message is already user-facing. */
class MxlError extends Error {}
const defaultParse: XmlParse = (xml) => new DOMParser().parseFromString(xml, 'application/xml')

// ---- small DOM helpers (direct children only; MusicXML has no namespace) ----

function kids(el: Element, name?: string): Element[] {
  const out: Element[] = []
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
    if (!name || c.tagName === name) out.push(c)
  }
  return out
}
const kid = (el: Element | null | undefined, name: string): Element | null =>
  el ? kids(el, name)[0] ?? null : null
const text = (el: Element | null): string => el?.textContent?.trim() ?? ''
function num(el: Element | null): number | null {
  const n = parseFloat(text(el))
  return Number.isFinite(n) ? n : null
}
function attrNum(el: Element | null, name: string): number | null {
  const v = el?.getAttribute(name)
  if (v == null) return null
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

// ---- pitch, tempo ----

const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** "F" + 1 -> "F#", "B" + -1 -> "Bb"; undefined for a quarter-tone or an alter beyond a double. */
function spellingOf(step: string, alter: number): string | undefined {
  const s = step.toUpperCase()
  if (!(s in STEP) || !Number.isInteger(alter) || Math.abs(alter) > 2) return undefined
  return s + (alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter))
}

function midiOf(step: string, octave: number | null, alter: number): number | null {
  const s = STEP[step.toUpperCase()]
  if (s === undefined || octave === null) return null
  // <alter> may be fractional (0.5 = a quarter-tone sharp). MIDI keys are
  // semitones, so a quarter tone rounds to the nearest key (half away from 0).
  return (octave + 1) * 12 + s + Math.round(alter)
}

const BEAT_UNIT_QUARTERS: Record<string, number> = {
  maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5,
  '16th': 0.25, '32nd': 0.125, '64th': 0.0625, '128th': 0.03125,
}

/** Quarter-note BPM from a <metronome> of the form beat-unit (+dots) = per-minute. */
function metronomeBpm(m: Element): number | null {
  const units = kids(m, 'beat-unit')
  const per = kid(m, 'per-minute')
  if (units.length !== 1 || !per) return null   // metric modulations etc. are skipped
  const q = BEAT_UNIT_QUARTERS[text(units[0])]
  const match = /\d+(\.\d+)?/.exec(text(per))
  if (!q || !match) return null
  let quarters = q
  let add = q
  for (let d = kids(m, 'beat-unit-dot').length; d > 0; d--) { add /= 2; quarters += add }
  const bpm = parseFloat(match[0]) * quarters
  return bpm > 0 ? bpm : null
}

const FIFTHS_MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']

/**
 * The key at SOUNDING pitch. A written key in a transposing part is shifted
 * by its chromatic interval: each semitone is 7 fifths (mod 12), normalised
 * back into -7..7 (so written D major on a Bb clarinet, -2, is C major).
 */
function keySignatureOf(keyEl: Element, chromatic = 0): ScoreDocument['keySignature'] {
  const written = num(kid(keyEl, 'fifths'))
  if (written === null || !Number.isInteger(written) || written < -7 || written > 7) return null
  let fifths = written + ((((chromatic * 7) % 12) + 12) % 12)
  while (fifths > 7) fifths -= 12
  while (fifths < -7) fifths += 12
  const major = FIFTHS_MAJOR[fifths + 7]
  const minor = text(kid(keyEl, 'mode')) === 'minor'
  return minor
    ? { key: Key.majorKey(major).minorRelative, scale: 'minor' }
    : { key: major, scale: 'major' }
}

// ---- the walk ----

interface RawNote {
  measure: number
  off: number          // ticks (float) from the measure start
  dur: number          // ticks (float)
  pitch: number
  staff: number
  voice: string        // <voice>, '1' when absent: ties are matched within it
  velocity: number
  tieStart: boolean
  tieStop: boolean
  /** Written pitch class ("F#", "Bb"), untransposed parts only. */
  spelling?: string
}
interface Timed { measure: number; off: number }
interface RawTempo extends Timed { bpm: number; rank: number }  // rank: <sound> 0, <metronome> 1
interface PartInfo {
  id: string
  name: string
  channel10: boolean
  /** <midi-unpitched> (1-based) by midi-instrument id. */
  unpitched: Map<string, number>
}

/**
 * Parses MusicXML text. Throws an Error with a user-facing message for
 * content it cannot use (not XML, timewise, no parts).
 */
export function parseMusicXml(
  xml: string, name: string, setting: TempoSetting, parse: XmlParse = defaultParse,
): ScoreDocument {
  const doc = parse(xml)
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('the MusicXML is not well-formed XML.')
  }
  const root = doc.documentElement
  if (root.tagName === 'score-timewise') {
    throw new Error('timewise MusicXML is not supported. Export the score as partwise MusicXML (the usual kind).')
  }
  if (root.tagName !== 'score-partwise') throw new Error('this XML file is not a MusicXML score.')

  const partInfo = new Map<string, PartInfo>()
  for (const sp of kids(kid(root, 'part-list') ?? root, 'score-part')) {
    const id = sp.getAttribute('id') ?? ''
    const partName = text(kid(sp, 'part-name')) || text(kid(sp, 'part-abbreviation')) || id
    const mis = kids(sp, 'midi-instrument')
    const channels = mis.map((mi) => num(kid(mi, 'midi-channel')))
    const unpitched = new Map<string, number>()
    for (const mi of mis) {
      const u = num(kid(mi, 'midi-unpitched'))
      if (u !== null && u >= 1 && u <= 128) unpitched.set(mi.getAttribute('id') ?? '', Math.round(u))
    }
    partInfo.set(id, {
      id, name: partName, unpitched,
      channel10: channels.length > 0 && channels.every((c) => c === 10),
    })
  }

  const parts = kids(root, 'part')
  if (parts.length === 0) throw new Error('the MusicXML score has no parts.')

  const ppq = MUSICXML_PPQ
  const measureLen: number[] = []          // max content length over parts, per measure index
  const tempos: RawTempo[] = []
  /** Part 1's signature in force in each measure: the bar grid. */
  const sigAt: { numerator: number; denominator: number }[] = []
  /** Each part's first <key>, and the part's chromatic transposition (null = none). */
  const keys: { el: Element; chromatic: number | null }[] = []
  const perPart: { id: string; notes: RawNote[]; staves: number; percussion: boolean }[] = []

  parts.forEach((part, partIndex) => {
    const id = part.getAttribute('id') ?? `P${partIndex + 1}`
    const notes: RawNote[] = []
    let divisions = 1
    let staves = 1
    let velocity = DEFAULT_VELOCITY
    let percussion = partInfo.get(id)?.channel10 ?? false
    /** Chromatic transposition written -> sounding, by staff (0 = every staff). */
    const transpose = new Map<number, number>()
    let lastSig = { numerator: 4, denominator: 4 }
    let firstKey: Element | null = null
    let chromatic: number | null = null
    const unpitchedOf = partInfo.get(id)?.unpitched ?? new Map<string, number>()

    kids(part, 'measure').forEach((measure, mi) => {
      let cursor = 0
      let maxPos = 0
      let lastStart = 0
      const toTicks = (d: number | null) => ((d ?? 0) * ppq) / divisions
      const advance = (t: number) => { cursor = Math.max(0, cursor + t); maxPos = Math.max(maxPos, cursor) }
      const readSound = (s: Element | null, at: number) => {
        if (!s) return
        const t = attrNum(s, 'tempo')
        if (t !== null && t > 0) tempos.push({ measure: mi, off: at, bpm: t, rank: 0 })
        const dyn = attrNum(s, 'dynamics')
        if (dyn !== null && dyn >= 0) velocity = clampVel(dyn)
      }

      for (const el of kids(measure)) {
        switch (el.tagName) {
          case 'attributes': {
            const d = num(kid(el, 'divisions'))
            if (d !== null && d > 0) divisions = d
            const st = num(kid(el, 'staves'))
            if (st !== null && st >= 1) staves = Math.floor(st)
            const k = kid(el, 'key')
            if (k && !firstKey) firstKey = k
            for (const tp of kids(el, 'transpose')) {
              const c = num(kid(tp, 'chromatic')) ?? 0
              if (chromatic === null) chromatic = Math.round(c)
              const semis = c + 12 * (num(kid(tp, 'octave-change')) ?? 0)
              transpose.set(attrNum(tp, 'number') ?? 0, Math.round(semis))
            }
            const time = kid(el, 'time')
            if (time) {
              // Composite beats ("3+2") are summed; an additive sum is still the bar length.
              const beats = text(kid(time, 'beats')).split('+').reduce((a, b) => a + (parseInt(b, 10) || 0), 0)
              const beatType = parseInt(text(kid(time, 'beat-type')), 10)
              if (beats > 0 && beatType > 0) lastSig = { numerator: beats, denominator: beatType }
            }
            break
          }
          case 'backup': advance(-toTicks(num(kid(el, 'duration')))); break
          case 'forward': advance(toTicks(num(kid(el, 'duration')))); break
          case 'sound': readSound(el, cursor); break
          case 'direction': {
            const at = Math.max(0, cursor + toTicks(num(kid(el, 'offset'))))
            for (const dt of kids(el, 'direction-type')) {
              const m = kid(dt, 'metronome')
              const bpm = m ? metronomeBpm(m) : null
              if (bpm !== null) tempos.push({ measure: mi, off: at, bpm, rank: 1 })
            }
            readSound(kid(el, 'sound'), at)
            break
          }
          case 'note': {
            if (kid(el, 'grace')) break                       // no time of its own: skipped
            const isChord = !!kid(el, 'chord')
            const dur = toTicks(num(kid(el, 'duration')))
            const start = isChord ? lastStart : cursor
            if (!isChord) { lastStart = cursor; advance(dur) }
            if (kid(el, 'rest') || kid(el, 'cue')) break
            const staff = Math.max(1, Math.floor(num(kid(el, 'staff')) ?? 1))
            const voice = text(kid(el, 'voice')) || '1'
            let pitch: number | null = null
            let spelling: string | undefined
            const p = kid(el, 'pitch')
            const u = kid(el, 'unpitched')
            if (p) {
              const alter = num(kid(p, 'alter')) ?? 0
              const written = midiOf(text(kid(p, 'step')), num(kid(p, 'octave')), alter)
              const shift = transpose.get(staff) ?? transpose.get(0) ?? 0
              if (written !== null) pitch = written + shift
              // The written name is only the sounding name in an untransposed part.
              if (written !== null && shift === 0) spelling = spellingOf(text(kid(p, 'step')), alter)
            } else if (u) {
              percussion = true
              // A GM drum key from the note's instrument (or the part's only
              // one), else the notated display position.
              const inst = kid(el, 'instrument')?.getAttribute('id')
              const mu = inst != null ? unpitchedOf.get(inst)
                : unpitchedOf.size === 1 ? [...unpitchedOf.values()][0] : undefined
              pitch = mu !== undefined ? mu - 1
                : midiOf(text(kid(u, 'display-step')), num(kid(u, 'display-octave')), 0)
            }
            if (pitch === null || pitch < 0 || pitch > 127 || dur <= 0) break
            const ties = kids(el, 'tie').map((t) => t.getAttribute('type'))
            const noteDyn = attrNum(el, 'dynamics')
            notes.push({
              measure: mi, off: start, dur, pitch, staff, voice, spelling,
              velocity: noteDyn !== null && noteDyn >= 0 ? clampVel(noteDyn) : velocity,
              tieStart: ties.includes('start'), tieStop: ties.includes('stop'),
            })
            break
          }
        }
      }
      // An empty measure contributes 0: it must not stretch another part's short bar.
      measureLen[mi] = Math.max(measureLen[mi] ?? 0, maxPos)
      if (partIndex === 0) sigAt[mi] = lastSig
    })
    if (firstKey) keys.push({ el: firstKey, chromatic })
    perPart.push({ id, notes, staves, percussion })
  })

  // An untransposed part's key is already at sounding pitch; else shift one.
  const keySrc = keys.find((k) => !k.chromatic) ?? keys[0]
  const keySignature = keySrc ? keySignatureOf(keySrc.el, keySrc.chromatic ?? 0) : null

  // Shared measure starts keep the parts aligned bar by bar. A bar empty in
  // every part takes part 1's signature length.
  const barLen = (sig: { numerator: number; denominator: number }) => (ppq * 4 * sig.numerator) / sig.denominator
  const measureStart: number[] = []
  const timeSigs: TimeSigEvent[] = []
  let acc = 0
  let sig = { numerator: 4, denominator: 4 }
  for (let i = 0; i < measureLen.length; i++) {
    sig = sigAt[i] ?? sig
    // Empty in every part: the signature's length. Within half a tick of it
    // (float drift from odd divisions): exactly it, so no spurious partial bar.
    if (!(measureLen[i] > 0) || Math.abs(measureLen[i] - barLen(sig)) < 0.5) measureLen[i] = barLen(sig)
    measureStart[i] = acc
    const at = Math.round(acc)
    const partial = measureLen[i] !== barLen(sig) ? spanningSig(measureLen[i], sig.denominator, ppq) : null
    const eff = partial ?? sig
    const prev = timeSigs[timeSigs.length - 1]
    if (!prev || prev.numerator !== eff.numerator || prev.denominator !== eff.denominator || partial) {
      timeSigs.push({ ticks: at, ...eff })
    }
    acc += measureLen[i]
  }
  const abs = (t: Timed) => Math.round(measureStart[t.measure] + t.off)

  // Tempo: a <sound tempo> beats a metronome mark at the same tick; earlier parts win.
  const byTick = new Map<number, RawTempo>()
  for (const t of tempos) {
    const k = abs(t)
    const cur = byTick.get(k)
    if (!cur || t.rank < cur.rank) byTick.set(k, t)
  }
  const tempoMap = buildTempoMap([...byTick].map(([ticks, t]) => ({ ticks, bpm: t.bpm })), ppq)
  const timeSignatures = normaliseTimeSignatures(timeSigs)

  // Notes, ties merged, grouped into part+staff voices.
  const notes: NoteEvent[] = []
  const voiceDefs: { id: string; label: string; partId: string; staff: number; percussion: boolean }[] = []
  const multiPart = perPart.length > 1
  let nextId = 0
  for (const pp of perPart) {
    const info = partInfo.get(pp.id)
    const partName = info?.name || pp.id
    const merged = mergeTies(pp.notes.map((n) => ({ ...n, start: abs(n), end: abs(n) + n.dur })))
    const staves = merged.reduce((mx, n) => Math.max(mx, n.staff), pp.staves)
    const used = new Set(merged.map((n) => n.staff))
    // A two-staff part lists its left hand first, as the MIDI hand split does.
    const order = staves === 2 ? [2, 1] : Array.from({ length: staves }, (_, i) => i + 1)
    for (const staff of order) {
      if (!used.has(staff)) continue
      const id = `xml-${pp.id}-staff${staff}`
      voiceDefs.push({
        id, partId: pp.id, staff, percussion: pp.percussion,
        label: voiceLabel(partName, staff, staves, multiPart) + (pp.percussion ? ' (percussion)' : ''),
      })
      for (const n of merged) {
        if (n.staff !== staff) continue
        notes.push({
          id: nextId++, pitch: n.pitch,
          startTicks: n.start, durTicks: Math.max(1, Math.round(n.end) - n.start),
          startSec: 0, endSec: 0, velocity: n.velocity, voiceId: id,
          ...(n.spelling ? { spelling: n.spelling } : {}),
        })
      }
    }
  }
  const voices: Voice[] = voiceDefs.map((d, i) => {
    const v = makeVoice(d.id, d.label, i, voiceDefs.length)
    v.source = { kind: 'xml-part', partId: d.partId, staff: d.staff }
    if (d.percussion) v.percussion = true
    return v
  })
  notes.sort((a, b) => a.startTicks - b.startTicks || a.pitch - b.pitch)

  const score: ScoreDocument = {
    id: '', name, ppq, tempoMap, voices, notes,
    durationSec: 0, sourceFormat: 'musicxml', timeSignatures, keySignature, rawXml: xml,
  }
  return retimeScore(score, setting)
}

/**
 * A signature that spans exactly `len` ticks (a pickup or short bar), using
 * the bar's own denominator or a finer power of two; null if none fits.
 */
function spanningSig(len: number, denominator: number, ppq: number) {
  for (let d = denominator; d <= 128; d *= 2) {
    const n = (len * d) / (ppq * 4)
    if (Math.abs(n - Math.round(n)) < 1e-6 && Math.round(n) >= 1) return { numerator: Math.round(n), denominator: d }
  }
  return null
}

function clampVel(dynamicsPercent: number): number {
  return Math.min(127, Math.max(1, Math.round((dynamicsPercent * FORTE_VELOCITY) / 100)))
}

function voiceLabel(partName: string, staff: number, staves: number, multiPart: boolean): string {
  if (staves === 2) {
    const hand = staff === 1 ? 'Right hand' : 'Left hand'
    return multiPart ? `${partName} (${hand.toLowerCase()})` : hand
  }
  if (staves > 2) return `${partName} staff ${staff}`
  return partName
}

type Placed = RawNote & { start: number; end: number }

/**
 * Merges tied notes into one. An open tie is keyed by voice + pitch, so an
 * untied unison in another voice (piano, SATB) neither closes nor extends
 * it. A stop with no same-voice tie open falls back to any open tie of that
 * pitch ending where it starts, which covers cross-voice and cross-staff ties.
 */
function mergeTies(list: Placed[]): Placed[] {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  const open = new Map<string, Placed>()
  const out: Placed[] = []
  const meets = (p: Placed, n: Placed) => Math.abs(p.end - n.start) <= 2
  for (const n of sorted) {
    const key = `${n.voice}:${n.pitch}`
    let prevKey: string | null = null
    if (n.tieStop) {
      const same = open.get(key)
      if (same && meets(same, n)) prevKey = key
      else {
        for (const [k, p] of open) {
          if (p.pitch === n.pitch && meets(p, n)) { prevKey = k; break }
        }
      }
    }
    let cur: Placed
    if (prevKey !== null) {
      cur = open.get(prevKey)!
      open.delete(prevKey)
      cur.end = Math.max(cur.end, n.end)
    } else {
      cur = { ...n }
      out.push(cur)
    }
    if (n.tieStart) open.set(key, cur)
    else if (prevKey === null) open.delete(key)   // only this voice's own stale tie
  }
  return out
}

// ---- bytes: text decoding and .mxl ----

/** Decodes XML bytes, honouring a UTF-16 byte-order mark (UTF-8 otherwise). */
export function decodeXmlText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
  // No BOM: honour a single-byte encoding named in the XML declaration.
  const decl = /^\s*<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(
    String.fromCharCode(...bytes.subarray(0, 200)))
  const enc = decl?.[1].toLowerCase()
  if (enc && /^(iso-?8859-1|latin-?1|l1|windows-1252|cp1252|us-ascii|ascii)$/.test(enc)) {
    return new TextDecoder('windows-1252').decode(bytes)   // WHATWG's superset of Latin-1
  }
  return new TextDecoder('utf-8').decode(bytes)   // strips a UTF-8 BOM
}

/**
 * Unpacks a compressed MusicXML (.mxl) and returns the score's XML text: the
 * rootfile named in META-INF/container.xml, else the first .xml/.musicxml not
 * under META-INF. Refuses archives with too many entries, or whose score file
 * claims more than MAX_MXL_XML_BYTES (fflate sizes its output buffer from that
 * claim, so a lying header cannot inflate past it either).
 */
export function unpackMxl(bytes: Uint8Array, parse: XmlParse = defaultParse): string {
  const names: string[] = []
  const sizes = new Map<string, number>()
  const pick = (want: (n: string) => boolean) => unzipSync(bytes, {
    filter: (f) => {
      if (names.length >= MAX_MXL_ENTRIES && !sizes.has(f.name)) {
        throw new MxlError(`the .mxl archive has more than ${MAX_MXL_ENTRIES} files.`)
      }
      if (!sizes.has(f.name)) { names.push(f.name); sizes.set(f.name, f.originalSize) }
      if (!want(f.name)) return false
      if (f.originalSize > MAX_MXL_XML_BYTES) {
        throw new MxlError(`the score inside the .mxl is larger than ${MAX_MXL_XML_BYTES / (1024 * 1024)} MiB.`)
      }
      return true
    },
  })
  const pickSafe = (want: (n: string) => boolean) => {
    try {
      return pick(want)
    } catch (e) {
      if (e instanceof MxlError) throw e
      throw new Error('the .mxl file is not a readable zip archive.')
    }
  }
  const files = pickSafe((n) => n === 'META-INF/container.xml')
  let target: string | undefined
  const container = files['META-INF/container.xml']
  if (container) {
    const doc = parse(strFromU8(container))
    // A container may list other renderings (a PDF) too: take the first
    // rootfile that is MusicXML by media type or extension.
    for (const r of Array.from(doc.getElementsByTagName('rootfile'))) {
      const path = r.getAttribute('full-path')
      const type = r.getAttribute('media-type') ?? ''
      const isXml = /musicxml|\/xml$/.test(type) || (!type && /\.(xml|musicxml)$/i.test(path ?? ''))
      if (path && isXml && sizes.has(path)) { target = path; break }
    }
  }
  target ??= names.find((n) => !n.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(n))
  if (!target) throw new Error('the .mxl archive holds no MusicXML score.')
  const t = target
  const out = pickSafe((n) => n === t)[t]
  if (!out || out.length > MAX_MXL_XML_BYTES) throw new Error('the score inside the .mxl could not be read.')
  return decodeXmlText(out)
}
