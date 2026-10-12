import type { Clock, ClockEvent } from '../../core/clock/types'

/** pepperscore 0.2's clock prop (spec §4.3), structurally a subset of Clock. */
export interface ExternalClock {
  /** Seconds from score beat 0 on the score's own tempo map; negative during a count-in. */
  now(): number
  readonly playing: boolean
  /** Called on play, pause, seek and rate changes; returns the unsubscribe. */
  subscribe(fn: (e: ClockEvent) => void): () => void
}

/**
 * The adapter handed to pepperscore. Its identity must only change with the
 * Clock instance (pepperscore resubscribes on identity change, R17), so the
 * score-time mapping is read through `map()` on every call, not captured.
 */
export function toExternalClock(clock: Clock, map: () => (t: number) => number): ExternalClock {
  return {
    now: () => map()(clock.now()),
    get playing() { return clock.playing },
    subscribe: (fn) => clock.subscribe((e) => fn({ type: e.type, time: map()(e.time) })),
  }
}
