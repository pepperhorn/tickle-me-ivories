/**
 * A live note on the PROVIDER CLOCK, for the rising roll (R-T). `endSec` is
 * null while the key is held. Not LiveNote.time, which is performance.now().
 */
export interface TrailNote { midi: number; velocity: number; startSec: number; endSec: number | null }

/** The rising roll shows at most this many recent live notes. */
export const MAX_TRAIL_NOTES = 512

const close = (n: TrailNote, at: number): TrailNote => ({ ...n, endSec: Math.max(n.startSec, at) })

export function trailNoteOn(list: readonly TrailNote[], midi: number, velocity: number, at: number): readonly TrailNote[] {
  const out = list.map((n) => (n.midi === midi && n.endSec === null ? close(n, at) : n))
  out.push({ midi, velocity, startSec: at, endSec: null })
  return out.length > MAX_TRAIL_NOTES ? out.slice(out.length - MAX_TRAIL_NOTES) : out
}

export function trailNoteOff(list: readonly TrailNote[], midi: number, at: number): readonly TrailNote[] {
  let changed = false
  const out = list.map((n) => {
    if (n.midi !== midi || n.endSec !== null) return n
    changed = true
    return close(n, at)
  })
  return changed ? out : list
}

/** After a seek: finished notes are dropped, held ones restart at the new position. */
export function trailReseat(list: readonly TrailNote[], at: number): readonly TrailNote[] {
  return list.filter((n) => n.endSec === null).map((n) => ({ ...n, startSec: at }))
}
