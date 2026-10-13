import { describe, it, expect, vi, afterEach } from 'vitest'
import { MediaClock } from './MediaClock'
import { describeClockContract } from './clockContract.test-helpers'
import { FakeMedia } from './fakeMediaElement.test-helpers'

describeClockContract('MediaClock', () => {
  const el = new FakeMedia()
  let ms = 0
  return {
    clock: new MediaClock(el as unknown as HTMLMediaElement, { nowMs: () => ms }),
    advance: (s) => { el.advance(s); ms += s * 1000 },
  }
})

describe('MediaClock specifics', () => {
  afterEach(() => { vi.useRealTimers() })

  it('score time is media time minus the offset, both ways', () => {
    const el = new FakeMedia()
    const c = new MediaClock(el as unknown as HTMLMediaElement, { offset: 2 })
    el.currentTime = 5
    expect(c.now()).toBe(3)
    c.seek(10)
    expect(el.currentTime).toBe(12)
  })

  it('a rejected play() (autoplay policy) never throws into the host', async () => {
    const el = new FakeMedia()
    el.play = () => Promise.reject(new Error('NotAllowedError'))
    const c = new MediaClock(el as unknown as HTMLMediaElement)
    expect(() => c.play()).not.toThrow()
    await Promise.resolve()
  })

  it('follows the element: its own play/pause/seek/rate become clock events', () => {
    const el = new FakeMedia()
    const c = new MediaClock(el as unknown as HTMLMediaElement)
    const seen: string[] = []
    c.subscribe((e) => seen.push(e.type))
    void el.play()
    el.currentTime = 3
    el.playbackRate = 2
    el.pause()
    expect(seen).toEqual(['play', 'seek', 'rate', 'pause'])
    expect(c.rate).toBe(2)
  })

  it('a negative media time holds the element at 0 until the virtual time crosses it', () => {
    vi.useFakeTimers()
    let ms = 0
    const el = new FakeMedia()
    const c = new MediaClock(el as unknown as HTMLMediaElement, { offset: 1, nowMs: () => ms })
    const seen: string[] = []
    c.subscribe((e) => seen.push(e.type))
    c.seek(-1.5)                       // media -0.5: before the media starts
    expect(el.currentTime).toBe(0)
    expect(c.now()).toBeCloseTo(-1.5, 9)
    c.play()
    expect(c.playing).toBe(true)
    expect(el.paused).toBe(true)       // held: the media must not sound early
    ms += 250
    vi.advanceTimersByTime(250)
    el.advance(0.25)
    expect(el.paused).toBe(true)
    expect(c.now()).toBeCloseTo(-1.25, 9)
    ms += 250
    vi.advanceTimersByTime(250)        // the crossing timer starts the element
    expect(el.paused).toBe(false)
    expect(c.now()).toBeCloseTo(-1, 9)
    el.advance(0.5)
    expect(c.now()).toBeCloseTo(-0.5, 9)
    expect(seen).toEqual(['seek', 'play'])
  })

  it('pausing in the pre-roll freezes the virtual time; seeking back into the media releases the hold', () => {
    let ms = 0
    const el = new FakeMedia()
    const c = new MediaClock(el as unknown as HTMLMediaElement, { nowMs: () => ms })
    c.seek(-2)
    c.play()
    ms += 500
    c.pause()
    ms += 5000
    expect(c.now()).toBeCloseTo(-1.5, 9)
    expect(c.playing).toBe(false)
    c.play()
    c.seek(3)
    expect(el.currentTime).toBe(3)
    expect(el.paused).toBe(false)
    expect(c.playing).toBe(true)
  })

  it('a rate change in the pre-roll keeps the virtual time continuous', () => {
    let ms = 0
    const el = new FakeMedia()
    const c = new MediaClock(el as unknown as HTMLMediaElement, { nowMs: () => ms })
    c.seek(-4)
    c.play()
    ms += 1000
    c.setRate(0.5)
    expect(c.now()).toBeCloseTo(-3, 9)
    ms += 1000
    expect(c.now()).toBeCloseTo(-2.5, 9)
    expect(el.playbackRate).toBe(0.5)
  })

  it('dispose detaches from the element, clears the crossing timer and freezes the position', () => {
    vi.useFakeTimers()
    let ms = 0
    const el = new FakeMedia()
    const c = new MediaClock(el as unknown as HTMLMediaElement, { nowMs: () => ms })
    const fn = vi.fn()
    c.subscribe(fn)
    c.seek(-1)
    c.play()
    fn.mockClear()
    c.dispose()
    ms += 2000
    vi.advanceTimersByTime(2000)
    expect(el.paused).toBe(true)
    expect(c.now()).toBeCloseTo(-1, 9)
    expect(c.playing).toBe(false)
    void el.play()
    expect(fn).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('dispose during the pre-roll, after the virtual time crossed 0, never starts the element', () => {
    vi.useFakeTimers()
    let ms = 0
    const el = new FakeMedia()
    const play = vi.spyOn(el, 'play')
    const c = new MediaClock(el as unknown as HTMLMediaElement, { offset: 0, nowMs: () => ms })
    c.seek(-1)
    c.play()
    // The wall clock moves past the crossing before the timer fires.
    ms += 1500
    c.dispose()
    expect(play).not.toHaveBeenCalled()
    expect(el.paused).toBe(true)
    expect(c.now()).toBeCloseTo(0.5, 9)
    vi.advanceTimersByTime(2000)
    expect(play).not.toHaveBeenCalled()
  })
})
