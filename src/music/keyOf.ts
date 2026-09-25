import { DEFAULT_KEY } from './spell'
import type { KeyContext } from './spell'
import type { ScoreDocument } from '../model/types'

const MAJOR_TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C#', 'Cb', 'Gb']

// F35: minor tonics are a separate list, not a reuse of the major list. Minor
// key signatures conventionally spell their sharp side (C#, G#, D#, A# minor)
// rather than the enharmonic flats (Db, Gb, Cb) that the majors use, and the
// majors' flat-side tonics have no minor equivalent worth offering here.
const MINOR_TONICS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'D', 'G', 'C', 'F', 'Bb', 'Eb', 'Ab']

export const KEY_OPTIONS: string[] = [
  ...MAJOR_TONICS.map((t) => `${t} major`),
  ...MINOR_TONICS.map((t) => `${t} minor`),
]

export function formatKey(k: KeyContext): string {
  return `${k.tonic} ${k.scale}`
}

/** Strict on purpose: a silently mis-parsed key spells every accidental wrong
    for the whole piece, which is worse than ignoring the override. */
export function parseKeyString(s: string): KeyContext | null {
  const m = /^\s*([a-g])([#b]?)\s+(major|minor)\s*$/i.exec(s)
  if (!m) return null
  return {
    tonic: m[1].toUpperCase() + m[2].toLowerCase(),
    scale: m[3].toLowerCase() as 'major' | 'minor',
  }
}

/**
 * Spec §15.3, in order: the user override, then the MIDI file's key-signature
 * meta event, then C major. tonal does not infer a key and this app does not
 * guess one -- an inferred key that is wrong mis-spells the whole piece.
 */
export function keyOfScore(score: ScoreDocument | null, override: string | null): KeyContext {
  if (override) {
    const parsed = parseKeyString(override)
    if (parsed) return parsed
  }
  const sig = score?.keySignature
  if (sig) {
    const parsed = parseKeyString(`${sig.key} ${sig.scale}`)
    if (parsed) return parsed
  }
  return DEFAULT_KEY
}
