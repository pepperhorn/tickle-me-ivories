import { describe, it, expect } from 'vitest'
import { buildTempoMap, ticksToSec, secToTicks } from './tempoMap'
import type { TempoSetting } from './types'

const PPQ = 480
const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }

describe('buildTempoMap', () => {
  it('inserts a 120bpm entry at tick 0 when the file has none', () => {
    const map = buildTempoMap([], PPQ)
    expect(map).toEqual([{ ticks: 0, sec: 0, bpm: 120 }])
  })

  it('accumulates seconds across tempo changes', () => {
    // 4 beats at 120bpm = 2s, then the tempo doubles
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    expect(map[1].sec).toBeCloseTo(2, 9)
  })

  it('sorts unsorted input', () => {
    const map = buildTempoMap([{ ticks: 960, bpm: 90 }, { ticks: 0, bpm: 120 }], PPQ)
    expect(map.map((e) => e.ticks)).toEqual([0, 960])
  })
})

describe('ticksToSec', () => {
  it('converts at a constant tempo', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }], PPQ)
    expect(ticksToSec(map, PPQ, PPQ, SCALE_1)).toBeCloseTo(0.5, 9)  // 1 beat @120 = 0.5s
  })

  it('honours a tempo change partway through', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    // 4 beats @120 (2s) + 4 beats @240 (1s)
    expect(ticksToSec(map, PPQ, 8 * PPQ, SCALE_1)).toBeCloseTo(3, 9)
  })

  it('scale mode compresses time uniformly and preserves tempo changes', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    const half: TempoSetting = { mode: 'scale', scale: 2 }
    expect(ticksToSec(map, PPQ, 8 * PPQ, half)).toBeCloseTo(1.5, 9)
    // the ritardando survives: second half still takes half as long as the first
    const a = ticksToSec(map, PPQ, 4 * PPQ, half)
    const b = ticksToSec(map, PPQ, 8 * PPQ, half) - a
    expect(a / b).toBeCloseTo(2, 9)
  })

  it('absolute mode flattens the tempo map entirely', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    const flat: TempoSetting = { mode: 'absolute', bpm: 60 }
    expect(ticksToSec(map, PPQ, 8 * PPQ, flat)).toBeCloseTo(8, 9)  // 8 beats @60 = 8s
  })
})

describe('secToTicks', () => {
  it('round-trips against ticksToSec in every mode', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 100 }, { ticks: 3 * PPQ, bpm: 175 }], PPQ)
    const settings: TempoSetting[] = [
      { mode: 'scale', scale: 1 },
      { mode: 'scale', scale: 0.5 },
      { mode: 'scale', scale: 2.4 },
      { mode: 'absolute', bpm: 90 },
    ]
    for (const s of settings) {
      for (const ticks of [0, 240, 1440, 5000, 12345]) {
        const sec = ticksToSec(map, PPQ, ticks, s)
        expect(secToTicks(map, PPQ, sec, s)).toBeCloseTo(ticks, 6)
      }
    }
  })
})

describe('tempo change preserves musical position', () => {
  it('the tick at a given playhead maps back to the same tick after a tempo change', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }], PPQ)
    const before: TempoSetting = { mode: 'scale', scale: 1 }
    const after: TempoSetting = { mode: 'scale', scale: 1.75 }
    const playheadSec = 3.2
    const ticks = secToTicks(map, PPQ, playheadSec, before)
    const rebasedSec = ticksToSec(map, PPQ, ticks, after)
    expect(secToTicks(map, PPQ, rebasedSec, after)).toBeCloseTo(ticks, 6)
  })
})
