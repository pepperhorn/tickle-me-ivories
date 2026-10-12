import { describe, it, expect } from 'vitest'
import { clampBpm, clampVisibleBeats, liveBeatClock, scoreBeatClock } from './beats'
import { buildTempoMap } from '../model/tempoMap'
import type { ScoreDocument, TempoSetting, TimeSigEvent } from '../model/types'

const PPQ = 480
const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }
const score = (sigs: TimeSigEvent[], tempi = [{ ticks: 0, bpm: 120 }]): ScoreDocument => ({
  id: 's', name: 's', ppq: PPQ, tempoMap: buildTempoMap(tempi, PPQ), voices: [], notes: [],
  durationSec: 10, sourceFormat: 'midi', timeSignatures: sigs, keySignature: null,
})
const bars = (lines: { beat: number; bar: boolean }[]) => lines.filter((l) => l.bar).map((l) => l.beat)

describe('liveBeatClock (R-B)', () => {
  it('maps seconds to beats at the BPM, both ways', () => {
    const c = liveBeatClock(120)
    expect(c.beatAt(1)).toBe(2)
    expect(c.secAt(2)).toBe(1)
  })

  it('a beat line on every beat, a bar line every beatsPerBar from clock 0', () => {
    const c = liveBeatClock(120, 4)
    const lines = c.lines(-0.5, 8.2)
    expect(lines.map((l) => l.beat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(bars(lines)).toEqual([0, 4, 8])
    expect(bars(liveBeatClock(120, 3).lines(0, 6))).toEqual([0, 3, 6])
    expect(c.lines(1.5, 3).map((l) => l.beat)).toEqual([2, 3])
  })

  it('negative beats (before the first note) keep the bar pattern', () => {
    expect(bars(liveBeatClock(60, 4).lines(-5, 0))).toEqual([-4, 0])
  })
})

describe('clampBpm / clampVisibleBeats (Review Focus 3)', () => {
  it('clamps to 20-300, rounds, and maps non-finite input to the default', () => {
    expect(clampBpm(10)).toBe(20)
    expect(clampBpm(1e9)).toBe(300)
    expect(clampBpm(99.6)).toBe(100)
    expect(clampBpm(Number.NaN)).toBe(100)
    expect(clampVisibleBeats(0)).toBe(1)
    expect(clampVisibleBeats(500)).toBe(64)
    expect(clampVisibleBeats(Number.NaN)).toBe(8)
  })
})

describe('scoreBeatClock (R-B)', () => {
  it('beats are quarter notes on the tempo map', () => {
    const c = scoreBeatClock(score([{ ticks: 0, numerator: 4, denominator: 4 }]), SCALE_1)
    expect(c.beatAt(1)).toBeCloseTo(2, 9)
    expect(c.secAt(4)).toBeCloseTo(2, 9)
  })

  it('follows a tempo change', () => {
    const c = scoreBeatClock(score([], [{ ticks: 0, bpm: 120 }, { ticks: 2 * PPQ, bpm: 60 }]), SCALE_1)
    expect(c.beatAt(1)).toBeCloseTo(2, 9)
    expect(c.beatAt(2)).toBeCloseTo(3, 9)
  })

  it('a retimed (studio) score still lines up: scale 2 doubles beats per second', () => {
    expect(scoreBeatClock(score([]), { mode: 'scale', scale: 2 }).beatAt(0.5)).toBeCloseTo(2, 9)
  })

  it('bar lines from the time signature: 4/4, 3/4, and 6/8 (eighth-note beat lines)', () => {
    expect(bars(scoreBeatClock(score([{ ticks: 0, numerator: 4, denominator: 4 }]), SCALE_1).lines(0, 8))).toEqual([0, 4, 8])
    expect(bars(scoreBeatClock(score([{ ticks: 0, numerator: 3, denominator: 4 }]), SCALE_1).lines(0, 6))).toEqual([0, 3, 6])
    const six = scoreBeatClock(score([{ ticks: 0, numerator: 6, denominator: 8 }]), SCALE_1).lines(0, 3)
    expect(six.map((l) => l.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3])
    expect(bars(six)).toEqual([0, 3])
  })

  it('a signature change restarts the bar count at the change', () => {
    const c = scoreBeatClock(score([
      { ticks: 0, numerator: 4, denominator: 4 },
      { ticks: 4 * PPQ, numerator: 3, denominator: 4 },
    ]), SCALE_1)
    expect(bars(c.lines(0, 10))).toEqual([0, 4, 7, 10])
  })

  it('the count-in (negative beats) extends the first signature backwards', () => {
    const c = scoreBeatClock(score([{ ticks: 0, numerator: 4, denominator: 4 }]), SCALE_1)
    const lines = c.lines(-2, 0)
    expect(lines.map((l) => l.beat)).toEqual([-2, -1, 0])
    expect(bars(lines)).toEqual([0])
  })
})
