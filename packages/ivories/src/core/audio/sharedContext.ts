let shared: AudioContext | null = null

/** One AudioContext for every provider on the page. Created on first use, never at import. */
export function sharedAudioContext(): AudioContext {
  if (!shared || shared.state === 'closed') shared = new AudioContext()
  return shared
}
