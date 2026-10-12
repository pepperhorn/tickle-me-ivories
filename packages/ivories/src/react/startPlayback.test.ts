import { describe, it, expect, vi, afterEach } from 'vitest'
import { startPlayback, RESUME_WAIT_MS } from './startPlayback'
import { ManualClock } from '../core/clock/ManualClock'

afterEach(() => { vi.useRealTimers() })

describe('startPlayback (audio resumes before the clock starts)', () => {
  it('waits for resume() before starting the clock', async () => {
    vi.useFakeTimers()
    const clock = new ManualClock({ nowMs: () => 0 })
    let resolve!: () => void
    const engine = { resume: vi.fn(() => new Promise<void>((r) => { resolve = r })) }
    const reportError = vi.fn()
    startPlayback({ clock, engine, audio: true, reportError })
    expect(engine.resume).toHaveBeenCalledTimes(1)   // called inside the gesture
    await vi.advanceTimersByTimeAsync(100)
    expect(clock.playing).toBe(false)
    resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(clock.playing).toBe(true)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('a resume() that never settles still starts the clock after the cap, without reporting', async () => {
    vi.useFakeTimers()
    const clock = new ManualClock({ nowMs: () => 0 })
    const engine = { resume: vi.fn(() => new Promise<void>(() => {})) }
    const reportError = vi.fn()
    startPlayback({ clock, engine, audio: true, reportError })
    await vi.advanceTimersByTimeAsync(RESUME_WAIT_MS - 1)
    expect(clock.playing).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(clock.playing).toBe(true)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('a resume() rejecting after the cap reports audio-unavailable exactly once', async () => {
    vi.useFakeTimers()
    const clock = new ManualClock({ nowMs: () => 0 })
    let reject!: (e: unknown) => void
    const engine = { resume: vi.fn(() => new Promise<void>((_, j) => { reject = j })) }
    const reportError = vi.fn()
    startPlayback({ clock, engine, audio: true, reportError })
    startPlayback({ clock, engine, audio: true, reportError })   // a second press while waiting is ignored
    await vi.advanceTimersByTimeAsync(RESUME_WAIT_MS)
    expect(clock.playing).toBe(true)
    reject(new Error('denied'))
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.resume).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0][0].code).toBe('audio-unavailable')
  })

  it('a rejected resume() reports once and starts the clock silently', async () => {
    const clock = new ManualClock({ nowMs: () => 0 })
    const engine = { resume: vi.fn(() => Promise.reject(new Error('no Web Audio'))) }
    const reportError = vi.fn()
    startPlayback({ clock, engine, audio: true, reportError })
    await Promise.resolve(); await Promise.resolve()
    expect(clock.playing).toBe(true)
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('audio off starts the clock at once without touching the engine', () => {
    const clock = new ManualClock({ nowMs: () => 0 })
    const engine = { resume: vi.fn(async () => {}) }
    startPlayback({ clock, engine, audio: false, reportError: vi.fn() })
    expect(clock.playing).toBe(true)
    expect(engine.resume).not.toHaveBeenCalled()
  })
})
