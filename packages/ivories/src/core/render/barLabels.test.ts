import { describe, it, expect } from 'vitest'
import { NoteBarLabelCache, barLabelPx, displayAccidentals, noteBarLabel, noteBarLabelsOf } from './barLabels'
import { parseMusicXml } from '../io/parseMusicXml'
import type { NoteEvent } from '../model/types'

const C = { tonic: 'C', scale: 'major' } as const
const F = { tonic: 'F', scale: 'major' } as const
const D = { tonic: 'D', scale: 'major' } as const

describe('noteBarLabel (user ruling 2026-10-22)', () => {
  it('pitch class only by default: no MIDI number, no octave', () => {
    expect(noteBarLabel({ pitch: 60 }, C, 'pitch')).toBe('C')
    expect(noteBarLabel({ pitch: 69 }, C, 'pitch')).toBe('A')
  })

  it('without a spelling: sharps in C (and with no key), flats in a flat key, the key own spellings first', () => {
    expect(noteBarLabel({ pitch: 66 }, C, 'pitch')).toBe('F♯')
    expect(noteBarLabel({ pitch: 70 }, C, 'pitch')).toBe('A♯')
    expect(noteBarLabel({ pitch: 70 }, F, 'pitch')).toBe('B♭')
    expect(noteBarLabel({ pitch: 66 }, D, 'pitch')).toBe('F♯')
  })

  it('the score spelling wins when MusicXML gave one', () => {
    expect(noteBarLabel({ pitch: 70, spelling: 'Bb' }, C, 'pitch')).toBe('B♭')
    expect(noteBarLabel({ pitch: 66, spelling: 'Gb' }, D, 'pitch')).toBe('G♭')
    expect(noteBarLabel({ pitch: 60, spelling: 'B#' }, C, 'pitch')).toBe('B♯')
    // A spelling that does not match the pitch (corrupt data) is ignored.
    expect(noteBarLabel({ pitch: 61, spelling: 'D' }, C, 'pitch')).toBe('C♯')
  })

  it("'pitch-octave' adds the octave of the letter; 'none' is null", () => {
    expect(noteBarLabel({ pitch: 60 }, C, 'pitch-octave')).toBe('C4')
    expect(noteBarLabel({ pitch: 66 }, C, 'pitch-octave')).toBe('F♯4')
    expect(noteBarLabel({ pitch: 59, spelling: 'Cb' }, C, 'pitch-octave')).toBe('C♭4')
    expect(noteBarLabel({ pitch: 60, spelling: 'B#' }, C, 'pitch-octave')).toBe('B♯3')
    expect(noteBarLabel({ pitch: 60 }, C, 'none')).toBeNull()
  })

  it('displayAccidentals and noteBarLabelsOf', () => {
    expect(['C', 'F#', 'Bb', 'C##', 'Ebb'].map(displayAccidentals)).toEqual(['C', 'F♯', 'B♭', 'C𝄪', 'E𝄫'])
    expect([undefined, 'pitch', 'pitch-octave', 'none', 'midi'].map(noteBarLabelsOf)).toEqual(['pitch', 'pitch', 'pitch-octave', 'none', 'pitch'])
  })

  it('the cache returns the same label per note and resets on a key or mode change', () => {
    const cache = new NoteBarLabelCache()
    const n = { id: 1, pitch: 70, startTicks: 0, durTicks: 1, startSec: 0, endSec: 1, velocity: 90, voiceId: 'v' } as NoteEvent
    expect(cache.get(n, C, 'pitch')).toBe('A♯')
    expect(cache.get(n, F, 'pitch')).toBe('B♭')
    expect(cache.get(n, F, 'pitch-octave')).toBe('B♭4')
    expect(cache.get(n, F, 'none')).toBeNull()
  })
})

describe('barLabelPx', () => {
  it('scales with the bar width up to 20px', () => {
    expect(barLabelPx('C', 20, 100, 'vertical')).toBeCloseTo(14, 6)
    expect(barLabelPx('C', 60, 100, 'vertical')).toBe(20)
  })

  it('is 0 (hidden) when the bar is too narrow or too short to read', () => {
    expect(barLabelPx('C', 8, 100, 'vertical')).toBe(0)
    expect(barLabelPx('C', 20, 10, 'vertical')).toBe(0)
  })

  it('horizontal: the text runs along the bar, so a short bar hides it', () => {
    expect(barLabelPx('F♯', 20, 40, 'horizontal')).toBeGreaterThan(0)
    expect(barLabelPx('F♯', 20, 12, 'horizontal')).toBe(0)
  })
})

describe('MusicXML spelling reaches NoteEvent.spelling', () => {
  const xml = (part: string) => `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
<part id="P1"><measure number="1">${part}</measure></part></score-partwise>`
  const note = (step: string, alter: number | null, octave = 4) =>
    `<note><pitch><step>${step}</step>${alter === null ? '' : `<alter>${alter}</alter>`}<octave>${octave}</octave></pitch><duration>1</duration></note>`

  it('keeps the written step and alter for an untransposed part', () => {
    const s = parseMusicXml(xml(`<attributes><divisions>1</divisions></attributes>${note('G', -1)}${note('F', 1)}${note('C', null)}${note('B', 1, 3)}`), 'x.musicxml', { mode: 'scale', scale: 1 })
    const byStart = [...s.notes].sort((a, b) => a.startTicks - b.startTicks).map((n) => [n.pitch, n.spelling])
    expect(byStart).toEqual([[66, 'Gb'], [66, 'F#'], [60, 'C'], [60, 'B#']])
  })

  it('leaves it off a transposing part (the written name is not the sounding one)', () => {
    const s = parseMusicXml(xml(`<attributes><divisions>1</divisions><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>${note('D', null, 5)}`), 'x.musicxml', { mode: 'scale', scale: 1 })
    expect(s.notes[0].spelling).toBeUndefined()
  })
})
