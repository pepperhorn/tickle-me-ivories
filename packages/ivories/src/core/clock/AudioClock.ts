import { ClockListeners } from './listeners'
import { clampRate } from './types'
import type { Clock, ClockEvent, ClockEventType } from './types'

/** Anything with an advancing `currentTime` in seconds: an AudioContext, or the AudioEngine. */
export interface TimeSource { readonly currentTime: number }

export interface AudioClockAnchors {
  playing: boolean
  /** Source time at which the position would be 0 at the current rate. */
  originSec: number
  /** The position while paused; the play-session start while playing. */
  pausedAtSec: number
  rate: number
}

export interface AudioClockOptions {
  /** False while the source does not advance (a suspended AudioContext). A play()
      then runs that session on the wall clock, so visuals move silently. */
  isRunning?: () => boolean
  /** Wall clock in seconds. Default performance.now() / 1000. */
  wallNow?: () => number
}

const defaultWallNow = () => performance.now() / 1000

/**
 * The transport math that used to live in useTransport (spec §3.1):
 * position = (sourceTime - originSec) * rate while playing, pausedAtSec while
 * paused. The `*At(now)` methods take the caller's source time so the studio
 * store keeps its explicit-time API; play/pause/seek/setRate read the source.
 */
export class AudioClock implements Clock {
  private a: AudioClockAnchors = { playing: false, originSec: 0, pausedAtSec: 0, rate: 1 }
  private silent = false
  private disposed = false
  private readonly listeners = new ClockListeners()
  private readonly source: TimeSource
  private readonly opts: AudioClockOptions

  constructor(source: TimeSource, opts: AudioClockOptions = {}) {
    this.source = source
    this.opts = opts
  }

  get playing(): boolean { return this.a.playing }
  get rate(): number { return this.a.rate }
  get originSec(): number { return this.a.originSec }
  get pausedAtSec(): number { return this.a.pausedAtSec }
  /** True while the current play session runs on the wall clock. */
  get silentFallback(): boolean { return this.silent }

  anchors(): AudioClockAnchors { return { ...this.a } }

  /** Replaces the anchors without notifying anyone. */
  load(a: AudioClockAnchors): void {
    this.a = { playing: a.playing, originSec: a.originSec, pausedAtSec: a.pausedAtSec, rate: clampRate(a.rate) }
  }

  /** The time base of the current session. */
  sourceTime(): number {
    return this.silent ? (this.opts.wallNow ?? defaultWallNow)() : this.source.currentTime
  }

  positionAt(now: number): number {
    return this.a.playing ? (now - this.a.originSec) * this.a.rate : this.a.pausedAtSec
  }

  now(): number { return this.positionAt(this.sourceTime()) }

  playAt(now: number, silent = false): void {
    if (this.disposed || this.a.playing) return
    this.silent = silent
    this.a = { ...this.a, playing: true, originSec: now - this.a.pausedAtSec / this.a.rate }
    this.emit('play', this.a.pausedAtSec)
  }

  pauseAt(now: number): void {
    if (this.disposed || !this.a.playing) return
    const at = this.positionAt(now)
    this.a = { ...this.a, playing: false, pausedAtSec: at }
    this.silent = false
    this.emit('pause', at)
  }

  seekAt(sec: number, now: number): void {
    if (this.disposed || !Number.isFinite(sec)) return
    this.a = this.a.playing
      ? { ...this.a, pausedAtSec: sec, originSec: now - sec / this.a.rate }
      : { ...this.a, pausedAtSec: sec }
    this.emit('seek', sec)
  }

  setRateAt(r: number, now: number): void {
    if (this.disposed) return
    const rate = clampRate(r)
    const pos = this.positionAt(now)
    this.a = this.a.playing
      ? { ...this.a, rate, pausedAtSec: pos, originSec: now - pos / rate }
      : { ...this.a, rate, pausedAtSec: pos }
    this.emit('rate', pos)
  }

  play(): void {
    if (this.a.playing) return
    const silent = this.opts.isRunning ? !this.opts.isRunning() : false
    this.playAt(silent ? (this.opts.wallNow ?? defaultWallNow)() : this.source.currentTime, silent)
  }

  pause(): void { this.pauseAt(this.sourceTime()) }
  seek(t: number): void { this.seekAt(t, this.sourceTime()) }
  setRate(r: number): void { this.setRateAt(r, this.sourceTime()) }

  subscribe(fn: (e: ClockEvent) => void): () => void {
    if (this.disposed) return () => {}
    return this.listeners.add(fn)
  }

  /** Freezes the position (pause semantics, silently) and drops all subscribers. */
  dispose(): void {
    if (this.disposed) return
    if (this.a.playing) {
      this.a = { ...this.a, playing: false, pausedAtSec: this.positionAt(this.sourceTime()) }
      this.silent = false
    }
    this.disposed = true
    this.listeners.clear()
  }

  private emit(type: ClockEventType, time: number): void {
    this.listeners.emit({ type, time })
  }
}
