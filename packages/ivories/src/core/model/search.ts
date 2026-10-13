import type { NoteEvent } from './types'

/** First index whose startSec is >= sec, in a start-sorted array. */
export function lowerBoundByStart(notes: NoteEvent[], sec: number): number {
  let lo = 0, hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (notes[mid].startSec < sec) lo = mid + 1
    else hi = mid
  }
  return lo
}
