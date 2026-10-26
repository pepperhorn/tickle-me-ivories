/** Physical string indices are zero-based, low to high, matching Chordl's openMidi convention. */
import type { FrettedInstrument, HeadstockStyle } from './types'
import { pitchClassName } from '../music/spell'
export const FRETBOARD_TUNINGS: Readonly<Record<FrettedInstrument, readonly number[]>> = {
  guitar: [40, 45, 50, 55, 59, 64], bass4: [28, 33, 38, 43], bass5: [23, 28, 33, 38, 43],
}
export function headstockFor(instrument: FrettedInstrument, requested?: HeadstockStyle): HeadstockStyle {
  return instrument === 'guitar' ? requested === 'tele' ? 'tele' : 'strat' : requested === 'violin' ? 'violin' : 'precision'
}
export function fretNoteName(midi: number, octave = false): string {
  return pitchClassName(midi).replace(/#/g, '♯').replace(/b/g, '♭') + (octave ? Math.floor(midi / 12) - 1 : '')
}
export interface FretPosition { string: number; fret: number; midi: number }
/** Every exact-pitch location, including open strings. This is a map, NOT a playable fingering. */
export function exactPitchPositions(pitches: Iterable<number>, instrument: FrettedInstrument = 'guitar', frets = 12): FretPosition[] {
  const wanted = new Set(pitches)
  return FRETBOARD_TUNINGS[instrument].flatMap((open, string) =>
    Array.from({ length: frets + 1 }, (_, fret) => ({ string, fret, midi: open + fret })).filter((p) => wanted.has(p.midi)))
}
/** Equal-tempered physical fret spacing, normalised to the visible neck length. */
export function fretBoundary(fret: number, frets: number, length: number): number {
  return length * (1 - 2 ** (-fret / 12)) / (1 - 2 ** (-frets / 12))
}
