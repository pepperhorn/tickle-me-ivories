import type { Orientation } from '../layout/types'
import type { RenderState } from './pianoRoll'
import { roundRect, strokeRoundRect } from './shapes'

/** The canonical-space offset that moves a shadow down-right on screen. A
    horizontal view maps X = H - y, Y = W - x, so both axes flip. */
export function screenShadowOffset(o: Orientation | undefined, d: number): { dx: number; dy: number } {
  const s = o === 'horizontal' ? -d : d
  return { dx: s, dy: s }
}

/** One note bar: with a template, a hard shadow, the bar, then an outline.
    Without one (or with both zero) it is exactly a fill and a roundRect. The
    shadow offset is computed inline (not via screenShadowOffset) so nothing
    allocates per bar. */
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
    const d = state.orientation === 'horizontal' ? -b.shadowDepth : b.shadowDepth
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
