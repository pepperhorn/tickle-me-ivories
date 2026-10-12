import { describe, it, expect, vi } from 'vitest'
import { claimPlayback, releasePlayback } from './claim'

describe('page-wide playback claim', () => {
  it('a second claimant pauses the first; a released owner is never paused', () => {
    const a = { pause: vi.fn() }, b = { pause: vi.fn() }
    claimPlayback(a)
    claimPlayback(b)
    expect(a.pause).toHaveBeenCalledTimes(1)
    releasePlayback(b)
    claimPlayback(a)
    expect(b.pause).not.toHaveBeenCalled()
    releasePlayback(a)
  })
})
