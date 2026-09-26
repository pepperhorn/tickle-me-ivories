import { normaliseTimeSignatures } from './timeSignatures'
import type { ScoreDocument, TempoSetting } from './types'

/**
 * The one-bar lead-in played before t = 0 when playback starts from the top.
 * `beats` is the first time signature's numerator, each one denominator unit
 * long (4/4 -> 4 quarters, 6/8 -> 6 eighths), at the tempo in force at tick 0.
 * A tempo change later in bar 1 does not stretch the lead-in: a count-in is
 * counted at the opening tempo. Over a pickup, the bar counted is the metre
 * that follows it (see countedSignature).
 */
export interface LeadIn { sec: number; beats: number; beatSec: number }

export const NO_LEAD_IN: LeadIn = { sec: 0, beats: 0, beatSec: 0 }

const barTicks = (ppq: number, s: { numerator: number; denominator: number }) =>
  s.numerator * ((ppq * 4) / s.denominator)

/**
 * A pickup (anacrusis) reaches us as its own short signature spanning exactly
 * one bar -- parseMusicXml does this so the metronome's accents stay on bar
 * lines -- followed by the real metre. The count-in counts the real metre:
 * "1 2 3 4" then the pickup, as a player would.
 */
function countedSignature(score: ScoreDocument) {
  const sigs = normaliseTimeSignatures(score.timeSignatures)
  const [first, next] = sigs
  if (next && next.ticks === barTicks(score.ppq, first) && barTicks(score.ppq, first) < barTicks(score.ppq, next)) {
    return next
  }
  return first
}

export function leadInFor(score: ScoreDocument, setting: TempoSetting): LeadIn {
  const { numerator, denominator } = countedSignature(score)
  const quarterBpm = setting.mode === 'absolute'
    ? setting.bpm
    : (score.tempoMap[0]?.bpm ?? 120) * Math.max(0.01, setting.scale)
  const beatSec = (60 / quarterBpm) * (4 / denominator)
  return { sec: beatSec * numerator, beats: numerator, beatSec }
}

/**
 * The count showing at playhead `head` (1-based), or 0 outside the lead-in.
 * Runs every frame in the draw loop, so it is plain arithmetic.
 */
export function countInBeatAt(head: number, lead: LeadIn): number {
  if (lead.beats === 0 || head >= 0 || head < -lead.sec) return 0
  const i = Math.floor((head + lead.sec) / lead.beatSec) + 1
  return Math.min(lead.beats, Math.max(1, i))
}
