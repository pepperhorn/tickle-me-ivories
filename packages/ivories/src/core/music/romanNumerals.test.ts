import { describe, it, expect } from 'vitest'
import { toRomanNumeral } from './romanNumerals'

const C = { tonic: 'C', scale: 'major' as const }
const Am = { tonic: 'A', scale: 'minor' as const }

describe('toRomanNumeral', () => {
  it('leaves a major triad as a bare uppercase numeral', () => {
    expect(toRomanNumeral('CM', C)).toBe('I')
    expect(toRomanNumeral('C', C)).toBe('I')
  })

  it('lowercases minor and diminished, which tonal returns uppercase', () => {
    expect(toRomanNumeral('Dm7', C)).toBe('ii7')
    expect(toRomanNumeral('Am', C)).toBe('vi')
    expect(toRomanNumeral('Bdim', C)).toBe('vii°')
  })

  it('renders a half-diminished seventh with its own symbol', () => {
    expect(toRomanNumeral('Bm7b5', C)).toBe('viiø7')
  })

  it('keeps a dominant seventh uppercase', () => {
    expect(toRomanNumeral('G7', C)).toBe('V7')
  })

  it('normalises tonal’s M7 to maj7', () => {
    expect(toRomanNumeral('CM7', C)).toBe('Imaj7')
    expect(toRomanNumeral('Fmaj7', C)).toBe('IVmaj7')
  })

  it('keeps a borrowed chord’s accidental', () => {
    expect(toRomanNumeral('Ebmaj7', C)).toBe('bIIImaj7')
  })

  it('works against a minor tonic', () => {
    expect(toRomanNumeral('Am', Am)).toBe('i')
    expect(toRomanNumeral('E7', Am)).toBe('V7')
    expect(toRomanNumeral('Bdim', Am)).toBe('ii°')
  })

  it('ignores the slash bass, which tonal cannot express as figured bass', () => {
    expect(toRomanNumeral('CM/E', C)).toBe('I')
    expect(toRomanNumeral('CM/G', C)).toBe('I')
  })

  it('returns null for a symbol tonal cannot parse, rather than echoing it', () => {
    // Progression.toRomanNumerals passes junk straight through, so this must be
    // rejected before the call or nonsense reaches the screen.
    expect(toRomanNumeral('zzz', C)).toBeNull()
    expect(toRomanNumeral('', C)).toBeNull()
  })

  it('returns null rather than a numeral for an empty tonic', () => {
    expect(toRomanNumeral('CM', { tonic: '', scale: 'major' })).toBeNull()
  })
})
