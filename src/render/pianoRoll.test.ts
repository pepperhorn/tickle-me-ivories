import { describe, it, expect } from 'vitest'
import { visibleNotes, heldNotes, drawStage, drawRoll } from './pianoRoll'
import { drawKeyboard } from './keyboard'
import { noteColor } from './colors'
import { DEFAULT_THEME } from './theme'
import { stubCtx, state } from './pianoRoll.test-helpers'
import type { NoteEvent } from '../model/types'

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

  it('keeps a note whose flash is still decaying even when its duration equals maxNoteDur', () => {
    // Window floor must be a superset of what the inclusion predicate admits
    // (endSec >= t - FLASH_TAIL), not just t - maxNoteDur -- otherwise a note
    // exactly maxNoteDur long that ended just inside the flash tail starts
    // below the search floor and never gets found at all.
    const maxNoteDur = 0.3
    const note = n(0, 60, 0, maxNoteDur)        // startSec 0, endSec 0.3
    const t = note.endSec + 0.2                  // 0.2s into the 0.22s flash tail
    expect(visibleNotes([note], t, 3, maxNoteDur).map((x) => x.id)).toEqual([0])
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

  // F38: the overlay reads the same held set the keyboard was lit from, so
  // there is one visibleNotes pass per frame rather than two.
  it('returns the held set it lit the keyboard from, hidden voices excluded', () => {
    const notes = [n(0, 60, 0, 1), n(1, 64, 0.2, 1), n(2, 67, 2)]   // 67 not yet sounding
    const held = drawStage(stubCtx().ctx, state(notes), 0.5, 0)
    expect([...held.keys()].sort()).toEqual([60, 64])
    const hidden = state(notes)
    hidden.voices.get('v')!.visible = false
    expect(drawStage(stubCtx().ctx, hidden, 0.5, 0).size).toBe(0)
  })

  it('clears rather than fills when the stage background is transparent', () => {
    const { ctx, calls } = stubCtx()
    drawStage(ctx, { ...state([]), theme: { ...DEFAULT_THEME, stageBg: 'transparent' } }, 0, 0)
    expect(calls.filter((c) => c.startsWith('clearRect('))).toHaveLength(1)
  })

  it('treats the computed form rgba(0, 0, 0, 0) as transparent too', () => {
    const { ctx, calls } = stubCtx()
    drawStage(ctx, { ...state([]), theme: { ...DEFAULT_THEME, stageBg: 'rgba(0, 0, 0, 0)' } }, 0, 0)
    expect(calls.filter((c) => c.startsWith('clearRect('))).toHaveLength(1)
  })

  it('fills the stage when the background is an opaque colour', () => {
    const { ctx, calls } = stubCtx()
    drawStage(ctx, { ...state([]), theme: { ...DEFAULT_THEME, stageBg: '#00b140' } }, 0, 0)
    expect(calls.filter((c) => c.startsWith('clearRect('))).toHaveLength(0)
    expect(calls[0]).toBe('fillRect(4)')
  })

  it('strokes one grid line per C in range, dash scoped inside save/restore', () => {
    const on = stubCtx(); drawStage(on.ctx, state([]), 0, 0)
    const off = stubCtx(); drawStage(off.ctx, { ...state([]), showGrid: false }, 0, 0)
    const strokes = (c: string[]) => c.filter((x) => x.startsWith('stroke(')).length
    // Full 88-key range holds C1..C8 = 8 grid lines; no flash strokes on an empty score.
    expect(strokes(on.calls) - strokes(off.calls)).toBe(8)
    const dash = on.calls.indexOf('setLineDash(1)')
    expect(dash).toBeGreaterThan(on.calls.indexOf('save(0)'))
    expect(on.calls.indexOf('restore(0)')).toBeGreaterThan(dash)
  })

  it('F32: strokes every key when keyOutline is set, and none when it is transparent', () => {
    const off = stubCtx(); drawStage(off.ctx, state([]), 0, 0)
    const on = stubCtx()
    drawStage(on.ctx, { ...state([]), theme: { ...DEFAULT_THEME, keyOutline: '#ffffff' } }, 0, 0)
    const strokeRects = (c: string[]) => c.filter((x) => x.startsWith('strokeRect(')).length
    expect(strokeRects(off.calls)).toBe(0)
    // Full 88-key range: 52 white + 36 black keys, one stroke each.
    expect(strokeRects(on.calls)).toBe(88)
  })
})

describe('fill colours', () => {
  it('fills a bar with the gradient stops noteColor produces for its voice', () => {
    const { ctx, gradientStops } = stubCtx()
    const st = state([n(0, 60, 0)])          // one note, voice hue 207, velocity 100
    drawRoll(ctx, st, 0, st.notes)

    expect(gradientStops).toContain(noteColor(207, 100, st.velocity))
    expect(gradientStops).toContain(noteColor(207, 86, st.velocity))   // the -14 top stop
  })

  it("uses the theme's key colours for unheld keys", () => {
    const { ctx, fillStyles } = stubCtx()
    const theme = { ...DEFAULT_THEME, keyWhite: '#111111', keyBlack: '#222222' }
    drawKeyboard(ctx, { ...state([]), theme }, new Map())
    expect(fillStyles).toContain('#111111')
    expect(fillStyles).toContain('#222222')
  })
})
