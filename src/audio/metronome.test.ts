import { describe, it, expect } from 'vitest'
import { BeatCursor, beatTimes } from './metronome'
import { buildTempoMap } from '../model/tempoMap'
import type { NoteEvent, ScoreDocument } from '../model/types'

function score(patch: Partial<ScoreDocument> = {}): ScoreDocument {
  const notes: NoteEvent[] = [
    { id: 0, pitch: 60, startTicks: 0, durTicks: 1920, startSec: 0, endSec: 2, velocity: 90, voiceId: 'a' },
  ]
  return {
    id: 'x', name: 'x', ppq: 480,
    tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480),
    voices: [], notes, durationSec: 2, sourceFormat: 'midi', beatsPerBar: 4,
    ...patch,
  }
}

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
    const beats = beatTimes(score({ beatsPerBar: 3 }), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, true, false])
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
