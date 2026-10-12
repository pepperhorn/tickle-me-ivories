import { IvoriesError } from '../core/errors'
import type { AudioEngine } from '../core/audio/engine'
import type { Clock } from '../core/clock/types'

/** Resume audio (when scheduling it), report a failure as `audio-unavailable`, and start the clock. */
export function startPlayback(iv: {
  clock: Clock
  engine: Pick<AudioEngine, 'resume'>
  audio: boolean
  reportError(e: IvoriesError): void
}): void {
  if (iv.audio) resumeAudio(iv)
  iv.clock.play()
}

/** Resume the audio context only (the "Tap to enable sound" path). */
export function resumeAudio(iv: { engine: Pick<AudioEngine, 'resume'>; reportError(e: IvoriesError): void }): void {
  iv.engine.resume().catch((e) => iv.reportError(new IvoriesError('audio-unavailable', 'Audio could not start; playing silently.', e)))
}
