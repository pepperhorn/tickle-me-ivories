import { ticksToSec } from '../model/tempoMap'
import { normaliseTimeSignatures } from '../model/timeSignatures'
import { clampToNow } from './engine'
import { LOOKAHEAD_SEC } from './scheduler'
import type { Metronome as PepperMetronome } from 'pepperscore/audio'
import type { MetronomeVoiceName } from '../settings/types'
import type { LeadIn } from '../model/countIn'
import type { ScoreDocument, TempoSetting } from '../model/types'

export interface Beat { sec: number; accent: boolean }

/**
 * Beat positions are computed in TICKS and converted through the tempo map,
 * never as a fixed interval. That is what makes the click follow a ritardando
 * and stay correct in both tempo modes.
 *
 * The pulse comes from each time signature in turn: one click per denominator
 * unit (a half note in 2/2, an eighth in 3/8), except in compound metres --
 * 6/8, 9/8, 12/8 and their /16 cousins -- where it clicks the dotted pulse, the
 * beat a player actually counts. Each signature starts a new bar, so the
 * accent re-seats at every change.
 */
export function beatTimes(score: ScoreDocument, setting: TempoSetting): Beat[] {
  if (score.notes.length === 0) return []
  const lastTick = score.notes.reduce((m, n) => Math.max(m, n.startTicks + n.durTicks), 0)
  const sigs = normaliseTimeSignatures(score.timeSignatures)
  const beats: Beat[] = []
  for (let s = 0; s < sigs.length; s++) {
    const { ticks: start, numerator: num, denominator: den } = sigs[s]
    const end = s + 1 < sigs.length ? sigs[s + 1].ticks : Infinity
    const compound = den >= 8 && num > 3 && num % 3 === 0
    const pulse = ((score.ppq * 4) / den) * (compound ? 3 : 1)
    const perBar = compound ? num / 3 : num
    for (let i = 0, ticks = start; ticks < end && ticks <= lastTick; i++, ticks = start + i * pulse) {
      beats.push({
        sec: ticksToSec(score.tempoMap, score.ppq, ticks, setting),
        accent: i % perBar === 0,
      })
    }
  }
  return beats
}

/**
 * The count-in clicks: one per lead-in beat, before t = 0, accent on 1. They
 * are prepended to beatTimes() in one cursor, so a start from the top (the
 * playhead at -lead.sec) clicks them and a resume or seek (playhead >= 0)
 * skips them without any special case.
 */
export function countInBeats(lead: LeadIn): Beat[] {
  const out: Beat[] = []
  for (let i = 0; i < lead.beats; i++) out.push({ sec: -lead.sec + i * lead.beatSec, accent: i === 0 })
  return out
}

/** Same cursor contract as Scheduler, over beats instead of notes. */
export class BeatCursor {
  private cursor = 0
  private beats: Beat[]

  constructor(beats: Beat[]) {
    this.beats = beats
  }

  seek(playheadSec: number): void {
    let lo = 0, hi = this.beats.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.beats[mid].sec < playheadSec) lo = mid + 1
      else hi = mid
    }
    this.cursor = lo
  }

  collect(playheadSec: number): Beat[] {
    const horizon = playheadSec + LOOKAHEAD_SEC
    const out: Beat[] = []
    while (this.cursor < this.beats.length && this.beats[this.cursor].sec < horizon) {
      out.push(this.beats[this.cursor++])
    }
    return out
  }
}

export type { MetronomeVoiceName }
/** The metronome's sounds (pepperscore/audio METRONOME_VOICES): wood blocks, kick and hat, or a soft synthesized tick. */
export const METRONOME_VOICE_NAMES: readonly MetronomeVoiceName[] = ['woodblock', 'drum-machine', 'click']
export const DEFAULT_METRONOME_VOICE: MetronomeVoiceName = 'woodblock'

/** Anything -> a metronome voice; unknown values are the default (woodblock). */
export function validMetronomeVoice(v: unknown): MetronomeVoiceName {
  return METRONOME_VOICE_NAMES.includes(v as MetronomeVoiceName) ? (v as MetronomeVoiceName) : DEFAULT_METRONOME_VOICE
}

/** The part of pepperscore/audio's Metronome this wrapper drives. */
export type PepperMetronomeLike = Pick<PepperMetronome, 'output' | 'tick' | 'setVoice' | 'stop' | 'dispose'>

/**
 * The click: pepperscore/audio's createMetronome on the engine's context and master bus, built
 * LAZILY (prepare(), or the first click). It is created on the synthesized 'click' voice, which
 * loads nothing, and then switched to the chosen voice: the wood blocks pull TimGM6mb.sf2
 * (about 6 MB) from the asset base, and until they arrive pepperscore plays a synthesized knock
 * (a soft tick for the drum machine), so a beat is never silent while the kit loads.
 *
 * Clicks are handed over up to LOOKAHEAD_SEC ahead of when they sound, exactly like notes in
 * AudioEngine.play. F19: every caller of engine.stopAll() (pause, seek, tempo change, file
 * load/unload) must also call stop() here, or clicks already scheduled keep sounding.
 */
export class SharedMetronome {
  private readonly create: () => Promise<PepperMetronomeLike>
  private readonly now: () => number
  private m: PepperMetronomeLike | null = null
  private building: Promise<PepperMetronomeLike | null> | null = null
  private failed = false
  private voice: MetronomeVoiceName = DEFAULT_METRONOME_VOICE
  /** Voice switches run one after another (pepperscore loads the kit once). */
  private chain: Promise<void> = Promise.resolve()
  /** Clicks asked for while the metronome was still being built (flushed, clamped to now, once it exists). */
  private queued: { time: number; accent: boolean; volume: number }[] = []

  constructor(create: () => Promise<PepperMetronomeLike>, now: () => number) {
    this.create = create
    this.now = now
  }

  get voiceName(): MetronomeVoiceName { return this.voice }

  /** Selects the voice. Loads nothing until the metronome is built; then loads the voice's drum notes. */
  setVoice(voice: MetronomeVoiceName): void {
    if (voice === this.voice) return
    this.voice = voice
    if (this.m) this.switchTo(this.m, voice)
  }

  /** Builds the metronome and loads the chosen voice. Resolves once that voice is ready (or fell back); never rejects. */
  async prepare(): Promise<void> {
    const m = await this.build()
    if (m) await this.chain
  }

  click(time: number, accent: boolean, volume: number): void {
    if (volume <= 0 || this.failed) return
    if (!this.m) {
      this.queued.push({ time, accent, volume })
      void this.build()
      return
    }
    this.tick(this.m, time, accent, volume)
  }

  /** Cancels every click already scheduled ahead of now, the same job engine.stopAll() does for notes. */
  stop(): void {
    this.queued = []
    try { this.m?.stop() } catch { /* nothing sounding */ }
  }

  dispose(): void {
    this.queued = []
    try { this.m?.dispose() } catch { /* already gone */ }
    this.m = null
  }

  private tick(m: PepperMetronomeLike, time: number, accent: boolean, volume: number): void {
    m.output.gain.value = Math.min(1, Math.max(0, volume))
    // Same guard as AudioEngine.play: a click behind the clock (after a seek) sounds now, not never.
    m.tick({ time: clampToNow(time, this.now()), beat: accent ? 0 : 1, accent })
  }

  private switchTo(m: PepperMetronomeLike, voice: MetronomeVoiceName): void {
    this.chain = this.chain.then(() => m.setVoice(voice)).catch(() => { /* pepperscore falls back to synth */ })
  }

  private build(): Promise<PepperMetronomeLike | null> {
    if (this.m) return Promise.resolve(this.m)
    if (this.failed) return Promise.resolve(null)
    this.building ??= this.create().then(
      (m) => {
        this.m = m
        this.switchTo(m, this.voice)
        const pending = this.queued.splice(0)
        for (const q of pending) this.tick(m, q.time, q.accent, q.volume)
        return m
      },
      () => { this.failed = true; this.queued = []; return null },
    )
    return this.building
  }
}
