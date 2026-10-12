// Song references carried by a scene (spec §8.1-§8.4). Pure.

import type { SongRef } from './types'
import { isObj } from './codec'

/** Spec §8.2: an opensongs song id, and a pinned ref (a tag or a 40-hex commit; never a branch). */
export const OPENSONGS_ID_RE = /^[a-z0-9-]{1,80}$/
export const OPENSONGS_REF_RE = /^(v\d+\.\d+\.\d+|[0-9a-f]{40})$/
/** Lowercase hex sha256, as hashFile produces for ScoreDocument.id. */
export const SHA256_RE = /^[0-9a-f]{64}$/
/** Spec §8.4: an embedded MIDI file is at most 128 KiB decoded. */
export const MAX_MIDI_BYTES = 128 * 1024
/** Spec §8.5: names (song title, save name, voice label) are at most 128 characters. */
export const MAX_NAME_CHARS = 128

const FORMATS = ['midi', 'musicxml'] as const
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/**
 * The decoded byte length of a canonical (padded, standard-alphabet) base64
 * string, or null if it is not one. Computed from the length alone, so a
 * 1 MB string is sized without being decoded.
 */
export function base64DecodedBytes(s: string): number | null {
  if (s.length % 4 !== 0 || !BASE64_RE.test(s)) return null
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0
  return (s.length / 4) * 3 - pad
}

const isName = (v: unknown): v is string => typeof v === 'string' && v.length <= MAX_NAME_CHARS

/**
 * Returns a clean copy of a valid song ref (unknown keys dropped), or null.
 * Carries the spec §8.2/§8.4 rules (preflight F20) so HashShareProvider can
 * rely on `kind` and later phases do not have to reopen this validator.
 */
export function validSongRef(v: unknown): SongRef | null {
  if (!isObj(v)) return null
  switch (v.kind) {
    case 'opensongs':
      if (typeof v.id !== 'string' || !OPENSONGS_ID_RE.test(v.id)) return null
      if (typeof v.ref !== 'string' || !OPENSONGS_REF_RE.test(v.ref)) return null
      return { kind: 'opensongs', id: v.id, ref: v.ref }
    case 'local':
      if (typeof v.sha256 !== 'string' || !SHA256_RE.test(v.sha256) || !isName(v.name)) return null
      if (!FORMATS.includes(v.format as typeof FORMATS[number])) return null
      return { kind: 'local', sha256: v.sha256, name: v.name, format: v.format as typeof FORMATS[number] }
    case 'midi': {
      if (typeof v.sha256 !== 'string' || !SHA256_RE.test(v.sha256) || !isName(v.name)) return null
      if (typeof v.dataB64 !== 'string') return null
      const bytes = base64DecodedBytes(v.dataB64)
      if (bytes === null || bytes === 0 || bytes > MAX_MIDI_BYTES) return null
      return { kind: 'midi', sha256: v.sha256, name: v.name, dataB64: v.dataB64 }
    }
    case 'ph-asset':
      // Phase 6; accepted structurally only (the gateway owns what an asset id is).
      if (typeof v.assetId !== 'string' || !v.assetId || v.assetId.length > MAX_NAME_CHARS) return null
      return { kind: 'ph-asset', assetId: v.assetId }
    default:
      return null
  }
}

/**
 * The identity a profile is stored under for this song (spec §8.1). For a
 * local or embedded file it is the content hash, which equals
 * ScoreDocument.id, so a scene's profile lines up with today's autosaves.
 */
export function songKey(ref: SongRef): string {
  switch (ref.kind) {
    case 'opensongs': return `opensongs:${ref.id}@${ref.ref}`
    case 'local':
    case 'midi': return ref.sha256
    case 'ph-asset': return `ph:${ref.assetId}`
  }
}
