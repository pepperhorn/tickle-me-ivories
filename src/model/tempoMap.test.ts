import { describe, it, expect } from 'vitest'
import { buildTempoMap, ticksToSec, secToTicks, effectiveBpmAt, sameTempo } from './tempoMap'
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

  it('clamps a zero scale so the result is finite, not Infinity', () => {
    const map = buildTempoMap([{ ticks: 0, bpm: 120 }], PPQ)
    const zero: TempoSetting = { mode: 'scale', scale: 0 }
    expect(Number.isFinite(ticksToSec(map, PPQ, PPQ, zero))).toBe(true)
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

describe('effectiveBpmAt', () => {
  const ppq = 480
  // 120bpm from the start, dropping to 60bpm at tick 960 (= 2 beats = 1.0s).
  const map = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }], ppq)

  it('reports the notated tempo at scale 1', () => {
    expect(effectiveBpmAt(map, 0.5, { mode: 'scale', scale: 1 })).toBeCloseTo(120, 6)
    expect(effectiveBpmAt(map, 1.5, { mode: 'scale', scale: 1 })).toBeCloseTo(60, 6)
  })

  it('multiplies the notated tempo by the scale', () => {
    expect(effectiveBpmAt(map, 0.25, { mode: 'scale', scale: 0.5 })).toBeCloseTo(60, 6)
    expect(effectiveBpmAt(map, 0.2, { mode: 'scale', scale: 2 })).toBeCloseTo(240, 6)
  })

  it('crosses the tempo change at the scaled playhead, not the notated one', () => {
    // At scale 2 the 1.0s change lands at playhead 0.5s. Before it: 120*2.
    expect(effectiveBpmAt(map, 0.4, { mode: 'scale', scale: 2 })).toBeCloseTo(240, 6)
    // After it: 60*2.
    expect(effectiveBpmAt(map, 0.6, { mode: 'scale', scale: 2 })).toBeCloseTo(120, 6)
  })

  it('reports a flat tempo in absolute mode, ignoring the map entirely', () => {
    expect(effectiveBpmAt(map, 0.5, { mode: 'absolute', bpm: 90 })).toBe(90)
    expect(effectiveBpmAt(map, 5, { mode: 'absolute', bpm: 90 })).toBe(90)
  })

  it('does not divide by zero if a scale of 0 ever reaches it', () => {
    expect(Number.isFinite(effectiveBpmAt(map, 1, { mode: 'scale', scale: 0 }))).toBe(true)
  })
})

describe('sameTempo', () => {
  it('compares mode and value', () => {
    expect(sameTempo({ mode: 'scale', scale: 1 }, { mode: 'scale', scale: 1 })).toBe(true)
    expect(sameTempo({ mode: 'scale', scale: 1 }, { mode: 'scale', scale: 0.5 })).toBe(false)
    expect(sameTempo({ mode: 'absolute', bpm: 90 }, { mode: 'absolute', bpm: 90 })).toBe(true)
    expect(sameTempo({ mode: 'absolute', bpm: 90 }, { mode: 'absolute', bpm: 91 })).toBe(false)
    expect(sameTempo({ mode: 'scale', scale: 1 }, { mode: 'absolute', bpm: 120 })).toBe(false)
  })
})
