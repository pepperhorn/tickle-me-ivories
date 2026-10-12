import { describe, it, expect, vi } from 'vitest'
import { ManualClock } from './ManualClock'
import { describeClockContract } from './clockContract.test-helpers'

describeClockContract('ManualClock', () => {
  let ms = 1000
  return { clock: new ManualClock({ nowMs: () => ms }), advance: (s) => { ms += s * 1000 } }
})

describe('ManualClock specifics', () => {
  it('set(t) moves the position without a seek event, paused or playing', () => {
    let ms = 0
    const c = new ManualClock({ nowMs: () => ms })
    const fn = vi.fn()
    c.subscribe(fn)
    c.set(5)
    expect(c.now()).toBe(5)
    c.play()
    fn.mockClear()
    ms += 500
    c.set(9)
    expect(c.now()).toBeCloseTo(9, 9)
    ms += 1000
    expect(c.now()).toBeCloseTo(10, 9)
    expect(fn).not.toHaveBeenCalled()
  })

  it('set(t) is ignored after dispose and for a non-finite t', () => {
    const c = new ManualClock({ nowMs: () => 0 })
    c.set(3)
    c.set(Number.NaN)
    expect(c.now()).toBe(3)
    c.dispose()
    c.set(7)
    expect(c.now()).toBe(3)
  })
})
