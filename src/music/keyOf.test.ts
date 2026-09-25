import { describe, it, expect } from 'vitest'
import { KEY_OPTIONS, formatKey, keyOfScore, parseKeyString } from './keyOf'
import type { ScoreDocument } from '../model/types'

const score = (keySignature: ScoreDocument['keySignature']): ScoreDocument => ({
  id: 'x', name: 'x', ppq: 480, tempoMap: [], voices: [], notes: [],
  durationSec: 0, sourceFormat: 'midi', beatsPerBar: 4, keySignature,
})

describe('parseKeyString', () => {
  it('parses a tonic and a scale', () => {
    expect(parseKeyString('Eb major')).toEqual({ tonic: 'Eb', scale: 'major' })
    expect(parseKeyString('F# minor')).toEqual({ tonic: 'F#', scale: 'minor' })
  })

  it('is case- and space-tolerant', () => {
    expect(parseKeyString('  bb MINOR ')).toEqual({ tonic: 'Bb', scale: 'minor' })
  })

  it('rejects junk rather than guessing', () => {
    expect(parseKeyString('H major')).toBeNull()
    expect(parseKeyString('C lydian')).toBeNull()
    expect(parseKeyString('')).toBeNull()
  })
})

describe('keyOfScore', () => {
  it('prefers the user override above everything', () => {
    expect(keyOfScore(score({ key: 'Ab', scale: 'major' }), 'E minor'))
      .toEqual({ tonic: 'E', scale: 'minor' })
  })

  it('falls back to the file key signature when there is no override', () => {
    expect(keyOfScore(score({ key: 'Ab', scale: 'major' }), null))
      .toEqual({ tonic: 'Ab', scale: 'major' })
  })

  it('falls back to C major when the file has no key signature', () => {
    expect(keyOfScore(score(null), null)).toEqual({ tonic: 'C', scale: 'major' })
  })

  it('falls back to C major with no score at all', () => {
    expect(keyOfScore(null, null)).toEqual({ tonic: 'C', scale: 'major' })
  })

  it('ignores an unparseable override rather than breaking spelling', () => {
    expect(keyOfScore(score({ key: 'Ab', scale: 'major' }), 'nonsense'))
      .toEqual({ tonic: 'Ab', scale: 'major' })
  })
})

describe('KEY_OPTIONS', () => {
  it('offers every tonic in both scales, and every one of them parses', () => {
    expect(KEY_OPTIONS).toHaveLength(30)
    for (const k of KEY_OPTIONS) expect(parseKeyString(k)).not.toBeNull()
  })

  it('round-trips through formatKey', () => {
    for (const k of KEY_OPTIONS) expect(formatKey(parseKeyString(k)!)).toBe(k)
  })

  it('uses real minor tonics rather than reusing the major tonic list', () => {
    // F35: the majors favour flat tonics (Db, Gb, Cb); minors conventionally
    // use their sharp-side relatives (C#, G#, D#, A#) and omit the enharmonic
    // flat spellings that would never be used for a minor key signature.
    const minors = KEY_OPTIONS.filter((k) => k.endsWith('minor')).map((k) => k.split(' ')[0])
    expect(minors.sort()).toEqual(
      ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab'].sort(),
    )
  })
})
