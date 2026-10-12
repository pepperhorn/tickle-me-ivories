import { AudioClock } from '../clock/AudioClock'
import { Scheduler, TICK_MS } from './scheduler'
import { BeatCursor, beatTimes, countInBeats } from './metronome'
import { leadInFor } from '../model/countIn'
import type { Clock, ClockEvent } from '../clock/types'
import type { ScheduledNote } from './scheduler'
import type { AudioSettings } from '../settings/types'
import type { ScoreDocument, TempoSetting, Voice } from '../model/types'

export interface MetronomeLike {
  click(time: number, accent: boolean, volume: number): void
  stop(): void
}

export interface PlaybackEngine {
  readonly currentTime: number
  play(s: ScheduledNote, voice: Voice, originSec: number, rate?: number): void
  stopAll(): void
  metronome(): MetronomeLike
}

export interface PlaybackDriverOptions {
  clock: Clock
  engine: PlaybackEngine
  /** Read every tick: a voice edit replaces the score object but not its notes. */
  getScore(): ScoreDocument | null
  getAudio(): AudioSettings
  /** False: keep the cursors level with the clock but hand nothing to the engine. */
  audioEnabled(): boolean
  /** Pause at the end of the score (default true; off for a MediaClock). */
  stopAtEnd?: boolean
}

/**
 * The scheduler tick that used to live in App.tsx, driven by any Clock.
 * Audio timing comes from the exact `time` handed to smplr, not from when
 * the interval fires. Every seek, rate change and pause silences what was
 * already scheduled and re-seats the cursors (Global Constraints).
 */
export class PlaybackDriver {
  private scheduler: Scheduler | null = null
  private beats: BeatCursor | null = null
  private metronome: MetronomeLike | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly off: () => void
  private readonly o: PlaybackDriverOptions

  constructor(o: PlaybackDriverOptions) {
    this.o = o
    this.off = o.clock.subscribe((e) => this.onClock(e))
  }

  /**
   * Rebuild the cursors. Call when score.notes is REPLACED (load or retime),
   * never on a voice edit: rebuilding re-hands notes smplr already has.
   * The count-in clicks sit before t = 0 in the same beat cursor.
   */
  setScore(score: ScoreDocument | null, tempo: TempoSetting): void {
    if (!score) { this.scheduler = null; this.beats = null; return }
    const head = this.o.clock.now()
    const s = new Scheduler(score.notes)
    s.seek(head)
    this.scheduler = s
    const b = new BeatCursor([...countInBeats(leadInFor(score, tempo)), ...beatTimes(score, tempo)])
    b.seek(head)
    this.beats = b
  }

  start(): void {
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  dispose(): void {
    this.stop()
    this.off()
  }

  /** Cancels everything already handed to the engine, notes and clicks. */
  silence(): void {
    this.o.engine.stopAll()
    this.metronome?.stop()
  }

  tick(): void {
    const { clock, engine } = this.o
    const score = this.o.getScore()
    const s = this.scheduler
    if (!clock.playing || !s || !score) return
    const head = clock.now()

    if ((this.o.stopAtEnd ?? true) && head >= score.durationSec) {
      clock.pause()
      clock.seek(score.durationSec)
      return
    }

    const audible = this.o.audioEnabled()
    const rate = clock.rate
    const origin = this.originFor(head)
    for (const sched of s.collect(head)) {
      if (!audible) continue
      const voice = score.voices.find((v) => v.id === sched.note.voiceId)
      if (voice) engine.play(sched, voice, origin, rate)
    }

    const audio = this.o.getAudio()
    if (audible && audio.metronome && this.beats) {
      this.metronome ??= engine.metronome()
      for (const beat of this.beats.collect(head)) {
        // Count-in clicks (sec < 0) only while the Count-in setting is on.
        if (beat.sec < 0 && audio.countIn === false) continue
        this.metronome.click(origin + beat.sec / rate, beat.accent, audio.metronomeVolume)
      }
    } else {
      // Keep the beat cursor level with the playhead while the click is off,
      // so switching it on mid-piece does not fire every beat since the start.
      this.beats?.seek(head)
    }
  }

  /** Engine time of score-time 0. Exact for an AudioClock; derived otherwise. */
  private originFor(head: number): number {
    const c = this.o.clock
    if (c instanceof AudioClock && !c.silentFallback) return c.originSec
    return this.o.engine.currentTime - head / c.rate
  }

  private onClock(e: ClockEvent): void {
    switch (e.type) {
      case 'play':
        // e.time is the exact session start (e.g. -(lead + pad)), not now - origin,
        // which can land an ulp past the accented first count-in beat.
        this.scheduler?.seek(e.time)
        this.beats?.seek(e.time)
        break
      case 'pause':
        this.silence()
        break
      case 'seek':
      case 'rate':
        this.silence()
        this.scheduler?.seek(e.time)
        this.beats?.seek(e.time)
        break
    }
  }
}
