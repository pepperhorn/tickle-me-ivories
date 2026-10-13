import { normaliseTimeSignatures } from './timeSignatures'
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
export function leadInFor(score: ScoreDocument, setting: TempoSetting): LeadIn {
  const { numerator, denominator, pickupBeats } = countedMetre(score)
  const quarterBpm = setting.mode === 'absolute'
    ? setting.bpm
    : (score.tempoMap[0]?.bpm ?? 120) * Math.max(0.01, setting.scale)
  const beatSec = (60 / quarterBpm) * (4 / denominator)
  const leadBeats = numerator - pickupBeats
  return { sec: beatSec * leadBeats, beats: Math.ceil(leadBeats - 1e-9), beatSec }
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
