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

  it("countInClicks 'always': the count-in clicks with the metronome off, the bar's beats do not", () => {
    const src = { currentTime: 10 }
    const clicks: { t: number; accent: boolean }[] = []
    const engine = {
      get currentTime() { return src.currentTime },
      play: vi.fn(), stopAll: vi.fn(),
      metronome: () => ({ click: (t: number, accent: boolean) => { clicks.push({ t, accent }) }, stop: vi.fn() }),
    }
    const clock = new AudioClock(src)
    const s = score()
    const audio = { ...DEFAULT_SETTINGS.audio, metronome: false, countIn: true }
    const driver = new PlaybackDriver({ clock, engine, getScore: () => s, getAudio: () => audio, audioEnabled: () => true, countInClicks: 'always' })
    driver.setScore(s, { mode: 'scale', scale: 1 }, { sec: 2, beats: 4, beatSec: 0.5 })
    clock.seek(-2)
    clock.play()
    for (let i = 0; i < 120; i++) { src.currentTime += 0.025; driver.tick() }
    // Four count-in clicks, accent on 1, at -2, -1.5, -1, -0.5 (engine time 8 + 2 = origin 12).
    expect(clicks.map((c) => c.accent)).toEqual([true, false, false, false])
    expect(clicks.map((c) => c.t - 12)).toEqual([-2, -1.5, -1, -0.5])
    // The count-in setting off silences them too.
    const quiet = { ...audio, countIn: false }
    const c2: number[] = []
    const d2 = new PlaybackDriver({ clock: new AudioClock(src), engine: { ...engine, metronome: () => ({ click: (t: number) => { c2.push(t) }, stop: vi.fn() }) }, getScore: () => s, getAudio: () => quiet, audioEnabled: () => true, countInClicks: 'always' })
    d2.setScore(s, { mode: 'scale', scale: 1 }, { sec: 2, beats: 4, beatSec: 0.5 })
    expect(c2).toEqual([])
  })

  it('setScore with two bars of lead-in clicks eight count-in beats', () => {
    const r = rig({ ...DEFAULT_SETTINGS.audio, metronome: true, countIn: true })
    r.driver.setScore(r.s, { mode: 'scale', scale: 1 }, { sec: 4, beats: 8, beatSec: 0.5 })
    r.clock.seek(-4)
    r.clock.play()
    for (let i = 0; i < 170; i++) { r.src.currentTime += 0.025; r.driver.tick() }
    expect(r.clicks.filter((t) => t < 14 - 1e-9).length).toBe(8)
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

describe('PlaybackDriver + the real AudioEngine on a fake pepperscore/audio (count-in, notes, Stop)', () => {
  async function engineRig(s: ScoreDocument) {
    const { AudioEngine } = await import('./engine')
    const { leadInFor } = await import('../model/countIn')
    const src = { currentTime: 10 }
    const gain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })
    const ctx = { get currentTime() { return src.currentTime }, state: 'running', destination: {}, createGain: vi.fn(gain) }
    const starts: { note: number; time: number }[] = []
    const ticks: { time: number; beat: number; accent?: boolean }[] = []
    const instStop = vi.fn()
    const metroStop = vi.fn()
    const engine = new AudioEngine({
      audioApi: {
        getSharedAudio: () => ({ context: ctx as never, master: {} as never }),
        loadInstrument: async () => ({ start: (o) => { starts.push({ note: o.note, time: o.time }); return () => {} }, stop: instStop, dispose: vi.fn() }),
        createMetronome: async () => ({ output: { gain: { value: 0.5 } } as never, tick: (o) => { ticks.push(o); return () => {} }, setVoice: async () => {}, stop: metroStop, dispose: vi.fn() }),
      },
    })
    await engine.loadVoice(s.voices[0])
    await engine.prepareMetronome()
    const clock = new AudioClock(src)
    const audio = { ...DEFAULT_SETTINGS.audio, metronome: false, countIn: true }
    const driver = new PlaybackDriver({ clock, engine, getScore: () => s, getAudio: () => audio, audioEnabled: () => true, countInClicks: 'always' })
    const lead = leadInFor(s, { mode: 'scale', scale: 1 })
    driver.setScore(s, { mode: 'scale', scale: 1 }, lead)
    return { src, clock, driver, engine, starts, ticks, instStop, metroStop, lead }
  }

  it('hands each note to the voice\'s pepperscore instrument as its MIDI number, after the count-in', async () => {
    const r = await engineRig(score())
    r.clock.seek(-r.lead.sec)
    r.clock.play()
    for (let i = 0; i < 200; i++) { r.src.currentTime += 0.025; r.driver.tick() }
    expect(r.starts.map((s) => s.note)).toEqual([60, 61, 62, 63])
    expect(r.ticks.map((t) => t.accent)).toEqual([true, false, false, false])
  })

  it('6/8 counts in every eighth (six clicks, accent on 1) on the pepperscore metronome', async () => {
    const s = { ...score(), timeSignatures: [{ ticks: 0, numerator: 6, denominator: 8 }] }
    const r = await engineRig(s)
    expect(r.lead.beats).toBe(6)
    r.clock.seek(-(r.lead.sec + 0.2))   // the provider starts one lookahead early, so beat 1 is not late
    r.clock.play()
    for (let i = 0; i < 80; i++) { r.src.currentTime += 0.025; r.driver.tick() }
    expect(r.ticks.map((t) => t.beat)).toEqual([0, 1, 1, 1, 1, 1])
    const gaps = r.ticks.slice(1).map((t, i) => +(t.time - r.ticks[i].time).toFixed(6))
    expect(new Set(gaps)).toEqual(new Set([0.25]))   // an eighth at 120 BPM
  })

  it('Stop (pause) cancels the queued notes and clicks: pepperscore stop() on both, nothing handed over after', async () => {
    const r = await engineRig(score())
    r.clock.seek(-0.55)   // the last count-in click (-0.5), then the first note
    r.clock.play()
    for (let i = 0; i < 18; i++) { r.src.currentTime += 0.025; r.driver.tick() }
    const handed = r.starts.length
    expect(handed).toBeGreaterThan(0)
    expect(r.ticks.length).toBeGreaterThan(0)
    r.clock.pause()
    expect(r.instStop).toHaveBeenCalled()
    expect(r.metroStop).toHaveBeenCalled()
    for (let i = 0; i < 40; i++) { r.src.currentTime += 0.025; r.driver.tick() }
    expect(r.starts.length).toBe(handed)
  })

  it('a sounds change mid-session leaves the metronome and count-in clicking (the driver never keeps a dead metronome)', async () => {
    const r = await engineRig(score())
    r.clock.seek(-r.lead.sec)
    r.clock.play()
    for (let i = 0; i < 20; i++) { r.src.currentTime += 0.025; r.driver.tick() }
    const before = r.ticks.length
    expect(before).toBeGreaterThan(0)
    await r.engine.setSounds({ assetBaseUrl: 'https://b.test/' })
    for (let i = 0; i < 4; i++) await Promise.resolve()
    for (let i = 0; i < 40; i++) { r.src.currentTime += 0.025; r.driver.tick(); await Promise.resolve() }
    await new Promise((res) => setTimeout(res, 0))
    expect(r.ticks.length).toBe(4)
    expect(r.ticks.map((t) => t.accent)).toEqual([true, false, false, false])
  })
})

describe('PlaybackDriver.setLeadIn (a Count-in change)', () => {
  it('while playing, rebuilds the beat cursor without re-handing a click or a note already given to Web Audio', () => {
    const r = rig({ ...DEFAULT_SETTINGS.audio, metronome: true, countIn: true })
    r.clock.seek(0.4)
    r.clock.play()
    r.driver.tick()
    expect(r.clicks).toHaveLength(1)
    expect(r.clicks[0]).toBeCloseTo(10.1, 9)   // the beat at 0.5, origin 9.6
    r.driver.setLeadIn(r.s, { mode: 'scale', scale: 1 }, { sec: 4, beats: 8, beatSec: 0.5 })
    r.driver.tick()
    r.src.currentTime += 0.025
    r.driver.tick()
    expect(r.clicks).toHaveLength(1)
    expect(r.engine.play).toHaveBeenCalledTimes(1)
    // Later beats still come.
    for (let i = 0; i < 20; i++) { r.src.currentTime += 0.025; r.driver.tick() }
    expect(r.clicks).toHaveLength(2)
  })

  it('while paused, the new lead-in is what the next Play from the top counts', () => {
    const r = rig({ ...DEFAULT_SETTINGS.audio, metronome: true, countIn: true })
    r.driver.setLeadIn(r.s, { mode: 'scale', scale: 1 }, { sec: 4, beats: 8, beatSec: 0.5 })
    r.clock.seek(-4)
    r.clock.play()
    for (let i = 0; i < 170; i++) { r.src.currentTime += 0.025; r.driver.tick() }
    expect(r.clicks.filter((t) => t < 14 - 1e-9).length).toBe(8)
  })
})
