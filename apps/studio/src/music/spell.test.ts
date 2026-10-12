import { describe, it, expect } from 'vitest'
import { Note } from 'tonal'
import { DEFAULT_KEY, pitchClassName, spellPitch } from './spell'

const K = (tonic: string, scale: 'major' | 'minor') => ({ tonic, scale })

describe('pitchClassName', () => {
  it('spells naturals plainly in C major', () => {
    expect(pitchClassName(60)).toBe('C')
    expect(pitchClassName(71)).toBe('B')
  })

  it('spells the same pitch as Eb in a flat key and D# in a sharp key', () => {
    expect(pitchClassName(63, K('Ab', 'major'))).toBe('Eb')
    expect(pitchClassName(63, K('E', 'major'))).toBe('D#')
  })

  it('uses the key signature even for notes outside the scale', () => {
    // Bb is not in E major; the key has sharps, so the fallback spells sharps.
    expect(pitchClassName(70, K('E', 'major'))).toBe('A#')
    expect(pitchClassName(70, K('Ab', 'major'))).toBe('Bb')
  })

  it('handles a minor key from its natural scale', () => {
    expect(pitchClassName(66, K('F#', 'minor'))).toBe('F#')
    expect(pitchClassName(61, K('C', 'minor'))).toBe('Db')
  })

  it('produces Cb in Gb major rather than B', () => {
    expect(pitchClassName(71, K('Gb', 'major'))).toBe('Cb')
  })
})

describe('spellPitch', () => {
  it('appends the octave', () => {
    expect(spellPitch(60, DEFAULT_KEY)).toBe('C4')
    expect(spellPitch(21, DEFAULT_KEY)).toBe('A0')
    expect(spellPitch(108, DEFAULT_KEY)).toBe('C8')
  })

  it('gives Cb its LETTER octave, not its pitch octave', () => {
    // MIDI 71 is B4, but spelled Cb it belongs to octave 5.
    expect(spellPitch(71, K('Gb', 'major'))).toBe('Cb5')
  })

  it('round-trips every key on the keyboard, in the most extreme flat key', () => {
    for (let m = 21; m <= 108; m++) {
      expect(Note.midi(spellPitch(m, K('Gb', 'major')))).toBe(m)
    }
  })

  it('round-trips every key on the keyboard, in the most extreme sharp key', () => {
    for (let m = 21; m <= 108; m++) {
      expect(Note.midi(spellPitch(m, K('C#', 'major')))).toBe(m)
    }
  })
})
