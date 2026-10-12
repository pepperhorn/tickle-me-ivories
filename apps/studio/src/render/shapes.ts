/** Clamps the radius and opens the rounded-rect path, or returns false so the
    caller falls back to a plain rect where roundRect is unavailable -- so no
    browser loses the keyboard entirely over corner rounding. Shared by
    roundRect and strokeRoundRect so the clamp/fallback logic exists once. */
function roundRectPath(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): boolean {
  const rad = Math.max(0, Math.min(r, w / 3, Math.abs(h) / 2))
  if (rad > 0 && typeof ctx.roundRect === 'function') {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, rad)
    return true
  }
  return false
}

export function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  if (roundRectPath(ctx, x, y, w, h, r)) ctx.fill()
  else ctx.fillRect(x, y, w, h)
}

/** Same shape as roundRect, stroked instead of filled -- F32: per-key outline
    for the Outline theme, whose keys are transparent and would otherwise vanish. */
export function strokeRoundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
): void {
  if (roundRectPath(ctx, x, y, w, h, r)) ctx.stroke()
  else ctx.strokeRect(x, y, w, h)
}
