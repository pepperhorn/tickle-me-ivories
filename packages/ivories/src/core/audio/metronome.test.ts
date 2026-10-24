import { describe, it, expect } from 'vitest'
import { BeatCursor, beatTimes, countInBeats, validMetronomeVoice } from './metronome'
import { buildTempoMap } from '../model/tempoMap'
import type { NoteEvent, ScoreDocument } from '../model/types'

function score(patch: Partial<ScoreDocument> = {}): ScoreDocument {
  const notes: NoteEvent[] = [
    { id: 0, pitch: 60, startTicks: 0, durTicks: 1920, startSec: 0, endSec: 2, velocity: 90, voiceId: 'a' },
  ]
  return {
    id: 'x', name: 'x', ppq: 480,
    tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480),
    voices: [], notes, durationSec: 2, sourceFormat: 'midi',
    timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
    keySignature: null,
    ...patch,
  }
}

const SCALE_1 = { mode: 'scale', scale: 1 } as const
const sig = (ticks: number, numerator: number, denominator: number) => ({ ticks, numerator, denominator })
const note = (startTicks: number, durTicks: number): NoteEvent => ({
  id: 0, pitch: 60, startTicks, durTicks, startSec: 0, endSec: 0, velocity: 90, voiceId: 'a',
})

describe('beatTimes', () => {
  it('places a beat on every quarter note, inclusive of the last', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('accents the first beat of each bar', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, false, true])
  })

  it('follows the time signature', () => {
    const beats = beatTimes(score({ timeSignatures: [sig(0, 3, 4)] }), SCALE_1)
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, true, false])
  })

  it('assumes 4/4 from the start when the file carries no time signature', () => {
    const beats = beatTimes(score({ timeSignatures: [] }), SCALE_1)
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2])
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, false, true])
  })

  it('clicks half notes in 2/2', () => {
    const beats = beatTimes(score({ timeSignatures: [sig(0, 2, 2)] }), SCALE_1)
    expect(beats.map((b) => b.sec)).toEqual([0, 1, 2])
    expect(beats.map((b) => b.accent)).toEqual([true, false, true])
  })

  it('clicks eighth notes in 3/8 (simple, not compound)', () => {
    const beats = beatTimes(score({ timeSignatures: [sig(0, 3, 8)] }), SCALE_1)
    // 240 ticks = 0.25s per eighth; 1920 ticks = 8 eighths, inclusive of the last
    expect(beats.map((b) => b.sec)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
    expect(beats.map((b) => b.accent))
      .toEqual([true, false, false, true, false, false, true, false, false])
  })

  it('clicks the dotted-quarter pulse in 6/8, accenting each bar', () => {
    const beats = beatTimes(score({ timeSignatures: [sig(0, 6, 8)] }), SCALE_1)
    // 720 ticks = 0.75s per dotted quarter, two per bar
    expect(beats.map((b) => b.sec)).toEqual([0, 0.75, 1.5])
    expect(beats.map((b) => b.accent)).toEqual([true, false, true])
  })

  it('clicks four dotted quarters per bar in 12/8', () => {
    const s = score({ timeSignatures: [sig(0, 12, 8)], notes: [note(0, 2880 * 2)] })
    const beats = beatTimes(s, SCALE_1)
    expect(beats.map((b) => b.sec)).toEqual([0, 0.75, 1.5, 2.25, 3, 3.75, 4.5, 5.25, 6])
    expect(beats.map((b) => b.accent))
      .toEqual([true, false, false, false, true, false, false, false, true])
  })

  it('follows a later time-signature change, accenting from the new bar', () => {
    // one bar of 4/4 (1920 ticks), then 3/4 from tick 1920
    const s = score({
      timeSignatures: [sig(0, 4, 4), sig(1920, 3, 4)],
      notes: [note(0, 1920 + 1440)],
    })
    const beats = beatTimes(s, SCALE_1)
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5])
    expect(beats.map((b) => b.accent))
      .toEqual([true, false, false, false, true, false, false, true])
  })

  it('switches pulse at a change from 4/4 to 6/8', () => {
    const s = score({
      timeSignatures: [sig(0, 4, 4), sig(1920, 6, 8)],
      notes: [note(0, 1920 + 1440)],
    })
    const beats = beatTimes(s, SCALE_1)
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2, 2.75, 3.5])
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, false, true, false, true])
  })

  it('follows the tempo scale', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 2 })
    expect(beats.map((b) => b.sec)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('follows a tempo change in the map rather than a fixed interval', () => {
    const s = score({ tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }], 480) })
    const beats = beatTimes(s, { mode: 'scale', scale: 1 })
    // 0.5s per beat at 120, then 1.0s per beat from tick 960 (= 1.0s) onward
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 2, 3])
  })

  it('flattens the map in absolute mode', () => {
    const s = score({ tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }], 480) })
    const beats = beatTimes(s, { mode: 'absolute', bpm: 60 })
    expect(beats.map((b) => b.sec)).toEqual([0, 1, 2, 3, 4])
  })

  it('returns nothing for an empty score', () => {
    expect(beatTimes(score({ notes: [] }), { mode: 'scale', scale: 1 })).toEqual([])
  })
})

describe('BeatCursor', () => {
  const beats = [0, 0.5, 1, 1.5, 2].map((sec, i) => ({ sec, accent: i % 4 === 0 }))

  it('hands back each beat exactly once', () => {
    const c = new BeatCursor(beats)
    const seen = [
      ...c.collect(0), ...c.collect(0.5), ...c.collect(1),
      ...c.collect(1.5), ...c.collect(2),
    ]
    expect(seen.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('includes a beat inside the lookahead window', () => {
    const c = new BeatCursor(beats)
    // 0.4 + 0.15 lookahead reaches 0.55, so beats at 0 and 0.5 are both due
    expect(c.collect(0.4).map((b) => b.sec)).toEqual([0, 0.5])
  })

  it('re-seats in both directions on seek', () => {
    // F16: collect(1)'s horizon is 1.15, so only the beat at 1 is due yet.
    const c = new BeatCursor(beats)
    c.collect(2)
    c.seek(1)
    expect(c.collect(1).map((b) => b.sec)).toEqual([1])
    expect(c.collect(1.4).map((b) => b.sec)).toEqual([1.5])
  })
})

describe('countInBeats', () => {
  it('places the count-in beats before t = 0, accent on 1', () => {
    const beats = countInBeats({ sec: 2, beats: 4, beatSec: 0.5 })
    expect(beats).toEqual([
      { sec: -2, accent: true }, { sec: -1.5, accent: false },
      { sec: -1, accent: false }, { sec: -0.5, accent: false },
    ])
  })

  it('follows a pickup lead-in: "1 2 3" before a 1-beat pickup, accent on 1', () => {
    expect(countInBeats({ sec: 1.5, beats: 3, beatSec: 0.5 })).toEqual([
      { sec: -1.5, accent: true }, { sec: -1, accent: false }, { sec: -0.5, accent: false },
    ])
  })

  it('a cursor seeked to the lead-in start collects the count-in clicks, one seeked to 0 skips them', () => {
    const all = [...countInBeats({ sec: 2, beats: 4, beatSec: 0.5 }), ...beatTimes(score(), SCALE_1)]
    const c = new BeatCursor(all)
    c.seek(-2)
    expect(c.collect(-2).map((b) => b.sec)).toEqual([-2])
    const resumed = new BeatCursor(all)
    resumed.seek(0)
    expect(resumed.collect(0).map((b) => b.sec)).toEqual([0])
  })
})

describe('validMetronomeVoice', () => {
  it('keeps a known voice and maps anything else to the woodblock', () => {
    expect(validMetronomeVoice('drum-machine')).toBe('drum-machine')
    expect(validMetronomeVoice('click')).toBe('click')
    expect(validMetronomeVoice('cowbell')).toBe('woodblock')
    expect(validMetronomeVoice(undefined)).toBe('woodblock')
  })
})
