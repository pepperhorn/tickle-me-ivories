import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioEngine, clampToNow, volumeToGain } from './engine'
import type { Voice } from '../model/types'
import type { ScheduledNote } from './scheduler'

const voice = (id: string, patch: Partial<Voice> = {}): Voice => ({
  id, label: id, hue: 200, instrument: 'acoustic_grand_piano',
  visible: true, audible: true, volume: 1, ...patch,
})

const sched = (pitch: number, atSec: number, velocity = 100): ScheduledNote => ({
  atSec,
  note: {
    id: pitch, pitch, startTicks: 0, durTicks: 480,
    startSec: atSec, endSec: atSec + 1, velocity, voiceId: 'v1',
  },
})

/** Minimal AudioContext stand-in: jsdom has no Web Audio. */
function fakeGain() {
  return { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
}
function fakeContext() {
  return {
    currentTime: 10,
    state: 'running' as AudioContextState,
    destination: { id: 'dest' },
    createGain: vi.fn(fakeGain),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }
}

type FakeInstrument = { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; destination: AudioNode; id: string }

function harness() {
  const ctx = fakeContext()
  const made: FakeInstrument[] = []
  const makeInstrument = vi.fn(async (_c: BaseAudioContext, id: string, destination: AudioNode) => {
    const inst = { id, destination, start: vi.fn(), stop: vi.fn(), dispose: vi.fn() }
    made.push(inst)
    return inst as never
  })
  const engine = new AudioEngine({
    makeContext: () => ctx as unknown as AudioContext,
    makeInstrument,
  })
  return { ctx, made, makeInstrument, engine }
}

describe('volumeToGain', () => {
  it('maps the ends of the range exactly', () => {
    expect(volumeToGain(0)).toBe(0)
    expect(volumeToGain(1)).toBe(1)
  })

  it('is a perceptual (square) curve, not linear', () => {
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 9)
  })

  it('rises monotonically and clamps out-of-range input', () => {
    let prev = -1
    for (let v = 0; v <= 1.0001; v += 0.05) {
      const g = volumeToGain(v)
      expect(g).toBeGreaterThanOrEqual(prev)
      prev = g
    }
    expect(volumeToGain(-3)).toBe(0)
    expect(volumeToGain(9)).toBe(1)
  })
})

describe('clampToNow', () => {
  it('never schedules in the past', () => {
    expect(clampToNow(5, 10)).toBe(10)
    expect(clampToNow(12, 10)).toBe(12)
  })
})

describe('AudioEngine voice bus', () => {
  let h: ReturnType<typeof harness>
  beforeEach(() => { h = harness() })

  it('gives two voices on the SAME instrument two instances with different destinations', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v2'))
    expect(h.made).toHaveLength(2)
    expect(h.made[0].destination).not.toBe(h.made[1].destination)
  })

  it('passes raw velocity to smplr -- volume must NOT fold into it', async () => {
    await h.engine.loadVoice(voice('v1', { volume: 0.25 }))
    h.engine.play(sched(60, 0.5, 100), voice('v1', { volume: 0.25 }), 0)
    expect(h.made[0].start).toHaveBeenCalledWith(
      expect.objectContaining({ note: 60, velocity: 100 }),
    )
  })

  // F4 ruling: load at volume 1 so this test actually exercises setVoiceVolume
  // -- with loadVoice already applying 0.5, the assertion would pass even if
  // setVoiceVolume were a no-op.
  it('applies volume to the voice gain node instead', async () => {
    await h.engine.loadVoice(voice('v1', { volume: 1 }))
    h.engine.setVoiceVolume('v1', 0.5)
    const gain = (h.made[0].destination as unknown as { gain: { value: number } }).gain
    expect(gain.value).toBeCloseTo(0.25, 9)
  })

  it('changes one voice volume without touching another', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v2'))
    h.engine.setVoiceVolume('v1', 0)
    const g1 = (h.made[0].destination as unknown as { gain: { value: number } }).gain
    const g2 = (h.made[1].destination as unknown as { gain: { value: number } }).gain
    expect(g1.value).toBe(0)
    expect(g2.value).toBe(1)
  })

  it('schedules against the voice its own instrument, at the exact clock time', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v2'))
    h.engine.play(sched(60, 2), voice('v2'), 20)
    expect(h.made[0].start).not.toHaveBeenCalled()
    expect(h.made[1].start).toHaveBeenCalledWith(expect.objectContaining({ time: 22 }))
  })

  it('disposes the old instance when a voice changes instrument', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v1', { instrument: 'harpsichord' }))
    expect(h.made[0].dispose).toHaveBeenCalled()
    expect(h.made).toHaveLength(2)
    expect(h.made[1].id).toBe('harpsichord')
  })

  it('does not rebuild an instance when the instrument is unchanged', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v1', { volume: 0.3 }))
    expect(h.made).toHaveLength(1)
    expect(h.made[0].dispose).not.toHaveBeenCalled()
  })

  it('retainVoices disposes and disconnects voices no longer in the score', async () => {
    await h.engine.loadVoice(voice('v1'))
    await h.engine.loadVoice(voice('v2'))
    h.engine.retainVoices(['v2'])
    expect(h.made[0].dispose).toHaveBeenCalled()
    expect(h.made[1].dispose).not.toHaveBeenCalled()
    h.engine.play(sched(60, 0), voice('v1'), 0)
    expect(h.made[0].start).not.toHaveBeenCalled()
  })

  it('is a silent no-op for an unloaded or muted voice', async () => {
    h.engine.play(sched(60, 0), voice('ghost'), 0)      // never loaded
    await h.engine.loadVoice(voice('v1', { audible: false }))
    h.engine.play(sched(60, 0), voice('v1', { audible: false }), 0)
    expect(h.made[0].start).not.toHaveBeenCalled()
  })

  // F5 ruling: capture the returned fallback instance and assert that its
  // start() was actually called by play() -- the original test only checked
  // that stopAll() did not throw, which proves nothing about sounding.
  it('falls back to the grand piano when an instrument fails twice', async () => {
    const ctx = fakeContext()
    let calls = 0
    let fallback: FakeInstrument | null = null
    const engine = new AudioEngine({
      makeContext: () => ctx as unknown as AudioContext,
      makeInstrument: async (_c, id, destination) => {
        calls++
        if (id !== 'acoustic_grand_piano') throw new Error('404')
        fallback = { id, destination, start: vi.fn(), stop: vi.fn(), dispose: vi.fn() }
        return fallback as never
      },
    })
    await engine.loadVoice(voice('v1', { instrument: 'broken_instrument' }))
    // two attempts at the requested instrument, then one at the fallback
    expect(calls).toBe(3)
    engine.play(sched(60, 0), voice('v1', { instrument: 'broken_instrument' }), 0)
    // it sounds -- a missing soundfont must never block playback
    expect(fallback).not.toBeNull()
    expect(fallback!.start).toHaveBeenCalledWith(
      expect.objectContaining({ note: 60 }),
    )
    expect(() => engine.stopAll()).not.toThrow()
  })
})
