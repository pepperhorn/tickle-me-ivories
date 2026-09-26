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
// - A part with unpitched (percussion) notes is kept as a voice, hidden and
//   muted by default, so it never lights keys unless the user turns it on.

import { strFromU8, unzipSync } from 'fflate'
import { Key } from 'tonal'
import { buildTempoMap } from '../model/tempoMap'
import { normaliseTimeSignatures } from '../model/timeSignatures'
import { makeVoice, retimeScore } from './parseMidi'
import type { NoteEvent, ScoreDocument, TempoSetting, TimeSigEvent, Voice } from '../model/types'

/** Fixed tick resolution; each part's <divisions> are scaled into it. */
export const MUSICXML_PPQ = 960
/** Zip-bomb guards for .mxl: the score file's decompressed size, and the entry count. */
export const MAX_MXL_XML_BYTES = 16 * 1024 * 1024
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

function midiOf(step: string, octave: number | null, alter: number): number | null {
  const s = STEP[step.toUpperCase()]
  if (s === undefined || octave === null) return null
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

function keySignatureOf(keyEl: Element): ScoreDocument['keySignature'] {
  const fifths = num(kid(keyEl, 'fifths'))
  if (fifths === null || !Number.isInteger(fifths) || fifths < -7 || fifths > 7) return null
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
  velocity: number
  tieStart: boolean
  tieStop: boolean
}
interface Timed { measure: number; off: number }
interface RawTempo extends Timed { bpm: number; rank: number }  // rank: <sound> 0, <metronome> 1
interface PartInfo { id: string; name: string; channel10: boolean }

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
    const channels = kids(sp, 'midi-instrument').map((mi) => num(kid(mi, 'midi-channel')))
    partInfo.set(id, { id, name: partName, channel10: channels.length > 0 && channels.every((c) => c === 10) })
  }

  const parts = kids(root, 'part')
  if (parts.length === 0) throw new Error('the MusicXML score has no parts.')

  const ppq = MUSICXML_PPQ
  const measureLen: number[] = []          // max over parts, per measure index
  const tempos: RawTempo[] = []
  const timeSigs: (Timed & { numerator: number; denominator: number })[] = []
  let keySignature: ScoreDocument['keySignature'] = null
  let keySeen = false
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
            if (k && !keySeen) { keySeen = true; keySignature = keySignatureOf(k) }
            for (const tp of kids(el, 'transpose')) {
              const semis = (num(kid(tp, 'chromatic')) ?? 0) + 12 * (num(kid(tp, 'octave-change')) ?? 0)
              transpose.set(attrNum(tp, 'number') ?? 0, Math.round(semis))
            }
            const time = kid(el, 'time')
            if (time) {
              // Composite beats ("3+2") are summed; an additive sum is still the bar length.
              const beats = text(kid(time, 'beats')).split('+').reduce((a, b) => a + (parseInt(b, 10) || 0), 0)
              const beatType = parseInt(text(kid(time, 'beat-type')), 10)
              if (beats > 0 && beatType > 0) {
                lastSig = { numerator: beats, denominator: beatType }
                if (partIndex === 0) timeSigs.push({ measure: mi, off: cursor, ...lastSig })
              }
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
            let pitch: number | null = null
            const p = kid(el, 'pitch')
            const u = kid(el, 'unpitched')
            if (p) {
              const written = midiOf(text(kid(p, 'step')), num(kid(p, 'octave')), num(kid(p, 'alter')) ?? 0)
              if (written !== null) pitch = written + (transpose.get(staff) ?? transpose.get(0) ?? 0)
            } else if (u) {
              percussion = true
              pitch = midiOf(text(kid(u, 'display-step')), num(kid(u, 'display-octave')), 0)
            }
            if (pitch === null || pitch < 0 || pitch > 127 || dur <= 0) break
            const ties = kids(el, 'tie').map((t) => t.getAttribute('type'))
            const noteDyn = attrNum(el, 'dynamics')
            notes.push({
              measure: mi, off: start, dur, pitch, staff,
              velocity: noteDyn !== null && noteDyn >= 0 ? clampVel(noteDyn) : velocity,
              tieStart: ties.includes('start'), tieStop: ties.includes('stop'),
            })
            break
          }
        }
      }
      // An empty bar in every part still takes its time signature's length.
      const len = maxPos > 0 ? maxPos : (ppq * 4 * lastSig.numerator) / lastSig.denominator
      measureLen[mi] = Math.max(measureLen[mi] ?? 0, len)
    })
    perPart.push({ id, notes, staves, percussion })
  })

  // Shared measure starts keep the parts aligned bar by bar.
  const measureStart: number[] = []
  let acc = 0
  for (let i = 0; i < measureLen.length; i++) { measureStart[i] = acc; acc += measureLen[i] ?? 0 }
  const abs = (t: Timed) => Math.round(measureStart[t.measure] + t.off)

  // Tempo: a <sound tempo> beats a metronome mark at the same tick; earlier parts win.
  const byTick = new Map<number, RawTempo>()
  for (const t of tempos) {
    const k = abs(t)
    const cur = byTick.get(k)
    if (!cur || t.rank < cur.rank) byTick.set(k, t)
  }
  const tempoMap = buildTempoMap([...byTick].map(([ticks, t]) => ({ ticks, bpm: t.bpm })), ppq)
  const timeSignatures = normaliseTimeSignatures(timeSigs.map((s): TimeSigEvent => ({
    ticks: abs(s), numerator: s.numerator, denominator: s.denominator,
  })))

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
        })
      }
    }
  }
  const voices: Voice[] = voiceDefs.map((d, i) => {
    const v = makeVoice(d.id, d.label, i, voiceDefs.length)
    v.source = { kind: 'xml-part', partId: d.partId, staff: d.staff }
    if (d.percussion) { v.visible = false; v.audible = false }
    return v
  })
  notes.sort((a, b) => a.startTicks - b.startTicks || a.pitch - b.pitch)

  const score: ScoreDocument = {
    id: '', name, ppq, tempoMap, voices, notes,
    durationSec: 0, sourceFormat: 'musicxml', timeSignatures, keySignature, rawXml: xml,
  }
  return retimeScore(score, setting)
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

/** Merges tied notes (same part and pitch, stop meeting the open start) into one. */
function mergeTies(list: Placed[]): Placed[] {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  const open = new Map<number, Placed>()
  const out: Placed[] = []
  for (const n of sorted) {
    const prev = n.tieStop ? open.get(n.pitch) : undefined
    let cur: Placed
    if (prev && Math.abs(prev.end - n.start) <= 2) {
      prev.end = Math.max(prev.end, n.end)
      cur = prev
    } else {
      cur = { ...n }
      out.push(cur)
    }
    if (n.tieStart) open.set(n.pitch, cur)
    else open.delete(n.pitch)
  }
  return out
}

// ---- bytes: text decoding and .mxl ----

/** Decodes XML bytes, honouring a UTF-16 byte-order mark (UTF-8 otherwise). */
export function decodeXmlText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes)
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
    const rf = doc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path')
    if (rf && sizes.has(rf)) target = rf
  }
  target ??= names.find((n) => !n.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(n))
  if (!target) throw new Error('the .mxl archive holds no MusicXML score.')
  const t = target
  const out = pickSafe((n) => n === t)[t]
  if (!out || out.length > MAX_MXL_XML_BYTES) throw new Error('the score inside the .mxl could not be read.')
  return decodeXmlText(out)
}
