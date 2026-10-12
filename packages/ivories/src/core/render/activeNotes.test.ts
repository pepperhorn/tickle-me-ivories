import { describe, it, expect } from 'vitest'
import { diffHeld, heldScoreNotes } from './activeNotes'
import type { NoteEvent, ScoreDocument } from '../model/types'

const n = (id: number, pitch: number, s: number, e: number, voiceId = 'v'): NoteEvent =>
  ({ id, pitch, startTicks: 0, durTicks: 0, startSec: s, endSec: e, velocity: 80, voiceId })
const score = (notes: NoteEvent[]): ScoreDocument => ({
  id: 'x', name: 'x', ppq: 480, tempoMap: [], notes, durationSec: 4, sourceFormat: 'midi',
  timeSignatures: [], keySignature: null,
  voices: [
    { id: 'v', label: 'v', hue: 0, instrument: 'p', visible: true, audible: true, volume: 1 },
    { id: 'drums', label: 'd', hue: 0, instrument: 'p', visible: true, audible: true, volume: 1, percussion: true },
    { id: 'hidden', label: 'h', hue: 0, instrument: 'p', visible: false, audible: true, volume: 1 },
  ],
})

describe('held score notes', () => {
  it('is what sounds at t, without percussion or hidden voices', () => {
    const s = score([n(0, 60, 0, 1), n(1, 36, 0, 1, 'drums'), n(2, 64, 0, 1, 'hidden'), n(3, 67, 2, 3)])
    expect([...heldScoreNotes(s, 0.5, 1).keys()]).toEqual([60])
    expect([...heldScoreNotes(s, 2.5, 1).keys()]).toEqual([67])
  })

  it('diffHeld reports ons and offs, and null when nothing changed', () => {
    const a = new Map([[60, n(0, 60, 0, 1)]])
    const b = new Map([[64, n(1, 64, 0.5, 1)]])
    expect(diffHeld(a, new Map(a))).toBeNull()
    const d = diffHeld(a, b)!
    expect(d.on.map((x) => x.pitch)).toEqual([64])
    expect(d.off.map((x) => x.pitch)).toEqual([60])
  })

  it('a re-strike of the same pitch (new note id) is an off then an on', () => {
    const d = diffHeld(new Map([[60, n(0, 60, 0, 1)]]), new Map([[60, n(5, 60, 1, 2)]]))!
    expect(d.off.map((x) => x.id)).toEqual([0])
    expect(d.on.map((x) => x.id)).toEqual([5])
  })
})
