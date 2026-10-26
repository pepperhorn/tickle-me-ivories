import { describe, it, expect } from 'vitest'
import { exactPitchPositions, FRETBOARD_TUNINGS, fretBoundary, headstockFor } from './model'

describe('exact-pitch fretboard map', () => {
  it('shows all exact E4 locations including open high E, without lower-octave Es', () => {
    expect(exactPitchPositions([64, 64])).toEqual([
      { string: 3, fret: 9, midi: 64 }, { string: 4, fret: 5, midi: 64 }, { string: 5, fret: 0, midi: 64 },
    ])
  })
  it.each(['guitar', 'bass4', 'bass5'] as const)('round-trips pitches across %s, including both boundaries', (instrument) => {
    const tuning = FRETBOARD_TUNINGS[instrument]
    const pitches = Array.from({ length: 128 }, (_, i) => i)
    const positions = exactPitchPositions(pitches, instrument, 24)
    expect(positions).toHaveLength(tuning.length * 25)
    for (const p of positions) expect(tuning[p.string] + p.fret).toBe(p.midi)
    expect(exactPitchPositions([-1, 128], instrument)).toEqual([])
    expect(exactPitchPositions([tuning[0]], instrument)).toEqual([{ string: 0, fret: 0, midi: tuning[0] }])
  })
  it('uses progressively narrower physical fret spacing', () => {
    expect(fretBoundary(0, 12, 900)).toBe(0)
    expect(fretBoundary(12, 12, 900)).toBe(900)
    expect(fretBoundary(1, 12, 900)).toBeGreaterThan(900 - fretBoundary(11, 12, 900))
  })
  it('normalises incompatible headstocks to instrument defaults', () => {
    expect(headstockFor('guitar', 'violin')).toBe('strat')
    expect(headstockFor('bass5', 'tele')).toBe('precision')
  })
})
