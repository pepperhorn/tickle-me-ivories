import { drawKeyboard } from './keyboard'
import { FLASH_MS, flashIntensity, noteColor } from './colors'
import type { KeyboardLayout } from './geometry'
import type { NoteEvent, Voice } from '../model/types'
import type { VelocityScheme } from '../settings/types'

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
}

const BAR_RADIUS = 4
const FLASH_TAIL = FLASH_MS / 1000

function lowerBound(notes: NoteEvent[], startSec: number): number {
  let lo = 0, hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (notes[mid].startSec < startSec) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Binary-searches the sorted array for the visible slice. Cost scales with notes
 * ON SCREEN, not notes in the file -- a 20k-note score draws no slower than a
 * 200-note one.
 */
export function visibleNotes(
  notes: NoteEvent[], t: number, fallSeconds: number, maxNoteDur: number,
): NoteEvent[] {
  const out: NoteEvent[] = []
  for (let i = lowerBound(notes, t - maxNoteDur - FLASH_TAIL); i < notes.length; i++) {
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

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 3, Math.abs(h) / 2))
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, rad); ctx.fill()
  } else {
    ctx.fillRect(x, y, w, h)
  }
}

export function drawRoll(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, vis: NoteEvent[],
): void {
  const { layout, voices, fallSeconds } = state
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
      roundRect(ctx, k.x + (k.black ? 0.5 : 1), top, k.w - (k.black ? 1 : 2), h, BAR_RADIUS)
    }
  }
}

function drawImpact(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, vis: NoteEvent[],
): void {
  const { layout, voices } = state

  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const n of vis) {
    const v = voices.get(n.voiceId)
    if (!v || !v.visible) continue
    const i = flashIntensity(t - n.startSec, n.velocity) * state.flashScale
    if (i <= 0.003) continue
    const k = layout.byPitch.get(n.pitch)
    if (!k) continue

    const cx = k.x + k.w / 2
    const cy = layout.hitY
    const R = Math.max(2, 2.2 * layout.whiteW * i)

    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
    rg.addColorStop(0, `rgba(255,255,255,${(0.9 * i).toFixed(3)})`)
    rg.addColorStop(0.35, `rgba(255,242,214,${(0.34 * i).toFixed(3)})`)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = rg
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

    const bg = ctx.createLinearGradient(0, cy - 26, 0, cy + 20)
    bg.addColorStop(0, 'rgba(255,255,255,0)')
    bg.addColorStop(0.5, `rgba(255,255,255,${(0.85 * i).toFixed(3)})`)
    bg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = bg
    ctx.fillRect(cx - k.w * 0.45, cy - 26, k.w * 0.9, 46)

    const len = 1.6 * layout.whiteW * i
    ctx.strokeStyle = `rgba(255,255,255,${(0.7 * i).toFixed(3)})`
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
  ctx.restore()
}

/** The whole frame, in spec draw order. Pure function of t. */
export function drawStage(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, progress: number,
): void {
  const { layout } = state
  const stageW = layout.stageW
  const stageH = layout.hitY + layout.keyboardH

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, stageW, stageH)

  if (state.showGrid) {
    for (let p = 24; p <= 108; p += 12) {
      const k = layout.byPitch.get(p)
      if (!k) continue
      ctx.fillStyle = p === 60 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'
      ctx.fillRect(k.x, 0, 1, layout.hitY)
    }
  }

  // Computed once per frame and threaded through to drawRoll/drawImpact below
  // -- identical arguments were producing the same window three times a frame.
  const vis = visibleNotes(state.notes, t, state.fallSeconds, state.maxNoteDur)

  // Keyboard-only mode suppresses the roll entirely. It must NOT be faked by
  // shrinking fallSeconds -- drawRoll divides by it (pps = hitY / fallSeconds),
  // so a tiny value turns every held note into a full-height colour column.
  if (state.showRoll) drawRoll(ctx, state, t, vis)

  const held = heldNotes(
    vis.filter((n) => state.voices.get(n.voiceId)?.visible !== false), t,
  )
  drawKeyboard(ctx, state, held)

  if (state.showFlash) drawImpact(ctx, state, t, vis)

  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(0, stageH - 3, stageW, 3)
  ctx.fillStyle = '#e8384f'
  ctx.fillRect(0, stageH - 3, stageW * Math.min(1, Math.max(0, progress)), 3)
}
