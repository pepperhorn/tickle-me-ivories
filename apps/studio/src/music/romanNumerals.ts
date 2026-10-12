import { Chord, Progression } from 'tonal'
import type { KeyContext } from './spell'

// The alternation order is load-bearing: IV before I, VII before VI before V,
// III before II before I. Get it wrong and "IV" matches as "I" plus a stray V.
const NUMERAL = /^([b#]*)(IV|VII|VI|V|III|II|I)(.*)$/

/** Minor, diminished and half-diminished lowercase; `maj` must not match `m`. */
const MINORISH = /^(m(?!aj)|dim|ø)/

/**
 * Spec §15.3. tonal returns UPPERCASE numerals with the chord quality appended
 * (`IIm7`, not `ii7`) and silently DROPS the slash bass, so figured-bass notation
 * is not available from this call. It also passes an unparseable symbol straight
 * through, which is why the chord is validated first.
 */
export function toRomanNumeral(symbol: string, key: KeyContext): string | null {
  if (!key.tonic) return null
  const base = symbol.split('/')[0].trim()
  if (!base || Chord.get(base).empty) return null

  const [raw] = Progression.toRomanNumerals(key.tonic, [base])
  const m = NUMERAL.exec(raw ?? '')
  if (!m) return null

  const [, accidental, roman, rawSuffix] = m
  const minorish = MINORISH.test(rawSuffix)

  let suffix = rawSuffix
  if (minorish) suffix = suffix.replace(/^m(?!aj)/, '')
  suffix = suffix.replace(/^dim/, '°').replace(/^(m7b5|7b5)/, 'ø7').replace(/^M7/, 'maj7')
  if (suffix === 'M') suffix = ''

  return accidental + (minorish ? roman.toLowerCase() : roman) + suffix
}
