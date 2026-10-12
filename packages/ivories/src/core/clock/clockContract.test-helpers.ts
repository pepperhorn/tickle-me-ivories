import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Clock, ClockEvent } from './types'

export interface ClockHarness {
  clock: Clock
  /** Moves wall time forward by `sec` seconds. */
  advance(sec: number): void
  cleanup?(): void
}

export function describeClockContract(name: string, make: () => ClockHarness): void {
  describe(`${name}: Clock contract (spec §3.1)`, () => {
    let h: ClockHarness
    beforeEach(() => { h = make() })
    afterEach(() => { h.clock.dispose(); h.cleanup?.() })

    it('starts paused at 0 and does not move while paused', () => {
      expect(h.clock.playing).toBe(false)
      expect(h.clock.now()).toBeCloseTo(0, 9)
      h.advance(2)
      expect(h.clock.now()).toBeCloseTo(0, 9)
    })

    it('advances one score-second per wall-second at rate 1', () => {
      h.clock.play()
      h.advance(1.5)
      expect(h.clock.playing).toBe(true)
      expect(h.clock.now()).toBeCloseTo(1.5, 6)
    })

    it('rate 0.5 for one wall-second advances now() by 0.5 score-seconds', () => {
      h.clock.setRate(0.5)
      h.clock.play()
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(0.5, 6)
    })

    it('seek while paused moves the position and stays put', () => {
      h.clock.seek(4)
      expect(h.clock.now()).toBeCloseTo(4, 6)
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(4, 6)
      expect(h.clock.playing).toBe(false)
    })

    it('seek while playing jumps and keeps playing from the target', () => {
      h.clock.play()
      h.advance(1)
      h.clock.seek(10)
      expect(h.clock.now()).toBeCloseTo(10, 6)
      expect(h.clock.playing).toBe(true)
      h.advance(0.5)
      expect(h.clock.now()).toBeCloseTo(10.5, 6)
    })

    it('pause freezes the position and play resumes from it', () => {
      h.clock.play()
      h.advance(2)
      h.clock.pause()
      h.advance(5)
      expect(h.clock.now()).toBeCloseTo(2, 6)
      h.clock.play()
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(3, 6)
    })

    it('a rate change mid-play keeps the position continuous', () => {
      h.clock.play()
      h.advance(2)
      const before = h.clock.now()
      h.clock.setRate(2)
      expect(h.clock.now()).toBeCloseTo(before, 6)
      expect(h.clock.rate).toBe(2)
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(before + 2, 6)
    })

    it('notifies play, seek, rate and pause with the position; unsubscribe stops delivery', () => {
      const seen: ClockEvent[] = []
      const off = h.clock.subscribe((e) => seen.push(e))
      h.clock.play()
      h.advance(1)
      h.clock.seek(3)
      h.clock.setRate(2)
      h.clock.pause()
      expect(seen.map((e) => e.type)).toEqual(['play', 'seek', 'rate', 'pause'])
      expect(seen[0].time).toBeCloseTo(0, 6)
      expect(seen[1].time).toBeCloseTo(3, 6)
      expect(seen[2].time).toBeCloseTo(3, 6)
      expect(seen[3].time).toBeCloseTo(3, 6)
      off()
      h.clock.play()
      expect(seen).toHaveLength(4)
    })

    it('dispose stops notifications', () => {
      const fn = vi.fn()
      h.clock.subscribe(fn)
      h.clock.dispose()
      h.clock.play()
      h.clock.seek(2)
      expect(fn).not.toHaveBeenCalled()
    })

    it('dispose freezes the position and stops timers', () => {
      h.clock.play()
      h.advance(1)
      h.clock.dispose()
      const t = h.clock.now()
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(t, 6)
    })

    it('emits no events after dispose', () => {
      const fn = vi.fn()
      h.clock.subscribe(fn)
      h.clock.play()
      fn.mockClear()
      h.clock.dispose()
      expect(fn).not.toHaveBeenCalled()
    })
  })
}
