import { describe, it, expect, vi } from 'vitest'
import { BeatCursor, MetronomeVoice, beatTimes } from './metronome'
import { buildTempoMap } from '../model/tempoMap'
import type { NoteEvent, ScoreDocument } from '../model/types'

function score(patch: Partial<ScoreDocument> = {}): ScoreDocument {
  const notes: NoteEvent[] = [
    { id: 0, pitch: 60, startTicks: 0, durTicks: 1920, startSec: 0, endSec: 2, velocity: 90, voiceId: 'a' },
  ]
  return {
    id: 'x', name: 'x', ppq: 480,
    tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480),
    voices: [], notes, durationSec: 2, sourceFormat: 'midi', beatsPerBar: 4,
    keySignature: null,
    ...patch,
  }
}

describe('beatTimes', () => {
  it('places a beat on every quarter note, inclusive of the last', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('accents the first beat of each bar', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, false, true])
  })

  it('follows the time signature', () => {
    const beats = beatTimes(score({ beatsPerBar: 3 }), { mode: 'scale', scale: 1 })
    expect(beats.map((b) => b.accent)).toEqual([true, false, false, true, false])
  })

  it('follows the tempo scale', () => {
    const beats = beatTimes(score(), { mode: 'scale', scale: 2 })
    expect(beats.map((b) => b.sec)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('follows a tempo change in the map rather than a fixed interval', () => {
    const s = score({ tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }], 480) })
    const beats = beatTimes(s, { mode: 'scale', scale: 1 })
    // 0.5s per beat at 120, then 1.0s per beat from tick 960 (= 1.0s) onward
    expect(beats.map((b) => b.sec)).toEqual([0, 0.5, 1, 2, 3])
  })

  it('flattens the map in absolute mode', () => {
    const s = score({ tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 960, bpm: 60 }], 480) })
    const beats = beatTimes(s, { mode: 'absolute', bpm: 60 })
    expect(beats.map((b) => b.sec)).toEqual([0, 1, 2, 3, 4])
  })

  it('returns nothing for an empty score', () => {
    expect(beatTimes(score({ notes: [] }), { mode: 'scale', scale: 1 })).toEqual([])
  })
})

describe('BeatCursor', () => {
  const beats = [0, 0.5, 1, 1.5, 2].map((sec, i) => ({ sec, accent: i % 4 === 0 }))

  it('hands back each beat exactly once', () => {
    const c = new BeatCursor(beats)
    const seen = [
      ...c.collect(0), ...c.collect(0.5), ...c.collect(1),
      ...c.collect(1.5), ...c.collect(2),
    ]
    expect(seen.map((b) => b.sec)).toEqual([0, 0.5, 1, 1.5, 2])
  })

  it('includes a beat inside the lookahead window', () => {
    const c = new BeatCursor(beats)
    // 0.4 + 0.15 lookahead reaches 0.55, so beats at 0 and 0.5 are both due
    expect(c.collect(0.4).map((b) => b.sec)).toEqual([0, 0.5])
  })

  it('re-seats in both directions on seek', () => {
    // F16: collect(1)'s horizon is 1.15, so only the beat at 1 is due yet.
    const c = new BeatCursor(beats)
    c.collect(2)
    c.seek(1)
    expect(c.collect(1).map((b) => b.sec)).toEqual([1])
    expect(c.collect(1.4).map((b) => b.sec)).toEqual([1.5])
  })
})

/** Minimal Web Audio stand-in: jsdom has no real AudioContext. */
function fakeAudioNode() {
  return {
    connect: vi.fn(), disconnect: vi.fn(),
    start: vi.fn(), stop: vi.fn(),
    frequency: { value: 0 }, type: '',
    onended: null as (() => void) | null,
  }
}
function fakeGainNode() {
  return {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 1 },
    connect: vi.fn(), disconnect: vi.fn(),
  }
}
function fakeCtx(currentTime: number) {
  const osc = fakeAudioNode()
  const gain = fakeGainNode()
  const ctx = {
    currentTime,
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gain),
  }
  return { ctx: ctx as unknown as BaseAudioContext, osc, gain }
}

describe('MetronomeVoice.click', () => {
  // The bug this guards: App.tsx schedules clicks up to LOOKAHEAD_SEC ahead, but by
  // the time a tick runs (after a play/seek/tempo change), state.originSec + beat.sec
  // can already be behind ctx.currentTime -- the same situation AudioEngine.play
  // guards with clampToNow. Scheduling the gain envelope at a PAST time makes
  // exponentialRampToValueAtTime measure its ramp from that past instant, so most
  // (or all) of the 35ms decay has already elapsed before anything can be heard.
  it('clamps a past scheduled time to now, for start, envelope and stop alike', () => {
    const { ctx, osc, gain } = fakeCtx(10)
    const voice = new MetronomeVoice(ctx, {} as AudioNode)
    voice.click(5, false, 1) // 5 is behind currentTime 10
    expect(osc.start).toHaveBeenCalledWith(10)
    expect(osc.stop).toHaveBeenCalledWith(10 + 0.035)
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(expect.any(Number), 10)
    expect(gain.gain.exponentialRampToValueAtTime)
      .toHaveBeenCalledWith(expect.any(Number), 10 + 0.035)
  })

  it('does not clamp a time that is already in the future', () => {
    const { ctx, osc } = fakeCtx(10)
    const voice = new MetronomeVoice(ctx, {} as AudioNode)
    voice.click(12, false, 1)
    expect(osc.start).toHaveBeenCalledWith(12)
    expect(osc.stop).toHaveBeenCalledWith(12 + 0.035)
  })

  it('schedules nothing when volume is zero', () => {
    const { ctx, osc } = fakeCtx(10)
    const voice = new MetronomeVoice(ctx, {} as AudioNode)
    voice.click(10, true, 0)
    expect(osc.start).not.toHaveBeenCalled()
  })
})

describe('MetronomeVoice.stop', () => {
  it('stops a click already handed to Web Audio, the same job stopAll() does for notes', () => {
    const { ctx, osc } = fakeCtx(10)
    const voice = new MetronomeVoice(ctx, {} as AudioNode)
    voice.click(20, false, 1) // scheduled ahead; osc.stop already called once for the envelope
    voice.stop()
    expect(osc.stop).toHaveBeenCalledTimes(2)
  })

  it('is safe to call with nothing pending', () => {
    const { ctx } = fakeCtx(10)
    const voice = new MetronomeVoice(ctx, {} as AudioNode)
    expect(() => voice.stop()).not.toThrow()
  })
})
