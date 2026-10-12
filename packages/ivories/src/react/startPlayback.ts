import { IvoriesError } from '../core/errors'
import type { AudioEngine } from '../core/audio/engine'
import type { Clock } from '../core/clock/types'

/**
 * How long Play waits for the AudioContext to start before starting the clock
 * anyway (silently; the Transport then offers "Tap to enable sound").
 */
export const RESUME_WAIT_MS = 400

/** Clocks with a start waiting on resume(): a second press meanwhile is ignored. */
const waiting = new WeakSet<Clock>()

/**
 * Resume audio (when scheduling it), then start the clock. resume() is called
 * synchronously, inside the gesture; the clock starts once it settles (or after
 * RESUME_WAIT_MS), because the driver hands nothing to a suspended engine and
 * would otherwise pass the downbeat by while the context is still starting.
 * A rejection is reported once as `audio-unavailable` and the clock still starts.
 */
export function startPlayback(iv: {
  clock: Clock
  engine: Pick<AudioEngine, 'resume'>
  audio: boolean
  reportError(e: IvoriesError): void
}): void {
  const { clock } = iv
  if (!iv.audio) { clock.play(); return }
  if (waiting.has(clock)) return
  waiting.add(clock)
  let started = false
  const start = () => {
    if (started) return
    started = true
    clearTimeout(timer)
    waiting.delete(clock)
    clock.play()
  }
  const timer = setTimeout(start, RESUME_WAIT_MS)
  resumeAudio(iv).then(start)
}

/** Resume the audio context only (the "Tap to enable sound" path). Settles once, never rejects. */
export function resumeAudio(iv: { engine: Pick<AudioEngine, 'resume'>; reportError(e: IvoriesError): void }): Promise<void> {
  let resumed: Promise<void>
  try { resumed = iv.engine.resume() } catch (e) { resumed = Promise.reject(e) }
  return resumed.catch((e) => iv.reportError(new IvoriesError('audio-unavailable', 'Audio could not start; playing silently.', e)))
}
