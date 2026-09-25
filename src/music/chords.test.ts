import { describe, it, expect } from 'vitest'
import { ChordTracker, detectChord, pitchesInWindow, rankCandidates } from './chords'
import { DEFAULT_KEY } from './spell'
import type { NoteEvent } from '../model/types'

const n = (id: number, pitch: number, startSec: number, endSec: number): NoteEvent => ({
  id, pitch, startTicks: 0, durTicks: 0, startSec, endSec, velocity: 90, voiceId: 'a',
})

describe('pitchesInWindow', () => {
  // A C major arpeggio, one note at a time, then a rest.
  const arp = [n(0, 60, 0, 0.2), n(1, 64, 0.2, 0.4), n(2, 67, 0.4, 0.6), n(3, 72, 0.6, 0.8)]

  it('collects every pitch struck inside the trailing window', () => {
    // A window wide enough to reach back past the first note of the arpeggio.
    expect(pitchesInWindow(arp, 0.7, 0.8, 0.2)).toEqual([60, 64, 67, 72])
  })

  it('drops pitches that fell out of the back of the window', () => {
    // At t=0.7 a 0.35s window reaches back to 0.35, so only the last two struck.
    expect(pitchesInWindow(arp, 0.7, 0.35, 0.2)).toEqual([67, 72])
  })

  it('keeps a note that is still sounding even if it started before the window', () => {
    // The pedal bass started at 0 and runs to 4s, so it belongs to the chord
    // even though a 0.25s window cannot reach its onset.
    const withPedalBass = [n(9, 36, 0, 4), ...arp]
    expect(pitchesInWindow(withPedalBass, 0.7, 0.25, 4)).toEqual([36, 72])
  })

  it('never returns a note that has not started yet', () => {
    expect(pitchesInWindow(arp, 0.3, 0.6, 0.2)).toEqual([60, 64])
  })

  it('returns pitches ascending and deduplicated', () => {
    const doubled = [n(0, 60, 0, 1), n(1, 72, 0.1, 1), n(2, 60, 0.2, 1)]
    expect(pitchesInWindow(doubled, 0.3, 0.6, 1)).toEqual([60, 72])
  })

  it('is a pure function of t -- the same t always gives the same answer', () => {
    const a = pitchesInWindow(arp, 0.5, 0.6, 0.2)
    void pitchesInWindow(arp, 0.9, 0.6, 0.2)
    expect(pitchesInWindow(arp, 0.5, 0.6, 0.2)).toEqual(a)
  })

  it('returns nothing for an empty score', () => {
    expect(pitchesInWindow([], 1, 0.6, 0)).toEqual([])
  })
})

describe('rankCandidates', () => {
  it('demotes an altered-extension reading below a plain slash chord', () => {
    // This is the case the spec got wrong: tonal ranks Em#5 first for C/E.
    expect(rankCandidates(['Em#5', 'CM/E'])).toEqual(['CM/E', 'Em#5'])
  })

  it('leaves tonal alone when neither candidate is rare', () => {
    expect(rankCandidates(['Am7', 'C6/A'])).toEqual(['Am7', 'C6/A'])
    expect(rankCandidates(['CM/G', 'Em#5/G'])).toEqual(['CM/G', 'Em#5/G'])
  })

  it('is stable among equally rare candidates', () => {
    expect(rankCandidates(['Cm#5', 'Ebm#5'])).toEqual(['Cm#5', 'Ebm#5'])
  })

  it('survives an empty list', () => {
    expect(rankCandidates([])).toEqual([])
  })
})

describe('detectChord', () => {
  it('names a root-position triad', () => {
    expect(detectChord([60, 64, 67], DEFAULT_KEY)[0]).toBe('CM')
  })

  it('names a first inversion as a slash chord, not as an augmented spelling', () => {
    // F39: [64, 60, 67] sorts to C-E-G (root position) and returns CM, not
    // CM/E -- the ascending sort inside detectChord discards which note was
    // struck first. E3-C4-G4 keeps E as the lowest pitch after sorting.
    expect(detectChord([52, 60, 67], DEFAULT_KEY)[0]).toBe('CM/E')
  })

  it('names a second inversion from its bass', () => {
    expect(detectChord([67, 72, 76], DEFAULT_KEY)[0]).toBe('CM/G')
  })

  it('names a seventh chord', () => {
    expect(detectChord([57, 60, 64, 67], DEFAULT_KEY)[0]).toBe('Am7')
  })

  it('spells the chord for the key', () => {
    expect(detectChord([60, 63, 67], { tonic: 'Eb', scale: 'major' })[0]).toBe('Cm')
  })

  it('keeps the remaining readings as alternates', () => {
    expect(detectChord([57, 60, 64, 67], DEFAULT_KEY)).toContain('C6/A')
  })

  it('refuses to name fewer than three pitches -- two notes are not a chord', () => {
    expect(detectChord([60, 67], DEFAULT_KEY)).toEqual([])
    expect(detectChord([60], DEFAULT_KEY)).toEqual([])
    expect(detectChord([], DEFAULT_KEY)).toEqual([])
  })

  it('ignores octave doubling', () => {
    expect(detectChord([48, 60, 64, 67, 72], DEFAULT_KEY)[0]).toBe('CM')
  })

  it('guards on distinct pitch classes, not raw pitch count', () => {
    // F40: C3-C4-G4 is three pitches but only two pitch classes (C, G) -- the
    // noise the guard exists to stop, not a chord.
    expect(detectChord([48, 60, 67], DEFAULT_KEY)).toEqual([])
  })
})

describe('ChordTracker', () => {
  const C = ['CM', 'Em#5/C']
  const G = ['GM']

  it('does not commit a reading until it has persisted for confirmMs', () => {
    const t = new ChordTracker(300, 60)
    expect(t.update(C, 0)).toBeNull()
    expect(t.update(C, 59)).toBeNull()
  })

  it('commits once the reading has held long enough', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0)
    expect(t.update(C, 60)).toEqual({ symbol: 'CM', alternates: ['Em#5/C'] })
  })

  it('keeps returning the committed reading without re-confirming it', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0)
    t.update(C, 60)
    expect(t.update(C, 61)!.symbol).toBe('CM')
  })

  it('will not replace a committed reading inside its minimum display time', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)
    t.update(G, 100); t.update(G, 200)
    expect(t.update(G, 300)!.symbol).toBe('CM')
  })

  it('replaces it once the minimum display time has passed', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)
    t.update(G, 400)
    expect(t.update(G, 460)!.symbol).toBe('GM')
  })

  it('does not commit a reading that flickers past', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)      // committed
    t.update(G, 400)                      // pending
    t.update(['Am'], 430)                 // pending restarts
    expect(t.update(['Am'], 450)!.symbol).toBe('CM')
  })

  it('holds the last chord through a rest rather than blanking', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)
    expect(t.update([], 500)!.symbol).toBe('CM')
  })

  it('returns null before anything has ever been committed', () => {
    expect(new ChordTracker(300, 60).update([], 0)).toBeNull()
  })

  it('reset clears the committed reading, for a seek', () => {
    const t = new ChordTracker(300, 60)
    t.update(C, 0); t.update(C, 60)
    t.reset()
    expect(t.update([], 100)).toBeNull()
  })
})
