import { ChordTracker, detectChord, pitchesInWindow } from './chords'
import type { ChordReading } from './chords'
import type { KeyContext } from './spell'
import type { NoteEvent } from '../model/types'

/** A playhead jump backwards by more than this is a scrub, not jitter. */
const BACKWARD_JUMP_SEC = 0.25

function sameNumbers(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * The draw loop's per-frame chord step (ruling F41). update() runs EVERY frame
 * while the readout is on -- the tracker's hysteresis needs a steady stream of
 * frames to confirm a held chord -- so the expensive half is memoised:
 * detectChord (the tonal call) runs only when the pitch set or the key changes,
 * and otherwise the tracker receives the same candidates array reference, which
 * is its zero-cost path. A steady chord returns the same ChordReading object, so
 * the caller can compare by identity and skip React updates.
 *
 * The tracker's clock is the caller's WALL clock, not the playhead: hysteresis
 * is about what a viewer sees, and a playhead clock stands still while paused,
 * which would leave the readout blank after any paused seek.
 */
export class ChordFeed {
  private readonly tracker = new ChordTracker()
  private set: number[] = []
  private key: KeyContext | null = null
  private candidates: string[] = []
  private lastHead = 0

  reset(): void {
    this.tracker.reset()
  }

  update(
    notes: NoteEvent[], head: number, windowSec: number, maxNoteDur: number,
    key: KeyContext, nowMs: number,
  ): ChordReading | null {
    // A backward scrub makes the held reading stale; start over from the new spot.
    if (head < this.lastHead - BACKWARD_JUMP_SEC) this.tracker.reset()
    this.lastHead = head

    const set = pitchesInWindow(notes, head, windowSec, maxNoteDur)
    if (key !== this.key || !sameNumbers(set, this.set)) {
      this.set = set
      this.key = key
      this.candidates = detectChord(set, key)
    }
    return this.tracker.update(this.candidates, nowMs)
  }
}
