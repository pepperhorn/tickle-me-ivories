import { drawKeyboard } from './keyboard'
import { drawBackground, drawImpact, drawProgress, heldNotes, labelBar } from './pianoRoll'
import { noteColor } from './colors'
import { barGradient, noteFill } from './noteStyle'
import { roundRect } from './shapes'
import { lowerBoundByStart } from '../model/search'
import type { RenderState } from './pianoRoll'
import type { BeatClock } from './beats'
import type { KeyRect } from './geometry'
import type { NoteEvent } from '../model/types'
import type { TrailNote } from '../midi/trail'

export interface RisingState extends RenderState {
  beats: BeatClock
  visibleBeats: number
  trail: readonly TrailNote[]
  showBeatGrid: boolean
}

export interface BarSpan { top: number; bottom: number }

/**
 * Where a note sits on the rising roll, in the canonical frame (spec §2 Rising
 * view): its onset edge is `top`, its release edge `bottom`. A held note grows
 * from the keyboard edge (bottom = hitY); once released it detaches and drifts.
 * Distance is beats x beatPx, so a BPM change re-spaces but never re-times.
 * Null before the onset (count-in, a seek back) or once past the far edge.
 */
export function risingSpan(
  t: number, nowBeat: number, beats: BeatClock, startSec: number, endSec: number | null, hitY: number, beatPx: number,
): BarSpan | null {
  if (startSec > t) return null
  const top = hitY - (nowBeat - beats.beatAt(startSec)) * beatPx
  const end = endSec === null ? t : Math.min(endSec, t)
  const bottom = hitY - (nowBeat - beats.beatAt(end)) * beatPx
  if (bottom <= 0) return null
  return { top, bottom }
}

/** Score notes started by t that are still on the roll (end at or after fromSec). */
export function risingNotes(notes: NoteEvent[], fromSec: number, t: number, maxNoteDur: number): NoteEvent[] {
  const out: NoteEvent[] = []
  for (let i = lowerBoundByStart(notes, fromSec - maxNoteDur); i < notes.length; i++) {
    const n = notes[i]
    if (n.startSec > t) break
    if (n.endSec >= fromSec) out.push(n)
  }
  return out
}

function drawBar(
  ctx: CanvasRenderingContext2D, state: RenderState, k: KeyRect, span: BarSpan,
  hue: number, pitch: number, velocity: number, radius: number, gradient: boolean,
): void {
  const h = Math.max(1, span.bottom - span.top)
  if (gradient) {
    const g = ctx.createLinearGradient(0, span.top, 0, span.top + h)
    // The onset edge is the far (top) edge here, so the full colour sits there.
    g.addColorStop(0, noteColor(hue, velocity, state.velocity))
    g.addColorStop(1, noteColor(hue, Math.max(1, velocity - 14), state.velocity))
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = noteFill(state, hue, pitch, velocity)
  }
  roundRect(ctx, k.x + (k.black ? 0.5 : 1), span.top, k.w - (k.black ? 1 : 2), h, radius)
}

/**
 * The rising roll frame (pure function of t): stage, beat grid, score bars,
 * live trail bars, keyboard, hit flash, progress. Returns the held score set
 * the keyboard was lit from, like drawStage.
 */
export function drawRisingStage(
  ctx: CanvasRenderingContext2D, state: RisingState, t: number, progress: number,
): Map<number, NoteEvent> {
  const { layout, voices, theme, beats } = state
  const hitY = layout.hitY
  const visibleBeats = Math.max(1, state.visibleBeats)
  const beatPx = hitY / visibleBeats
  const nowBeat = beats.beatAt(t)

  drawBackground(ctx, state)

  if (state.showBeatGrid && hitY > 0) {
    ctx.save()
    ctx.lineWidth = theme.gridLineWidth
    for (const line of beats.lines(nowBeat - visibleBeats, nowBeat)) {
      const y = hitY - (nowBeat - line.beat) * beatPx
      ctx.strokeStyle = line.bar ? theme.barLine : theme.beatLine
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(layout.stageW, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  const vis = risingNotes(state.notes, beats.secAt(nowBeat - visibleBeats), t, state.maxNoteDur)

  if (state.showRoll) {
    const gradient = barGradient(state)
    // White-key bars first, then black-key bars on top (as on the falling roll).
    for (let pass = 0; pass < 2; pass++) {
      for (const n of vis) {
        const k = layout.byPitch.get(n.pitch)
        const v = voices.get(n.voiceId)
        if (!k || !v || !v.visible) continue
        if ((k.black ? 0 : 1) === pass) continue
        const span = risingSpan(t, nowBeat, beats, n.startSec, n.endSec, hitY, beatPx)
        if (span) {
          drawBar(ctx, state, k, span, v.hue, n.pitch, n.velocity, theme.barRadius, gradient)
          labelBar(ctx, state, n, k.x + (k.black ? 0.5 : 1), k.w - (k.black ? 1 : 2), span.top, span.bottom, 0, hitY)
        }
      }
      for (const n of state.trail) {
        const k = layout.byPitch.get(n.midi)
        if (!k || (k.black ? 0 : 1) === pass) continue
        const span = risingSpan(t, nowBeat, beats, n.startSec, n.endSec, hitY, beatPx)
        if (span) {
          drawBar(ctx, state, k, span, theme.liveHue, n.midi, n.velocity, theme.barRadius, gradient)
        }
      }
    }
  }

  const held = heldNotes(
    vis.filter((n) => {
      const v = voices.get(n.voiceId)
      return v?.visible !== false && !v?.percussion
    }), t,
  )
  drawKeyboard(ctx, state, held)
  if (state.showFlash) drawImpact(ctx, state, t, vis, state.trail)
  drawProgress(ctx, state, progress)
  return held
}
