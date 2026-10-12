import { Key, Midi, Note } from 'tonal'

export interface KeyContext { tonic: string; scale: 'major' | 'minor' }

export const DEFAULT_KEY: KeyContext = { tonic: 'C', scale: 'major' }

function scaleNames(key: KeyContext): readonly string[] {
  return key.scale === 'minor'
    ? Key.minorKey(key.tonic).natural.scale
    : Key.majorKey(key.tonic).scale
}

/** Negative for a flat key signature, positive for a sharp one. */
function alteration(key: KeyContext): number {
  return key.scale === 'minor'
    ? Key.minorKey(key.tonic).alteration
    : Key.majorKey(key.tonic).alteration
}

/**
 * The key's own seven spellings win; anything outside the scale follows the key
 * signature's direction. Note.chroma returns NaN for an unparseable name, and
 * `NaN === chroma` is false for every chroma, so junk is skipped without a guard
 * that would have to be written `Number.isInteger(...)` to work at all.
 */
export function pitchClassName(midi: number, key: KeyContext = DEFAULT_KEY): string {
  const chroma = ((midi % 12) + 12) % 12
  for (const n of scaleNames(key)) {
    if (Note.chroma(n) === chroma) return n
  }
  return Midi.midiToNoteName(midi, { sharps: alteration(key) >= 0, pitchClass: true })
}

/**
 * A note's octave belongs to its LETTER, not its pitch: Cb4 is MIDI 59 and B#3
 * is MIDI 60, so floor(midi / 12) - 1 is off by one for both. The octave is
 * chosen by round-tripping instead, which is correct for every spelling.
 */
export function spellPitch(midi: number, key: KeyContext = DEFAULT_KEY): string {
  const name = pitchClassName(midi, key)
  const base = Math.floor(midi / 12) - 1
  for (const oct of [base, base + 1, base - 1]) {
    if (Note.midi(`${name}${oct}`) === midi) return `${name}${oct}`
  }
  return `${name}${base}`
}
