import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PlaybackDriver } from './playback'
import { AudioClock } from '../clock/AudioClock'
import { ManualClock } from '../clock/ManualClock'
import { DEFAULT_SETTINGS } from '../settings/types'
import { buildTempoMap } from '../model/tempoMap'
import type { ScoreDocument, NoteEvent } from '../model/types'

const note = (id: number, startSec: number): NoteEvent => ({
  id, pitch: 60 + id, startTicks: id * 480, durTicks: 480, startSec, endSec: startSec + 0.5, velocity: 90, voiceId: 'v',
})
const score = (): ScoreDocument => ({
  id: 's', name: 's.mid', ppq: 480, tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480),
  voices: [{ id: 'v', label: 'V', hue: 0, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 }],
  notes: [note(0, 0), note(1, 0.5), note(2, 1), note(3, 1.5)],
  durationSec: 2, sourceFormat: 'midi', timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }], keySignature: null,
})

function rig(audio = { ...DEFAULT_SETTINGS.audio }) {
  const src = { currentTime: 10 }
  const clicks: number[] = []
  const engine = {
    get currentTime() { return src.currentTime },
    play: vi.fn(),
    stopAll: vi.fn(),
    metronome: () => ({ click: (t: number) => { clicks.push(t) }, stop: vi.fn() }),
  }
  const clock = new AudioClock(src)
  const s = score()
  const driver = new PlaybackDriver({
    clock, engine, getScore: () => s, getAudio: () => audio, audioEnabled: () => true,
  })
  driver.setScore(s, { mode: 'scale', scale: 1 })
  return { src, clock, engine, driver, clicks, s }
}

describe('PlaybackDriver (spec §3.1: the scheduler consumes a Clock)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('hands notes inside the lookahead to the engine at origin + atSec', () => {
    const r = rig()
    r.clock.play()
    r.driver.tick()
    expect(r.engine.play).toHaveBeenCalledTimes(1)
    const [sched, , origin, rate] = r.engine.play.mock.calls[0]
    expect(sched.note.id).toBe(0)
    expect(origin).toBe(10)
    expect(rate).toBe(1)
  })

  it('seek spam while playing schedules each note at most once per pass and calls stopAll per seek', () => {
    const r = rig()
    r.clock.play()
    const handed = new Map<number, number>()
    let pass = new Map<number, number>()
    r.clock.subscribe((e) => { if (e.type === 'seek') pass = new Map() })
    r.engine.play.mockImplementation((s: { note: NoteEvent }) => {
      const n = (pass.get(s.note.id) ?? 0) + 1
      pass.set(s.note.id, n)
      expect(n).toBe(1)
      handed.set(s.note.id, (handed.get(s.note.id) ?? 0) + 1)
    })
    for (let i = 0; i < 20; i++) {
      r.src.currentTime += 0.03
      r.driver.tick()
      if (i % 3 === 0) r.clock.seek(1.4)
    }
    // Seeks at i = 0, 3, 6, …, 18: stopAll ran for every one of the 7, each
    // pass re-handed note 3 (at 1.5, inside the lookahead from 1.4) exactly
    // once, and note 0 was handed only before the first seek.
    expect(r.engine.stopAll).toHaveBeenCalledTimes(7)
    expect(handed.get(3)).toBe(7)
    expect(handed.get(0)).toBe(1)
  })

  it('a rate change silences and schedules at origin + atSec / rate', () => {
    const r = rig()
    r.clock.play()
    r.src.currentTime += 0.4
    r.driver.tick()
    r.clock.setRate(2)
    expect(r.engine.stopAll).toHaveBeenCalledTimes(1)
    r.engine.play.mockClear()
    r.driver.tick()
    const [sched, , origin, rate] = r.engine.play.mock.calls[0]
    expect(rate).toBe(2)
    expect(origin).toBe(r.clock.originSec)
    // The engine time handed over is exactly when the clock reaches the note.
    expect(r.clock.positionAt(origin + sched.atSec / rate)).toBeCloseTo(sched.atSec, 9)
  })

  it('pauses at the end of the score, exactly at the duration', () => {
    const r = rig()
    r.clock.play()
    r.src.currentTime += 2.4
    r.driver.tick()
    expect(r.clock.playing).toBe(false)
    expect(r.clock.now()).toBe(2)
    expect(r.engine.stopAll).toHaveBeenCalled()
  })

  it('clicks the count-in only when the count-in setting is on', () => {
    const on = rig({ ...DEFAULT_SETTINGS.audio, metronome: true, countIn: true })
    on.clock.seek(-2)
    on.clock.play()
    on.driver.tick()
    expect(on.clicks.length).toBe(1)
    const off = rig({ ...DEFAULT_SETTINGS.audio, metronome: true, countIn: false })
    off.clock.seek(-2)
    off.clock.play()
    off.driver.tick()
    expect(off.clicks.length).toBe(0)
  })

  it('keeps cursors level but hands nothing to the engine while audio is disabled', () => {
    const r = rig()
    let on = false
    const driver = new PlaybackDriver({
      clock: r.clock, engine: r.engine, getScore: () => r.s, getAudio: () => DEFAULT_SETTINGS.audio, audioEnabled: () => on,
    })
    driver.setScore(r.s, { mode: 'scale', scale: 1 })
    r.clock.play()
    r.src.currentTime += 0.3
    driver.tick()
    // Enabling audio later must not replay what the cursor already passed.
    on = true
    driver.tick()
    expect(r.engine.play).not.toHaveBeenCalled()
  })

  it('start() ticks on an interval and stop()/dispose() end it', () => {
    const r = rig()
    const tick = vi.spyOn(r.driver, 'tick')
    r.driver.start()
    vi.advanceTimersByTime(100)
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(3)
    r.driver.dispose()
    tick.mockClear()
    vi.advanceTimersByTime(100)
    expect(tick).not.toHaveBeenCalled()
  })
})

describe('PlaybackDriver driven by a ManualClock', () => {
  it('derives the engine origin from engine time when the clock is not an AudioClock', () => {
    let ms = 0
    const clock = new ManualClock({ nowMs: () => ms })
    const engine = { currentTime: 50, play: vi.fn(), stopAll: vi.fn(), metronome: () => ({ click: vi.fn(), stop: vi.fn() }) }
    const s = score()
    const d = new PlaybackDriver({ clock, engine, getScore: () => s, getAudio: () => DEFAULT_SETTINGS.audio, audioEnabled: () => true })
    d.setScore(s, { mode: 'scale', scale: 1 })
    clock.seek(0.45)
    clock.play()
    ms += 10
    d.tick()
    const [sched, , origin] = engine.play.mock.calls[0]
    expect(sched.note.id).toBe(1)
    expect(origin).toBeCloseTo(50 - clock.now(), 9)
  })

  it('reads no engine time while audio is off (a missing AudioContext must not throw per tick)', () => {
    const clock = new ManualClock({ nowMs: () => 0 })
    const engine = {
      get currentTime(): number { throw new Error('no Web Audio') },
      play: vi.fn(), stopAll: vi.fn(), metronome: () => ({ click: vi.fn(), stop: vi.fn() }),
    }
    const s = score()
    const d = new PlaybackDriver({ clock, engine, getScore: () => s, getAudio: () => DEFAULT_SETTINGS.audio, audioEnabled: () => false })
    d.setScore(s, { mode: 'scale', scale: 1 })
    clock.play()
    expect(() => d.tick()).not.toThrow()
  })
  it('an engine whose time throws (no Web Audio) reports once through onAudioError and goes silent', () => {
    let ms = 0
    const clock = new ManualClock({ nowMs: () => ms })
    const engine = {
      get currentTime(): number { throw new Error('no Web Audio') },
      play: vi.fn(), stopAll: vi.fn(), metronome: () => ({ click: vi.fn(), stop: vi.fn() }),
    }
    const onAudioError = vi.fn()
    const s = score()
    const d = new PlaybackDriver({
      clock, engine, getScore: () => s, getAudio: () => DEFAULT_SETTINGS.audio, audioEnabled: () => true, onAudioError,
    })
    d.setScore(s, { mode: 'scale', scale: 1 })
    clock.play()
    for (let i = 0; i < 5; i++) { expect(() => d.tick()).not.toThrow(); ms += 300 }
    expect(onAudioError).toHaveBeenCalledTimes(1)
    expect(engine.play).not.toHaveBeenCalled()
  })

  it('a throwing audioEnabled() never throws out of tick', () => {
    const clock = new ManualClock({ nowMs: () => 0 })
    const engine = { currentTime: 0, play: vi.fn(), stopAll: vi.fn(), metronome: () => ({ click: vi.fn(), stop: vi.fn() }) }
    const onAudioError = vi.fn()
    const s = score()
    const d = new PlaybackDriver({
      clock, engine, getScore: () => s, getAudio: () => DEFAULT_SETTINGS.audio,
      audioEnabled: () => { throw new Error('boom') }, onAudioError,
    })
    d.setScore(s, { mode: 'scale', scale: 1 })
    clock.play()
    expect(() => { d.tick(); d.tick() }).not.toThrow()
    expect(onAudioError).toHaveBeenCalledTimes(1)
    expect(engine.play).not.toHaveBeenCalled()
  })
})
