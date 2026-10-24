import { claimPlayback as claimShared, releasePlayback as releaseShared } from 'pepperscore/audio'

/** Whoever is sounding. Only one player on a page plays at a time (spec §3.2). */
export interface PlaybackOwner { pause(): void }

/**
 * The slot is pepperscore/audio's, so ivories providers and PepperScore readers share it:
 * starting any of them stops whichever other one is playing. pepperscore's owners have
 * `stop()`; each ivories owner gets one stable adapter.
 */
const adapters = new WeakMap<PlaybackOwner, { stop(): void }>()
function adapter(owner: PlaybackOwner): { stop(): void } {
  let a = adapters.get(owner)
  if (!a) {
    a = { stop: () => owner.pause() }
    adapters.set(owner, a)
  }
  return a
}

export function claimPlayback(owner: PlaybackOwner): void {
  claimShared(adapter(owner))
}

export function releasePlayback(owner: PlaybackOwner): void {
  releaseShared(adapter(owner))
}
