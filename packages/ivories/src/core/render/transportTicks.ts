import { secToTicks, ticksToSec } from '../model/tempoMap'
import { normaliseTimeSignatures } from '../model/timeSignatures'
import type { ScoreDocument, TempoSetting } from '../model/types'

/** One mark on the seek track: `x` px from the track start; `bar` marks a bar line. */
export interface BeatTick { x: number; bar: boolean }

/** Marks closer than this are not told apart, so a denser kind is dropped. */
export const MIN_TICK_GAP_PX = 4
/** A pathological score (thousands of bars) still builds a bounded list. */
const MAX_TICKS = 20_000

const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }

/**
 * Where the seek track breaks (user ruling 2026-10-22), as a pure function of
 * the score and the track width: a mark at every beat of every time signature
 * -- the denominator note (4/4: quarters, 3/8: eighths), except compound metres
 * (6/8, 9/8, 12/8 and their /16 cousins), which beat in dotted pulses, as the
 * metronome does -- and a stronger one at every bar line. Positions run through
 * the tempo map, so a ritardando spreads its beats out on the track.
 *
 * Density: when any two marks would sit closer than MIN_TICK_GAP_PX the beat
 * marks go and the bar lines stay; when bar lines are that close too, every Nth
 * bar is kept (N = 2, 4, 8 ... counted from bar 1). Bar 1's line at x = 0 and
 * anything at or past the end are not drawn: the track's own ends show them.
 * Internal (not exported from the package).
 */
export function beatTickPositions(score: ScoreDocument, widthPx: number, tempo: TempoSetting = SCALE_1): BeatTick[] {
  const dur = score.durationSec
  if (!(widthPx > 0) || !(dur > 0)) return []
  const endTick = secToTicks(score.tempoMap, score.ppq, dur, tempo)
  const sigs = normaliseTimeSignatures(score.timeSignatures)
  const all: { x: number; bar: boolean; barNo: number }[] = []
  let barNo = 0
  for (let s = 0; s < sigs.length && all.length < MAX_TICKS; s++) {
    const { ticks: start, numerator: num, denominator: den } = sigs[s]
    const segEnd = Math.min(s + 1 < sigs.length ? sigs[s + 1].ticks : Infinity, endTick)
    const compound = den >= 8 && num > 3 && num % 3 === 0
    const pulse = ((score.ppq * 4) / den) * (compound ? 3 : 1)
    const perBar = compound ? num / 3 : num
    for (let i = 0; all.length < MAX_TICKS; i++) {
      const tick = start + i * pulse
      if (tick >= segEnd - 1e-6) break
      const bar = i % perBar === 0
      if (bar && (i > 0 || s > 0)) barNo++
      const x = (ticksToSec(score.tempoMap, score.ppq, tick, tempo) / dur) * widthPx
      if (x > 0.5 && x < widthPx - 0.5) all.push({ x, bar, barNo })
    }
  }
  if (minGap(all) >= MIN_TICK_GAP_PX) return all.map(({ x, bar }) => ({ x, bar }))
  const bars = all.filter((t) => t.bar)
  for (let every = 1; every <= 1 << 20; every *= 2) {
    const kept = every === 1 ? bars : bars.filter((t) => t.barNo % every === 0)
    if (kept.length <= 1 || minGap(kept) >= MIN_TICK_GAP_PX) return kept.map(({ x }) => ({ x, bar: true }))
  }
  return []
}

function minGap(list: readonly { x: number }[]): number {
  let m = Infinity
  for (let i = 1; i < list.length; i++) m = Math.min(m, list[i].x - list[i - 1].x)
  return m
}
