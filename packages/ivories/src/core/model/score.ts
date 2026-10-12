import type { ScoreDocument } from './types'

/** Longest note in seconds. A fixed cutoff is wrong for some score: at the
    tempo control's 25% minimum, any note over 2s at notated tempo exceeds 8s. */
export function longestNoteSec(score: ScoreDocument): number {
  return score.notes.reduce((m, n) => Math.max(m, n.endSec - n.startSec), 0)
}
