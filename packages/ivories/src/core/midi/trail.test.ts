import { describe, it, expect } from 'vitest'
import { MAX_TRAIL_NOTES, trailNoteOff, trailNoteOn, trailReseat } from './trail'

describe('live trail (R-T)', () => {
  it('a note-on opens a held note; its note-off closes it', () => {
    const a = trailNoteOn([], 60, 90, 1)
    expect(a).toEqual([{ midi: 60, velocity: 90, startSec: 1, endSec: null }])
    expect(trailNoteOff(a, 60, 1.5)).toEqual([{ midi: 60, velocity: 90, startSec: 1, endSec: 1.5 }])
  })

  it('a repeated note-on closes the still-held copy first', () => {
    const a = trailNoteOn(trailNoteOn([], 60, 90, 1), 60, 70, 2)
    expect(a).toEqual([
      { midi: 60, velocity: 90, startSec: 1, endSec: 2 },
      { midi: 60, velocity: 70, startSec: 2, endSec: null },
    ])
  })

  it('an off for a key that is not held returns the same list', () => {
    const a = trailNoteOn([], 60, 90, 1)
    expect(trailNoteOff(a, 62, 2)).toBe(a)
  })

  it('an off never ends a note before it started (a backward clock)', () => {
    expect(trailNoteOff(trailNoteOn([], 60, 90, 5), 60, 4)[0].endSec).toBe(5)
  })

  it('keeps at most MAX_TRAIL_NOTES, dropping the oldest', () => {
    let list = trailNoteOn([], 21, 1, 0)
    for (let i = 1; i <= MAX_TRAIL_NOTES; i++) list = trailNoteOn(list, 21 + (i % 80), 1, i)
    expect(list).toHaveLength(MAX_TRAIL_NOTES)
    expect(list[0].startSec).toBe(1)
  })

  it('reseat (after a seek) drops finished notes and restarts held ones at the new time', () => {
    const list = trailNoteOff(trailNoteOn(trailNoteOn([], 60, 90, 1), 64, 80, 1.2), 60, 1.5)
    expect(trailReseat(list, 10)).toEqual([{ midi: 64, velocity: 80, startSec: 10, endSec: null }])
  })
})
