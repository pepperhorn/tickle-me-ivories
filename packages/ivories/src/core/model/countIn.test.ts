import { describe, it, expect } from 'vitest'
import { clampCountIn, countInBeatAt, countInBeatsPerBar, countInLabelAt, leadInFor, metreAt, playLeadIn } from './countIn'
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

describe('count-in bars (user ruling 2026-10-22)', () => {
  it('two bars of 4/4 double the lead-in; 0 bars is no lead-in', () => {
    expect(leadInFor(score(), SCALE_1, 2)).toEqual({ sec: 4, beats: 8, beatSec: 0.5 })
    expect(leadInFor(score(), SCALE_1, 0)).toEqual({ sec: 0, beats: 0, beatSec: 0 })
  })

  it('3/4: one bar is three beats, two bars six', () => {
    const s = score({ timeSignatures: sig(3, 4) })
    expect(leadInFor(s, SCALE_1, 1)).toEqual({ sec: 1.5, beats: 3, beatSec: 0.5 })
    expect(leadInFor(s, SCALE_1, 2)).toEqual({ sec: 3, beats: 6, beatSec: 0.5 })
  })

  it('6/8: the bar is six eighths at the opening tempo, two bars twelve', () => {
    const s = score({ timeSignatures: sig(6, 8) })
    const one = leadInFor(s, SCALE_1, 1)
    const two = leadInFor(s, SCALE_1, 2)
    expect(one.sec).toBeCloseTo(1.5, 9)
    expect(two.sec).toBeCloseTo(3, 9)
    expect(two.beats).toBe(12)
  })

  it('two bars over a 1-beat pickup: a full bar, then "1 2 3"', () => {
    const timeSignatures = [{ ticks: 0, numerator: 1, denominator: 4 }, { ticks: 480, numerator: 4, denominator: 4 }]
    const s = score({ timeSignatures })
    const lead = leadInFor(s, SCALE_1, 2)
    expect(lead).toEqual({ sec: 3.5, beats: 7, beatSec: 0.5 })
    const per = countInBeatsPerBar(s)
    expect(per).toBe(4)
    expect([-3.5, -3, -2.5, -2, -1.5, -1, -0.5].map((h) => countInLabelAt(h, lead, per))).toEqual([1, 2, 3, 4, 1, 2, 3])
  })

  it('playLeadIn: with the count-in off a silent beat still runs first (no clicks, no count)', () => {
    const pre = playLeadIn(score(), SCALE_1, 0)
    expect(pre).toEqual({ sec: 0.5, beats: 0, beatSec: 0.5 })
    expect(countInLabelAt(-0.25, pre, 4)).toBe(0)
    expect(playLeadIn(score(), SCALE_1, 2)).toEqual(leadInFor(score(), SCALE_1, 2))
  })

  it('countInLabelAt folds two bars into "1 2 3 4 1 2 3 4"', () => {
    const lead = leadInFor(score(), SCALE_1, 2)
    expect([-4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0].map((h) => countInLabelAt(h, lead, 4)))
      .toEqual([1, 2, 3, 4, 1, 2, 3, 4, 0])
  })

  it('clampCountIn keeps 0, 1, 2 and defaults anything else to 1', () => {
    expect([0, 1, 2, 3, -1, Number.NaN, '2', undefined].map(clampCountIn)).toEqual([0, 1, 2, 1, 1, 1, 1, 1])
  })
})

describe('metreAt (the Transport time signature readout)', () => {
  it('is the signature in force at the playhead and follows a change', () => {
    const s = score({ timeSignatures: [{ ticks: 0, numerator: 3, denominator: 4 }, { ticks: 1440, numerator: 6, denominator: 8 }] })
    expect(metreAt(s, 0, SCALE_1)).toEqual({ numerator: 3, denominator: 4 })
    expect(metreAt(s, 1.49, SCALE_1)).toEqual({ numerator: 3, denominator: 4 })
    expect(metreAt(s, 1.5, SCALE_1)).toEqual({ numerator: 6, denominator: 8 })
  })

  it('shows the counted metre during the count-in and over a pickup, never the pickup\'s own short signature', () => {
    const s = score({ timeSignatures: [{ ticks: 0, numerator: 1, denominator: 4 }, { ticks: 480, numerator: 4, denominator: 4 }] })
    expect(metreAt(s, -1, SCALE_1)).toEqual({ numerator: 4, denominator: 4 })
    expect(metreAt(s, 0.1, SCALE_1)).toEqual({ numerator: 4, denominator: 4 })
    expect(metreAt(s, 1, SCALE_1)).toEqual({ numerator: 4, denominator: 4 })
  })

  it('follows the tempo setting (a slower scale reaches a change later)', () => {
    const s = score({ timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }, { ticks: 1920, numerator: 3, denominator: 4 }] })
    expect(metreAt(s, 2.5, SCALE_1)).toEqual({ numerator: 3, denominator: 4 })
    expect(metreAt(s, 2.5, { mode: 'scale', scale: 0.5 })).toEqual({ numerator: 4, denominator: 4 })
  })
})
