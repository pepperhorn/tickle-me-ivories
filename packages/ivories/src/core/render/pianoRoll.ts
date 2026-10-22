import { drawKeyboard } from './keyboard'
import { FLASH_MS, flashIntensity, noteColor } from './colors'
import { roundRect } from './shapes'
import { barLabelPx, drawBarLabel } from './barLabels'
import { isTransparent } from './theme'
import { lowerBoundByStart } from '../model/search'
import type { Theme } from './theme'
import type { KeyboardLayout } from './geometry'
import type { NoteEvent, Voice } from '../model/types'
import type { VelocityScheme } from '../settings/types'
import type { LiveNote } from '../midi/types'
import type { Orientation } from '../layout/types'
import type { TrailNote } from '../midi/trail'

export interface RenderState {
  notes: NoteEvent[]           // sorted by startSec
  voices: Map<string, Voice>
  layout: KeyboardLayout
  velocity: VelocityScheme
  fallSeconds: number
  /** Longest note in the score, in seconds, under the CURRENT tempo setting.
      The window search looks back this far for notes that started earlier and
      are still sounding. A fixed cutoff is wrong for some score: at the tempo
      control's 25% minimum, any note over 2s at notated tempo exceeds 8s. */
  maxNoteDur: number
  showRoll: boolean            // false in keyboard-only mode
  showGrid: boolean
  showFlash: boolean
  flashScale: number           // 0-1.5 multiplier on flash intensity
  showMiddleC: boolean
  theme: Theme
  /** Keys held on a live MIDI input (spec §4.1); drawn in theme.liveHue over the score colour. */
  live?: ReadonlyMap<number, LiveNote>
  /** Horizontal views draw this same canonical frame under a reflection (R-H);
      only canvas text needs to know, to stay upright. */
  orientation?: Orientation
  /** The note-name label for a bar (null: none). Absent: no labels. */
  barLabel?: (n: NoteEvent) => string | null
}

/**
 * A bar's name label, centred on the part of the bar that is on the roll
 * (between `lo` and `hi` in canonical y), when it fits legibly.
 */
export function labelBar(
  ctx: CanvasRenderingContext2D, state: RenderState, n: NoteEvent, x: number, w: number, top: number, bottom: number, lo: number, hi: number,
): void {
  const text = state.barLabel?.(n)
  if (!text) return
  const a = Math.max(top, lo)
  const b = Math.min(bottom, hi)
  const px = barLabelPx(text, w, b - a, state.orientation)
  if (px > 0) drawBarLabel(ctx, text, x + w / 2, (a + b) / 2, px, state.orientation)
}

const FLASH_TAIL = FLASH_MS / 1000

/**
 * Binary-searches the sorted array for the visible slice. Cost scales with notes
 * ON SCREEN, not notes in the file -- a 20k-note score draws no slower than a
 * 200-note one.
 */
export function visibleNotes(
  notes: NoteEvent[], t: number, fallSeconds: number, maxNoteDur: number,
): NoteEvent[] {
  const out: NoteEvent[] = []
  for (let i = lowerBoundByStart(notes, t - maxNoteDur - FLASH_TAIL); i < notes.length; i++) {
    const n = notes[i]
    if (n.startSec > t + fallSeconds) break
    if (n.endSec >= t - FLASH_TAIL) out.push(n)
  }
  return out
}

/** Which pitches are sounding at t. Derived each frame; never stored. */
export function heldNotes(visible: NoteEvent[], t: number): Map<number, NoteEvent> {
  const held = new Map<number, NoteEvent>()
  for (const n of visible) {
    if (n.startSec <= t && t < n.endSec) {
      const prev = held.get(n.pitch)
      if (!prev || n.velocity > prev.velocity) held.set(n.pitch, n)
    }
  }
  return held
}

export function drawRoll(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, vis: NoteEvent[],
): void {
  const { layout, voices, fallSeconds, theme } = state
  const pps = layout.hitY / fallSeconds
  const stageH = layout.hitY + layout.keyboardH

  // White-key bars first, then black-key bars on top, so accidentals are never
  // hidden behind the naturals beside them.
  for (let pass = 0; pass < 2; pass++) {
    for (const n of vis) {
      const k = layout.byPitch.get(n.pitch)
      const v = voices.get(n.voiceId)
      if (!k || !v || !v.visible) continue
      if ((k.black ? 0 : 1) === pass) continue

      // A bar does not stop at the hit line: while held it continues down over
      // the key, so bar and lit key read as one object.
      const bottom = Math.min(layout.hitY + (t - n.startSec) * pps, stageH)
      const top = layout.hitY + (t - n.endSec) * pps
      if (bottom <= 0) continue
      const h = Math.max(1, bottom - top)

      const g = ctx.createLinearGradient(0, top, 0, top + h)
      g.addColorStop(0, noteColor(v.hue, Math.max(1, n.velocity - 14), state.velocity))
      g.addColorStop(1, noteColor(v.hue, n.velocity, state.velocity))
      ctx.fillStyle = g
      const x = k.x + (k.black ? 0.5 : 1)
      const w = k.w - (k.black ? 1 : 2)
      roundRect(ctx, x, top, w, h, theme.barRadius)
      labelBar(ctx, state, n, x, w, top, top + h, 0, layout.hitY)
    }
  }
}

/** Default live list for drawImpact, shared so the falling roll allocates nothing per frame. */
const NO_TRAIL: readonly TrailNote[] = []

/** One key's hit flash at intensity i (0 = nothing). */
function flashKey(ctx: CanvasRenderingContext2D, state: RenderState, pitch: number, i: number): void {
  if (i <= 0.003) return
  const { layout, theme } = state
  const k = layout.byPitch.get(pitch)
  if (!k) return

  const cx = k.x + k.w / 2
  const cy = layout.hitY
  const R = Math.max(2, 2.2 * layout.whiteW * i)

  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
  rg.addColorStop(0, `rgba(${theme.flashCoreRgb}, ${(0.9 * i).toFixed(3)})`)
  rg.addColorStop(0.35, `rgba(${theme.flashWarmRgb}, ${(0.34 * i).toFixed(3)})`)
  rg.addColorStop(1, `rgba(${theme.flashCoreRgb}, 0)`)
  ctx.fillStyle = rg
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

  const bg = ctx.createLinearGradient(0, cy - 26, 0, cy + 20)
  bg.addColorStop(0, `rgba(${theme.flashCoreRgb}, 0)`)
  bg.addColorStop(0.5, `rgba(${theme.flashCoreRgb}, ${(0.85 * i).toFixed(3)})`)
  bg.addColorStop(1, `rgba(${theme.flashCoreRgb}, 0)`)
  ctx.fillStyle = bg
  ctx.fillRect(cx - k.w * 0.45, cy - 26, k.w * 0.9, 46)

  const len = 1.6 * layout.whiteW * i
  ctx.strokeStyle = `rgba(${theme.flashCoreRgb}, ${(0.7 * i).toFixed(3)})`
  ctx.lineWidth = 1
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let s = 0; s < 5; s++) {
    const ang = ((-50 + 100 * (s / 4)) * Math.PI) / 180
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len)
  }
  ctx.stroke()
}

/** Hit flashes for score notes and (rising roll, R-F) live trail notes. */
export function drawImpact(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, vis: NoteEvent[],
  live: readonly TrailNote[] = NO_TRAIL,
): void {
  const { voices } = state
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const n of vis) {
    const v = voices.get(n.voiceId)
    if (!v || !v.visible || v.percussion) continue   // percussion never lights keys (§6.1)
    flashKey(ctx, state, n.pitch, flashIntensity(t - n.startSec, n.velocity) * state.flashScale)
  }
  for (const n of live) flashKey(ctx, state, n.midi, flashIntensity(t - n.startSec, n.velocity) * state.flashScale)
  ctx.restore()
}

/** The stage fill, or a clear for a transparent stage (spec §13.1). */
export function drawBackground(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { layout, theme } = state
  const stageH = layout.hitY + layout.keyboardH
  // Spec §13.1: a transparent stage CLEARS instead of filling, so an OBS
  // browser source composites live video through the page. Alpha, not chroma
  // key -- the impact layer draws with 'lighter', and an additive white bloom
  // over green keys as desaturated fringing at the brightest moment of a note.
  if (isTransparent(theme.stageBg)) {
    ctx.clearRect(0, 0, layout.stageW, stageH)
  } else {
    ctx.fillStyle = theme.stageBg
    ctx.fillRect(0, 0, layout.stageW, stageH)
  }
}

/** The 3px progress strip along the bottom of the canonical frame. */
export function drawProgress(ctx: CanvasRenderingContext2D, state: RenderState, progress: number): void {
  const { layout, theme } = state
  const stageH = layout.hitY + layout.keyboardH
  ctx.fillStyle = theme.progressTrack
  ctx.fillRect(0, stageH - 3, layout.stageW, 3)
  ctx.fillStyle = theme.progressFill
  ctx.fillRect(0, stageH - 3, layout.stageW * Math.min(1, Math.max(0, progress)), 3)
}

/**
 * The whole frame, in spec draw order. Pure function of t. Returns the held set
 * the keyboard was lit from (visible voices only), so the DOM text overlay reads
 * the same pitches without a second visibleNotes pass (F38).
 */
export function drawStage(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, progress: number,
): Map<number, NoteEvent> {
  const { layout, theme } = state

  drawBackground(ctx, state)

  if (state.showGrid) {
    // The dash array is set inside save()/restore() so it cannot leak into the
    // bars, the keys or the flash -- exactly as the impact layer's composite op is.
    ctx.save()
    ctx.setLineDash(theme.gridLineDash)
    ctx.lineWidth = theme.gridLineWidth
    for (let p = 24; p <= 108; p += 12) {
      const k = layout.byPitch.get(p)
      if (!k) continue
      ctx.strokeStyle = p === 60 ? theme.gridLineC4 : theme.gridLine
      ctx.beginPath()
      ctx.moveTo(k.x + theme.gridLineWidth / 2, 0)
      ctx.lineTo(k.x + theme.gridLineWidth / 2, layout.hitY)
      ctx.stroke()
    }
    ctx.restore()
  }

  // Computed once per frame and threaded through to drawRoll/drawImpact below
  // -- identical arguments were producing the same window three times a frame.
  const vis = visibleNotes(state.notes, t, state.fallSeconds, state.maxNoteDur)

  // Keyboard-only mode suppresses the roll entirely. It must NOT be faked by
  // shrinking fallSeconds -- drawRoll divides by it (pps = hitY / fallSeconds),
  // so a tiny value turns every held note into a full-height colour column.
  if (state.showRoll) drawRoll(ctx, state, t, vis)

  // Hidden voices, and percussion (spec §6.1: on the roll, never on the keys).
  const held = heldNotes(
    vis.filter((n) => {
      const v = state.voices.get(n.voiceId)
      return v?.visible !== false && !v?.percussion
    }), t,
  )
  drawKeyboard(ctx, state, held)

  if (state.showFlash) drawImpact(ctx, state, t, vis)

  drawProgress(ctx, state, progress)
  return held
}
