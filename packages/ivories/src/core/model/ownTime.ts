import { secToTicks, ticksToSec } from './tempoMap'
import type { ScoreDocument, TempoSetting } from './types'

const OWN: TempoSetting = { mode: 'scale', scale: 1 }
const isOwn = (t: TempoSetting) => t.mode === 'scale' && t.scale === 1

/** Provider time (a studio TempoSetting may retime it) -> seconds on the score's own tempo map. */
export function toOwnTempoSec(score: Pick<ScoreDocument, 'tempoMap' | 'ppq'>, tempo: TempoSetting, t: number): number {
  if (isOwn(tempo) || t <= 0) return t
  return ticksToSec(score.tempoMap, score.ppq, secToTicks(score.tempoMap, score.ppq, t, tempo), OWN)
}

/** The inverse: own-tempo seconds (e.g. a pepperscore onSeek) -> provider time. */
export function fromOwnTempoSec(score: Pick<ScoreDocument, 'tempoMap' | 'ppq'>, tempo: TempoSetting, own: number): number {
  if (isOwn(tempo) || own <= 0) return own
  return ticksToSec(score.tempoMap, score.ppq, secToTicks(score.tempoMap, score.ppq, own, OWN), tempo)
}
