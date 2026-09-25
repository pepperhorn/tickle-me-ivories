import { describe, it, expect } from 'vitest'
import { normaliseTimeSignatures } from './timeSignatures'

const sig = (ticks: number, numerator: number, denominator: number) => ({ ticks, numerator, denominator })

describe('normaliseTimeSignatures', () => {
  it('assumes 4/4 at tick 0 when there are none', () => {
    expect(normaliseTimeSignatures([])).toEqual([sig(0, 4, 4)])
  })

  it('fills the gap before a first signature that starts late', () => {
    expect(normaliseTimeSignatures([sig(960, 3, 4)])).toEqual([sig(0, 4, 4), sig(960, 3, 4)])
  })

  it('sorts by tick and keeps the last of several at the same tick', () => {
    expect(normaliseTimeSignatures([sig(1920, 3, 4), sig(0, 2, 4), sig(0, 6, 8)]))
      .toEqual([sig(0, 6, 8), sig(1920, 3, 4)])
  })

  it('drops malformed entries (non-positive numerator, non-power-of-two denominator)', () => {
    expect(normaliseTimeSignatures([sig(0, 0, 4), sig(0, 3, 5), sig(0, 5, 4)])).toEqual([sig(0, 5, 4)])
  })
})
