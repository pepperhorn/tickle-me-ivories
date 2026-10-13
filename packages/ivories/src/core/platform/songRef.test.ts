import { describe, it, expect } from 'vitest'
import {
  MAX_MIDI_BYTES, OPENSONGS_ID_RE, OPENSONGS_REF_RE, base64DecodedBytes, songKey, validSongRef,
} from './songRef'

const SHA = 'a'.repeat(64)
const GIT_SHA = '0123456789abcdef0123456789abcdef01234567'

describe('validSongRef: opensongs (spec §8.2)', () => {
  it('accepts a tag or a 40-hex commit ref, and a slug id', () => {
    expect(validSongRef({ kind: 'opensongs', id: 'fur-elise', ref: 'v1.2.3' }))
      .toEqual({ kind: 'opensongs', id: 'fur-elise', ref: 'v1.2.3' })
    expect(validSongRef({ kind: 'opensongs', id: 'a1', ref: GIT_SHA })).not.toBeNull()
  })

  it('refuses a branch ref, a short sha, or an uppercase sha', () => {
    for (const ref of ['main', 'v1.2', GIT_SHA.slice(0, 39), GIT_SHA.toUpperCase(), 'v1.2.3/../x'])
      expect(validSongRef({ kind: 'opensongs', id: 'x', ref }), ref).toBeNull()
  })

  it('refuses an id outside ^[a-z0-9-]{1,80}$', () => {
    for (const id of ['', 'Fur-Elise', '../etc', 'a b', 'a'.repeat(81), 7])
      expect(validSongRef({ kind: 'opensongs', id, ref: 'v1.0.0' }), String(id)).toBeNull()
    expect(validSongRef({ kind: 'opensongs', id: 'a'.repeat(80), ref: 'v1.0.0' })).not.toBeNull()
  })

  it('exports the exact spec regexes', () => {
    expect(OPENSONGS_ID_RE.source).toBe('^[a-z0-9-]{1,80}$')
    expect(OPENSONGS_REF_RE.source).toBe('^(v\\d+\\.\\d+\\.\\d+|[0-9a-f]{40})$')
  })
})

describe('validSongRef: local (spec §8.3)', () => {
  it('accepts a lowercase sha256, a name and a known format', () => {
    const r = { kind: 'local', sha256: SHA, name: 'demo.mid', format: 'midi' }
    expect(validSongRef(r)).toEqual(r)
    expect(validSongRef({ ...r, format: 'musicxml' })).not.toBeNull()
  })

  it('refuses a bad hash, a non-string name, or an unknown format', () => {
    const r = { kind: 'local', sha256: SHA, name: 'demo.mid', format: 'midi' }
    expect(validSongRef({ ...r, sha256: 'A'.repeat(64) })).toBeNull()
    expect(validSongRef({ ...r, sha256: 'a'.repeat(63) })).toBeNull()
    expect(validSongRef({ ...r, name: 5 })).toBeNull()
    expect(validSongRef({ ...r, format: 'abc' })).toBeNull()
  })

  it('drops unknown keys', () => {
    const r = validSongRef({ kind: 'local', sha256: SHA, name: 'x', format: 'midi', evil: '<b>' })
    expect(r).not.toHaveProperty('evil')
  })
})

describe('validSongRef: midi (spec §8.4)', () => {
  const b64 = (n: number) => Buffer.from(new Uint8Array(n)).toString('base64')

  it('accepts base64 of at most 128 KiB decoded', () => {
    expect(MAX_MIDI_BYTES).toBe(128 * 1024)
    const r = { kind: 'midi', sha256: SHA, name: 'a.mid', dataB64: b64(MAX_MIDI_BYTES) }
    expect(validSongRef(r)).toEqual(r)
  })

  it('refuses base64 that decodes past 128 KiB', () => {
    expect(validSongRef({ kind: 'midi', sha256: SHA, name: 'a.mid', dataB64: b64(MAX_MIDI_BYTES + 1) })).toBeNull()
  })

  it('refuses non-base64 or empty data', () => {
    for (const dataB64 of ['', 'abc', 'ab$=', '====', 'QQ==QQ==', 12])
      expect(validSongRef({ kind: 'midi', sha256: SHA, name: 'a.mid', dataB64 }), String(dataB64)).toBeNull()
  })

  it('computes the decoded length from padding', () => {
    expect(base64DecodedBytes('QQ==')).toBe(1)
    expect(base64DecodedBytes('QUI=')).toBe(2)
    expect(base64DecodedBytes('QUJD')).toBe(3)
    expect(base64DecodedBytes('QUJ')).toBeNull()
  })
})

describe('validSongRef: ph-asset and junk', () => {
  it('accepts a ph-asset structurally', () => {
    expect(validSongRef({ kind: 'ph-asset', assetId: 'abc-123' })).toEqual({ kind: 'ph-asset', assetId: 'abc-123' })
    expect(validSongRef({ kind: 'ph-asset', assetId: '' })).toBeNull()
    expect(validSongRef({ kind: 'ph-asset', assetId: 3 })).toBeNull()
  })

  it('refuses non-objects and unknown kinds', () => {
    for (const v of [null, undefined, 'x', [], { kind: 'youtube', id: 'x' }])
      expect(validSongRef(v)).toBeNull()
  })
})

describe('songKey', () => {
  it('keys each ref kind as spec §8.1 says', () => {
    expect(songKey({ kind: 'opensongs', id: 'fur-elise', ref: 'v1.0.0' })).toBe('opensongs:fur-elise@v1.0.0')
    expect(songKey({ kind: 'local', sha256: SHA, name: 'x', format: 'midi' })).toBe(SHA)
    expect(songKey({ kind: 'midi', sha256: SHA, name: 'x', dataB64: 'QQ==' })).toBe(SHA)
    expect(songKey({ kind: 'ph-asset', assetId: 'q1' })).toBe('ph:q1')
  })
})
