import { describe, it, expect } from 'vitest'
import { ChordFeed } from './chordFeed'
import { DEFAULT_KEY } from './spell'
import type { KeyContext } from './spell'
import type { NoteEvent } from '../model/types'

const n = (id: number, pitch: number, startSec: number, endSec: number): NoteEvent => ({
  id, pitch, startTicks: 0, durTicks: 0, startSec, endSec, velocity: 90, voiceId: 'a',
})

// A held C major block chord for two seconds, then an F major one.
const block = [
  n(0, 60, 0, 2), n(1, 64, 0, 2), n(2, 67, 0, 2),
  n(3, 65, 2, 4), n(4, 69, 2, 4), n(5, 72, 2, 4),
]
const WINDOW = 0.3
const MAX_DUR = 2

/** Drives the feed at 60fps from `fromSec` to `toSec`, with a wall clock that
    advances in step, and returns every reading it produced. */
function run(feed: ChordFeed, notes: NoteEvent[], fromSec: number, toSec: number, key: KeyContext = DEFAULT_KEY) {
  const out = []
  for (let t = fromSec; t <= toSec; t += 1 / 60) {
    out.push(feed.update(notes, t, WINDOW, MAX_DUR, key, t * 1000))
  }
  return out
}

describe('ChordFeed', () => {
  it('confirms a held block chord whose pitch set never changes (F41)', () => {
    const readings = run(new ChordFeed(), block, 0, 1)
    expect(readings[readings.length - 1]?.symbol).toBe('CM')
  })

  it('returns the SAME reading object every frame while the chord is steady', () => {
    const feed = new ChordFeed()
    const readings = run(feed, block, 0, 1.5)
    const last = readings[readings.length - 1]
    expect(last).not.toBeNull()
    // Every frame after the commit hands back the identical object, which is
    // what lets App skip setChord on an unchanged chord.
    const firstCommit = readings.findIndex((r) => r !== null)
    expect(readings.slice(firstCommit).every((r) => r === last)).toBe(true)
  })

  it('moves to the next chord once it has been held long enough', () => {
    const readings = run(new ChordFeed(), block, 0, 3)
    expect(readings[readings.length - 1]?.symbol).toBe('FM')
  })

  it('resolves an arpeggio to one chord rather than a symbol per note', () => {
    // One note at a time, every note short; the 0.7s window keeps the bass in view.
    const arp = [n(0, 60, 0, 0.15), n(1, 64, 0.15, 0.3), n(2, 67, 0.3, 0.45), n(3, 72, 0.45, 0.6)]
    const feed = new ChordFeed()
    const symbols = new Set<string>()
    for (let t = 0; t <= 0.65; t += 1 / 60) {
      const r = feed.update(arp, t, 0.7, 0.15, DEFAULT_KEY, t * 1000)
      if (r) symbols.add(r.symbol)
    }
    expect([...symbols]).toEqual(['CM'])
  })

  it('recovers after a backward scrub rather than sticking', () => {
    const feed = new ChordFeed()
    run(feed, block, 1.5, 3.5)
    // Jump back into the C chord. The wall clock keeps running forwards.
    let r = null
    for (let i = 0; i < 30; i++) r = feed.update(block, 1, WINDOW, MAX_DUR, DEFAULT_KEY, 5000 + i * 16)
    expect(r?.symbol).toBe('CM')
  })

  it('confirms a chord while paused, because hysteresis runs on the wall clock', () => {
    const feed = new ChordFeed()
    let r = null
    // The playhead sits still at 1s; only the wall clock moves.
    for (let i = 0; i < 30; i++) r = feed.update(block, 1, WINDOW, MAX_DUR, DEFAULT_KEY, i * 16)
    expect(r?.symbol).toBe('CM')
  })

  it('re-detects when the key changes, so the chord is re-spelled', () => {
    const dbChord = [n(0, 61, 0, 4), n(1, 65, 0, 4), n(2, 68, 0, 4)]
    const feed = new ChordFeed()
    let r = null
    for (let i = 0; i < 30; i++) r = feed.update(dbChord, 1, WINDOW, 4, { tonic: 'E', scale: 'major' }, i * 16)
    expect(r?.symbol).toBe('C#M')
    for (let i = 30; i < 60; i++) r = feed.update(dbChord, 1, WINDOW, 4, { tonic: 'Ab', scale: 'major' }, i * 16)
    expect(r?.symbol).toBe('DbM')
  })

  it('clears on reset', () => {
    const feed = new ChordFeed()
    run(feed, block, 0, 1)
    feed.reset()
    expect(feed.update([], 0, WINDOW, MAX_DUR, DEFAULT_KEY, 0)).toBeNull()
  })
})
