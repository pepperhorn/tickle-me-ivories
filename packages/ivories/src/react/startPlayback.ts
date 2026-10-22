import { IvoriesError } from '../core/errors'
import type { AudioEngine } from '../core/audio/engine'
import type { Clock } from '../core/clock/types'

/**
 * How long Play waits for the AudioContext to start before starting the clock
 * anyway (silently; the Transport then offers "Tap to enable sound").
 */
export const RESUME_WAIT_MS = 400

/** Clocks with a start waiting on resume(), and how to cancel it. A second press meanwhile is ignored. */
const waiting = new WeakMap<Clock, () => void>()

/**
 * Resume audio (when scheduling it), then start the clock. resume() is called
 * synchronously, inside the gesture; the clock starts once it settles (or after
 * RESUME_WAIT_MS), because the driver hands nothing to a suspended engine and
 * would otherwise pass the downbeat by while the context is still starting.
 * A rejection is reported once as `audio-unavailable` and the clock still starts.
 * cancelPendingStart(clock) drops a start that is still waiting.
 */
export function startPlayback(iv: {
  clock: Clock
  engine: Pick<AudioEngine, 'resume'>
  audio: boolean
  reportError(e: IvoriesError): void
  /** Runs immediately before clock.play() (the count-in seek), never if the start is cancelled. */
  prepare?: () => void
}): void {
  const { clock } = iv
  const run = () => { iv.prepare?.(); clock.play() }
  if (!iv.audio) { run(); return }
  if (waiting.has(clock)) return
  let done = false
  const finish = () => {
    if (done) return false
    done = true
    clearTimeout(timer)
    if (waiting.get(clock) === cancel) waiting.delete(clock)
    return true
  }
  const cancel = () => { finish() }
  const start = () => { if (finish()) run() }
  waiting.set(clock, cancel)
  const timer = setTimeout(start, RESUME_WAIT_MS)
  void resumeAudio(iv).then(start)
}

/** Drops a start still waiting on resume() (a pause, an unmount, a clock change). */
export function cancelPendingStart(clock: Clock): void {
  waiting.get(clock)?.()
}

/** Resume the audio context only (the "Tap to enable sound" path). Settles once, never rejects. */
export function resumeAudio(iv: { engine: Pick<AudioEngine, 'resume'>; reportError(e: IvoriesError): void }): Promise<void> {
  let resumed: Promise<void>
  try { resumed = iv.engine.resume() } catch (e) { resumed = Promise.reject(e) }
  return resumed.catch((e) => iv.reportError(new IvoriesError('audio-unavailable', 'Audio could not start; playing silently.', e)))
}
