import { secToTicks, ticksToSec } from '../model/tempoMap'
import { normaliseTimeSignatures } from '../model/timeSignatures'
import type { ScoreDocument, TempoSetting } from '../model/types'

export const DEFAULT_LIVE_BPM = 100
export const MIN_LIVE_BPM = 20
export const MAX_LIVE_BPM = 300
export const DEFAULT_VISIBLE_BEATS = 8
export const DEFAULT_BEATS_PER_BAR = 4
/** A pathological window (64 beats of 1/64 notes) still draws a bounded grid. */
const MAX_LINES = 512

/** Live BPM: an integer in 20-300; anything non-finite is the default (Review Focus 3). */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_LIVE_BPM
  return Math.round(Math.min(MAX_LIVE_BPM, Math.max(MIN_LIVE_BPM, bpm)))
}

/** A typed BPM draft -> a committable BPM, or null while it is empty, half-typed or out of range. */
export function parseBpmDraft(v: string): number | null {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= MIN_LIVE_BPM && n <= MAX_LIVE_BPM ? n : null
}

export function clampVisibleBeats(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_VISIBLE_BEATS
  return Math.min(64, Math.max(1, v))
}

export interface BeatLine { beat: number; bar: boolean }

/**
 * Clock seconds <-> beats for the rising roll (R-B). For a score a beat is a
 * quarter note (ticks / ppq) on the provider's tempo; live, it is 60 / bpm s.
 */
export interface BeatClock {
  beatAt(sec: number): number
  secAt(beat: number): number
  /** Grid lines with fromBeat <= beat <= toBeat, ascending; `bar` marks bar starts. */
  lines(fromBeat: number, toBeat: number): BeatLine[]
}

const mod = (a: number, n: number) => ((a % n) + n) % n

export function liveBeatClock(bpm: number, beatsPerBar: number = DEFAULT_BEATS_PER_BAR): BeatClock {
  const b = clampBpm(bpm)
  const perBar = Number.isFinite(beatsPerBar) && beatsPerBar >= 1 ? Math.round(beatsPerBar) : DEFAULT_BEATS_PER_BAR
  return {
    beatAt: (sec) => (sec * b) / 60,
    secAt: (beat) => (beat * 60) / b,
    lines(fromBeat, toBeat) {
      const out: BeatLine[] = []
      for (let k = Math.ceil(fromBeat - 1e-9) + 0; /* + 0: ceil(-0.5) is -0 */ k <= toBeat + 1e-9 && out.length < MAX_LINES; k++) {
        out.push({ beat: k, bar: mod(k, perBar) === 0 })
      }
      return out
    },
  }
}

export function scoreBeatClock(score: ScoreDocument, tempo: TempoSetting): BeatClock {
  const { tempoMap, ppq } = score
  const sigs = normaliseTimeSignatures(score.timeSignatures)
  return {
    beatAt: (sec) => secToTicks(tempoMap, ppq, sec, tempo) / ppq,
    secAt: (beat) => ticksToSec(tempoMap, ppq, beat * ppq, tempo),
    lines(fromBeat, toBeat) {
      const out: BeatLine[] = []
      const fromT = fromBeat * ppq
      const toT = toBeat * ppq
      for (let i = 0; i < sigs.length && out.length < MAX_LINES; i++) {
        const s = sigs[i]
        // The first signature also covers the count-in before tick 0.
        const segStart = i === 0 ? -Infinity : s.ticks
        const segEnd = i + 1 < sigs.length ? sigs[i + 1].ticks : Infinity
        const lo = Math.max(fromT, segStart)
        const hi = Math.min(toT, segEnd)
        if (lo > hi) continue
        const beatTicks = (ppq * 4) / s.denominator
        for (let k = Math.ceil((lo - s.ticks) / beatTicks - 1e-9); out.length < MAX_LINES; k++) {
          const tick = s.ticks + k * beatTicks
          if (tick > hi + 1e-6 || tick >= segEnd) break
          out.push({ beat: tick / ppq, bar: mod(k, s.numerator) === 0 })
        }
      }
      return out
    },
  }
}
