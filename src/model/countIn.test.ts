import { describe, it, expect } from 'vitest'
import { countInBeatAt, leadInFor } from './countIn'
import { buildTempoMap } from './tempoMap'
import type { ScoreDocument } from './types'

function score(patch: Partial<ScoreDocument> = {}): ScoreDocument {
  return {
    id: 'x', name: 'x', ppq: 480,
    tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480),
    voices: [], notes: [], durationSec: 2, sourceFormat: 'midi',
    timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }],
    keySignature: null,
    ...patch,
  }
}

const SCALE_1 = { mode: 'scale', scale: 1 } as const
const sig = (numerator: number, denominator: number) => [{ ticks: 0, numerator, denominator }]

describe('leadInFor', () => {
  it('is one bar of 4/4 at the first tempo: four quarter beats', () => {
    expect(leadInFor(score(), SCALE_1)).toEqual({ sec: 2, beats: 4, beatSec: 0.5 })
  })

  it('is three beats in 3/4', () => {
    expect(leadInFor(score({ timeSignatures: sig(3, 4) }), SCALE_1)).toEqual({ sec: 1.5, beats: 3, beatSec: 0.5 })
  })

  it('counts six eighth-note beats in 6/8', () => {
    const l = leadInFor(score({ timeSignatures: sig(6, 8) }), SCALE_1)
    expect(l.beats).toBe(6)
    expect(l.beatSec).toBeCloseTo(0.25, 9)
    expect(l.sec).toBeCloseTo(1.5, 9)
  })

  it('assumes 4/4 when the file carries no time signature', () => {
    expect(leadInFor(score({ timeSignatures: [] }), SCALE_1).beats).toBe(4)
  })

  it('uses the tempo at tick 0, not a tempo change later in bar 1', () => {
    const tempoMap = buildTempoMap([{ ticks: 0, bpm: 60 }, { ticks: 480, bpm: 240 }], 480)
    expect(leadInFor(score({ tempoMap }), SCALE_1)).toEqual({ sec: 4, beats: 4, beatSec: 1 })
  })

  it('over a 1-beat pickup in 4/4 counts "1 2 3" and the pickup enters on 4', () => {
    // parseMusicXml gives a one-beat pickup its own 1/4 signature, then 4/4.
    const timeSignatures = [{ ticks: 0, numerator: 1, denominator: 4 }, { ticks: 480, numerator: 4, denominator: 4 }]
    expect(leadInFor(score({ timeSignatures }), SCALE_1)).toEqual({ sec: 1.5, beats: 3, beatSec: 0.5 })
  })

  it('over an eighth-note pickup counts "1 2 3 4", the pickup on the "and" of 4', () => {
    const timeSignatures = [{ ticks: 0, numerator: 1, denominator: 8 }, { ticks: 240, numerator: 4, denominator: 4 }]
    const lead = leadInFor(score({ timeSignatures }), SCALE_1)
    expect(lead).toEqual({ sec: 1.75, beats: 4, beatSec: 0.5 })
    expect([-1.75, -1.3, -1.2, -0.8, -0.7, -0.3, -0.2, -0.01].map((h) => countInBeatAt(h, lead)))
      .toEqual([1, 1, 2, 2, 3, 3, 4, 4])
  })

  it('keeps a genuine opening bar that is followed by a metre change', () => {
    // Two full 3/4 bars, then 4/4: the opening is not a pickup. (One lone short
    // bar before a longer metre is indistinguishable from a pickup, and is
    // treated as one -- pickups are by far the commoner case.)
    const timeSignatures = [{ ticks: 0, numerator: 3, denominator: 4 }, { ticks: 2880, numerator: 4, denominator: 4 }]
    expect(leadInFor(score({ timeSignatures }), SCALE_1).beats).toBe(3)
  })

  it('follows the tempo setting in both modes', () => {
    expect(leadInFor(score(), { mode: 'scale', scale: 0.5 }).sec).toBeCloseTo(4, 9)
    expect(leadInFor(score(), { mode: 'absolute', bpm: 60 }).sec).toBeCloseTo(4, 9)
  })
})

describe('countInBeatAt', () => {
  const lead = { sec: 2, beats: 4, beatSec: 0.5 }

  it('counts 1..N across the lead-in bar, one number per beat', () => {
    expect([-2, -1.75, -1.5, -1.01, -1, -0.5, -0.01].map((h) => countInBeatAt(h, lead)))
      .toEqual([1, 1, 2, 2, 3, 4, 4])
  })

  it('is 0 from t = 0 on, and before the lead-in', () => {
    expect(countInBeatAt(0, lead)).toBe(0)
    expect(countInBeatAt(3, lead)).toBe(0)
    expect(countInBeatAt(-2.5, lead)).toBe(0)
  })

  it('is 0 with no lead-in', () => {
    expect(countInBeatAt(-1, { sec: 0, beats: 0, beatSec: 0 })).toBe(0)
  })
})
