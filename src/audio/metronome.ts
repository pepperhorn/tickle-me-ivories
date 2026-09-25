import { ticksToSec } from '../model/tempoMap'
import { LOOKAHEAD_SEC } from './scheduler'
import type { ScoreDocument, TempoSetting } from '../model/types'

export interface Beat { sec: number; accent: boolean }

/**
 * Beat positions are computed in TICKS and converted through the tempo map,
 * never as a fixed interval. That is what makes the click follow a ritardando
 * and stay correct in both tempo modes.
 */
export function beatTimes(score: ScoreDocument, setting: TempoSetting): Beat[] {
  if (score.notes.length === 0) return []
  const lastTick = score.notes.reduce((m, n) => Math.max(m, n.startTicks + n.durTicks), 0)
  const perBar = Math.max(1, Math.round(score.beatsPerBar))
  const beats: Beat[] = []
  for (let i = 0, ticks = 0; ticks <= lastTick; i++, ticks = i * score.ppq) {
    beats.push({
      sec: ticksToSec(score.tempoMap, score.ppq, ticks, setting),
      accent: i % perBar === 0,
    })
  }
  return beats
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

const ACCENT_HZ = 1600
const BEAT_HZ = 1000
const CLICK_SEC = 0.035

/**
 * A synthesised click rather than a sample: it needs no load, cannot fail, and
 * is scheduled at an exact AudioContext time like every other sound in the app.
 *
 * Clicks are handed to Web Audio up to LOOKAHEAD_SEC ahead of when they sound,
 * exactly like notes in AudioEngine.play. F19: every caller of engine.stopAll()
 * (pause, seek, tempo change, file load/unload) must also call stop() here, or
 * clicks already scheduled keep sounding across the change.
 */
export class MetronomeVoice {
  private readonly ctx: BaseAudioContext
  private readonly destination: AudioNode
  private pending: OscillatorNode[] = []

  constructor(ctx: BaseAudioContext, destination: AudioNode) {
    this.ctx = ctx
    this.destination = destination
  }

  click(time: number, accent: boolean, volume: number): void {
    if (volume <= 0) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? ACCENT_HZ : BEAT_HZ
    gain.gain.setValueAtTime(Math.min(1, Math.max(0, volume)) * 0.25, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_SEC)
    osc.connect(gain)
    gain.connect(this.destination)
    osc.onended = () => {
      const i = this.pending.indexOf(osc)
      if (i !== -1) this.pending.splice(i, 1)
      gain.disconnect()
      osc.disconnect()
    }
    this.pending.push(osc)
    osc.start(time)
    osc.stop(time + CLICK_SEC)
  }

  /** Cancels every click already scheduled ahead of now, the same job
      engine.stopAll() does for notes. Call it everywhere stopAll() is called. */
  stop(): void {
    for (const osc of this.pending.splice(0)) {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
    }
  }
}
