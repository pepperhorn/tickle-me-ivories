import { describe, it, expect } from 'vitest'
import { visibleNotes, heldNotes, drawStage } from './pianoRoll'
import { computeLayout } from './geometry'
import type { NoteEvent, Voice } from '../model/types'

const n = (id: number, pitch: number, startSec: number, dur = 0.4): NoteEvent => ({
  id, pitch, startTicks: 0, durTicks: 480,
  startSec, endSec: startSec + dur, velocity: 100, voiceId: 'v',
})

describe('visibleNotes', () => {
  const notes = [n(0, 60, 0), n(1, 62, 1), n(2, 64, 2), n(3, 66, 10), n(4, 68, 100)]

  it('includes notes inside the fall window', () => {
    expect(visibleNotes(notes, 0, 3, 3).map((x) => x.id)).toEqual([0, 1, 2])
  })

  it('excludes notes beyond the window', () => {
    expect(visibleNotes(notes, 0, 3, 3).some((x) => x.id === 3)).toBe(false)
  })

  it('still includes a note that has started but not finished', () => {
    expect(visibleNotes(notes, 0.2, 3, 3).map((x) => x.id)).toContain(0)
  })

  it('drops notes whose flash has fully decayed', () => {
    expect(visibleNotes(notes, 5, 3, 3).map((x) => x.id)).toEqual([])
  })

  it('costs the same for a dense score as a sparse one (windowed, not scanned)', () => {
    const dense: NoteEvent[] = []
    for (let i = 0; i < 20000; i++) dense.push(n(i, 21 + (i % 88), i * 0.01))
    const got = visibleNotes(dense, 100, 3, 3)
    expect(got.length).toBeLessThan(400)          // only ~3s worth, not 20000
    expect(got[0].startSec).toBeGreaterThan(99)
  })

  it('keeps a long held note visible past any fixed lookback', () => {
    // A 30s note: still sounding at t=20, long past the old 8s cutoff.
    // Reachable in practice -- at the tempo control's 25% minimum, a 2s
    // notated note becomes 8s, and slow pedal tones go further.
    const long = [n(0, 60, 0, 30)]
    const got = visibleNotes(long, 20, 3, 30)
    expect(got.map((x) => x.id)).toEqual([0])
    expect(heldNotes(got, 20).get(60)).toBeDefined()
  })
})

describe('heldNotes', () => {
  it('reports notes sounding at t, keyed by pitch', () => {
    const vis = [n(0, 60, 0, 1), n(1, 64, 0.5, 1)]
    const held = heldNotes(vis, 0.6)
    expect([...held.keys()].sort()).toEqual([60, 64])
  })

  it('excludes notes that have ended', () => {
    expect(heldNotes([n(0, 60, 0, 0.2)], 0.5).size).toBe(0)
  })

  it('excludes notes that have not started', () => {
    expect(heldNotes([n(0, 60, 1, 0.2)], 0.5).size).toBe(0)
  })

  it('keeps the loudest when two notes share a pitch', () => {
    const a = { ...n(0, 60, 0, 1), velocity: 40 }
    const b = { ...n(1, 60, 0, 1), velocity: 120 }
    expect(heldNotes([a, b], 0.5).get(60)!.velocity).toBe(120)
  })
})

describe('drawStage', () => {
  /** Records calls so we can assert what was drawn without a real canvas. */
  function stubCtx() {
    const calls: string[] = []
    const rec = (name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.length})`) }
    return {
      calls,
      ctx: new Proxy({} as CanvasRenderingContext2D, {
        get(_t, prop: string) {
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
            return () => ({ addColorStop() {} })
          }
          if (prop === 'canvas') return { width: 1000, height: 600 }
          if (typeof prop === 'string' && prop.startsWith('global')) return 'source-over'
          return rec(prop)
        },
        set() { return true },
      }),
    }
  }

  const state = (notes: NoteEvent[]) => ({
    notes,
    voices: new Map<string, Voice>([['v', {
      id: 'v', label: 'V', hue: 207, instrument: 'acoustic_grand_piano',
      visible: true, audible: true, volume: 1,
    }]]),
    layout: computeLayout(1000, 600),
    fallSeconds: 3,
    maxNoteDur: 3,
    showRoll: true,
    showGrid: true,
    showFlash: true,
  })

  it('draws without throwing on an empty score', () => {
    const { ctx } = stubCtx()
    expect(() => drawStage(ctx, state([]), 0, 0)).not.toThrow()
  })

  it('draws more when notes are on screen than when none are', () => {
    const empty = stubCtx()
    drawStage(empty.ctx, state([]), 50, 0)
    const full = stubCtx()
    drawStage(full.ctx, state([n(0, 60, 0), n(1, 64, 0.5), n(2, 67, 1)]), 0, 0)
    expect(full.calls.length).toBeGreaterThan(empty.calls.length)
  })

  it('draws no falling bars when showRoll is false (keyboard-only mode)', () => {
    const notes = [n(0, 60, 2), n(1, 64, 2.5)]   // both in the future: bars only
    const withRoll = stubCtx(); drawStage(withRoll.ctx, state(notes), 0, 0)
    const kbOnly = stubCtx()
    drawStage(kbOnly.ctx, { ...state(notes), showRoll: false, showGrid: false }, 0, 0)
    expect(kbOnly.calls.length).toBeLessThan(withRoll.calls.length)
  })

  it('skips notes belonging to a hidden voice', () => {
    const hidden = state([n(0, 60, 0)])
    hidden.voices.get('v')!.visible = false
    const a = stubCtx(); drawStage(a.ctx, hidden, 0, 0)
    const b = stubCtx(); drawStage(b.ctx, state([n(0, 60, 0)]), 0, 0)
    expect(a.calls.length).toBeLessThan(b.calls.length)
  })
})
