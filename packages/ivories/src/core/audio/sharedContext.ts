import { getSharedAudio } from 'pepperscore/audio'

/**
 * The page's one AudioContext, shared with every PepperScore reader and any other
 * pepperscore/audio user (pepperscore's getSharedAudio). Created on first use, never
 * at import. Throws when the device has no Web Audio.
 */
export function sharedAudioContext(): AudioContext {
  const shared = getSharedAudio()
  if (!shared) throw new Error('Web Audio is not available on this device.')
  return shared.context
}
