import type { NoteEvent } from '../model/types'

export const LOOKAHEAD_SEC = 0.15
export const TICK_MS = 25

export interface ScheduledNote { note: NoteEvent; atSec: number }

/**
 * Walks a time-sorted note array and hands back everything starting within the
 * next LOOKAHEAD_SEC. Holds only a cursor index -- no audio, no timers -- so it
 * is driven by a plain number in tests and by AudioContext.currentTime in the app.
 */
export class Scheduler {
  private cursor = 0

  constructor(private notes: NoteEvent[]) {}

  /** Re-seat the cursor after a seek. Works in both directions. */
  seek(playheadSec: number): void {
    let lo = 0, hi = this.notes.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.notes[mid].startSec < playheadSec) lo = mid + 1
      else hi = mid
    }
    this.cursor = lo
  }

  /** Everything due before playheadSec + LOOKAHEAD_SEC, each returned once. */
  collect(playheadSec: number): ScheduledNote[] {
    const horizon = playheadSec + LOOKAHEAD_SEC
    const out: ScheduledNote[] = []
    while (this.cursor < this.notes.length && this.notes[this.cursor].startSec < horizon) {
      const note = this.notes[this.cursor++]
      out.push({ note, atSec: note.startSec })
    }
    return out
  }
}
