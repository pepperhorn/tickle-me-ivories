// Spec §3.1, with the controller's ruling: now() is SCORE-TIME seconds, the
// position on the score's own tempo map at rate 1. `rate` changes only how
// fast score-time advances; seek(t) takes score-time. Negative times (the
// count-in) are legal.
export type ClockEventType = 'play' | 'pause' | 'seek' | 'rate'

export interface ClockEvent {
  type: ClockEventType
  /** Score-time position at the moment of the event. */
  time: number
}

export interface Clock {
  now(): number
  readonly playing: boolean
  /** Tempo multiplier: score-seconds per wall-second. */
  readonly rate: number
  play(): void
  pause(): void
  seek(t: number): void
  setRate(r: number): void
  subscribe(fn: (e: ClockEvent) => void): () => void
  dispose(): void
}

export const MIN_RATE = 0.1
export const MAX_RATE = 4

export function clampRate(r: number): number {
  return Number.isFinite(r) ? Math.min(MAX_RATE, Math.max(MIN_RATE, r)) : 1
}
