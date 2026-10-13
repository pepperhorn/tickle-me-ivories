import { describe, it, expect } from 'vitest'
import { fromOwnTempoSec, toOwnTempoSec } from './ownTime'
import { buildTempoMap } from './tempoMap'
import type { ScoreDocument } from './types'

const score = { ppq: 480, tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 1920, bpm: 60 }], 480) } as ScoreDocument

describe('provider time <-> the score\'s own tempo map (Global Constraints: clock time)', () => {
  it('is the identity at scale 1 and passes count-in times through', () => {
    expect(toOwnTempoSec(score, { mode: 'scale', scale: 1 }, 3.25)).toBe(3.25)
    expect(toOwnTempoSec(score, { mode: 'scale', scale: 0.5 }, -1.5)).toBe(-1.5)
  })

  it('maps a retimed position to own-tempo seconds through ticks, and back', () => {
    const half = { mode: 'scale', scale: 0.5 } as const
    expect(toOwnTempoSec(score, half, 4)).toBeCloseTo(2, 9)        // 4 retimed s = 2 own s (first 2 s are at 120)
    expect(fromOwnTempoSec(score, half, 2)).toBeCloseTo(4, 9)
    const abs = { mode: 'absolute', bpm: 240 } as const
    expect(fromOwnTempoSec(score, abs, toOwnTempoSec(score, abs, 1.7))).toBeCloseTo(1.7, 9)
  })
})
