import { describe, it, expect } from 'vitest'
import { drawRisingStage, risingNotes, risingSpan } from './rising'
import { liveBeatClock, scoreBeatClock } from './beats'
import { noteColor } from './colors'
import { DEFAULT_THEME } from './theme'
import { state } from './pianoRoll.test-helpers'
import { buildTempoMap } from '../model/tempoMap'
import type { RisingState } from './rising'
import type { NoteEvent, ScoreDocument } from '../model/types'

const n = (id: number, pitch: number, startSec: number, dur: number): NoteEvent => ({
  id, pitch, startTicks: 0, durTicks: 480, startSec, endSec: startSec + dur, velocity: 100, voiceId: 'v',
})

/** Records bars (roundRect with the gradient stops in force) and grid lines (moveTo). */
function recorder() {
  const rects: { x: number; y: number; w: number; h: number; stops: string[] }[] = []
  const moves: { x: number; y: number; stroke: string }[] = []
  let fill: unknown = null
  let stroke = ''
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, p: string) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') {
        return () => { const g = { stops: [] as string[], addColorStop(_o: number, c: string) { g.stops.push(c) } }; return g }
      }
      if (p === 'roundRect') {
        return (x: number, y: number, w: number, h: number) => {
          rects.push({ x, y, w, h, stops: (fill as { stops?: string[] } | null)?.stops ?? [] })
        }
      }
      if (p === 'moveTo') return (x: number, y: number) => { moves.push({ x, y, stroke }) }
      if (p.startsWith('global')) return 'source-over'
      return () => {}
    },
    set(_t, p: string, v) {
      if (p === 'fillStyle') fill = v
      if (p === 'strokeStyle') stroke = String(v)
      return true
    },
  })
  return { ctx, rects, moves }
}

const rising = (patch: Partial<RisingState> = {}): RisingState => ({
  ...state([]), showFlash: false, beats: liveBeatClock(120), visibleBeats: 8, trail: [], showBeatGrid: true, ...patch,
})

describe('risingSpan (rising-roll spec §2 Rising view, §4)', () => {
  const beats = liveBeatClock(120)   // 2 beats per second
  const span = (t: number, start: number, end: number | null) =>
    risingSpan(t, beats.beatAt(t), beats, start, end, 400, 50)

  it('a note appears at the keyboard edge at its onset', () => {
    expect(span(1, 1, null)).toEqual({ top: 400, bottom: 400 })
  })

  it('a held note grows from the keyboard (bottom stays on the edge)', () => {
    expect(span(1, 0, null)).toEqual({ top: 300, bottom: 400 })
    expect(span(1, 0, 5)).toEqual({ top: 300, bottom: 400 })
  })

  it('on release it detaches and drifts away, one beat = beatPx', () => {
    expect(span(2, 0, 1)).toEqual({ top: 200, bottom: 300 })
  })

  it('a note that has not started is not drawn (count-in, seek back: Review Focus 1)', () => {
    expect(span(2, 3, null)).toBeNull()
  })

  it('a note past the far edge is gone', () => {
    expect(span(5.01, 0, 1)).toBeNull()
  })

  it('a BPM change re-spaces, never re-times: the same seconds sit half as far apart at half the BPM', () => {
    const slow = liveBeatClock(60)
    expect(risingSpan(2, slow.beatAt(2), slow, 0, 1, 400, 50)).toEqual({ top: 300, bottom: 350 })
  })
})

describe('risingNotes', () => {
  it('keeps notes started by t that end inside the window, from a binary-searched start', () => {
    const notes = [n(0, 60, 0, 0.2), n(1, 62, 2, 0.5), n(2, 64, 4, 1), n(3, 65, 9, 1)]
    expect(risingNotes(notes, 1, 5, 1).map((x) => x.id)).toEqual([1, 2])
  })
})

describe('drawRisingStage', () => {
  const layoutOf = () => state([]).layout

  it('a held live note is a bar in the live hue whose bottom sits on the keyboard edge', () => {
    const { ctx, rects } = recorder()
    const trail = [{ midi: 60, velocity: 100, startSec: 0, endSec: null }]
    drawRisingStage(ctx, rising({ trail }), 1, 0)
    const { hitY, byPitch } = layoutOf()
    const beatPx = hitY / 8
    const k = byPitch.get(60)!
    const bar = rects.find((r) => r.x === k.x + 1)!
    expect(bar.y).toBeCloseTo(hitY - 2 * beatPx, 6)
    expect(bar.y + bar.h).toBeCloseTo(hitY, 6)
    expect(bar.stops[0]).toBe(noteColor(DEFAULT_THEME.liveHue, 100, state([]).velocity))
  })

  it('a finished score note has detached and drifted (onset edge is the far edge)', () => {
    const { ctx, rects } = recorder()
    drawRisingStage(ctx, rising({ notes: [n(0, 64, 0, 0.5)] }), 1, 0)
    const { hitY, byPitch } = layoutOf()
    const beatPx = hitY / 8
    const bar = rects.find((r) => r.x === byPitch.get(64)!.x + 1)!
    expect(bar.y).toBeCloseTo(hitY - 2 * beatPx, 6)
    expect(bar.y + bar.h).toBeCloseTo(hitY - beatPx, 6)
    expect(bar.stops[0]).toBe(noteColor(207, 100, state([]).velocity))
  })

  it('draws a line on every beat in view and the bar colour on bar starts', () => {
    const { ctx, moves } = recorder()
    drawRisingStage(ctx, rising(), 1, 0)   // now = beat 2, window beats -6..2
    const grid = moves.filter((m) => m.x === 0)
    expect(grid).toHaveLength(9)
    const { hitY } = layoutOf()
    expect(grid.at(-1)!.y).toBeCloseTo(hitY, 6)
    expect(grid.filter((m) => m.stroke === DEFAULT_THEME.barLine)).toHaveLength(2)   // beats -4 and 0
  })

  it('no grid when the beat grid is off', () => {
    const { ctx, moves } = recorder()
    drawRisingStage(ctx, rising({ showBeatGrid: false }), 1, 0)
    expect(moves.filter((m) => m.x === 0)).toHaveLength(0)
  })

  it('count-in (negative t) with a score clock draws no bars and no NaN', () => {
    const score: ScoreDocument = {
      id: 's', name: 's', ppq: 480, tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480), voices: [], notes: [],
      durationSec: 4, sourceFormat: 'midi', timeSignatures: [], keySignature: null,
    }
    const { ctx, rects, moves } = recorder()
    const held = drawRisingStage(ctx, rising({ notes: [n(0, 60, 0, 1)], beats: scoreBeatClock(score, { mode: 'scale', scale: 1 }) }), -1, 0)
    expect(rects).toHaveLength(0)
    expect(held.size).toBe(0)
    for (const m of moves) expect(Number.isFinite(m.y)).toBe(true)
  })

  it('lights the keyboard from the score notes sounding at t', () => {
    const { ctx } = recorder()
    const held = drawRisingStage(ctx, rising({ notes: [n(0, 60, 0, 2)] }), 1, 0)
    expect([...held.keys()]).toEqual([60])
  })
})
