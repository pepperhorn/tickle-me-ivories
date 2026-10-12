import { describe, it, expect } from 'vitest'
import { AudioClock } from './AudioClock'
import { describeClockContract } from './clockContract.test-helpers'

describeClockContract('AudioClock', () => {
  const src = { currentTime: 100 }
  return { clock: new AudioClock(src), advance: (s) => { src.currentTime += s } }
})

describe('AudioClock specifics', () => {
  it('anchors exactly like the old transport: origin = now - pausedAt / rate', () => {
    const src = { currentTime: 0 }
    const c = new AudioClock(src)
    c.seekAt(-2, 10)
    c.playAt(10)
    expect(c.originSec).toBe(12)
    expect(c.positionAt(10)).toBe(-2)
    expect(c.positionAt(12)).toBe(0)
  })

  it('load() replaces the anchors without notifying', () => {
    const c = new AudioClock({ currentTime: 5 })
    let n = 0
    c.subscribe(() => { n++ })
    c.load({ playing: true, originSec: 1, pausedAtSec: 0, rate: 1 })
    expect(n).toBe(0)
    expect(c.now()).toBeCloseTo(4, 9)
  })

  it('runs a play session on the wall clock when audio is not running (spec §8)', () => {
    let wall = 50
    const src = { currentTime: 7 }   // a suspended context does not advance
    const c = new AudioClock(src, { isRunning: () => false, wallNow: () => wall })
    c.play()
    expect(c.silentFallback).toBe(true)
    wall += 1.25
    expect(c.now()).toBeCloseTo(1.25, 9)
    c.pause()
    expect(c.silentFallback).toBe(false)
    expect(c.now()).toBeCloseTo(1.25, 9)
  })

  it('ignores a non-finite seek and clamps a silly rate', () => {
    const c = new AudioClock({ currentTime: 0 })
    c.seek(Number.NaN)
    expect(c.now()).toBe(0)
    c.setRate(1000)
    expect(c.rate).toBe(4)
    c.setRate(Number.NaN)
    expect(c.rate).toBe(1)
  })
})
