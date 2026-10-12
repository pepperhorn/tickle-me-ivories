import { describe, it, expect } from 'vitest'
import { Scheduler, LOOKAHEAD_SEC } from './scheduler'
import type { NoteEvent } from '../model/types'

const n = (id: number, startSec: number): NoteEvent => ({
  id, pitch: 60 + id, startTicks: 0, durTicks: 480,
  startSec, endSec: startSec + 0.4, velocity: 100, voiceId: 'v',
})

const NOTES = [n(0, 0), n(1, 0.1), n(2, 0.5), n(3, 1.0), n(4, 5.0)]

describe('Scheduler', () => {
  it('collects only notes inside the lookahead window', () => {
    const s = new Scheduler(NOTES)
    const got = s.collect(0)
    expect(got.map((g) => g.note.id)).toEqual([0, 1])   // 0 and 0.1 are within 0.15s
  })

  it('never schedules the same note twice', () => {
    const s = new Scheduler(NOTES)
    const seen: number[] = []
    for (let t = 0; t <= 6; t += LOOKAHEAD_SEC / 2) {
      for (const g of s.collect(t)) seen.push(g.note.id)
    }
    expect(seen).toEqual([...new Set(seen)])
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })

  it('reports the absolute time each note should sound', () => {
    const s = new Scheduler(NOTES)
    expect(s.collect(0)[0].atSec).toBeCloseTo(0, 9)
    const later = new Scheduler(NOTES)
    later.seek(0.45)
    expect(later.collect(0.45)[0].note.id).toBe(2)
    expect(later.collect(0.45).length).toBe(0)   // already consumed
  })

  it('re-seats the cursor on seek, forwards and backwards', () => {
    const s = new Scheduler(NOTES)
    s.collect(0); s.collect(1.0)
    s.seek(0)
    expect(s.collect(0).map((g) => g.note.id)).toEqual([0, 1])
  })

  it('skips notes already passed when seeking forward', () => {
    const s = new Scheduler(NOTES)
    s.seek(4.9)
    // Notes 0-3 are behind the playhead and must not be replayed. Note 4 starts
    // at 5.0, which IS inside the 150ms lookahead from 4.9 — it is due now, and
    // handing it over early with an exact start time is what keeps audio
    // sample-accurate when the scheduler tick fires late.
    expect(s.collect(4.9).map((g) => g.note.id)).toEqual([4])
    // ...and it is not handed over twice.
    expect(s.collect(5.0).map((g) => g.note.id)).toEqual([])
  })

  it('handles an empty score without throwing', () => {
    const s = new Scheduler([])
    expect(s.collect(0)).toEqual([])
    s.seek(10)
    expect(s.collect(10)).toEqual([])
  })

  it('tolerates a playhead beyond the end of the score', () => {
    const s = new Scheduler(NOTES)
    expect(s.collect(999)).toHaveLength(5)
    expect(s.collect(1000)).toEqual([])
  })
})
