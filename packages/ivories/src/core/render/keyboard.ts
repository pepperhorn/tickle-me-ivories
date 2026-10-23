import { noteFill } from './noteStyle'
import { roundRect, strokeRoundRect } from './shapes'
import { isTransparent } from './theme'
import type { NoteEvent } from '../model/types'
import type { ResolvedTemplate } from '../template/resolve'
import type { KeyboardLayout, KeyRect } from './geometry'
import type { RenderState } from './pianoRoll'

const MIDDLE_C = 60
// Below this whiteW the "C4" label would render as illegible mush -- skip it
// entirely rather than draw noise at phone scale.
const MIN_WHITE_W_FOR_LABEL = 14
const SUNK_LIP = 'rgba(0,0,0,0.18)'

/** chordl's white-key width: template key radii and raised/plate depths are in
    these units, so px = units * whiteW / 25.3 and they scale with the keys. */
export const CHORDL_WHITE_W = 25.3

export function chordlUnit(layout: KeyboardLayout): number {
  return layout.whiteW / CHORDL_WHITE_W
}

/** Where the keys sit. Today's box unless the template's plate is on, which
    insets the keys by its padding and keeps its border and shadow clear below. */
export function keyBox(layout: KeyboardLayout, t?: ResolvedTemplate): { top: number; whiteH: number; blackH: number } {
  const { hitY, keyboardH } = layout
  if (!t || !t.keys.plate.enabled) return { top: hitY, whiteH: keyboardH, blackH: layout.blackH }
  const p = t.keys.plate
  const u = chordlUnit(layout)
  const whiteH = Math.max(1, keyboardH - p.padding * u - (p.borderWidth + p.shadowDepth) * u)
  // A 0x0 stage has keyboardH 0: no ratio to scale by, so no black keys.
  const blackH = keyboardH > 0 ? layout.blackH * whiteH / keyboardH : 0
  return { top: hitY + p.padding * u, whiteH, blackH }
}

/** The plate under the keys, in the canonical frame: hard shadow at the bottom
    (toward the player), the fill from the hit line down, ink borders top and bottom. */
function drawPlate(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { layout } = state
  const p = state.template!.keys.plate
  const u = chordlUnit(layout)
  const stageH = layout.hitY + layout.keyboardH
  const sd = p.shadowDepth * u
  const bw = p.borderWidth * u
  ctx.fillStyle = p.shadowColor
  ctx.fillRect(0, Math.max(0, stageH - sd), layout.stageW, sd)
  ctx.fillStyle = p.fill
  ctx.fillRect(0, layout.hitY, layout.stageW, Math.max(0, stageH - layout.hitY - sd))
  ctx.fillStyle = p.borderColor
  ctx.fillRect(0, layout.hitY, layout.stageW, bw)
  ctx.fillRect(0, Math.max(0, stageH - sd - bw), layout.stageW, bw)
}

/** A black key standing on a hard shadow, with a lip near its front edge. A held
    (or live) key sinks: less shadow shows and the lip darkens. */
function drawRaisedBlackKey(
  ctx: CanvasRenderingContext2D, state: RenderState, k: KeyRect,
  box: { top: number; blackH: number }, fill: string, held: boolean,
): void {
  const { theme, layout } = state
  const t = state.template!
  const r = t.keys.raised
  const u = chordlUnit(layout)
  const radius = t.keys.blackRadius !== null ? t.keys.blackRadius * u : theme.keyRadius
  const { top, blackH } = box
  const lift = (held ? 0.25 : 1) * r.shadowDepth * u
  ctx.fillStyle = r.shadowColor
  roundRect(ctx, k.x, top + lift, k.w, blackH, radius)
  ctx.fillStyle = fill
  roundRect(ctx, k.x, top, k.w, blackH, radius)
  if (!isTransparent(theme.keyOutline)) {
    ctx.strokeStyle = theme.keyOutline
    ctx.lineWidth = theme.keyBorderWidth
    strokeRoundRect(ctx, k.x, top, k.w, blackH, radius)
  }
  const lipW = k.w - 3 * u
  if (lipW <= 0 || blackH <= (r.lipDepth + 2) * u) return
  const lipH = r.lipDepth * u
  ctx.fillStyle = held ? SUNK_LIP : r.lipColor
  roundRect(ctx, k.x + 1.5 * u, top + blackH - 2 * u - lipH, lipW, lipH, 1.5 * u)
}

export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  held: Map<number, NoteEvent>,
): void {
  const { layout, voices, theme } = state
  // Decided once per draw: no template takes exactly today's values and path.
  const t = state.template
  const box = t ? keyBox(layout, t) : null
  const top = box ? box.top : layout.hitY
  const keyboardH = box ? box.whiteH : layout.keyboardH
  const blackH = box ? box.blackH : layout.blackH
  const u = t ? chordlUnit(layout) : 0
  const whiteRadius = t && t.keys.whiteRadius !== null ? t.keys.whiteRadius * u : theme.keyRadius
  const blackRadius = t && t.keys.blackRadius !== null ? t.keys.blackRadius * u : theme.keyRadius
  const raised = !!t && t.keys.raised.enabled
  // F32: the Outline preset sets keyWhite/keyBlack to transparent, so a visible
  // stroke is what keeps the keyboard from disappearing entirely. Skipped by
  // default (keyOutline is transparent) so themes that don't opt in pay nothing.
  const outlined = !isTransparent(theme.keyOutline)

  if (t && t.keys.plate.enabled) drawPlate(ctx, state)

  for (const k of layout.keys) {
    if (k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    const lv = state.live?.get(k.pitch)
    ctx.fillStyle = lv
      ? noteFill(state, theme.liveHue, k.pitch, lv.velocity)
      : h && v ? noteFill(state, v.hue, k.pitch, h.velocity) : theme.keyWhite
    const w = Math.max(1, k.w - theme.keyGap)
    roundRect(ctx, k.x, top, w, keyboardH, whiteRadius)
    if (outlined) {
      ctx.strokeStyle = theme.keyOutline
      ctx.lineWidth = theme.keyBorderWidth
      strokeRoundRect(ctx, k.x, top, w, keyboardH, whiteRadius)
    }

    // Middle C carries a dark border and a "C4" label so orientation
    // survives phone scale, where 88 keys means ~16px per white key.
    if (k.pitch === MIDDLE_C && state.showMiddleC) {
      ctx.fillStyle = theme.middleCMark
      ctx.fillRect(k.x, top, 1.5, keyboardH)
      ctx.fillRect(k.x + k.w - 2.5, top, 1.5, keyboardH)

      if (layout.whiteW >= MIN_WHITE_W_FOR_LABEL) {
        ctx.save()
        ctx.fillStyle = theme.middleCMark
        ctx.font = `600 ${Math.round(layout.whiteW * 0.42)}px Poppins, sans-serif`
        ctx.textAlign = 'center'
        if (state.orientation === 'horizontal') {
          // The stage is drawn under the horizontal reflection; applying the same
          // matrix again here cancels it, so the label reads upright (R-H).
          ctx.translate(k.x + k.w / 2, top + keyboardH - layout.whiteW * 0.6)
          ctx.transform(0, -1, -1, 0, 0, 0)
          ctx.textBaseline = 'middle'
          ctx.fillText('C4', 0, 0)
        } else {
          ctx.textBaseline = 'alphabetic'
          ctx.fillText('C4', k.x + k.w / 2, top + keyboardH - layout.whiteW * 0.3)
        }
        ctx.restore()
      }
    }
  }

  for (const k of layout.keys) {
    if (!k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    const lv = state.live?.get(k.pitch)
    const fill = lv
      ? noteFill(state, theme.liveHue, k.pitch, lv.velocity)
      : h && v ? noteFill(state, v.hue, k.pitch, h.velocity) : theme.keyBlack
    if (raised) {
      // The raised style has no blackKeyTop strip: the lip shows the press.
      drawRaisedBlackKey(ctx, state, k, box!, fill, !!(h || lv))
      continue
    }
    ctx.fillStyle = fill
    roundRect(ctx, k.x, top, k.w, blackH, blackRadius)
    if (outlined) {
      ctx.strokeStyle = theme.keyOutline
      ctx.lineWidth = theme.keyBorderWidth
      strokeRoundRect(ctx, k.x, top, k.w, blackH, blackRadius)
    }
    if (h || lv) {
      ctx.fillStyle = theme.blackKeyTop
      ctx.fillRect(k.x, top, k.w, 2)
    }
  }

  ctx.fillStyle = theme.keyBorder
  ctx.fillRect(0, layout.hitY, layout.stageW, theme.keyBorderWidth)
}
