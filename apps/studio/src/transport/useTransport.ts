import { create } from 'zustand'
import { AudioClock, longestNoteSec, retimeScore, secToTicks, ticksToSec } from 'ivories/core'
import type { AudioClockAnchors, DisplayMode, ScoreDocument, TempoSetting, Voice } from 'ivories/core'

export type { DisplayMode } from 'ivories/core'

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
  /** Clock rate (hosts / library Transport). The studio's tempo control retimes instead. */
  rate: number
}

export interface TransportActions {
  loadScore: (score: ScoreDocument) => void
  clearScore: () => void
  /** `leadInSec` applies only from the top (paused at 0): the playhead then
      starts at -leadInSec, so the first notes are already falling. */
  play: (now: number, leadInSec?: number) => void
  pause: (now: number) => void
  seek: (sec: number, now: number) => void
  setTempo: (setting: TempoSetting, now: number) => void
  setMode: (mode: DisplayMode) => void
  setFallSeconds: (sec: number) => void
  updateVoice: (id: string, patch: Partial<Voice>) => void
}

/** The playhead is derived, never stored while running. */
export function playheadAt(
  s: { playing: boolean; originSec: number; pausedAtSec: number; rate?: number }, now: number,
): number {
  return s.playing ? (now - s.originSec) * (s.rate ?? 1) : s.pausedAtSec
}

const anchorsOf = (c: AudioClock): Pick<TransportState, 'playing' | 'originSec' | 'pausedAtSec' | 'rate'> => {
  const a = c.anchors()
  return { playing: a.playing, originSec: a.originSec, pausedAtSec: a.pausedAtSec, rate: a.rate }
}

const IDLE_SOURCE = { currentTime: 0 }
let clock = new AudioClock(IDLE_SOURCE)
let unsubscribe: () => void = () => {}

/** The clock the store currently drives. */
export function transportClock(): AudioClock { return clock }

/**
 * Binds the store to the app's AudioClock (spec 3.1: "a thin React binding
 * over an AudioClock"). The store's anchors are loaded into the clock at bind
 * time; afterwards every clock event (including one a host or the library
 * Transport causes) is mirrored back into the store.
 */
export function bindTransportClock(next: AudioClock): () => void {
  unsubscribe()
  clock = next
  next.load(storeAnchors(useTransport.getState()))
  unsubscribe = next.subscribe(() => useTransport.setState(anchorsOf(next)))
  return () => {
    if (clock !== next) return
    unsubscribe()
    unsubscribe = () => {}
    clock = new AudioClock(IDLE_SOURCE)
  }
}

function storeAnchors(s: TransportState): AudioClockAnchors {
  return { playing: s.playing, originSec: s.originSec, pausedAtSec: s.pausedAtSec, rate: s.rate ?? 1 }
}

/** The store is authoritative for its own actions: load it into the clock first,
    so a store reset (tests, clearScore) is never undone by stale clock anchors. */
function synced(s: TransportState): AudioClock {
  clock.load(storeAnchors(s))
  return clock
}

/** The *At methods must get the time base of the running session: a host that
    started a silent (wall-time) session anchored it on the wall clock, so the
    caller's AudioContext time would corrupt the origin. */
function baseNow(c: AudioClock, now: number): number {
  return c.playing && c.silentFallback ? c.sourceTime() : now
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
  rate: 1,

  loadScore: (incoming) => {
    // Retime to the live tempo setting so the store is never internally
    // inconsistent: a score timed at one setting with `tempo` reporting
    // another makes the next setTempo capture ticks against the wrong
    // baseline and jump the playhead. Idempotent when already correct.
    const s = get()
    const score = retimeScore(incoming, s.tempo)
    clock.load({ playing: false, originSec: 0, pausedAtSec: 0, rate: s.rate ?? 1 })
    set({ score, playing: false, pausedAtSec: 0, originSec: 0, maxNoteDur: longestNoteSec(score) })
  },

  // Returns to the drop zone. Callers must stop audio first (engine.stopAll())
  // -- this only clears the model.
  clearScore: () => {
    clock.load({ playing: false, originSec: 0, pausedAtSec: 0, rate: get().rate ?? 1 })
    set({ score: null, playing: false, pausedAtSec: 0, originSec: 0, maxNoteDur: 0 })
  },

  play: (now, leadInSec = 0) => {
    const s = get()
    const c = synced(s)
    if (s.pausedAtSec <= 0 && leadInSec > 0) c.seekAt(-leadInSec, now)
    c.playAt(now)
    set(anchorsOf(c))
  },

  // Clamped: a pause inside the lead-in parks at 0, so the next play counts in again.
  pause: (now) => {
    const c = synced(get())
    const t = baseNow(c, now)
    c.pauseAt(t)
    if (c.pausedAtSec < 0) c.seekAt(0, t)
    set(anchorsOf(c))
  },

  seek: (sec, now) => {
    const s = get()
    const c = synced(s)
    c.seekAt(clampToScore(s, sec), baseNow(c, now))
    set(anchorsOf(c))
  },

  /**
   * Capture the playhead's MUSICAL position, retime the score, then rebase the
   * clock so the same musical moment is under the playhead. The playhead never
   * jumps and the score never degrades -- ticks are the truth.
   */
  setTempo: (setting, now) => {
    const s = get()
    if (!s.score) { set({ tempo: setting }); return }
    const c = synced(s)
    const t = baseNow(c, now)
    const ticks = secToTicks(s.score.tempoMap, s.score.ppq, playheadAt(s, t), s.tempo)
    const score = retimeScore(s.score, setting)
    const target = ticksToSec(score.tempoMap, score.ppq, ticks, setting)
    // Score first, so a clock subscriber reacting to the seek sees the new notes.
    set({ tempo: setting, score, maxNoteDur: longestNoteSec(score) })
    c.seekAt(target, t)
    set(anchorsOf(c))
  },

  setMode: (mode) => set({ mode }),
  setFallSeconds: (fallSeconds) => set({ fallSeconds }),

  /**
   * Replaces the score object but reuses the SAME notes array. App.tsx keys its
   * scheduler effect on score.notes for exactly this reason: a colour or label
   * change must not rebuild the scheduler, which would re-hand already-scheduled
   * notes to smplr and double them.
   */
  updateVoice: (id, patch) => set((s) => {
    if (!s.score) return {}
    const voices = s.score.voices.map((v) => (v.id === id ? { ...v, ...patch } : v))
    if (voices.every((v, i) => v === s.score!.voices[i])) return {}
    return { score: { ...s.score, voices } }
  }),
}))
