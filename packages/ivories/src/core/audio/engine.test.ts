import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioEngine, LIVE_VOICE_ID, clampToNow, volumeToGain } from './engine'
import type { InstrumentFactoryFn } from './engine'
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
  const makeInstrument = vi.fn(async (_c: AudioContext, id: string, destination: AudioNode) => {
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

describe('AudioEngine audioContext / masterNode', () => {
  it('exposes the same context instance used internally, creating it lazily', () => {
    const h = harness()
    expect(h.engine.audioContext).toBe(h.ctx)
  })

  it('exposes the master gain node so an external voice can route through it', () => {
    const h = harness()
    const master = h.engine.masterNode
    expect(master).toBeTruthy()
    // Same instance on repeat access -- one master bus for the whole engine.
    expect(h.engine.masterNode).toBe(master)
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

  it('scales the note time and duration by the clock rate', async () => {
    await h.engine.loadVoice(voice('v1'))
    h.engine.play(sched(60, 4), voice('v1'), 100, 2)
    expect(h.made[0].start).toHaveBeenCalledWith(expect.objectContaining({ time: 102, duration: 0.5 }))
  })

  it('passes raw velocity to the instrument -- volume must NOT fold into it', async () => {
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

  // Fix round 1, issue 1 (F7 follow-up): with a naive "await the one pending
  // load, then re-check once" guard, 3+ overlapping loadVoice calls for the
  // SAME voice can each pass a now-stale re-check and each build their own
  // instrument: the requested instrument ends up built twice (one leaked)
  // and the pre-existing instrument disposed twice. The fix must instead
  // keep re-reading the loading map and chain onto whatever load is
  // CURRENTLY in flight, so a third caller discovers and waits on the second
  // caller's build instead of starting a competing one.
  it('re-checks against the latest in-flight load, so 3+ overlapping loadVoice calls never leak or double-build', async () => {
    const ctx = fakeContext()
    const made: FakeInstrument[] = []
    const gates: Array<() => void> = []
    const makeInstrument: InstrumentFactoryFn = (_c, id, destination) => {
      return new Promise((resolve) => {
        gates.push(() => {
          const inst = { id, destination, start: vi.fn(), stop: vi.fn(), dispose: vi.fn() }
          made.push(inst)
          resolve(inst as never)
        })
      })
    }
    const engine = new AudioEngine({
      makeContext: () => ctx as unknown as AudioContext,
      makeInstrument,
    })

    const p0 = engine.loadVoice(voice('v1', { instrument: 'acoustic_grand_piano' }))
    const p1 = engine.loadVoice(voice('v1', { instrument: 'harpsichord' }))
    const p2 = engine.loadVoice(voice('v1', { instrument: 'harpsichord' }))

    expect(gates).toHaveLength(1) // only the piano build has started so far
    gates[0]()                    // let the piano finish
    await p0

    // p1 and p2's continuations both run before our `await p0` settles (they
    // registered on the same promise first) -- p2 must discover p1's build
    // already in flight and chain onto it rather than starting its own.
    expect(gates).toHaveLength(2) // exactly ONE harpsichord build started
    gates[1]()                    // let it finish
    await Promise.all([p1, p2])

    expect(gates).toHaveLength(2)                          // never a third build
    expect(made).toHaveLength(2)                           // piano + one harpsichord instance
    expect(made[0].dispose).toHaveBeenCalledTimes(1)        // piano disposed exactly once
    expect(made[1].dispose).not.toHaveBeenCalled()          // the live harpsichord instance stays
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

  // Fix round 1, issue 2: retainVoices removes the voice's bus from the map,
  // but a loadVoice already in flight closed over that SAME bus object and
  // keeps writing into it regardless. Nothing else can ever reach an
  // instrument built into an orphaned bus, so it must be disposed the moment
  // the build notices its bus is no longer live -- otherwise it leaks.
  it('disposes an instrument built for a voice that was retired (retainVoices) while its load was in flight', async () => {
    const p = h.engine.loadVoice(voice('v1')) // not yet awaited
    h.engine.retainVoices([])                 // retire v1 before the load resolves
    await p

    expect(h.made).toHaveLength(1)
    expect(h.made[0].dispose).toHaveBeenCalledTimes(1)
    // And it must not resurrect the bus: v1 is still gone.
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

describe('AudioEngine.resume / running', () => {
  it('calls ctx.resume() synchronously, so a click handler that does not await still counts as the gesture', () => {
    const { ctx, engine } = harness()
    ctx.state = 'suspended'
    void engine.resume()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
  })

  it('resumes an iOS "interrupted" context too, not only a suspended one', () => {
    const { ctx, engine } = harness()
    ctx.state = 'interrupted' as AudioContextState
    void engine.resume()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
  })

  it('reports whether the context is actually running', () => {
    const { ctx, engine } = harness()
    ctx.state = 'suspended'
    expect(engine.running).toBe(false)
    ctx.state = 'running'
    expect(engine.running).toBe(true)
  })
})

describe('AudioEngine live voice (spec §4.1)', () => {
  function liveHarness() {
    const starts: number[] = []
    const stops: number[] = []
    const instStops: string[] = []
    const engine = new AudioEngine({
      makeContext: () => fakeContext() as unknown as AudioContext,
      makeInstrument: async () => ({
        start: (o: { note: number }) => { starts.push(o.note); return () => { stops.push(o.note) } },
        stop() { instStops.push('stop') },
        dispose() {},
      }) as never,
    })
    return { engine, starts, stops, instStops }
  }

  it('sounds live keys on a dedicated bus that survives retainVoices', async () => {
    const { engine, starts, stops } = liveHarness()
    await engine.prepareLive()
    engine.noteOn(60, 90)
    engine.retainVoices([])
    engine.noteOff(60)
    expect(stops).toEqual([60])
    engine.noteOn(62, 90)
    expect(starts).toEqual([60, 62])
  })

  it('is silent before prepareLive and ignores an unknown noteOff', () => {
    const { engine, starts } = liveHarness()
    engine.noteOn(60, 90)
    expect(() => engine.noteOff(61)).not.toThrow()
    expect(starts).toEqual([])
  })

  it('a repeated noteOn retriggers: the old note stops first', async () => {
    const { engine, stops } = liveHarness()
    await engine.prepareLive()
    engine.noteOn(60, 90)
    engine.noteOn(60, 50)
    expect(stops).toEqual([60])
  })

  it('stopAll (seek/pause/rate) leaves the live bus sounding', async () => {
    const { engine, instStops } = liveHarness()
    await engine.prepareLive()
    engine.stopAll()
    expect(instStops).toEqual([])
    expect(LIVE_VOICE_ID).toBe('__live')
  })

  it('dispose stops held live notes', async () => {
    const { engine, stops } = liveHarness()
    await engine.prepareLive()
    engine.noteOn(64, 80)
    engine.dispose()
    expect(stops).toEqual([64])
  })
})

/**
 * A fake pepperscore/audio: the engine's only sound layer. Instruments record every start
 * (what pepperscore would turn into an AudioBufferSourceNode), and stop() cancels them.
 */
function fakePepperscore(o: { shared?: boolean } = {}) {
  const ctx = fakeContext()
  const master = { id: 'pepperscore-master' }
  type Start = { note: unknown; time: number; duration: number; velocity: number; destination?: unknown }
  const instruments: { sound: string; options: Record<string, unknown>; starts: Start[]; stop: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = []
  const metronomes: { options: Record<string, unknown>; ticks: unknown[]; voices: string[]; output: { gain: { value: number } }; stop: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = []
  const api = {
    getSharedAudio: vi.fn(() => (o.shared === false ? null : { context: ctx, master })),
    resumeAudio: vi.fn(async (c: { resume(): Promise<void> }) => { await c.resume(); return true }),
    loadInstrument: vi.fn(async (sound: string, options: Record<string, unknown>) => {
      const inst = { sound, options, starts: [] as Start[], stop: vi.fn(), dispose: vi.fn() }
      instruments.push(inst)
      return { start: (s: Start) => { inst.starts.push(s); return () => {} }, stop: inst.stop, dispose: inst.dispose }
    }),
    createMetronome: vi.fn(async (options: Record<string, unknown>) => {
      const m = { options, ticks: [] as unknown[], voices: [] as string[], output: { gain: { value: 0.5 } }, stop: vi.fn(), dispose: vi.fn() }
      metronomes.push(m)
      return {
        output: m.output as unknown as GainNode,
        tick: (t: unknown) => { m.ticks.push(t); return () => {} },
        setVoice: vi.fn(async (v: string) => { m.voices.push(v) }),
        stop: m.stop, dispose: m.dispose,
      }
    }),
  }
  return { ctx, master, api, instruments, metronomes }
}

describe('AudioEngine on pepperscore/audio (one engine on the page)', () => {
  it('plays on pepperscore\'s shared context, through its master compressor', () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    expect(engine.audioContext).toBe(ps.ctx)
    const masterGain = ps.ctx.createGain.mock.results[0].value
    expect(masterGain.connect).toHaveBeenCalledWith(ps.master)
  })

  it('without Web Audio, reading the time throws (the provider then plays silently)', () => {
    const ps = fakePepperscore({ shared: false })
    const engine = new AudioEngine({ audioApi: ps.api as never })
    expect(() => engine.currentTime).toThrow(/Web Audio/)
  })

  it('loads each voice with loadInstrument on the context, into the voice\'s own gain, with the sounds options', async () => {
    const ps = fakePepperscore()
    const sources = [{ id: 'mine', programs: [1], kind: 'sf2', url: '/my.sf2' }]
    const engine = new AudioEngine({
      audioApi: ps.api as never,
      sounds: { assetBaseUrl: 'https://sounds.example.test/', soundPack: 'complete', sources: sources as never, instrument: 'bright_acoustic_piano' },
    })
    await engine.loadVoice(voice('v1'))
    await engine.loadVoice(voice('v2', { instrument: 'violin' }))
    await engine.prepareLive()
    expect(ps.instruments.map((i) => i.sound)).toEqual(['bright_acoustic_piano', 'violin', 'bright_acoustic_piano'])
    const [first] = ps.instruments
    expect(first.options).toMatchObject({ context: ps.ctx, assetBaseUrl: 'https://sounds.example.test/', soundPack: 'complete', sources })
    expect(ps.instruments[0].options.destination).not.toBe(ps.instruments[1].options.destination)
  })

  it('0.1.0\'s `pack` still picks the sound pack (deprecated alias of soundPack)', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never, sounds: { pack: 'complete' } })
    await engine.loadVoice(voice('v1'))
    expect(ps.instruments[0].options.soundPack).toBe('complete')
  })

  it('with no sounds option, every instrument comes from pepperscore\'s default asset base (no other loader)', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await engine.loadVoice(voice('v1'))
    expect(ps.api.loadInstrument).toHaveBeenCalledWith('acoustic_grand_piano', expect.not.objectContaining({ assetBaseUrl: expect.anything() }))
  })

  // Regression (0.1.1 silence, .superpowers/audio-diagnosis.md): the GM pack was handed to smplr keyed by
  // MIDI-number strings, so no pitch matched a sample and no voice ever started. pepperscore resolves samples
  // from the MIDI NOTE NUMBER itself; every scheduled note must reach start() as that number, unchanged.
  it('hands every scheduled note to the instrument as its MIDI note number, at its time, velocity untouched', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await engine.loadVoice(voice('v1'))
    for (const [pitch, at] of [[21, 0.5], [60, 1], [61, 1.5], [108, 2]] as const) engine.play(sched(pitch, at, 77), voice('v1'), 20)
    const starts = ps.instruments[0].starts
    expect(starts.map((s) => s.note)).toEqual([21, 60, 61, 108])
    for (const s of starts) expect(typeof s.note).toBe('number')
    expect(starts.map((s) => s.time)).toEqual([20.5, 21, 21.5, 22])
    expect(starts.every((s) => s.velocity === 77 && s.duration === 1)).toBe(true)
  })

  it('live keys go over as MIDI numbers too, now, on their own release envelope', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await engine.prepareLive()
    engine.noteOn(64, 99)
    const [s] = ps.instruments[0].starts
    expect(s).toMatchObject({ note: 64, time: 10, velocity: 99 })
    expect(s.duration).toBeGreaterThan(1)
    expect(s.destination).toBeDefined()
  })

  it('stopAll cancels what was queued on every score voice (pepperscore\'s stop), never the live bus', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await engine.loadVoice(voice('v1'))
    await engine.prepareLive()
    engine.stopAll()
    expect(ps.instruments[0].stop).toHaveBeenCalledTimes(1)
    expect(ps.instruments[1].stop).not.toHaveBeenCalled()
  })

  it('a note that cannot start (not loaded) is silent and does not throw into the scheduler', async () => {
    const engine = new AudioEngine({
      makeContext: () => fakeContext() as unknown as AudioContext,
      makeInstrument: async () => ({ start: () => { throw new Error('not loaded') }, stop() {}, dispose() {} }),
    })
    await engine.loadVoice(voice('v1'))
    expect(() => engine.play(sched(60, 0), voice('v1'), 0)).not.toThrow()
  })

  it('resume goes through pepperscore\'s bounded resumeAudio', async () => {
    const ps = fakePepperscore()
    ps.ctx.state = 'suspended'
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await engine.resume()
    expect(ps.api.resumeAudio).toHaveBeenCalledWith(ps.ctx)
  })
})

describe('AudioEngine.setSounds (reload in place)', () => {
  it('reloads every loaded voice and the live bus from the new base; later notes use it', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never, sounds: { assetBaseUrl: 'https://a.test/' } })
    await engine.loadVoice(voice('v1'))
    await engine.prepareLive()
    await engine.setSounds({ assetBaseUrl: 'https://b.test/' })
    expect(ps.instruments.map((i) => i.options.assetBaseUrl)).toEqual(['https://a.test/', 'https://a.test/', 'https://b.test/', 'https://b.test/'])
    expect(ps.instruments[0].dispose).toHaveBeenCalled()
    engine.play(sched(60, 0), voice('v1'), 0)
    expect(ps.instruments[2].starts).toHaveLength(1)
  })

  it('the same content is a no-op', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never, sounds: { soundPack: 'core' } })
    await engine.loadVoice(voice('v1'))
    await engine.setSounds({ soundPack: 'core' })
    expect(ps.instruments).toHaveLength(1)
  })

  it('an explicit makeInstrument keeps its instruments', async () => {
    const h = harness()
    await h.engine.loadVoice(voice('v1'))
    await h.engine.setSounds({ assetBaseUrl: 'https://b.test/' })
    expect(h.made).toHaveLength(1)
  })
})

describe('AudioEngine metronome (pepperscore createMetronome, built lazily)', () => {
  it('loads nothing until it is prepared or clicks', () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    engine.setMetronomeVoice('drum-machine')
    engine.metronome()
    expect(ps.api.createMetronome).not.toHaveBeenCalled()
  })

  it('prepare builds it on the engine master (synth click first, so a beat is never silent), then loads the chosen voice', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never, sounds: { assetBaseUrl: 'https://sounds.example.test/' } })
    engine.setMetronomeVoice('drum-machine')
    await engine.prepareMetronome()
    expect(ps.api.createMetronome).toHaveBeenCalledTimes(1)
    expect(ps.metronomes[0].options).toMatchObject({ context: ps.ctx, destination: engine.masterNode, voice: 'click', assetBaseUrl: 'https://sounds.example.test/' })
    expect(ps.metronomes[0].voices).toEqual(['drum-machine'])
    await engine.prepareMetronome()
    expect(ps.api.createMetronome).toHaveBeenCalledTimes(1)
  })

  it('defaults to the woodblock and follows a later voice change', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await engine.prepareMetronome()
    engine.setMetronomeVoice('click')
    await engine.prepareMetronome()
    expect(ps.metronomes[0].voices).toEqual(['woodblock', 'click'])
  })

  it('click ticks at the time (clamped to now) with the accent as beat 1, at the metronome volume', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await engine.prepareMetronome()
    const m = engine.metronome()
    m.click(12, true, 0.8)
    m.click(5, false, 0.3)
    m.click(13, false, 0)
    expect(ps.metronomes[0].ticks).toEqual([{ time: 12, beat: 0, accent: true }, { time: 10, beat: 1, accent: false }])
    expect(ps.metronomes[0].output.gain.value).toBeCloseTo(0.3)
  })

  it('a click asked for while it is still being built is played once it exists', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    engine.metronome().click(11, true, 1)
    await engine.prepareMetronome()
    expect(ps.metronomes[0].ticks).toEqual([{ time: 11, beat: 0, accent: true }])
  })

  it('stop cancels its scheduled beats; dispose releases it', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await engine.prepareMetronome()
    engine.metronome().stop()
    expect(ps.metronomes[0].stop).toHaveBeenCalledTimes(1)
    engine.dispose()
    expect(ps.metronomes[0].dispose).toHaveBeenCalledTimes(1)
  })

  it('a metronome that cannot be built stays quiet and never rejects', async () => {
    const ps = fakePepperscore()
    ps.api.createMetronome.mockRejectedValueOnce(new Error('no audio'))
    const engine = new AudioEngine({ audioApi: ps.api as never })
    await expect(engine.prepareMetronome()).resolves.toBeUndefined()
    expect(() => engine.metronome().click(11, true, 1)).not.toThrow()
  })

  it('keeps clicking after a sounds change, through a reference held from before it (the driver\'s), on a metronome from the new base', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never, sounds: { assetBaseUrl: 'https://a.test/' } })
    await engine.prepareMetronome()
    const held = engine.metronome()
    held.click(12, true, 1)
    await engine.setSounds({ assetBaseUrl: 'https://b.test/' })
    expect(ps.metronomes[0].dispose).toHaveBeenCalledTimes(1)
    held.click(13, false, 1)
    await engine.prepareMetronome()
    engine.metronome().click(14, true, 1)
    expect(ps.metronomes).toHaveLength(2)
    expect(ps.metronomes[1].options.assetBaseUrl).toBe('https://b.test/')
    expect(ps.metronomes[1].ticks).toEqual([{ time: 13, beat: 1, accent: false }, { time: 14, beat: 0, accent: true }])
    // The voice survives the rebuild.
    expect(ps.metronomes[1].voices).toEqual(['woodblock'])
  })

  it('a build still in flight when the sounds change or the engine is disposed is disposed on arrival, never attached', async () => {
    const ps = fakePepperscore()
    const real = ps.api.createMetronome.getMockImplementation()!
    const gates: (() => void)[] = []
    ps.api.createMetronome.mockImplementation(async (o: Record<string, unknown>) => {
      await new Promise<void>((r) => gates.push(r))
      return real(o)
    })
    const engine = new AudioEngine({ audioApi: ps.api as never, sounds: { assetBaseUrl: 'https://a.test/' } })
    engine.metronome().click(11, true, 1)
    expect(gates).toHaveLength(1)
    await engine.setSounds({ assetBaseUrl: 'https://b.test/' })
    engine.metronome().click(11.5, false, 1)
    expect(gates).toHaveLength(2)
    gates[0](); gates[1]()
    await engine.prepareMetronome()
    // The stale build (old base) is thrown away; only the new one sounds.
    expect(ps.metronomes.map((m) => m.options.assetBaseUrl).sort()).toEqual(['https://a.test/', 'https://b.test/'])
    const stale = ps.metronomes.find((m) => m.options.assetBaseUrl === 'https://a.test/')!
    const fresh = ps.metronomes.find((m) => m.options.assetBaseUrl === 'https://b.test/')!
    expect(stale.dispose).toHaveBeenCalledTimes(1)
    expect(stale.ticks).toEqual([])
    expect(fresh.ticks).toEqual([{ time: 11.5, beat: 1, accent: false }])
    // Dispose while a build is in flight: it arrives to a dead engine and is disposed too.
    engine.metronome().stop()
    const e2 = new AudioEngine({ audioApi: ps.api as never })
    e2.metronome().click(11, true, 1)
    e2.dispose()
    gates[2]()
    await new Promise((r) => setTimeout(r, 0))
    const late = ps.metronomes[2]
    expect(late.dispose).toHaveBeenCalledTimes(1)
    expect(late.ticks).toEqual([])
  })

  it('clicks asked for while it is still loading do not all knock at once: those already past are dropped', async () => {
    const ps = fakePepperscore()
    const engine = new AudioEngine({ audioApi: ps.api as never })
    const m = engine.metronome()
    // The context clock reads 10: the build took longer than a beat.
    m.click(9, true, 1)
    m.click(9.5, false, 1)
    m.click(10.2, false, 1)
    await engine.prepareMetronome()
    expect(ps.metronomes[0].ticks).toEqual([{ time: 10.2, beat: 1, accent: false }])
  })
})
