import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { MAX_MXL_ENTRIES, MAX_MXL_XML_BYTES, MAX_XML_BYTES, MUSICXML_PPQ, decodeXmlText, parseMusicXml, unpackMxl } from './parseMusicXml'
import { beatTimes } from '../audio/metronome'
import { parseScoreFile, sniffScoreFile } from './loadScoreFile'
import type { TempoSetting } from '../model/types'

const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }
const Q = MUSICXML_PPQ

/** A partwise score. `parts` are [id, name, measures-xml] triples. */
function score(parts: [string, string, string][]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>${parts.map(([id, name]) => `<score-part id="${id}"><part-name>${name}</part-name></score-part>`).join('')}</part-list>
  ${parts.map(([id, , body]) => `<part id="${id}">${body}</part>`).join('\n')}
</score-partwise>`
}

const n = (step: string, octave: number, dur: number, extra = '') =>
  `<note>${extra.includes('<chord/>') ? '<chord/>' : ''}<pitch><step>${step}</step>${
    /<alter>/.test(extra) ? extra.match(/<alter>[^<]*<\/alter>/)![0] : ''
  }<octave>${octave}</octave></pitch><duration>${dur}</duration>${extra.replace(/<chord\/>|<alter>[^<]*<\/alter>/g, '')}</note>`
const rest = (dur: number, extra = '') => `<note><rest/><duration>${dur}</duration>${extra}</note>`
const attrs = (inner: string) => `<attributes>${inner}</attributes>`
const m = (...children: string[]) => `<measure>${children.join('')}</measure>`
const DIV1 = attrs('<divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time>')

const one = (body: string) => parseMusicXml(score([['P1', 'Flute', body]]), 'x.musicxml', SCALE_1)

describe('parseMusicXml', () => {
  it('reads pitches and durations against <divisions>, at the default 120 bpm', () => {
    const s = one(m(attrs('<divisions>2</divisions>'), n('C', 4, 2), n('E', 4, 1), n('G', 4, 4)))
    expect(s.sourceFormat).toBe('musicxml')
    expect(s.ppq).toBe(Q)
    expect(s.notes.map((x) => [x.pitch, x.startTicks, x.durTicks])).toEqual([
      [60, 0, Q], [64, Q, Q / 2], [67, 1.5 * Q, 2 * Q],
    ])
    expect(s.notes[1].startSec).toBeCloseTo(0.5, 6)
    expect(s.durationSec).toBeCloseTo(1.75, 6)
  })

  it('applies <alter> accidentals', () => {
    const s = one(m(DIV1, n('F', 4, 1, '<alter>1</alter>'), n('B', 3, 1, '<alter>-1</alter>')))
    expect(s.notes.map((x) => x.pitch)).toEqual([66, 58])
  })

  it('advances past rests without making notes', () => {
    const s = one(m(DIV1, rest(2), n('C', 4, 1)))
    expect(s.notes).toHaveLength(1)
    expect(s.notes[0].startTicks).toBe(2 * Q)
  })

  it('starts <chord/> notes with the previous note', () => {
    const s = one(m(DIV1, n('C', 4, 2), n('E', 4, 2, '<chord/>'), n('G', 4, 2, '<chord/>'), n('D', 4, 1)))
    expect(s.notes.map((x) => [x.pitch, x.startTicks])).toEqual([[60, 0], [64, 0], [67, 0], [62, 2 * Q]])
  })

  it('merges tied notes into one event, across a barline', () => {
    const s = one(
      m(DIV1, rest(3), n('C', 4, 1, '<tie type="start"/>')) +
      m(n('C', 4, 2, '<tie type="stop"/><tie type="start"/>'), n('C', 4, 1, '<tie type="stop"/>'), n('D', 4, 1)),
    )
    expect(s.notes.map((x) => [x.pitch, x.startTicks, x.durTicks])).toEqual([
      [60, 3 * Q, 4 * Q], [62, 7 * Q, Q],
    ])
  })

  it('does not merge an un-tied repeat of the same pitch', () => {
    const s = one(m(DIV1, n('C', 4, 1), n('C', 4, 1)))
    expect(s.notes).toHaveLength(2)
  })

  it('makes a voice per staff of a two-staff piano part, left hand first, with hand labels', () => {
    const s = parseMusicXml(score([['P1', 'Piano', m(
      attrs('<divisions>1</divisions><staves>2</staves>'),
      n('C', 5, 4, '<staff>1</staff>'),
      '<backup><duration>4</duration></backup>',
      n('C', 3, 4, '<staff>2</staff>'),
    )]]), 'p.musicxml', SCALE_1)
    expect(s.voices.map((v) => [v.id, v.label])).toEqual([
      ['xml-P1-staff2', 'Left hand'], ['xml-P1-staff1', 'Right hand'],
    ])
    expect(s.voices[0].source).toEqual({ kind: 'xml-part', partId: 'P1', staff: 2 })
    expect(s.voices[0].hue).not.toBe(s.voices[1].hue)
    expect(s.voices.every((v) => v.instrument === 'acoustic_grand_piano' && v.visible && v.audible)).toBe(true)
    const by = (p: number) => s.notes.find((x) => x.pitch === p)!
    expect(by(72)).toMatchObject({ voiceId: 'xml-P1-staff1', startTicks: 0 })
    expect(by(48)).toMatchObject({ voiceId: 'xml-P1-staff2', startTicks: 0 })
    // Every note's voice exists (spec §4 invariant).
    expect(s.notes.every((x) => s.voices.some((v) => v.id === x.voiceId))).toBe(true)
  })

  it('maps several voices within one staff to the same Voice', () => {
    const s = one(m(DIV1,
      n('E', 5, 4, '<voice>1</voice>'), '<backup><duration>4</duration></backup>', n('C', 5, 4, '<voice>2</voice>')))
    expect(s.voices).toHaveLength(1)
    expect(s.voices[0].label).toBe('Flute')
    expect(new Set(s.notes.map((x) => x.voiceId)).size).toBe(1)
  })

  it('honours <backup> and <forward>', () => {
    const s = one(m(DIV1, n('C', 4, 4), '<backup><duration>4</duration></backup>',
      '<forward><duration>2</duration></forward>', n('G', 4, 2)))
    expect(s.notes.map((x) => [x.pitch, x.startTicks])).toEqual([[60, 0], [67, 2 * Q]])
  })

  it('handles a divisions change mid-piece', () => {
    const s = one(m(DIV1, n('C', 4, 4)) + m(attrs('<divisions>4</divisions>'), n('D', 4, 2), n('E', 4, 14)))
    expect(s.notes.map((x) => [x.startTicks, x.durTicks])).toEqual([[0, 4 * Q], [4 * Q, Q / 2], [4.5 * Q, 3.5 * Q]])
  })

  it('builds the tempo map from <sound tempo> and metronome marks', () => {
    const met = (unit: string, per: number, dot = '') =>
      `<direction><direction-type><metronome><beat-unit>${unit}</beat-unit>${dot}<per-minute>${per}</per-minute></metronome></direction-type></direction>`
    const s = one(
      m(DIV1, met('quarter', 60), n('C', 4, 4)) +
      m(`<direction><direction-type><words>faster</words></direction-type><sound tempo="120"/></direction>`, n('D', 4, 4)) +
      m(met('half', 50, '<beat-unit-dot/>'), n('E', 4, 4)),
    )
    expect(s.tempoMap.map((t) => [t.ticks, t.bpm])).toEqual([[0, 60], [4 * Q, 120], [8 * Q, 150]])
    expect(s.notes[1].startSec).toBeCloseTo(4, 6)       // one bar at 60
    expect(s.notes[2].startSec).toBeCloseTo(6, 6)       // plus one bar at 120
  })

  it('prefers <sound tempo> over a metronome mark at the same point', () => {
    const s = one(m(DIV1,
      '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>100</per-minute></metronome></direction-type><sound tempo="90"/></direction>',
      n('C', 4, 4)))
    expect(s.tempoMap.map((t) => t.bpm)).toEqual([90])
  })

  it('reads time signatures into timeSignatures', () => {
    const s = one(m(attrs('<divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time>'), n('C', 4, 3)) +
      m(attrs('<time><beats>6</beats><beat-type>8</beat-type></time>'), n('D', 4, 3)))
    expect(s.timeSignatures).toEqual([
      { ticks: 0, numerator: 3, denominator: 4 }, { ticks: 3 * Q, numerator: 6, denominator: 8 },
    ])
  })

  it('applies <transpose> so notes are at sounding pitch', () => {
    // Bb clarinet: written D5 sounds C5.
    const s = one(m(attrs('<divisions>1</divisions><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>'),
      n('D', 5, 1)))
    expect(s.notes[0].pitch).toBe(72)
    const oct = one(m(attrs('<divisions>1</divisions><transpose><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>'),
      n('C', 5, 1)))
    expect(oct.notes[0].pitch).toBe(60)
  })

  it('skips grace notes, which take no time, even with a bogus <duration>', () => {
    const s = one(m(DIV1,
      '<note><grace slash="yes"/><pitch><step>B</step><octave>3</octave></pitch><duration>4</duration></note>',
      n('C', 4, 1),
      // A grace chord: the <chord/> hangs off the grace note and is skipped too.
      '<note><grace/><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration></note>',
      '<note><grace/><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration></note>',
      n('D', 4, 1), n('F', 4, 1, '<chord/>')))
    expect(s.notes.map((x) => [x.pitch, x.startTicks])).toEqual([[60, 0], [62, Q], [65, Q]])
  })

  it('uses velocity 80 by default and <sound dynamics> when present', () => {
    const s = one(m(DIV1, n('C', 4, 1), '<direction><direction-type><dynamics><p/></dynamics></direction-type><sound dynamics="50"/></direction>',
      n('D', 4, 1), '<note dynamics="100"><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration></note>'))
    expect(s.notes.map((x) => x.velocity)).toEqual([80, 45, 90])
  })

  it('reads the key signature, including minor keys', () => {
    expect(one(m(attrs('<divisions>1</divisions><key><fifths>-3</fifths><mode>minor</mode></key>'), n('C', 4, 1))).keySignature)
      .toEqual({ key: 'C', scale: 'minor' })
    expect(one(m(attrs('<divisions>1</divisions><key><fifths>2</fifths></key>'), n('D', 4, 1))).keySignature)
      .toEqual({ key: 'D', scale: 'major' })
    expect(one(m(DIV1, n('C', 4, 1))).keySignature).toBeNull()
  })

  it('keeps parts aligned bar by bar and labels part voices by part name', () => {
    const s = parseMusicXml(score([
      ['P1', 'Violin', m(DIV1, n('G', 4, 4)) + m(n('A', 4, 4))],
      ['P2', 'Cello', m(DIV1, rest(4)) + m(n('C', 3, 4))],
    ]), 'q.musicxml', SCALE_1)
    expect(s.voices.map((v) => v.label)).toEqual(['Violin', 'Cello'])
    expect(s.notes.find((x) => x.pitch === 48)!.startTicks).toBe(4 * Q)
  })

  it('does not unroll repeats (v1): a repeated bar plays once', () => {
    const s = one(m(DIV1, '<barline location="left"><repeat direction="forward"/></barline>', n('C', 4, 4),
      '<barline location="right"><repeat direction="backward"/></barline>'))
    expect(s.notes).toHaveLength(1)
  })

  it('returns notes sorted by startSec, and retains the raw XML', () => {
    const xml = score([['P1', 'Piano', m(attrs('<divisions>1</divisions><staves>2</staves>'),
      n('C', 5, 1, '<staff>1</staff>'), n('D', 5, 1, '<staff>1</staff>'),
      '<backup><duration>2</duration></backup>', n('C', 3, 2, '<staff>2</staff>'))]])
    const s = parseMusicXml(xml, 'p.musicxml', SCALE_1)
    const starts = s.notes.map((x) => x.startSec)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    expect(s.rawXml).toBe(xml)
  })

  it('refuses timewise scores with a clear message', () => {
    expect(() => parseMusicXml('<score-timewise><part-list/></score-timewise>', 't.xml', SCALE_1))
      .toThrow(/timewise MusicXML is not supported/)
  })

  it('refuses malformed XML and non-score XML', () => {
    expect(() => parseMusicXml('<score-partwise><part', 'bad.xml', SCALE_1)).toThrow(/not well-formed/)
    expect(() => parseMusicXml('<html/>', 'h.xml', SCALE_1)).toThrow(/not a MusicXML score/)
  })
})

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container><rootfiles><rootfile full-path="score/song.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`

describe('unpackMxl', () => {
  const xml = score([['P1', 'Piano', m(DIV1, n('C', 4, 4))]])

  it('reads the rootfile named in META-INF/container.xml', () => {
    const zip = zipSync({
      mimetype: strToU8('application/vnd.recordare.musicxml'),
      'META-INF/container.xml': strToU8(CONTAINER),
      'decoy.xml': strToU8('<not-this/>'),
      'score/song.musicxml': strToU8(xml),
    })
    expect(unpackMxl(zip)).toBe(xml)
  })

  it('falls back to the first .xml outside META-INF when there is no container', () => {
    const zip = zipSync({ 'META-INF/other.xml': strToU8('<x/>'), 'song.xml': strToU8(xml) })
    expect(unpackMxl(zip)).toBe(xml)
  })

  it('refuses a score that claims to inflate past the cap (zip bomb)', () => {
    // Highly compressible, and just over the cap once inflated.
    const big = new Uint8Array(MAX_MXL_XML_BYTES + 1).fill(0x20)
    const zip = zipSync({ 'song.xml': big }, { level: 9 })
    expect(zip.length).toBeLessThan(100_000)
    expect(() => unpackMxl(zip)).toThrow(/larger than 16 MiB/)
  })

  it('refuses an archive with too many entries', () => {
    const files: Record<string, Uint8Array> = {}
    for (let i = 0; i <= MAX_MXL_ENTRIES; i++) files[`f${i}.txt`] = new Uint8Array(0)
    expect(() => unpackMxl(zipSync(files))).toThrow(/more than 1000 files/)
  })

  it('refuses a corrupt archive', () => {
    expect(() => unpackMxl(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]))).toThrow(/not a readable zip/)
  })
})

describe('parseScoreFile (content sniffing)', () => {
  const xml = score([['P1', 'Piano', m(DIV1, n('C', 4, 4))]])
  const buf = (u: Uint8Array) => u.slice().buffer

  it('loads MusicXML text whatever the file is called', () => {
    const s = parseScoreFile(buf(strToU8(xml)), 'renamed.mid', SCALE_1)
    expect(s.sourceFormat).toBe('musicxml')
    expect(s.notes).toHaveLength(1)
  })

  it('loads UTF-8 with a BOM and UTF-16', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8(xml)])
    expect(sniffScoreFile(bom)).toBe('musicxml')
    expect(parseScoreFile(buf(bom), 'a.xml', SCALE_1).notes).toHaveLength(1)
    const u16 = new Uint8Array(2 + xml.length * 2)
    u16[0] = 0xff; u16[1] = 0xfe
    for (let i = 0; i < xml.length; i++) u16[2 + 2 * i] = xml.charCodeAt(i)
    expect(parseScoreFile(buf(u16), 'b.xml', SCALE_1).notes).toHaveLength(1)
  })

  it('loads a .mxl by its zip magic', () => {
    const zip = zipSync({ 'META-INF/container.xml': strToU8(CONTAINER), 'score/song.musicxml': strToU8(xml) })
    expect(sniffScoreFile(zip)).toBe('mxl')
    expect(parseScoreFile(buf(zip), 'a.mxl', SCALE_1).rawXml).toBe(xml)
  })

  it('still loads MIDI, and refuses unknown content', () => {
    expect(sniffScoreFile(strToU8('MThd'))).toBe('midi')
    expect(sniffScoreFile(strToU8('<html><body/></html>'))).toBeNull()
    expect(() => parseScoreFile(buf(new Uint8Array([1, 2, 3])), 'junk.mid', SCALE_1))
      .toThrow(/not a MIDI or MusicXML file/)
  })
})

// A real MusicXML export, if one is present locally (local-fixtures/ is
// gitignored). Skipped when absent; never fetched from the network.
const FIXTURES = join(__dirname, '../../../../../local-fixtures')
const realFiles = existsSync(FIXTURES)
  ? readdirSync(FIXTURES).filter((f) => /\.(musicxml|xml|mxl)$/i.test(f))
  : []
describe.skipIf(realFiles.length === 0)(
  `local-fixtures/ MusicXML exports${realFiles.length ? '' : ' (SKIPPED: none present; the folder is gitignored and optional)'}`, () => {
  it.each(realFiles)('%s parses into sorted, voiced notes', (f) => {
    const bytes = readFileSync(join(FIXTURES, f))
    const s = parseScoreFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), f, SCALE_1)
    expect(s.notes.length).toBeGreaterThan(0)
    const starts = s.notes.map((x) => x.startSec)
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    expect(s.notes.every((x) => s.voices.some((v) => v.id === x.voiceId))).toBe(true)
  })
})

// ---- review fix round 1 ----

const pickupScore = (extraPart = '') => score([
  ['P1', 'Piano', `<measure number="0" implicit="yes">${DIV1}${n('G', 4, 1)}</measure>` +
    m(n('C', 5, 4)) + m(n('D', 5, 4))],
  ...(extraPart ? [['P2', 'Bass', extraPart] as [string, string, string]] : []),
])

describe('parseMusicXml: review fix round 1', () => {
  it('a pickup bar gets its own partial signature, so the downbeat accent lands on bar 1', () => {
    const s = parseMusicXml(pickupScore(), 'pickup.musicxml', SCALE_1)
    expect(s.timeSignatures).toEqual([
      { ticks: 0, numerator: 1, denominator: 4 }, { ticks: Q, numerator: 4, denominator: 4 },
    ])
    // 120 bpm: a quarter is 0.5s. Accents on the pickup, then bar 1 (0.5s) and bar 2 (2.5s).
    const accents = beatTimes(s, SCALE_1).filter((b) => b.accent).map((b) => b.sec)
    expect(accents).toEqual([0, 0.5, 2.5, 4.5])   // 4.5: the final bar line
  })

  it('an empty measure in one part does not stretch a short bar in another', () => {
    const s = parseMusicXml(pickupScore(
      `<measure number="0" implicit="yes">${DIV1}</measure>` + m(n('C', 3, 4)) + m(n('D', 3, 4))),
    'pickup2.musicxml', SCALE_1)
    expect(s.notes.find((x) => x.pitch === 72)!.startTicks).toBe(Q)
    expect(s.notes.find((x) => x.pitch === 48)!.startTicks).toBe(Q)
    expect(s.timeSignatures[0]).toEqual({ ticks: 0, numerator: 1, denominator: 4 })
  })

  it('a bar empty in every part still takes the signature length', () => {
    const s = one(m(DIV1, n('C', 4, 4)) + m() + m(n('D', 4, 4)))
    expect(s.notes.map((x) => x.startTicks)).toEqual([0, 8 * Q])
  })

  it('an untied unison in another voice does not break an open tie', () => {
    const s = one(
      m(DIV1, n('C', 5, 2, '<voice>1</voice>'), n('D', 5, 2, '<tie type="start"/><voice>1</voice>'),
        '<backup><duration>4</duration></backup>',
        n('G', 4, 3, '<voice>2</voice>'), n('D', 5, 1, '<voice>2</voice>')) +
      m(n('D', 5, 2, '<tie type="stop"/><voice>1</voice>'), n('E', 5, 2, '<voice>1</voice>')))
    const d5 = s.notes.filter((x) => x.pitch === 74).map((x) => [x.startTicks, x.durTicks])
    expect(d5).toEqual([[2 * Q, 4 * Q], [3 * Q, Q]])
  })

  it('still merges a tie that crosses voices or staves when no same-voice tie is open', () => {
    const s = parseMusicXml(score([['P1', 'Piano', m(
      attrs('<divisions>1</divisions><staves>2</staves>'),
      n('C', 4, 4, '<tie type="start"/><voice>1</voice><staff>1</staff>')) +
      m(n('C', 4, 4, '<tie type="stop"/><voice>5</voice><staff>2</staff>'))]]), 'x.musicxml', SCALE_1)
    expect(s.notes.map((x) => [x.pitch, x.startTicks, x.durTicks])).toEqual([[60, 0, 8 * Q]])
  })

  it('reads the key at sounding pitch: an untransposed part wins over a Bb clarinet listed first', () => {
    const clar = (fifths: number) => m(attrs(`<divisions>1</divisions><key><fifths>${fifths}</fifths></key><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>`), n('D', 5, 4))
    const both = parseMusicXml(score([
      ['P1', 'Clarinet in Bb', clar(2)],
      ['P2', 'Piano', m(attrs('<divisions>1</divisions><key><fifths>0</fifths></key>'), n('C', 4, 4))],
    ]), 'k.musicxml', SCALE_1)
    expect(both.keySignature).toEqual({ key: 'C', scale: 'major' })
    // Only transposing parts: shift the written key to sounding pitch.
    expect(parseMusicXml(score([['P1', 'Clarinet in Bb', clar(2)]]), 'k.musicxml', SCALE_1).keySignature)
      .toEqual({ key: 'C', scale: 'major' })
    expect(parseMusicXml(score([['P1', 'Clarinet in Bb', clar(0)]]), 'k.musicxml', SCALE_1).keySignature)
      .toEqual({ key: 'Bb', scale: 'major' })
  })

  it('percussion stays visible and audible, is flagged off the keyboard, and uses <midi-unpitched> for pitch', () => {
    const xml = `<score-partwise version="4.0"><part-list>
      <score-part id="P1"><part-name>Piano</part-name></score-part>
      <score-part id="P2"><part-name>Drumset</part-name>
        <score-instrument id="P2-I36"><instrument-name>Bass Drum 1</instrument-name></score-instrument>
        <score-instrument id="P2-I39"><instrument-name>Snare</instrument-name></score-instrument>
        <midi-instrument id="P2-I36"><midi-channel>10</midi-channel><midi-unpitched>37</midi-unpitched></midi-instrument>
        <midi-instrument id="P2-I39"><midi-channel>10</midi-channel><midi-unpitched>39</midi-unpitched></midi-instrument>
      </score-part></part-list>
      <part id="P1">${m(DIV1, n('C', 4, 4))}</part>
      <part id="P2">${m(DIV1,
        '<note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>2</duration><instrument id="P2-I36"/></note>',
        '<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>2</duration><instrument id="P2-I39"/></note>',
        '<note><unpitched><display-step>E</display-step><display-octave>5</display-octave></unpitched><duration>0</duration></note>')}</part>
    </score-partwise>`
    const s = parseMusicXml(xml, 'd.musicxml', SCALE_1)
    const drums = s.voices.find((v) => v.label.startsWith('Drumset'))!
    expect(drums).toMatchObject({ visible: true, audible: true, percussion: true, label: 'Drumset (percussion)' })
    expect(s.voices.find((v) => v.label === 'Piano')!.percussion).toBeFalsy()
    // GM drum keys: midi-unpitched is 1-based, so 37 is key 36 (bass drum 1), 39 is 38 (snare).
    expect(s.notes.filter((x) => x.voiceId === drums.id).map((x) => x.pitch)).toEqual([36, 38])
  })

  it('refuses a plain .xml over the size cap', () => {
    const big = new Uint8Array(MAX_XML_BYTES + 1).fill(0x20)
    big.set(strToU8('<?xml version="1.0"?><score-partwise>'))
    expect(() => parseScoreFile(big.buffer, 'big.xml', SCALE_1)).toThrow(/larger than 16 MiB/)
  })

  it('decodes an ISO-8859-1 file by its XML declaration', () => {
    const head = '<?xml version="1.0" encoding="ISO-8859-1"?><score-partwise><part-list><score-part id="P1"><part-name>Pi'
    const bytes = new Uint8Array([...strToU8(head), 0xe8, ...strToU8('ce</part-name></score-part></part-list><part id="P1"></part></score-partwise>')])
    expect(decodeXmlText(bytes)).toContain('Pièce')
    expect(decodeXmlText(strToU8('<?xml version="1.0" encoding="UTF-8"?><a>é</a>'))).toContain('é')
  })
})

describe('the MuseScore 4-shaped fixture', () => {
  const xml = readFileSync(join(__dirname, '__fixtures__/musescore4-minuet.musicxml'), 'utf8')
  const s = parseMusicXml(xml, 'minuet.musicxml', SCALE_1)
  const RH = 'xml-P1-staff1'
  const LH = 'xml-P1-staff2'
  const at = (voice: string) => s.notes.filter((x) => x.voiceId === voice)
    .map((x) => [x.pitch, x.startTicks, x.durTicks])

  it('reads the prolog, pickup, tempo and key', () => {
    expect(s.timeSignatures).toEqual([
      { ticks: 0, numerator: 1, denominator: 4 }, { ticks: Q, numerator: 4, denominator: 4 },
    ])
    expect(s.tempoMap.map((t) => [t.ticks, t.bpm])).toEqual([[0, 100]])
    expect(s.keySignature).toEqual({ key: 'G', scale: 'major' })
    expect(s.voices.map((v) => v.label)).toEqual(['Left hand', 'Right hand'])
    // Straight through, repeat and voltas not unrolled: 17 quarters at 100 bpm.
    expect(s.durationSec).toBeCloseTo(17 * 0.6, 6)
  })

  it('places every note: voices, ties with a unison, tuplets, a cross-staff note, grace and harmony ignored', () => {
    const T = Q / 3   // a triplet eighth: three in one beat
    expect(at(RH)).toEqual([
      [74, 0, Q],                               // pickup D5
      [67, Q, 2 * Q], [71, Q, Q],               // voice 2 G4, voice 1 B4 (the slashed grace A5 is skipped)
      [72, 2 * Q, Q],
      [71, 3 * Q, Q], [74, 3 * Q, 3 * Q],       // tied D5 spans the barline despite...
      [74, 4 * Q, Q],                           // ...the untied voice-2 D5 unison inside it
      [71, 6 * Q + T, T], [72, 6 * Q, T],       // triplet (sorted by start; C5 then B4)
      [67, 7 * Q, 2 * Q],
      [67, 13 * Q, 4 * Q],                      // volta 2 bar, after the measure rests
    ].sort((a, b) => a[1] - b[1] || a[0] - b[0]))
    expect(at(LH)).toEqual([
      [43, Q, 4 * Q], [50, 3 * Q, 2 * Q], [50, 5 * Q, 2 * Q],
      [69, 6 * Q + 2 * T, T],                   // cross-staff triplet note, voice 1 on staff 2
      [38, 7 * Q, 2 * Q], [43, 13 * Q, 4 * Q],
    ])
  })

  it('accents bar lines, not the pickup grid', () => {
    const accents = beatTimes(s, SCALE_1).filter((b) => b.accent).map((b) => Math.round(b.sec * 1000))
    expect(accents).toEqual([0, 0.6, 3.0, 5.4, 7.8, 10.2].map((x) => Math.round(x * 1000)))
  })

  it('an .mxl whose container lists a PDF rootfile first still opens the MusicXML one', () => {
    const container = `<?xml version="1.0" encoding="UTF-8"?><container><rootfiles>
      <rootfile full-path="minuet.pdf" media-type="application/pdf"/>
      <rootfile full-path="minuet.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
      </rootfiles></container>`
    const zip = zipSync({
      mimetype: strToU8('application/vnd.recordare.musicxml'),
      'META-INF/container.xml': strToU8(container),
      'minuet.pdf': strToU8('%PDF-1.4 not really'),
      'minuet.musicxml': strToU8(xml),
    })
    expect(unpackMxl(zip)).toBe(xml)
  })
})

describe('voice instruments from the score parts (GM program, piano default)', () => {
  const withInstrument = (mi: string) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Solo</part-name><score-instrument id="P1-I1"><instrument-name>x</instrument-name></score-instrument>${mi}</score-part></part-list>
  <part id="P1">${m(DIV1, n('C', 4, 4))}</part>
</score-partwise>`
  const parse = (xml: string) => parseMusicXml(xml, 'x.musicxml', SCALE_1)

  it('maps <midi-program> (1-based) to the GM sound', () => {
    expect(parse(withInstrument('<midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>41</midi-program></midi-instrument>')).voices[0].instrument).toBe('violin')
    expect(parse(withInstrument('<midi-instrument id="P1-I1"><midi-program>1</midi-program></midi-instrument>')).voices[0].instrument).toBe('acoustic_grand_piano')
  })

  it('is the piano without a program, or with a bad one', () => {
    expect(one(m(DIV1, n('C', 4, 4))).voices[0].instrument).toBe('acoustic_grand_piano')
    expect(parse(withInstrument('<midi-instrument id="P1-I1"><midi-program>200</midi-program></midi-instrument>')).voices[0].instrument).toBe('acoustic_grand_piano')
  })

  it('is the drum kit for a channel-10 part', () => {
    expect(parse(withInstrument('<midi-instrument id="P1-I1"><midi-channel>10</midi-channel><midi-program>1</midi-program></midi-instrument>')).voices[0].instrument).toBe('drums')
  })
})
