import { describe, it, expect } from 'vitest'
import { MIN_TICK_GAP_PX, beatTickPositions } from './transportTicks'
import { buildTempoMap, ticksToSec } from '../model/tempoMap'
import type { ScoreDocument, TimeSigEvent } from '../model/types'

const SCALE_1 = { mode: 'scale', scale: 1 } as const
const PPQ = 480

/** A score `quarters` quarter notes long under the given tempi and signatures. */
function score(quarters: number, sigs: TimeSigEvent[], tempi = [{ ticks: 0, bpm: 120 }]): ScoreDocument {
  const tempoMap = buildTempoMap(tempi, PPQ)
  return {
    id: 's', name: 's', ppq: PPQ, tempoMap, voices: [], notes: [],
    durationSec: ticksToSec(tempoMap, PPQ, quarters * PPQ, SCALE_1),
    sourceFormat: 'midi', timeSignatures: sigs, keySignature: null,
  }
}
const sig = (ticks: number, numerator: number, denominator: number): TimeSigEvent => ({ ticks, numerator, denominator })
const xs = (ticks: { x: number }[]) => ticks.map((t) => Math.round(t.x * 100) / 100)

describe('beatTickPositions (transport beat ticks)', () => {
  it('4/4, two bars over 800px: a mark every quarter, a bar line at the middle', () => {
    const t = beatTickPositions(score(8, [sig(0, 4, 4)]), 800)
    expect(xs(t)).toEqual([100, 200, 300, 400, 500, 600, 700])
    expect(t.map((x) => x.bar)).toEqual([false, false, false, true, false, false, false])
  })

  it('3/4: three beats per bar', () => {
    const t = beatTickPositions(score(6, [sig(0, 3, 4)]), 600)
    expect(xs(t)).toEqual([100, 200, 300, 400, 500])
    expect(t.filter((x) => x.bar).map((x) => x.x)).toEqual([300])
  })

  it('6/8 beats in dotted quarters: two per bar', () => {
    // Two bars of 6/8 = 6 quarters.
    const t = beatTickPositions(score(6, [sig(0, 6, 8)]), 600)
    expect(xs(t)).toEqual([150, 300, 450])
    expect(t.map((x) => x.bar)).toEqual([false, true, false])
  })

  it('2/2 and 3/8 beat in their denominator note', () => {
    expect(xs(beatTickPositions(score(8, [sig(0, 2, 2)]), 800))).toEqual([200, 400, 600])
    // 3/8: three eighths per bar; 3 quarters = two bars.
    const t = beatTickPositions(score(3, [sig(0, 3, 8)]), 600)
    expect(xs(t)).toEqual([100, 200, 300, 400, 500])
    expect(t.filter((x) => x.bar).map((x) => x.x)).toEqual([300])
  })

  it('follows a time-signature change: a new bar line where the metre changes', () => {
    // One bar of 4/4, then one of 3/4: seven quarters over 700px.
    const t = beatTickPositions(score(7, [sig(0, 4, 4), sig(4 * PPQ, 3, 4)]), 700)
    expect(xs(t)).toEqual([100, 200, 300, 400, 500, 600])
    expect(t.filter((x) => x.bar).map((x) => x.x)).toEqual([400])
  })

  it('follows the tempo map: beats at half tempo take twice the track', () => {
    // Bar 1 at 120 (2s), bar 2 at 60 (4s): 6s over 600px.
    const t = beatTickPositions(score(8, [sig(0, 4, 4)], [{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 60 }]), 600)
    expect(xs(t)).toEqual([50, 100, 150, 200, 300, 400, 500])
  })

  it('drops beat marks (keeps bar lines) when beats would sit under 4px apart', () => {
    // 100 bars of 4/4 over 1000px: 2.5px per beat, 10px per bar.
    const t = beatTickPositions(score(400, [sig(0, 4, 4)]), 1000)
    expect(t.every((x) => x.bar)).toBe(true)
    expect(t).toHaveLength(99)
    expect(t[0].x).toBeCloseTo(10, 6)
  })

  it('keeps every Nth bar when bar lines are too dense as well', () => {
    // 1000 bars over 1000px: 1px per bar -> every 4th bar (4px apart).
    const t = beatTickPositions(score(4000, [sig(0, 4, 4)]), 1000)
    expect(t.every((x) => x.bar)).toBe(true)
    for (let i = 1; i < t.length; i++) expect(t[i].x - t[i - 1].x).toBeGreaterThanOrEqual(MIN_TICK_GAP_PX - 1e-9)
    expect(t[0].x).toBeCloseTo(4, 6)
    expect(t[1].x).toBeCloseTo(8, 6)
  })

  it('nothing for no width or no duration', () => {
    expect(beatTickPositions(score(8, [sig(0, 4, 4)]), 0)).toEqual([])
    expect(beatTickPositions(score(0, [sig(0, 4, 4)]), 500)).toEqual([])
  })

  it('a pickup bar: the first full bar line falls after the pickup', () => {
    // A 1-beat pickup (1/4), then two bars of 4/4: nine quarters over 900px.
    const t = beatTickPositions(score(9, [sig(0, 1, 4), sig(PPQ, 4, 4)]), 900)
    expect(t.filter((x) => x.bar).map((x) => Math.round(x.x))).toEqual([100, 500])
  })
})
