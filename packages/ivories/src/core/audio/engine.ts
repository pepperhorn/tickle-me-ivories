import * as pepperAudio from 'pepperscore/audio'
import type { Voice } from '../model/types'
import type { ScheduledNote } from './scheduler'
import { SharedMetronome } from './metronome'
import type { MetronomeVoiceName, PepperMetronomeLike } from './metronome'
import { GM_PIANO, instrumentOptions, soundFor } from './sounds'
import type { SoundsOption } from './sounds'

/** The bus live MIDI keys sound on (spec §4.1). retainVoices and stopAll leave it alone. */
export const LIVE_VOICE_ID = '__live'
const LIVE_VOICE: Voice = {
  id: LIVE_VOICE_ID, label: 'Live', hue: 0, instrument: GM_PIANO, visible: true, audible: true, volume: 1,
}

/** How long a held live key may ring before the sample itself ends it. */
const LIVE_HOLD_SEC = 30
/** A released live key fades over this long instead of cutting off with a click. */
const LIVE_RELEASE_SEC = 0.12

/**
 * What the engine needs of an instrument: pepperscore/audio's Instrument. `start` takes a MIDI
 * note NUMBER and an exact AudioContext time and returns that note's stop; `stop` stops every
 * sounding note and cancels every scheduled one.
 */
export interface Instrument {
  start(o: { note: number; time: number; duration: number; velocity: number; destination?: AudioNode }): () => void
  stop(): void
  dispose(): void
}

/** The parts of pepperscore/audio the engine uses (a test seam: pass fakes for any of them). */
export interface AudioApi {
  getSharedAudio: typeof pepperAudio.getSharedAudio
  resumeAudio: typeof pepperAudio.resumeAudio
  loadInstrument: (sound: string, options: pepperAudio.InstrumentOptions) => Promise<Instrument>
  createMetronome: (options: pepperAudio.MetronomeOptions) => Promise<PepperMetronomeLike>
}

const PEPPERSCORE_AUDIO: AudioApi = {
  getSharedAudio: pepperAudio.getSharedAudio,
  resumeAudio: pepperAudio.resumeAudio,
  loadInstrument: pepperAudio.loadInstrument,
  createMetronome: pepperAudio.createMetronome,
}

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

/** Builds one voice's instrument: `id` is the voice's instrument (a GM sound name or 'drums'). */
export type InstrumentFactoryFn = (ctx: AudioContext, id: string, destination: AudioNode) => Promise<Instrument>

export interface AudioEngineDeps {
  /** Default: pepperscore's page-wide context (getSharedAudio), playing through its master compressor. */
  makeContext?: () => AudioContext
  /** Default: pepperscore/audio loadInstrument with the `sounds` options. Wins over `sounds`. */
  makeInstrument?: InstrumentFactoryFn
  /** Asset base, sound pack and own sources for every instrument and the metronome. */
  sounds?: SoundsOption
  /** Test seam: replaces parts of pepperscore/audio. */
  audioApi?: Partial<AudioApi>
}

const soundsKeyOf = (s: SoundsOption | undefined): string => (s ? JSON.stringify(s) : '')

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
 * Owns one instrument + gain node per VOICE on pepperscore's shared AudioContext,
 * and the metronome. AudioContext.currentTime is the app's single clock; the
 * scheduler (PlaybackDriver) decides what plays when, the engine only hands each
 * note to its voice's pepperscore instrument at an exact context time.
 *
 * Graph:  instrument -> voiceGain -> masterGain -> pepperscore master compressor -> destination
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private buses = new Map<string, VoiceBus>()
  private loading = new Map<string, Promise<void>>()
  private masterVolume = 0.8
  private metro: SharedMetronome | null = null
  private metroVoice: MetronomeVoiceName | null = null
  private readonly liveStops = new Map<number, (cut?: boolean) => void>()
  private readonly makeContext: (() => AudioContext) | null
  private readonly api: AudioApi
  private readonly customFactory: InstrumentFactoryFn | null
  private sounds: SoundsOption | undefined
  private soundsKey: string
  private gen = 0

  constructor(deps: AudioEngineDeps = {}) {
    this.makeContext = deps.makeContext ?? null
    this.api = { ...PEPPERSCORE_AUDIO, ...deps.audioApi }
    this.customFactory = deps.makeInstrument ?? null
    this.sounds = deps.sounds
    this.soundsKey = soundsKeyOf(deps.sounds)
  }

  private makeInstrument(id: string, destination: AudioNode): Promise<Instrument> {
    const ctx = this.context()
    if (this.customFactory) return this.customFactory(ctx, id, destination)
    return this.api.loadInstrument(soundFor(id, this.sounds), { context: ctx, destination, ...instrumentOptions(this.sounds) })
  }

  /**
   * Switches the asset base / sound pack / sources without rebuilding the engine:
   * every loaded voice and the live bus reload their instrument in place, each
   * keeping the old one sounding until its replacement is ready, and the
   * metronome (the same SharedMetronome object) is rebuilt on its next use. Same content is a no-op; an explicit
   * makeInstrument (test/host seam) keeps its instruments. Never rejects.
   */
  setSounds(sounds: SoundsOption | undefined): Promise<void> {
    const key = soundsKeyOf(sounds)
    if (key === this.soundsKey) return Promise.resolve()
    this.soundsKey = key
    this.sounds = sounds
    // The same SharedMetronome stays (the driver and hosts may hold it); only the pepperscore
    // metronome inside it is dropped, and rebuilt from the new sounds on its next use.
    this.metro?.reset()
    if (this.customFactory) return Promise.resolve()
    this.gen++
    const reloads = [...this.buses.values()].map((b) => this.loadVoice(b.voice).catch(() => {}))
    return Promise.all(reloads).then(() => {})
  }

  /** The context, built on first use (never at import). Throws without Web Audio. */
  private context(): AudioContext {
    if (!this.ctx) {
      let ctx: AudioContext
      let out: AudioNode
      if (this.makeContext) {
        ctx = this.makeContext()
        out = ctx.destination
      } else {
        const shared = this.api.getSharedAudio()
        if (!shared) throw new Error('Web Audio is not available on this device.')
        ctx = shared.context
        out = shared.master
      }
      const master = ctx.createGain()
      master.gain.value = volumeToGain(this.masterVolume)
      master.connect(out)
      this.ctx = ctx
      this.master = master
    }
    return this.ctx
  }

  get currentTime(): number {
    return this.context().currentTime
  }

  get audioContext(): AudioContext {
    return this.context()
  }

  /** The engine's master gain: score voices, live keys and the metronome all go through it. */
  get masterNode(): GainNode {
    this.context()
    return this.master!
  }

  get ready(): boolean {
    return [...this.buses.values()].some((b) => b.instrument !== null)
  }

  /**
   * Browsers require a user gesture before audio will sound. pepperscore's
   * resumeAudio() calls ctx.resume() synchronously (before its first await), so
   * a click handler that does not await this still unlocks audio inside the
   * gesture, and its wait is bounded: it never hangs on a device with no output.
   * Covers iOS Safari's 'interrupted' state too (anything but 'running').
   */
  async resume(): Promise<void> {
    const ctx = this.context()
    if (ctx.state === 'running' || ctx.state === 'closed') return
    await this.api.resumeAudio(ctx)
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
      return await this.makeInstrument(id, destination)
    } catch {
      return await this.makeInstrument(id, destination)
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
        // back to the grand piano so a missing sound never blocks playback
        // or the visuals.
        if (voice.instrument === GM_PIANO) return
        try {
          built = await this.createWithRetry(GM_PIANO, bus.gain)
          bus.instrument = built
          bus.instrumentId = GM_PIANO
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
    try { bus.instrument?.dispose() } catch { /* already gone */ }
    bus.gain.disconnect()
    this.buses.delete(id)
  }

  /** Loads the live piano (spec §4.1 liveAudio). Safe to call repeatedly. */
  prepareLive(): Promise<void> {
    return this.loadVoice(LIVE_VOICE)
  }

  /** Sounds a live key now. Silent until prepareLive() has finished. */
  noteOn(midi: number, velocity: number): void {
    const bus = this.buses.get(LIVE_VOICE_ID)
    const inst = bus?.instrument
    if (!bus || !inst) return
    this.noteOff(midi, true)
    const ctx = this.context()
    // A gain per key so the release can fade (pepperscore's stop cuts the sample).
    // Known limitation (README, CHANGELOG): an SF2 plan ignores `destination` and plays
    // through the instrument's output, so on TimGM6mb a release cuts instead of fading.
    // Fading inst.output or the bus would fade every held key, so it is left as is.
    const env = ctx.createGain()
    env.connect(bus.gain)
    const t = ctx.currentTime
    const stop = inst.start({ note: midi, time: t, duration: LIVE_HOLD_SEC, velocity, destination: env })
    const end = () => { try { stop() } catch { /* ended */ } env.disconnect() }
    this.liveStops.set(midi, (cut) => {
      if (cut) { end(); return }
      const now = ctx.currentTime
      try {
        env.gain.cancelScheduledValues(now)
        env.gain.setValueAtTime(env.gain.value, now)
        env.gain.linearRampToValueAtTime(0, now + LIVE_RELEASE_SEC)
      } catch { end(); return }
      setTimeout(end, LIVE_RELEASE_SEC * 1000 + 30)
    })
  }

  /** Releases a live key (a short fade; `cut` stops it at once). A key that never sounded is ignored. */
  noteOff(midi: number, cut = false): void {
    const stop = this.liveStops.get(midi)
    if (!stop) return
    this.liveStops.delete(midi)
    try { stop(cut) } catch { /* already stopped */ }
  }

  /** The metronome (built lazily: nothing loads until prepareMetronome() or its first click). */
  metronome(): SharedMetronome {
    if (!this.metro) {
      const metro = new SharedMetronome(
        () => this.api.createMetronome({
          context: this.context(), destination: this.masterNode, voice: 'click', ...instrumentOptions(this.sounds),
        }),
        () => this.currentTime,
      )
      if (this.metroVoice) metro.setVoice(this.metroVoice)
      this.metro = metro
    }
    return this.metro
  }

  /** The metronome's voice (woodblock, drum-machine, click). Loads nothing by itself. */
  setMetronomeVoice(voice: MetronomeVoiceName): void {
    this.metroVoice = voice
    this.metro?.setVoice(voice)
  }

  /** Builds the metronome and loads its voice (the wood blocks fetch TimGM6mb.sf2). Never rejects. */
  prepareMetronome(): Promise<void> {
    try { return this.metronome().prepare() } catch { return Promise.resolve() }
  }

  /**
   * Schedules one note at an exact AudioContext time. originSec is the context
   * time corresponding to playhead zero and `rate` the clock's score-seconds per
   * context-second, so atSec (a score time) lands at originSec + atSec / rate and
   * the duration shrinks or stretches by the same factor. The note goes over as
   * its MIDI NUMBER (pepperscore resolves samples from it). Velocity is passed
   * THROUGH -- see volumeToGain.
   */
  play(s: ScheduledNote, voice: Voice, originSec: number, rate = 1): void {
    if (!voice.audible) return
    const inst = this.buses.get(voice.id)?.instrument
    if (!inst) return
    try {
      inst.start({
        note: s.note.pitch,
        time: clampToNow(originSec + s.atSec / rate, this.currentTime),
        duration: Math.max(0.02, (s.note.endSec - s.note.startSec) / rate),
        velocity: s.note.velocity,
      })
    } catch {
      // One note that cannot start (not loaded) is silent; it must not take
      // the rest of the session's audio with it.
    }
  }

  /** Silences scheduled score audio (seek, pause, rate): sounding notes stop, queued ones are cancelled. Live keys keep sounding. */
  stopAll(): void {
    for (const [id, bus] of this.buses) {
      if (id === LIVE_VOICE_ID) continue
      try {
        bus.instrument?.stop()
      } catch {
        /* nothing sounding */
      }
    }
  }

  dispose(): void {
    for (const midi of [...this.liveStops.keys()]) this.noteOff(midi, true)
    this.liveStops.clear()
    for (const [id, bus] of [...this.buses]) this.disposeBus(id, bus)
    this.metro?.dispose()
    this.metro = null
    this.master?.disconnect()
  }
}
