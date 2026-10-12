import { Chord } from 'tonal'
import { spellPitch } from './spell'
import { lowerBoundByStart } from '../model/search'
import type { KeyContext } from './spell'
import type { NoteEvent } from '../model/types'

/** Below three DISTINCT pitch classes, tonal names power chords and intervals
    that read as noise on a piano roll. Counting raw pitches instead would let
    an octave-doubled interval (e.g. C3-C4-G4) through as a false "chord". */
const MIN_DISTINCT_PITCH_CLASSES = 3

/** Qualities that only ever appear when tonal is reaching for a root-position
    reading of an inversion. Demoting them is what turns Em#5 back into CM/E. */
const RARE_QUALITY = /#5|b5|#9|b9|#11|b13|alt|omit/

/**
 * Every pitch struck inside the trailing window, plus anything still sounding.
 * A PURE FUNCTION OF t: a broken chord resolves to the chord it outlines, and
 * scrubbing to the same t always produces the same set.
 */
export function pitchesInWindow(
  notes: NoteEvent[], t: number, windowSec: number, maxNoteDur: number,
): number[] {
  const out = new Set<number>()
  const from = t - Math.max(windowSec, maxNoteDur)
  for (let i = lowerBoundByStart(notes, from); i < notes.length; i++) {
    const n = notes[i]
    if (n.startSec > t) break
    if (n.startSec >= t - windowSec || n.endSec > t) out.add(n.pitch)
  }
  return [...out].sort((a, b) => a - b)
}

const quality = (symbol: string) => symbol.split('/')[0].replace(/^[A-G][#b]*/, '')

/** Stable: tonal's own order decides everything except the rare-quality demotion. */
export function rankCandidates(symbols: string[]): string[] {
  return symbols
    .map((s, i) => ({ s, i, rare: RARE_QUALITY.test(quality(s)) ? 1 : 0 }))
    .sort((a, b) => a.rare - b.rare || a.i - b.i)
    .map((x) => x.s)
}

function distinctPitchClassCount(pitches: number[]): number {
  return new Set(pitches.map((p) => ((p % 12) + 12) % 12)).size
}

/**
 * Notes go in ABSOLUTE and LOWEST-FIRST: tonal treats the first element as the
 * bass, which is what produces CM/E rather than a rootless reading. Spelling
 * comes from the key so a chord in Eb prints Cm, not B#m.
 */
export function detectChord(pitches: number[], key: KeyContext): string[] {
  if (distinctPitchClassCount(pitches) < MIN_DISTINCT_PITCH_CLASSES) return []
  const names = [...pitches].sort((a, b) => a - b).map((p) => spellPitch(p, key))
  return rankCandidates(Chord.detect(names, { assumePerfectFifth: true }))
}

/**
 * tonal names a plain major triad `CM` (and its inversions `CM/E`), which is
 * not how anyone writes a chord chart. For DISPLAY only, the bare `M` quality
 * is dropped; every other quality, maj7 (`Cmaj7`/`CM7`) included, is kept.
 * The raw symbol is still what toRomanNumeral takes -- it needs tonal's form.
 */
export function displayChordSymbol(symbol: string): string {
  return symbol.replace(/^([A-G][#b]*)M(?=\/|$)/, '$1')
}

export interface ChordReading { symbol: string; alternates: string[] }

/**
 * The one stateful piece in the music layer, and deliberately so: a new reading
 * must persist for confirmMs before it is committed (note-on chatter during a
 * chord change would otherwise commit two or three wrong chords in a row), and a
 * committed reading is held for minDisplayMs so the readout cannot flicker.
 *
 * It takes its clock as a parameter and lives outside the canvas render path, so
 * the "everything visible is a pure function of t" invariant still holds for the
 * canvas. Call reset() on seek.
 *
 * Task 16 will call update() every frame while the chord readout is on (ruling
 * F41), so the unchanged-input path below must stay cheap: no tonal call and no
 * allocation when the candidate set has not changed. The `candidates.join('|')`
 * needed to compare readings is only recomputed when the array reference
 * itself changes (Task 16 memoises detectChord by pitch set, so a held chord
 * passes the same array back every frame) -- a steady, already-committed chord
 * costs one reference check and nothing else.
 */
export class ChordTracker {
  private committed: ChordReading | null = null
  private committedAtMs = 0
  private committedKey = ''
  private pendingKey = ''
  private pendingSinceMs = 0
  private lastCandidates: string[] | null = null
  private lastKey = ''
  private readonly minDisplayMs: number
  private readonly confirmMs: number

  constructor(minDisplayMs = 300, confirmMs = 60) {
    this.minDisplayMs = minDisplayMs
    this.confirmMs = confirmMs
  }

  reset(): void {
    this.committed = null
    this.committedAtMs = 0
    this.committedKey = ''
    this.pendingKey = ''
    this.pendingSinceMs = 0
    this.lastCandidates = null
    this.lastKey = ''
  }

  update(candidates: string[], nowMs: number): ChordReading | null {
    // Silence never clears the readout: holding the last chord through a rest is
    // what a viewer expects, and blanking mid-phrase reads as a glitch on video.
    if (candidates.length === 0) {
      this.pendingKey = ''
      this.lastCandidates = null
      return this.committed
    }

    const key = candidates === this.lastCandidates ? this.lastKey : candidates.join('|')
    this.lastCandidates = candidates
    this.lastKey = key

    if (this.committed && key === this.committedKey) {
      this.pendingKey = ''
      return this.committed
    }

    if (key !== this.pendingKey) {
      this.pendingKey = key
      this.pendingSinceMs = nowMs
      return this.committed
    }

    const confirmed = nowMs - this.pendingSinceMs >= this.confirmMs
    const displayed = !this.committed || nowMs - this.committedAtMs >= this.minDisplayMs
    if (confirmed && displayed) {
      this.committed = { symbol: candidates[0], alternates: candidates.slice(1) }
      this.committedKey = key
      this.committedAtMs = nowMs
      this.pendingKey = ''
    }
    return this.committed
  }
}
