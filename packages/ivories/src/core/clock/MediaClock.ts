import { ClockListeners } from './listeners'
import { clampRate } from './types'
import type { Clock, ClockEvent, ClockEventType } from './types'

export type MediaLike = Pick<HTMLMediaElement,
  'currentTime' | 'paused' | 'ended' | 'playbackRate' | 'play' | 'pause' | 'addEventListener' | 'removeEventListener'>

export interface MediaClockOptions {
  /** Media time of score-time 0 (seconds). now() = el.currentTime - offset. */
  offset?: number
  /** Wall clock in ms for the pre-roll. Default performance.now(). */
  nowMs?: () => number
}

/** The virtual stretch before media time 0 (a count-in ahead of the media). */
interface PreRoll {
  /** Virtual media time (< 0) while paused; at `startMs` while playing. */
  at: number
  playing: boolean
  startMs: number
}

/**
 * Follows an <audio>/<video> element (spec §3.1): now() = el.currentTime - offset.
 * The media carries the sound, so providers default to audio off with it.
 *
 * Negative times are legal for every clock, but media time cannot go below 0.
 * A seek to a media time below 0 enters a pre-roll: the element is held paused
 * at 0 and the clock reports a virtual time that advances on the wall clock
 * (at the element's rate) while playing. When the virtual time reaches 0 (a
 * timer, or any now() read past it, whichever comes first) the hold ends and
 * the element is started from 0; from then on the clock follows the element.
 * The clock reports its own events during the pre-roll and ignores the
 * element's (it is the one moving the element).
 */
export class MediaClock implements Clock {
  readonly offset: number
  private readonly el: MediaLike
  private readonly nowMs: () => number
  private readonly listeners = new ClockListeners()
  private readonly handlers: [string, () => void][]
  private pre: PreRoll | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Last playing state we reported, so the element's late play/pause events do not repeat it. */
  private reported: boolean
  private frozen: number | null = null

  constructor(el: MediaLike, opts: MediaClockOptions = {}) {
    this.el = el
    this.offset = opts.offset ?? 0
    this.nowMs = opts.nowMs ?? (() => performance.now())
    this.reported = !el.paused && !el.ended
    this.handlers = [
      ['play', () => this.fromElement('play')],
      ['pause', () => this.fromElement('pause')],
      ['seeked', () => this.fromElement('seek')],
      ['ratechange', () => this.fromElement('rate')],
    ]
    for (const [type, h] of this.handlers) el.addEventListener(type, h)
  }

  now(): number {
    if (this.frozen !== null) return this.frozen
    if (this.pre) {
      const v = this.virtual(this.pre)
      if (!this.pre.playing || v < 0) return v - this.offset
      this.cross()
    }
    return this.el.currentTime - this.offset
  }

  get playing(): boolean {
    if (this.frozen !== null) return false
    return this.pre ? this.pre.playing : !this.el.paused && !this.el.ended
  }

  get rate(): number { return this.el.playbackRate }

  play(): void {
    if (this.frozen !== null) return
    const p = this.pre
    if (!p) { this.startElement(); return }
    if (p.playing) return
    this.pre = { ...p, playing: true, startMs: this.nowMs() }
    this.arm()
    this.emit('play')
  }

  pause(): void {
    if (this.frozen !== null) return
    const p = this.pre
    if (!p) { this.el.pause(); return }
    if (!p.playing) return
    this.pre = { at: this.virtual(p), playing: false, startMs: 0 }
    this.disarm()
    this.emit('pause')
  }

  seek(t: number): void {
    if (this.frozen !== null || !Number.isFinite(t)) return
    const media = t + this.offset
    if (media >= 0) {
      const resume = this.pre?.playing ?? false
      this.pre = null
      this.disarm()
      this.el.currentTime = media
      if (resume) this.startElement()
      return
    }
    // Hold the element at 0; the pre-roll is set first so its events are ignored.
    const playing = this.playing
    this.pre = { at: media, playing, startMs: this.nowMs() }
    this.el.pause()
    if (this.el.currentTime !== 0) this.el.currentTime = 0
    if (playing) this.arm()
    else this.disarm()
    this.emit('seek')
  }

  setRate(r: number): void {
    if (this.frozen !== null) return
    const p = this.pre
    if (p) {
      this.pre = { ...p, at: this.virtual(p), startMs: this.nowMs() }
      this.el.playbackRate = clampRate(r)
      if (p.playing) this.arm()
      this.emit('rate')
      return
    }
    this.el.playbackRate = clampRate(r)
  }

  subscribe(fn: (e: ClockEvent) => void): () => void {
    if (this.frozen !== null) return () => {}
    return this.listeners.add(fn)
  }

  /** Detaches from the element (which stays the host's), clears the timer and freezes now(). */
  dispose(): void {
    if (this.frozen !== null) return
    const t = this.now()
    this.disarm()
    this.pre = null
    for (const [type, h] of this.handlers) this.el.removeEventListener(type, h)
    this.listeners.clear()
    this.frozen = t
  }

  private virtual(p: PreRoll): number {
    return p.playing ? p.at + ((this.nowMs() - p.startMs) / 1000) * this.el.playbackRate : p.at
  }

  /** The pre-roll reached media time 0: hand over to the element. */
  private cross(): void {
    this.pre = null
    this.disarm()
    this.startElement()
  }

  private arm(): void {
    this.disarm()
    const p = this.pre
    if (!p || !p.playing) return
    const ms = Math.max(0, (-this.virtual(p) / this.el.playbackRate) * 1000)
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.pre?.playing) this.cross()
    }, ms)
  }

  private disarm(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null }
  }

  private startElement(): void {
    const p = this.el.play() as Promise<void> | undefined
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        // Autoplay refused: the element stays paused. If we had reported playing
        // (the pre-roll crossing), say so.
        if (this.frozen === null && !this.pre && this.el.paused && this.reported) this.emit('pause')
      })
    }
  }

  private fromElement(type: ClockEventType): void {
    if (this.frozen !== null || this.pre) return
    if (type === 'play' && this.reported) return
    if (type === 'pause' && !this.reported) return
    this.emit(type)
  }

  private emit(type: ClockEventType): void {
    if (this.frozen !== null) return
    if (type === 'play') this.reported = true
    if (type === 'pause') this.reported = false
    this.listeners.emit({ type, time: this.now() })
  }
}
