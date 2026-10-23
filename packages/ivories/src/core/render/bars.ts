import type { Orientation } from '../layout/types'
import type { RenderState } from './pianoRoll'
import { roundRect, strokeRoundRect } from './shapes'

/** The canonical-space shadow offset (both axes) that moves a shadow down-right
    on screen. A horizontal view maps X = H - y, Y = W - x, so both axes flip. */
export function screenShadowSign(o: Orientation | undefined, d: number): number {
  return o === 'horizontal' ? -d : d
}

/** One note bar: with a template, a hard shadow, the bar, then an outline.
    Without one (or with both zero) it is exactly a fill and a roundRect.
    Allocation-free per bar. */
export function drawNoteBar(
  ctx: CanvasRenderingContext2D, state: RenderState, x: number, top: number, w: number, h: number,
  fill: string | CanvasGradient,
): void {
  const r = state.theme.barRadius
  const b = state.template?.bars
  if (!b || (b.shadowDepth === 0 && b.outlineWidth === 0)) {
    ctx.fillStyle = fill
    roundRect(ctx, x, top, w, h, r)
    return
  }
  if (b.shadowDepth > 0) {
    const d = screenShadowSign(state.orientation, b.shadowDepth)
    ctx.fillStyle = b.shadowColor
    roundRect(ctx, x + d, top + d, w, h, r)
  }
  ctx.fillStyle = fill
  roundRect(ctx, x, top, w, h, r)
  if (b.outlineWidth > 0) {
    ctx.strokeStyle = b.outlineColor
    ctx.lineWidth = b.outlineWidth
    strokeRoundRect(ctx, x, top, w, h, r)
  }
}
