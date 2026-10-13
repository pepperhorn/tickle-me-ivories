import { SampleLoader, Soundfont, SplendidGrandPiano } from 'smplr'
import type { Sampler } from 'smplr'
import type { Voice } from '../model/types'
import type { ScheduledNote } from './scheduler'
import { MetronomeVoice } from './metronome'
import { gmInstrumentFactory, isGmInstrument } from './gmSounds'
import type { GmSoundDeps, SoundsOption } from './gmSounds'

const GRAND_PIANO_ID = 'acoustic_grand_piano'

/** The bus live MIDI keys sound on (spec §4.1). retainVoices and stopAll leave it alone. */
export const LIVE_VOICE_ID = '__live'
const LIVE_VOICE: Voice = {
  id: LIVE_VOICE_ID, label: 'Live', hue: 0, instrument: GRAND_PIANO_ID, visible: true, audible: true, volume: 1,
}

/** The instance type produced by any smplr instrument factory we use (Sampler: the GM pack, R-G). */
export type Instrument = ReturnType<typeof SplendidGrandPiano> | ReturnType<typeof Soundfont> | Sampler

/** Never schedule in the past -- after a seek, originSec + atSec can be behind the clock. */
export function clampToNow(when: number, now: number): number {
  return Math.max(when, now)
}

/**
 * Voice volume is LEVEL, not velocity. On a velocity-layered sampled piano,
 * velocity selects the sample layer, so folding volume into it would make a
 * quiet voice sound gently struck rather than quieter. Volume therefore lives
 * on a GainNode and velocity is passed through untouched.
 *
 * Square curve: a linear gain slider feels top-heavy because loudness is
 * roughly logarithmic. x^2 is the cheap approximation, exact at both ends.
 */
export function volumeToGain(volume: number): number {
  const v = Math.min(1, Math.max(0, volume))
  return v * v
}

export type InstrumentFactoryFn = (
  ctx: BaseAudioContext, id: string, destination: AudioNode, loader: unknown,
) => Promise<Instrument>

export interface AudioEngineDeps {
  makeContext?: () => AudioContext
  makeInstrument?: InstrumentFactoryFn
  /** Load the piano voice (and live keys) from the pepperscore-sounds GM pack (R-G). Ignored when makeInstrument is given. */
  sounds?: SoundsOption
  /** Test seam for the GM loader (fetch, Sampler construction). */
  soundsDeps?: GmSoundDeps
}

/**
 * smplr's factories take `O & Partial<SmplrOptions>`, so `destination` and the
 * shared `loader` are both accepted alongside each factory's own config.
 * Sharing one SampleLoader is what makes per-voice instances affordable: its
 * load() is cached by resolved URL, so N voices on the grand piano cost one
 * fetch and one decode between them.
 */
/**
 * One SampleLoader per AudioContext (module-level, created lazily, never at
 * import): several providers on the page share the shared context, so the
 * default piano's samples are fetched and decoded once, not once per provider.
 */
const loaders = new WeakMap<BaseAudioContext, unknown>()
function sharedSampleLoader(ctx: BaseAudioContext): unknown {
  let l = loaders.get(ctx)
  if (!l) { l = SampleLoader(ctx); loaders.set(ctx, l) }
  return l
}

const soundsKeyOf = (s: SoundsOption | undefined): string => (s ? JSON.stringify(s) : '')

export const defaultMakeInstrument: InstrumentFactoryFn = async (ctx, id, destination, loader) => {
  const opts = { destination, loader } as never
  const inst = id === GRAND_PIANO_ID
    ? SplendidGrandPiano(ctx, opts)
    : Soundfont(ctx, { instrument: id, ...(opts as object) } as never)
  await inst.ready
  return inst
}

interface VoiceBus {
  gain: GainNode
  instrumentId: string
  instrument: Instrument | null
  /** The voice last asked for, so setSounds can reload it. */
  voice: Voice
  /** The sound generation the instrument was built under (setSounds bumps it). */
  gen: number
}

/**
 * Owns the AudioContext and one instrument + gain node per VOICE.
 * AudioContext.currentTime is the app's single clock.
 *
 * Graph:  instrument -> voiceGain -> masterGain -> destination
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private loader: unknown = null
  private buses = new Map<string, VoiceBus>()
  private loading = new Map<string, Promise<void>>()
  private masterVolume = 0.8
  private metro: MetronomeVoice | null = null
  private readonly liveStops = new Map<number, () => void>()
  private readonly makeContext: () => AudioContext
  private makeInstrument: InstrumentFactoryFn
  private readonly customFactory: boolean
  private readonly soundsDeps: GmSoundDeps | undefined
  private soundsKey: string
  private gen = 0

  constructor(deps: AudioEngineDeps = {}) {
    this.makeContext = deps.makeContext ?? (() => new AudioContext())
    this.customFactory = deps.makeInstrument !== undefined
    this.soundsDeps = deps.soundsDeps
    this.soundsKey = soundsKeyOf(deps.sounds)
    this.makeInstrument = deps.makeInstrument ?? this.factoryFor(deps.sounds)
  }

  private factoryFor(sounds: SoundsOption | undefined): InstrumentFactoryFn {
    return sounds ? gmInstrumentFactory(sounds, defaultMakeInstrument, this.soundsDeps) : defaultMakeInstrument
  }

  /**
   * Switches the piano source (R-G) without rebuilding the engine: every loaded
   * voice and the live bus reload their instrument in place, each keeping the
   * old one sounding until its replacement is ready. Same content is a no-op;
   * an explicit makeInstrument (test/host seam) ignores it. Never rejects.
   */
  setSounds(sounds: SoundsOption | undefined): Promise<void> {
    const key = soundsKeyOf(sounds)
    if (this.customFactory || key === this.soundsKey) return Promise.resolve()
    this.soundsKey = key
    this.makeInstrument = this.factoryFor(sounds)
    this.gen++
    const reloads = [...this.buses.values()].map((b) => this.loadVoice(b.voice).catch(() => {}))
    return Promise.all(reloads).then(() => {})
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.makeContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = volumeToGain(this.masterVolume)
      this.master.connect(this.ctx.destination)
      this.loader = sharedSampleLoader(this.ctx)
    }
    return this.ctx
  }

  get currentTime(): number {
    return this.context().currentTime
  }

  /** The metronome routes through the master gain so master volume applies to it too. */
  get audioContext(): AudioContext {
    return this.context()
  }

  get masterNode(): GainNode {
    this.context()
    return this.master!
  }

  get ready(): boolean {
    return [...this.buses.values()].some((b) => b.instrument !== null)
  }

  /**
   * Browsers require a user gesture before audio will sound. ctx.resume() is
   * reached synchronously (before this function's first await), so a click
   * handler that calls resume() without awaiting it still unlocks audio inside
   * the gesture. Called outside a gesture, the returned promise can stay
   * pending until one arrives -- callers must not block other work on it.
   */
  async resume(): Promise<void> {
    const ctx = this.context()
    // Not only 'suspended': iOS Safari parks a context in 'interrupted' (a
    // call, another app taking audio) and it needs resume() just the same.
    if (ctx.state !== 'running' && ctx.state !== 'closed') await ctx.resume()
  }

  /** True once the context is actually producing sound. */
  get running(): boolean {
    return this.context().state === 'running'
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = volume
    if (this.master) this.master.gain.value = volumeToGain(volume)
  }

  setVoiceVolume(voiceId: string, volume: number): void {
    const bus = this.buses.get(voiceId)
    if (bus) bus.gain.gain.value = volumeToGain(volume)
  }

  private bus(voice: Voice): VoiceBus {
    const existing = this.buses.get(voice.id)
    if (existing) return existing
    const ctx = this.context()
    const gain = ctx.createGain()
    gain.gain.value = volumeToGain(voice.volume)
    gain.connect(this.master!)
    const created: VoiceBus = { gain, instrumentId: '', instrument: null, voice, gen: this.gen }
    this.buses.set(voice.id, created)
    return created
  }

  /** One retry of the same instrument before the caller gives up on it. */
  private async createWithRetry(id: string, destination: AudioNode): Promise<Instrument> {
    try {
      return await this.makeInstrument(this.context(), id, destination, this.loader)
    } catch {
      return await this.makeInstrument(this.context(), id, destination, this.loader)
    }
  }

  /**
   * Ensures this voice has a gain node and an instrument instance of its own.
   * Called on load and whenever the voice's instrument changes. Volume changes
   * must go through setVoiceVolume, which does not rebuild anything.
   */
  async loadVoice(voice: Voice): Promise<void> {
    const bus = this.bus(voice)
    bus.voice = voice
    bus.gain.gain.value = volumeToGain(voice.volume)
    const current = () => bus.instrumentId === voice.instrument && bus.instrument !== null && bus.gen === this.gen
    if (current()) return

    // Wait out any in-flight load(s) for this voice, re-checking the LOADING
    // MAP itself (not a stale reference) on every lap: with 3+ overlapping
    // calls, a newer load can supersede the one we started waiting on before
    // we resume, and we must chain onto that newer one instead of racing it
    // -- otherwise two callers can both pass a single stale re-check and each
    // build their own instance, leaking one and double-disposing `previous`.
    let pending: Promise<void> | undefined
    while ((pending = this.loading.get(voice.id))) {
      await pending
      if (current()) return
    }

    let task: Promise<void>
    task = (async () => {
      const previous = bus.instrument
      const gen = this.gen
      let built: Instrument | null = null
      try {
        built = await this.createWithRetry(voice.instrument, bus.gain)
        bus.instrument = built
        bus.instrumentId = voice.instrument
        bus.gen = gen
      } catch {
        // Retry-once on the requested instrument already failed twice; fall
        // back to the grand piano so a missing soundfont never blocks playback
        // or the visuals.
        if (voice.instrument === GRAND_PIANO_ID) return
        try {
          built = await this.createWithRetry(GRAND_PIANO_ID, bus.gain)
          bus.instrument = built
          bus.instrumentId = GRAND_PIANO_ID
          bus.gen = gen
        } catch {
          /* leave the voice silent; play() becomes a no-op for it */
        }
      } finally {
        // The voice may have been retired (retainVoices) while this load was
        // in flight. `bus` is a reference closed over at call time, so it is
        // no longer reachable from `this.buses` in that case -- retainVoices
        // already disposed whatever `previous` was, so disposing it again
        // here would double-dispose it. Instead dispose the instance we just
        // built, or it leaks: nothing else can ever reach it to clean it up.
        if (this.buses.get(voice.id) === bus) {
          if (previous && previous !== bus.instrument) previous.dispose()
        } else if (built) {
          built.dispose()
        }
      }
    })().finally(() => {
      // Only remove our OWN entry: a newer load for this voice may already
      // have replaced it in the map by the time we get here.
      if (this.loading.get(voice.id) === task) this.loading.delete(voice.id)
    })

    this.loading.set(voice.id, task)
    return task
  }

  /** Disposes every voice bus not in `ids` (the live bus always stays). Called when a score is replaced. */
  retainVoices(ids: string[]): void {
    const keep = new Set([...ids, LIVE_VOICE_ID])
    for (const [id, bus] of this.buses) {
      if (keep.has(id)) continue
      this.disposeBus(id, bus)
    }
  }

  private disposeBus(id: string, bus: VoiceBus): void {
    bus.instrument?.dispose()
    bus.gain.disconnect()
    this.buses.delete(id)
  }

  /** @internal e2e probe: true once a voice's instrument (LIVE_VOICE_ID for live keys) came from a GM pack. */
  isGmVoice(voiceId: string): boolean {
    return isGmInstrument(this.buses.get(voiceId)?.instrument)
  }

  /** Loads the live piano (spec §4.1 liveAudio). Safe to call repeatedly. */
  prepareLive(): Promise<void> {
    return this.loadVoice(LIVE_VOICE)
  }

  /** Sounds a live key now. Silent until prepareLive() has finished. */
  noteOn(midi: number, velocity: number): void {
    const inst = this.buses.get(LIVE_VOICE_ID)?.instrument
    if (!inst) return
    this.noteOff(midi)
    const stop = inst.start({ note: midi, velocity }) as unknown as () => void
    this.liveStops.set(midi, stop)
  }

  /** Releases a live key. A key that never sounded is ignored. */
  noteOff(midi: number): void {
    const stop = this.liveStops.get(midi)
    if (!stop) return
    this.liveStops.delete(midi)
    try { stop() } catch { /* already stopped */ }
  }

  /** The click, built on first use so it never creates the AudioContext early. */
  metronome(): MetronomeVoice {
    if (!this.metro) this.metro = new MetronomeVoice(this.audioContext, this.masterNode)
    return this.metro
  }

  /**
   * Schedules one note at an exact AudioContext time. originSec is the context
   * time corresponding to playhead zero and `rate` the clock's score-seconds per
   * context-second, so atSec (a score time) lands at originSec + atSec / rate and
   * the duration shrinks or stretches by the same factor. Velocity is passed
   * THROUGH -- see volumeToGain.
   */
  play(s: ScheduledNote, voice: Voice, originSec: number, rate = 1): void {
    if (!voice.audible) return
    const inst = this.buses.get(voice.id)?.instrument
    if (!inst) return

    inst.start({
      note: s.note.pitch,
      time: clampToNow(originSec + s.atSec / rate, this.currentTime),
      duration: Math.max(0.02, (s.note.endSec - s.note.startSec) / rate),
      velocity: s.note.velocity,
    })
  }

  /** Silences scheduled score audio (seek, pause, rate). Live keys keep sounding. */
  stopAll(): void {
    for (const [id, bus] of this.buses) {
      if (id === LIVE_VOICE_ID) continue
      try {
        bus.instrument?.stop()
      } catch {
        /* smplr throws if nothing is sounding */
      }
    }
  }

  dispose(): void {
    for (const midi of [...this.liveStops.keys()]) this.noteOff(midi)
    this.liveStops.clear()
    for (const [id, bus] of [...this.buses]) this.disposeBus(id, bus)
    this.master?.disconnect()
  }
}
