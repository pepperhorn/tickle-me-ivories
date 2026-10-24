import { normaliseTimeSignatures } from './timeSignatures'
import { secToTicks } from './tempoMap'
import type { ScoreDocument, TempoSetting } from './types'

/**
 * The lead-in played before t = 0 when playback starts from the top: one bar
 * of the opening metre, less any pickup (see leadInFor). Beats are the
 * denominator unit (4/4 -> 4 quarters, 6/8 -> 6 eighths) at the tempo in force
 * at tick 0; a tempo change later in bar 1 does not stretch it. `beats` is the
 * number of counts shown (a fractional pickup rounds the count up), `sec` the
 * exact length, so the count's beats sit at -sec + i * beatSec.
 */
export interface LeadIn { sec: number; beats: number; beatSec: number }

export const NO_LEAD_IN: LeadIn = { sec: 0, beats: 0, beatSec: 0 }

const barTicks = (ppq: number, s: { numerator: number; denominator: number }) =>
  s.numerator * ((ppq * 4) / s.denominator)

/**
 * The metre counted, and how many of its beats a pickup (anacrusis) already
 * fills. A pickup reaches us as its own short signature spanning exactly one
 * bar -- parseMusicXml does this so the metronome's accents stay on bar lines
 * -- followed by the real metre. One lone short opening bar before a longer
 * metre is indistinguishable from a pickup, and is treated as one: pickups
 * are by far the commoner case.
 */
function countedMetre(score: ScoreDocument): { numerator: number; denominator: number; pickupBeats: number } {
  const [first, next] = normaliseTimeSignatures(score.timeSignatures)
  const firstBar = barTicks(score.ppq, first)
  if (next && next.ticks === firstBar && firstBar < barTicks(score.ppq, next)) {
    const beatTicks = (score.ppq * 4) / next.denominator
    return { numerator: next.numerator, denominator: next.denominator, pickupBeats: firstBar / beatTicks }
  }
  return { numerator: first.numerator, denominator: first.denominator, pickupBeats: 0 }
}

/**
 * Controller ruling (musical convention): the count covers the beats of the
 * bar BEFORE the pickup, and the pickup enters on its natural beat -- a
 * 1-beat pickup in 4/4 counts "1 2 3" and plays on 4; an eighth-note pickup
 * counts "1 2 3 4" and plays on the "and" of 4. With no pickup, a full bar.
 */
export function leadInFor(score: ScoreDocument, setting: TempoSetting, bars: number = 1): LeadIn {
  const n = Math.max(0, Math.floor(Number.isFinite(bars) ? bars : 1))
  if (n === 0) return NO_LEAD_IN
  const { numerator, denominator, pickupBeats } = countedMetre(score)
  const beatSec = openingBeatSec(score, setting, denominator)
  // Two bars: a full bar, then the bar before the pickup (as one bar would be).
  const leadBeats = n * numerator - pickupBeats
  return { sec: beatSec * leadBeats, beats: Math.ceil(leadBeats - 1e-9), beatSec }
}

/** Seconds per denominator beat at the tempo in force at tick 0. */
function openingBeatSec(score: ScoreDocument, setting: TempoSetting, denominator: number): number {
  const quarterBpm = setting.mode === 'absolute'
    ? setting.bpm
    : (score.tempoMap[0]?.bpm ?? 120) * Math.max(0.01, setting.scale)
  return (60 / quarterBpm) * (4 / denominator)
}

/** The count-in setting of the ivories components: off, one bar or two bars. */
export type CountInBars = 0 | 1 | 2

/** Anything -> a CountInBars; a non-number or out-of-range value is the default (1 bar). */
export function clampCountIn(v: unknown): CountInBars {
  return v === 0 || v === 1 || v === 2 ? v : 1
}

/**
 * The time signature in force at playhead second `sec` (score time at `setting`),
 * for the Transport's readout. Before the score (the count-in) and over a pickup
 * it is the counted metre, never the pickup's own short signature.
 */
export function metreAt(score: ScoreDocument, sec: number, setting: TempoSetting): { numerator: number; denominator: number } {
  const sigs = normaliseTimeSignatures(score.timeSignatures)
  const ticks = sec > 0 ? secToTicks(score.tempoMap, score.ppq, sec, setting) : 0
  let i = 0
  while (i + 1 < sigs.length && sigs[i + 1].ticks <= ticks + 1e-6) i++
  // In the opening signature (a pickup's own short one included) show the counted metre.
  if (i === 0) {
    const { numerator, denominator } = countedMetre(score)
    return { numerator, denominator }
  }
  return { numerator: sigs[i].numerator, denominator: sigs[i].denominator }
}

/** Beats per counted bar (the opening metre, past any pickup), for the "1 2 3 4 1 2 3 4" display. */
export function countInBeatsPerBar(score: ScoreDocument): number {
  return countedMetre(score).numerator
}

/**
 * The lead-in a Play from the top runs before t = 0 (user ruling 2026-10-22):
 * `bars` of count-in, or with the count-in off one silent beat of the opening
 * metre. Either way t = 0 is never where playback starts, so on a falling roll
 * every bar -- even a note at t = 0 -- begins fully above the key line, and on
 * a rising roll the first tile leaves its key on beat 1 of bar 1.
 * The silent pre-roll has beats = 0: no clicks and no count are shown.
 */
export function playLeadIn(score: ScoreDocument, setting: TempoSetting, bars: number): LeadIn {
  if (bars >= 1) return leadInFor(score, setting, bars)
  const beatSec = openingBeatSec(score, setting, countedMetre(score).denominator)
  return { sec: beatSec, beats: 0, beatSec }
}

/**
 * The number shown at playhead `head`: countInBeatAt folded into bars, so two
 * bars of 4/4 count "1 2 3 4 1 2 3 4" (and over a pickup the second bar stops
 * short: "1 2 3 4 1 2 3"). 0 outside the count.
 */
export function countInLabelAt(head: number, lead: LeadIn, beatsPerBar: number): number {
  const b = countInBeatAt(head, lead)
  if (b === 0 || !(beatsPerBar >= 1)) return b
  return ((b - 1) % Math.round(beatsPerBar)) + 1
}

/**
 * The count showing at playhead `head` (1-based), or 0 outside the lead-in.
 * Runs every frame, so it is plain arithmetic.
 */
export function countInBeatAt(head: number, lead: LeadIn): number {
  if (lead.beats === 0 || head >= 0 || head < -lead.sec) return 0
  const i = Math.floor((head + lead.sec) / lead.beatSec) + 1
  return Math.min(lead.beats, Math.max(1, i))
}
