import { describe, it, expect } from 'vitest'
import { drawRoll, drawStage, visibleNotes } from './pianoRoll'
import { risingSpan } from './rising'
import { scoreBeatClock } from './beats'
import { toScreen } from './orientation'
import { computeLayout } from './geometry'
import { state, stubCtx } from './pianoRoll.test-helpers'
import { playLeadIn } from '../model/countIn'
import { buildTempoMap, ticksToSec } from '../model/tempoMap'
import { LOOKAHEAD_SEC } from '../audio/scheduler'
import type { NoteEvent, ScoreDocument } from '../model/types'

const SCALE_1 = { mode: 'scale', scale: 1 } as const

/** A score whose first note is at t = 0: a chord on the downbeat, then a run. */
function scoreWith(numerator: number, denominator: number, bpm = 120): ScoreDocument {
  const ppq = 480
  const tempoMap = buildTempoMap([{ ticks: 0, bpm }], ppq)
  const at = (ticks: number, pitch: number, dur = 480): NoteEvent => ({
    id: ticks + pitch, pitch, startTicks: ticks, durTicks: dur,
    startSec: ticksToSec(tempoMap, ppq, ticks, SCALE_1), endSec: ticksToSec(tempoMap, ppq, ticks + dur, SCALE_1),
    velocity: 90, voiceId: 'v',
  })
  const notes = [at(0, 60), at(0, 64), at(0, 67), at(480, 62), at(960, 65), at(1440, 69)]
  return {
    id: 's', name: 's', ppq, tempoMap, voices: [], notes, durationSec: notes[notes.length - 1].endSec,
    sourceFormat: 'midi', timeSignatures: [{ ticks: 0, numerator, denominator }], keySignature: null,
  }
}

/** Every bar rect drawRoll paints at t: [top, bottom] in canonical y. */
function barsAt(notes: NoteEvent[], t: number, fallSeconds = 3) {
  const rects: { top: number; bottom: number }[] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, p: string) {
      if (p === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (p === 'roundRect') return (_x: number, y: number, _w: number, h: number) => { rects.push({ top: y, bottom: y + h }) }
      if (p === 'fillRect') return (_x: number, y: number, _w: number, h: number) => { rects.push({ top: y, bottom: y + h }) }
      return () => {}
    },
    set() { return true },
  })
  const st = { ...state(notes), fallSeconds }
  drawRoll(ctx, st, t, visibleNotes(notes, t, fallSeconds, 3))
  return { rects, hitY: st.layout.hitY }
}

describe('falling roll at the moment Play is pressed (count-in, user ruling 2026-10-22)', () => {
  const cases: [string, number, number][] = [['4/4', 4, 4], ['3/4', 3, 4], ['6/8', 6, 8]]
  for (const [name, num, den] of cases) {
    for (const bars of [0, 1, 2] as const) {
      it(`${name}, count-in ${bars}: the clock starts before 0 and no bar touches the key line`, () => {
        const s = scoreWith(num, den)
        const lead = playLeadIn(s, SCALE_1, bars)
        expect(lead.sec).toBeGreaterThan(0)
        for (const start of [-lead.sec, -(lead.sec + LOOKAHEAD_SEC)]) {
          const { rects, hitY } = barsAt(s.notes, start)
          for (const r of rects) expect(r.bottom).toBeLessThan(hitY - 1)
        }
      })
    }
  }

  it('without the lead-in (t = 0) the downbeat chord would already be on the keys', () => {
    const s = scoreWith(4, 4)
    const { rects, hitY } = barsAt(s.notes, 0)
    expect(rects.some((r) => r.bottom >= hitY)).toBe(true)
  })

  it('one bar at 120 bpm: the downbeat chord is on screen, fully above the keys, as Play is pressed', () => {
    const s = scoreWith(4, 4)
    const lead = playLeadIn(s, SCALE_1, 1)
    const { rects, hitY } = barsAt(s.notes, -lead.sec)
    expect(rects.length).toBeGreaterThan(0)
    expect(Math.max(...rects.map((r) => r.bottom))).toBeLessThan(hitY)
  })
})

describe('rising roll, horizontal: tiles emanate from the keys', () => {
  const layout = computeLayout(600, 1000)   // canonical frame of a 1000 x 600 screen view
  const s = scoreWith(4, 4)
  const beats = scoreBeatClock(s, SCALE_1)
  const beatPx = layout.hitY / 8
  const n = s.notes[3]   // starts at 0.5s
  const span = (t: number) => risingSpan(t, beats.beatAt(t), beats, n.startSec, n.endSec, layout.hitY, beatPx)
  const screenX = (y: number) => toScreen('horizontal', layout, 0, y).x

  it('no tile before its onset (the count-in runs first)', () => {
    expect(span(-1)).toBeNull()
    expect(span(n.startSec - 0.01)).toBeNull()
  })

  it('is born at the keyboard edge and moves away from it as t increases', () => {
    const keyEdge = screenX(layout.hitY)
    expect(keyEdge).toBeCloseTo(layout.keyboardH, 6)
    const xs = [n.startSec, n.startSec + 0.25, n.startSec + 0.5, n.startSec + 1, n.startSec + 2].map((t) => screenX(span(t)!.top))
    expect(xs[0]).toBeCloseTo(keyEdge, 6)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
    // The release edge never moves toward the keys either.
    const tails = [n.startSec + 0.6, n.startSec + 1, n.startSec + 2].map((t) => screenX(span(t)!.bottom))
    for (let i = 1; i < tails.length; i++) expect(tails[i]).toBeGreaterThan(tails[i - 1])
  })
})

describe('note-name labels on falling bars', () => {
  const note = (pitch: number, startSec: number, dur = 1): NoteEvent => ({
    id: pitch, pitch, startTicks: 0, durTicks: 480, startSec, endSec: startSec + dur, velocity: 90, voiceId: 'v',
  })

  it('draws the label (centred, white over a dark outline) on a bar that fits', () => {
    const stub = stubCtx()
    const notes = [note(60, 0.5), note(66, 0.5)]
    // A 2000px stage: black-key bars are ~21px wide, wide enough for "F♯".
    drawStage(stub.ctx, { ...state(notes), layout: computeLayout(2000, 600), barLabel: (n) => (n.pitch === 60 ? 'C' : 'F♯') }, 0, 0)
    expect(stub.texts).toContain('C')
    expect(stub.texts).toContain('F♯')
    expect(stub.calls).toContain('strokeText(3)')
    expect(stub.fillStyles).toContain('#ffffff')
  })

  it('draws nothing when barLabel is absent or returns null', () => {
    const notes = [note(60, 0.5)]
    const a = stubCtx()
    drawStage(a.ctx, state(notes), 0, 0)
    const b = stubCtx()
    drawStage(b.ctx, { ...state(notes), barLabel: () => null }, 0, 0)
    for (const s of [a, b]) expect(s.calls).not.toContain('strokeText(3)')
  })

  it('hides the label on a bar too short to hold it', () => {
    const stub = stubCtx()
    drawStage(stub.ctx, { ...state([note(60, 0.5, 0.005)]), barLabel: () => 'C' }, 0, 0)
    expect(stub.calls).not.toContain('strokeText(3)')
  })
})
