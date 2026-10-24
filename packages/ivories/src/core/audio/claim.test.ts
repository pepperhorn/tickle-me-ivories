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

describe('the slot is pepperscore/audio\'s (one engine on the page)', () => {
  it('an ivories claim stops a playing PepperScore reader, and a reader starting pauses ivories', async () => {
    const shared = await import('pepperscore/audio')
    const reader = { stop: vi.fn() }
    const iv = { pause: vi.fn() }
    shared.claimPlayback(reader)
    claimPlayback(iv)
    expect(reader.stop).toHaveBeenCalledTimes(1)
    shared.claimPlayback(reader)
    expect(iv.pause).toHaveBeenCalledTimes(1)
    shared.releasePlayback(reader)
  })

  it('claiming again with the same owner does not pause it', () => {
    const iv = { pause: vi.fn() }
    claimPlayback(iv)
    claimPlayback(iv)
    expect(iv.pause).not.toHaveBeenCalled()
    releasePlayback(iv)
  })
})
