import { heldNotes, visibleNotes } from './pianoRoll'
import type { NoteEvent, ScoreDocument } from '../model/types'

export const EMPTY_HELD: ReadonlyMap<number, NoteEvent> = new Map()

/** What sounds at t on the keys: visible, non-percussion voices (spec §6.1). */
export function heldScoreNotes(score: ScoreDocument, t: number, maxNoteDur: number): Map<number, NoteEvent> {
  const vis = visibleNotes(score.notes, t, 0, maxNoteDur).filter((n) => {
    const v = score.voices.find((x) => x.id === n.voiceId)
    return v?.visible !== false && !v?.percussion
  })
  return heldNotes(vis, t)
}

/** Ons and offs between two held sets; null when they hold the same notes. */
export function diffHeld(
  prev: ReadonlyMap<number, NoteEvent>, next: ReadonlyMap<number, NoteEvent>,
): { on: NoteEvent[]; off: NoteEvent[] } | null {
  let same = prev.size === next.size
  if (same) for (const [p, note] of next) if (prev.get(p)?.id !== note.id) { same = false; break }
  if (same) return null
  const on: NoteEvent[] = []
  const off: NoteEvent[] = []
  for (const [p, note] of prev) if (next.get(p)?.id !== note.id) off.push(note)
  for (const [p, note] of next) if (prev.get(p)?.id !== note.id) on.push(note)
  return { on, off }
}
