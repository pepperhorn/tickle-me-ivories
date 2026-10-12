import { describe, it, expect } from 'vitest'
import { buildRecordedScore } from './recorder'

describe('buildRecordedScore (spec §4.2)', () => {
  it('one track at tempo 120, times in seconds from record start, ticks to match', () => {
    const s = buildRecordedScore([
      { midi: 64, velocity: 80, start: 1, end: 1.5 },
      { midi: 60, velocity: 90, start: 0.25, end: 1 },
      { midi: 62, velocity: 70, start: 2, end: 2 },        // zero length: dropped
    ])
    expect(s.voices).toHaveLength(1)
    expect(s.notes.map((n) => [n.pitch, n.startSec, n.endSec])).toEqual([[60, 0.25, 1], [64, 1, 1.5]])
    expect(s.notes[0].startTicks).toBe(240)            // 0.25 s at 120 bpm, ppq 480
    expect(s.tempoMap[0].bpm).toBe(120)
    expect(s.durationSec).toBe(1.5)
    expect(s.sourceFormat).toBe('midi')
  })
})
