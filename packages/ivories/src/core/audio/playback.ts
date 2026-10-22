import { AudioClock } from '../clock/AudioClock'
import { Scheduler, TICK_MS } from './scheduler'
import { BeatCursor, beatTimes, countInBeats } from './metronome'
import { leadInFor } from '../model/countIn'
import type { Clock, ClockEvent } from '../clock/types'
import type { LeadIn } from '../model/countIn'
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
  /**
   * Called once if the audio half of a tick throws (no Web Audio, a dead
   * engine). The driver then keeps its cursors level and never touches the
   * engine again; nothing ever throws out of the interval.
   */
  onAudioError?(e: unknown): void
  /**
   * When the count-in clicks sound. 'with-metronome' (default, the studio): only
   * while the metronome is on. 'always' (the ivories components): whenever the
   * count-in is on, metronome or not -- the player needs the count either way.
   */
  countInClicks?: 'with-metronome' | 'always'
}

/**
 * The scheduler tick that used to live in App.tsx, driven by any Clock.
 * Audio timing comes from the exact `time` handed to the instruments, not from when
 * the interval fires. Every seek, rate change and pause silences what was
 * already scheduled and re-seats the cursors (Global Constraints).
 */
export class PlaybackDriver {
  private scheduler: Scheduler | null = null
  private beats: BeatCursor | null = null
  private metronome: MetronomeLike | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private audioFailed = false
  private readonly off: () => void
  private readonly o: PlaybackDriverOptions

  constructor(o: PlaybackDriverOptions) {
    this.o = o
    this.off = o.clock.subscribe((e) => this.onClock(e))
  }

  /**
   * Rebuild the cursors. Call when score.notes is REPLACED (load or retime),
   * never on a voice edit: rebuilding re-hands notes the instruments already have.
   * The count-in clicks sit before t = 0 in the same beat cursor.
   */
  setScore(score: ScoreDocument | null, tempo: TempoSetting, lead: LeadIn = score ? leadInFor(score, tempo) : { sec: 0, beats: 0, beatSec: 0 }): void {
    if (!score) { this.scheduler = null; this.beats = null; return }
    const head = this.o.clock.now()
    const s = new Scheduler(score.notes)
    s.seek(head)
    this.scheduler = s
    const b = new BeatCursor([...countInBeats(lead), ...beatTimes(score, tempo)])
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
    const { clock } = this.o
    const score = this.o.getScore()
    const s = this.scheduler
    if (!clock.playing || !s || !score) return
    const head = clock.now()

    if ((this.o.stopAtEnd ?? true) && head >= score.durationSec) {
      clock.pause()
      clock.seek(score.durationSec)
      return
    }

    const collected = s.collect(head)
    if (!this.audible()) { this.beats?.seek(head); return }
    try {
      this.schedule(score, collected, head)
    } catch (e) {
      this.failAudio(e)
      this.beats?.seek(head)
    }
  }

  private audible(): boolean {
    if (this.audioFailed) return false
    try { return this.o.audioEnabled() } catch (e) { this.failAudio(e); return false }
  }

  private failAudio(e: unknown): void {
    if (this.audioFailed) return
    this.audioFailed = true
    try { this.o.onAudioError?.(e) } catch { /* a host callback must not break the tick */ }
  }

  /** The audio half of a tick: may throw (engine time without Web Audio). */
  private schedule(score: ScoreDocument, collected: ScheduledNote[], head: number): void {
    const { clock, engine } = this.o
    const rate = clock.rate
    // Engine time is read only when scheduling: with audio off (or no Web
    // Audio at all) the cursors still advance without touching the engine.
    const origin = this.originFor(head)
    for (const sched of collected) {
      const voice = score.voices.find((v) => v.id === sched.note.voiceId)
      if (voice) engine.play(sched, voice, origin, rate)
    }

    const audio = this.o.getAudio()
    const countInAlways = this.o.countInClicks === 'always' && audio.countIn !== false
    if ((audio.metronome || countInAlways) && this.beats) {
      for (const beat of this.beats.collect(head)) {
        // Count-in clicks (sec < 0) only while the Count-in setting is on;
        // the bar's own beats only while the metronome is.
        if (beat.sec < 0 ? audio.countIn === false : !audio.metronome) continue
        this.metronome ??= engine.metronome()
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
