import { SplendidGrandPiano, Soundfont } from 'smplr'
import type { Voice } from '../model/types'
import type { ScheduledNote } from './scheduler'

const GRAND_PIANO_ID = 'acoustic_grand_piano'

/** The instance type produced by either smplr instrument factory we use. */
type Instrument = ReturnType<typeof SplendidGrandPiano> | ReturnType<typeof Soundfont>

/** Never schedule in the past -- after a seek, originSec + atSec can be behind the clock. */
export function clampToNow(when: number, now: number): number {
  return Math.max(when, now)
}

/** smplr's start() has no per-note gain, so voice volume folds into velocity. */
export function foldVelocity(velocity: number, volume: number): number {
  return Math.min(127, Math.max(0, velocity * volume))
}

/**
 * Owns the AudioContext and a cache of smplr instruments. AudioContext.currentTime
 * is the app's single clock; everything visible derives from it.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private instruments = new Map<string, Instrument>()
  private loading = new Map<string, Promise<void>>()

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    return this.ctx
  }

  get currentTime(): number {
    return this.context().currentTime
  }

  get ready(): boolean {
    return this.instruments.size > 0
  }

  /** Browsers require a user gesture before audio will sound. */
  async resume(): Promise<void> {
    const ctx = this.context()
    if (ctx.state === 'suspended') await ctx.resume()
  }

  private async createInstrument(id: string): Promise<Instrument> {
    const ctx = this.context()
    const inst = id === GRAND_PIANO_ID ? SplendidGrandPiano(ctx) : Soundfont(ctx, { instrument: id })
    await inst.ready
    return inst
  }

  /** One retry of the same instrument before the caller gives up on it. */
  private async createInstrumentWithRetry(id: string): Promise<Instrument> {
    try {
      return await this.createInstrument(id)
    } catch {
      return await this.createInstrument(id)
    }
  }

  async loadInstrument(id: string): Promise<void> {
    if (this.instruments.has(id)) return
    const existing = this.loading.get(id)
    if (existing) return existing

    const task = (async () => {
      try {
        this.instruments.set(id, await this.createInstrumentWithRetry(id))
      } catch {
        // Retry-once on the requested instrument already failed twice; fall
        // back to the grand piano so a missing soundfont never blocks
        // playback or the visuals.
        if (id === GRAND_PIANO_ID) return
        try {
          let fallback = this.instruments.get(GRAND_PIANO_ID)
          if (!fallback) {
            fallback = await this.createInstrumentWithRetry(GRAND_PIANO_ID)
            this.instruments.set(GRAND_PIANO_ID, fallback)
          }
          this.instruments.set(id, fallback)
        } catch {
          /* leave id unloaded; play() becomes a no-op for it */
        }
      }
    })().finally(() => this.loading.delete(id))

    this.loading.set(id, task)
    return task
  }

  /**
   * Schedules one note at an exact AudioContext time. originSec is the context
   * time corresponding to playhead zero, so atSec (a score time) becomes an
   * absolute context time.
   */
  play(s: ScheduledNote, voice: Voice, originSec: number): void {
    if (!voice.audible) return
    const inst = this.instruments.get(voice.instrument)
    if (!inst) return

    const when = clampToNow(originSec + s.atSec, this.currentTime)
    const velocity = foldVelocity(s.note.velocity, voice.volume)

    inst.start({
      note: s.note.pitch,
      time: when,
      duration: Math.max(0.02, s.note.endSec - s.note.startSec),
      velocity,
    })
  }

  stopAll(): void {
    for (const inst of this.instruments.values()) {
      try {
        inst.stop()
      } catch {
        /* smplr throws if nothing is sounding */
      }
    }
  }
}
