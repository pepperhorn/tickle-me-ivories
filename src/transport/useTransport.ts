import { create } from 'zustand'
import { retimeScore } from '../io/parseMidi'
import { secToTicks, ticksToSec } from '../model/tempoMap'
import type { ScoreDocument, TempoSetting } from '../model/types'

export type DisplayMode = 'keyboard' | 'roll'

export interface TransportState {
  score: ScoreDocument | null
  playing: boolean
  originSec: number      // clock time corresponding to playhead 0
  pausedAtSec: number
  tempo: TempoSetting
  fallSeconds: number
  /** Longest note in the loaded score, in seconds, under the current tempo.
      The renderer's window search looks back this far for notes that started
      earlier and are still sounding. Recomputed on load and on every tempo
      change, because retiming changes note durations in seconds. */
  maxNoteDur: number
  mode: DisplayMode
}

export interface TransportActions {
  loadScore: (score: ScoreDocument) => void
  play: (now: number) => void
  pause: (now: number) => void
  seek: (sec: number, now: number) => void
  setTempo: (setting: TempoSetting, now: number) => void
  setMode: (mode: DisplayMode) => void
  setFallSeconds: (sec: number) => void
}

/** The playhead is derived, never stored while running. */
export function playheadAt(s: TransportState, now: number): number {
  return s.playing ? now - s.originSec : s.pausedAtSec
}

/** Longest note in seconds. A fixed cutoff is wrong for some score: at the
    tempo control's 25% minimum, any note over 2s at notated tempo exceeds 8s. */
export function longestNoteSec(score: ScoreDocument): number {
  return score.notes.reduce((m, n) => Math.max(m, n.endSec - n.startSec), 0)
}

const clampToScore = (s: TransportState, sec: number) =>
  Math.min(Math.max(0, sec), s.score?.durationSec ?? 0)

export const useTransport = create<TransportState & TransportActions>((set, get) => ({
  score: null,
  playing: false,
  originSec: 0,
  pausedAtSec: 0,
  tempo: { mode: 'scale', scale: 1 },
  fallSeconds: 3,
  maxNoteDur: 0,
  mode: 'roll',

  loadScore: (score) => set({
    score, playing: false, pausedAtSec: 0, originSec: 0,
    maxNoteDur: longestNoteSec(score),
  }),

  play: (now) => set((s) => ({ playing: true, originSec: now - s.pausedAtSec })),

  pause: (now) => set((s) => ({ playing: false, pausedAtSec: playheadAt(s, now) })),

  seek: (sec, now) => set((s) => {
    const target = clampToScore(s, sec)
    return s.playing
      ? { originSec: now - target, pausedAtSec: target }
      : { pausedAtSec: target }
  }),

  /**
   * Capture the playhead's MUSICAL position, retime the score, then rebase the
   * clock so the same musical moment is under the playhead. The playhead never
   * jumps and the score never degrades -- ticks are the truth.
   */
  setTempo: (setting, now) => {
    const s = get()
    if (!s.score) { set({ tempo: setting }); return }
    const ticks = secToTicks(s.score.tempoMap, s.score.ppq, playheadAt(s, now), s.tempo)
    const score = retimeScore(s.score, setting)
    const target = ticksToSec(score.tempoMap, score.ppq, ticks, setting)
    set({
      tempo: setting, score,
      pausedAtSec: target,
      originSec: s.playing ? now - target : s.originSec,
      maxNoteDur: longestNoteSec(score),   // retiming changed durations in seconds
    })
  },

  setMode: (mode) => set({ mode }),
  setFallSeconds: (fallSeconds) => set({ fallSeconds }),
}))
