import { AudioClock } from './AudioClock'
import type { Clock, ClockEvent } from './types'

/**
 * Host-driven time (spec §3.1): seek(t)/set(t) place the position; play()
 * advances it on performance.now() so a host can still get motion.
 * Composition, not inheritance: a ManualClock is not an AudioClock, so the
 * driver derives its audio origin instead of trusting originSec.
 */
export class ManualClock implements Clock {
  private readonly inner: AudioClock
  private disposed = false

  constructor(opts: { nowMs?: () => number } = {}) {
    const nowMs = opts.nowMs ?? (() => performance.now())
    this.inner = new AudioClock({ get currentTime() { return nowMs() / 1000 } })
  }

  now(): number { return this.inner.now() }
  get playing(): boolean { return this.inner.playing }
  get rate(): number { return this.inner.rate }
  play(): void { this.inner.play() }
  pause(): void { this.inner.pause() }
  seek(t: number): void { this.inner.seek(t) }
  setRate(r: number): void { this.inner.setRate(r) }
  subscribe(fn: (e: ClockEvent) => void): () => void { return this.inner.subscribe(fn) }

  /** Freezes the position (no timers to stop: time is read on demand). */
  dispose(): void {
    this.disposed = true
    this.inner.dispose()
  }

  /** Moves the position without a seek event (no audio re-plan): per-frame host sync. */
  set(t: number): void {
    if (this.disposed || !Number.isFinite(t)) return
    const a = this.inner.anchors()
    const src = this.inner.sourceTime()
    this.inner.load(a.playing ? { ...a, pausedAtSec: t, originSec: src - t / a.rate } : { ...a, pausedAtSec: t })
  }
}
