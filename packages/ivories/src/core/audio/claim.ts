/** Whoever is sounding. Only one provider on a page plays at a time (spec §3.2). */
export interface PlaybackOwner { pause(): void }

let holder: PlaybackOwner | null = null

export function claimPlayback(owner: PlaybackOwner): void {
  if (holder === owner) return
  const previous = holder
  holder = owner
  previous?.pause()
}

export function releasePlayback(owner: PlaybackOwner): void {
  if (holder === owner) holder = null
}
