import { SampleLoader, Soundfont, SplendidGrandPiano } from 'smplr'
import type { Voice } from '../model/types'
import type { ScheduledNote } from './scheduler'

const GRAND_PIANO_ID = 'acoustic_grand_piano'

/** The instance type produced by either smplr instrument factory we use. */
type Instrument = ReturnType<typeof SplendidGrandPiano> | ReturnType<typeof Soundfont>

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
}

/**
 * smplr's factories take `O & Partial<SmplrOptions>`, so `destination` and the
 * shared `loader` are both accepted alongside each factory's own config.
 * Sharing one SampleLoader is what makes per-voice instances affordable: its
 * load() is cached by resolved URL, so N voices on the grand piano cost one
 * fetch and one decode between them.
 */
const defaultMakeInstrument: InstrumentFactoryFn = async (ctx, id, destination, loader) => {
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
  private readonly makeContext: () => AudioContext
  private readonly makeInstrument: InstrumentFactoryFn

  constructor(deps: AudioEngineDeps = {}) {
    this.makeContext = deps.makeContext ?? (() => new AudioContext())
    this.makeInstrument = deps.makeInstrument ?? defaultMakeInstrument
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.makeContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = volumeToGain(this.masterVolume)
      this.master.connect(this.ctx.destination)
      this.loader = SampleLoader(this.ctx)
    }
    return this.ctx
  }

  get currentTime(): number {
    return this.context().currentTime
  }

  get ready(): boolean {
    return [...this.buses.values()].some((b) => b.instrument !== null)
  }

  /** Browsers require a user gesture before audio will sound. */
  async resume(): Promise<void> {
    const ctx = this.context()
    if (ctx.state === 'suspended') await ctx.resume()
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
    const created: VoiceBus = { gain, instrumentId: '', instrument: null }
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
    bus.gain.gain.value = volumeToGain(voice.volume)
    if (bus.instrumentId === voice.instrument && bus.instrument) return

    const pending = this.loading.get(voice.id)
    if (pending) {
      await pending
      // Re-check: the pending load may have already landed this exact
      // instrument, in which case a second build would create a duplicate
      // instance instead of reusing the one the other caller just made.
      if (bus.instrumentId === voice.instrument && bus.instrument) return
    }

    const task = (async () => {
      const previous = bus.instrument
      try {
        bus.instrument = await this.createWithRetry(voice.instrument, bus.gain)
        bus.instrumentId = voice.instrument
      } catch {
        // Retry-once on the requested instrument already failed twice; fall
        // back to the grand piano so a missing soundfont never blocks playback
        // or the visuals.
        if (voice.instrument === GRAND_PIANO_ID) return
        try {
          bus.instrument = await this.createWithRetry(GRAND_PIANO_ID, bus.gain)
          bus.instrumentId = GRAND_PIANO_ID
        } catch {
          /* leave the voice silent; play() becomes a no-op for it */
        }
      } finally {
        if (previous && previous !== bus.instrument) previous.dispose()
      }
    })().finally(() => this.loading.delete(voice.id))

    this.loading.set(voice.id, task)
    return task
  }

  /** Disposes every voice bus not in `ids`. Called when a score is replaced. */
  retainVoices(ids: string[]): void {
    const keep = new Set(ids)
    for (const [id, bus] of this.buses) {
      if (keep.has(id)) continue
      bus.instrument?.dispose()
      bus.gain.disconnect()
      this.buses.delete(id)
    }
  }

  /**
   * Schedules one note at an exact AudioContext time. originSec is the context
   * time corresponding to playhead zero, so atSec (a score time) becomes an
   * absolute context time. Velocity is passed THROUGH -- see volumeToGain.
   */
  play(s: ScheduledNote, voice: Voice, originSec: number): void {
    if (!voice.audible) return
    const inst = this.buses.get(voice.id)?.instrument
    if (!inst) return

    inst.start({
      note: s.note.pitch,
      time: clampToNow(originSec + s.atSec, this.currentTime),
      duration: Math.max(0.02, s.note.endSec - s.note.startSec),
      velocity: s.note.velocity,
    })
  }

  stopAll(): void {
    for (const bus of this.buses.values()) {
      try {
        bus.instrument?.stop()
      } catch {
        /* smplr throws if nothing is sounding */
      }
    }
  }

  dispose(): void {
    this.retainVoices([])
    this.master?.disconnect()
  }
}
