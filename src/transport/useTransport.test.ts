import { describe, it, expect, beforeEach } from 'vitest'
import { useTransport, playheadAt } from './useTransport'
import { buildTempoMap } from '../model/tempoMap'
import { retimeScore } from '../io/parseMidi'
import type { ScoreDocument } from '../model/types'

const PPQ = 480
const score = (): ScoreDocument => ({
  id: 'x', name: 'test.mid', ppq: PPQ,
  tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], PPQ),
  voices: [{ id: 'v', label: 'V', hue: 207, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 }],
  notes: [
    { id: 0, pitch: 60, startTicks: 0, durTicks: 480, startSec: 0, endSec: 0.5, velocity: 100, voiceId: 'v' },
    { id: 1, pitch: 64, startTicks: PPQ * 8, durTicks: 480, startSec: 4, endSec: 4.5, velocity: 100, voiceId: 'v' },
  ],
  durationSec: 4.5, sourceFormat: 'midi', timeSignatures: [], keySignature: null,
})

// Two voices, one note each -- used by the updateVoice tests below.
const makeScore = (): ScoreDocument => {
  const base: ScoreDocument = {
    id: 'two', name: 'two.mid', ppq: PPQ,
    tempoMap: buildTempoMap([], PPQ),
    voices: [
      { id: 'a', label: 'Voice A', hue: 200, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 },
      { id: 'b', label: 'Voice B', hue: 30, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 },
    ],
    notes: [
      { id: 0, pitch: 60, startTicks: 0, durTicks: 480, startSec: 0, endSec: 0, velocity: 100, voiceId: 'a' },
      { id: 1, pitch: 64, startTicks: 480, durTicks: 480, startSec: 0, endSec: 0, velocity: 100, voiceId: 'b' },
    ],
    durationSec: 0, sourceFormat: 'midi', timeSignatures: [], keySignature: null,
  }
  return retimeScore(base, { mode: 'scale', scale: 1 })
}

beforeEach(() => {
  useTransport.setState({
    score: null, playing: false, originSec: 0, pausedAtSec: 0,
    tempo: { mode: 'scale', scale: 1 }, fallSeconds: 3, mode: 'roll',
  })
})

describe('playheadAt', () => {
  it('is the paused position while stopped, whatever the clock says', () => {
    useTransport.getState().loadScore(score())
    useTransport.getState().seek(2, 100)
    expect(playheadAt(useTransport.getState(), 999)).toBeCloseTo(2, 9)
  })

  it('advances with the clock while playing', () => {
    useTransport.getState().loadScore(score())
    useTransport.getState().play(10)
    expect(playheadAt(useTransport.getState(), 12.5)).toBeCloseTo(2.5, 9)
  })
})

describe('play / pause', () => {
  it('resumes from where it paused, not from zero', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.play(0)
    t.pause(1.5)
    expect(playheadAt(useTransport.getState(), 99)).toBeCloseTo(1.5, 9)
    useTransport.getState().play(50)
    expect(playheadAt(useTransport.getState(), 51)).toBeCloseTo(2.5, 9)
  })
})

describe('seek', () => {
  it('moves the playhead while playing without stopping', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.play(0)
    t.seek(3, 2)
    expect(useTransport.getState().playing).toBe(true)
    expect(playheadAt(useTransport.getState(), 2)).toBeCloseTo(3, 9)
  })

  it('clamps to the score bounds', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.seek(-5, 0)
    expect(playheadAt(useTransport.getState(), 0)).toBeCloseTo(0, 9)
    t.seek(9999, 0)
    expect(playheadAt(useTransport.getState(), 0)).toBeCloseTo(4.5, 9)
  })
})

describe('maxNoteDur', () => {
  it('is the longest note in seconds after loading', () => {
    useTransport.getState().loadScore(score())
    expect(useTransport.getState().maxNoteDur).toBeCloseTo(0.5, 6)
  })

  it('is recomputed when the tempo changes, because durations move', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.setTempo({ mode: 'scale', scale: 0.5 }, 0)    // half speed: notes twice as long
    expect(useTransport.getState().maxNoteDur).toBeCloseTo(1, 6)
  })

  it('is zero for a score with no notes', () => {
    useTransport.getState().loadScore({ ...score(), notes: [], durationSec: 0 })
    expect(useTransport.getState().maxNoteDur).toBe(0)
  })
})

describe('setTempo', () => {
  it('retimes the score', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.setTempo({ mode: 'scale', scale: 2 }, 0)
    expect(useTransport.getState().score!.notes[1].startSec).toBeCloseTo(2, 6)
  })

  it('preserves the musical position of the playhead', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.seek(4, 0)                                   // sitting exactly on note 1
    t.setTempo({ mode: 'scale', scale: 2 }, 0)
    // Same musical moment, now at half the wall-clock time.
    expect(playheadAt(useTransport.getState(), 0)).toBeCloseTo(2, 6)
  })

  it('keeps playing across a tempo change', () => {
    const t = useTransport.getState()
    t.loadScore(score())
    t.play(0)
    t.setTempo({ mode: 'absolute', bpm: 240 }, 1)
    expect(useTransport.getState().playing).toBe(true)
  })

  it('retimes an incoming score to the tempo already set', () => {
    const t = useTransport.getState()
    t.setTempo({ mode: 'scale', scale: 2 }, 0)      // no score yet: just sets tempo
    t.loadScore(score())                            // fixture is timed at scale 1
    // note 1 sits at 4s in the fixture; at scale 2 it must land at 2s
    expect(useTransport.getState().score!.notes[1].startSec).toBeCloseTo(2, 6)
    expect(useTransport.getState().maxNoteDur).toBeCloseTo(0.25, 6)
  })

  it('preserves musical position across a switch to absolute tempo', () => {
    // Two tempo segments: 120bpm for 4 beats, then 240bpm. A seconds-ratio
    // implementation has no single "old bpm" to scale by and cannot land here;
    // only a genuine ticks round-trip can.
    const s = score()
    s.tempoMap = buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 4 * PPQ, bpm: 240 }], PPQ)
    s.durationSec = 60
    const t = useTransport.getState()
    t.loadScore(s)
    t.seek(2.5, 0)                                   // 2.5s = tick 2880
    t.setTempo({ mode: 'absolute', bpm: 60 }, 0)     // 2880 ticks @60bpm = 6s
    expect(playheadAt(useTransport.getState(), 0)).toBeCloseTo(6, 6)
  })
})

describe('updateVoice', () => {
  it('patches one voice and leaves its siblings alone', () => {
    const s = makeScore()
    useTransport.getState().loadScore(s)
    const v0 = useTransport.getState().score!.voices[0]
    const v1 = useTransport.getState().score!.voices[1]

    useTransport.getState().updateVoice(v1.id, { hue: 300 })
    const after = useTransport.getState().score!.voices
    expect(after[1].hue).toBe(300)
    expect(after[0]).toBe(v0)
  })

  it('keeps the SAME notes array reference, so the scheduler is not rebuilt', () => {
    const s = makeScore()
    useTransport.getState().loadScore(s)
    const notesBefore = useTransport.getState().score!.notes
    useTransport.getState().updateVoice(notesBefore[0].voiceId, { label: 'Melody' })
    expect(useTransport.getState().score!.notes).toBe(notesBefore)
  })

  it('is a no-op for an unknown voice id', () => {
    const s = makeScore()
    useTransport.getState().loadScore(s)
    const before = useTransport.getState().score!.voices
    useTransport.getState().updateVoice('nope', { hue: 1 })
    expect(useTransport.getState().score!.voices).toEqual(before)
  })
})

describe('parked plan 1 gaps', () => {
  it('pausing at the end leaves the playhead exactly at the duration', () => {
    const s = makeScore()
    useTransport.getState().loadScore(s)
    const dur = useTransport.getState().score!.durationSec
    useTransport.getState().play(100)
    // This is what App's scheduler tick does when head >= durationSec.
    useTransport.getState().pause(100 + dur)
    expect(useTransport.getState().playing).toBe(false)
    expect(useTransport.getState().pausedAtSec).toBeCloseTo(dur, 9)
  })

  it('clearScore returns the store to its empty state', () => {
    useTransport.getState().loadScore(makeScore())
    useTransport.getState().play(10)
    useTransport.getState().clearScore()
    const s = useTransport.getState()
    expect(s.score).toBeNull()
    expect(s.playing).toBe(false)
    expect(s.pausedAtSec).toBe(0)
    expect(s.originSec).toBe(0)
    expect(s.maxNoteDur).toBe(0)
  })

  it('seek clamps to the score at both ends, paused and playing', () => {
    useTransport.getState().loadScore(makeScore())
    const dur = useTransport.getState().score!.durationSec

    useTransport.getState().seek(-5, 0)
    expect(useTransport.getState().pausedAtSec).toBe(0)

    useTransport.getState().seek(dur + 99, 0)
    expect(useTransport.getState().pausedAtSec).toBeCloseTo(dur, 9)

    useTransport.getState().play(50)
    useTransport.getState().seek(dur + 99, 50)
    expect(useTransport.getState().pausedAtSec).toBeCloseTo(dur, 9)
    expect(useTransport.getState().originSec).toBeCloseTo(50 - dur, 9)
  })

  it('seek on an empty store clamps to zero rather than to NaN', () => {
    useTransport.getState().clearScore()
    useTransport.getState().seek(10, 0)
    expect(useTransport.getState().pausedAtSec).toBe(0)
  })
})
