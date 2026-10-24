import { pitchAt } from './geometry'
import type { KeyboardLayout } from './geometry'
import type { Orientation } from '../layout/types'

/**
 * Every view draws in one canonical frame: keyboard along the bottom, low notes
 * on the left, the roll above it. A horizontal view lays that frame out on the
 * screen box SWAPPED (W x H canonical = screen H x W) and maps it with
 *   X = H - y,  Y = W - x
 * so the keyboard stands on the left edge, low notes at the bottom, and time
 * runs to the right. That is a reflection in the anti-diagonal (a quarter turn
 * would put the low notes at the top) and it is its own inverse up to the swap.
 * Key geometry is still computeLayout's, so the chordl ratios and the geometry
 * oracle are untouched (R-H).
 */
export function canonicalSize(o: Orientation | undefined, w: number, h: number): [number, number] {
  return o === 'horizontal' ? [h, w] : [w, h]
}

/** The orientation a view actually draws in: only the rising roll turns (R-H).
    Falling is vertical only (user ruling 2026-10-22: a horizontal roll's tiles
    emanate from the keys, which is the rising roll), so a horizontal falling
    view -- deprecated -- draws vertical; so do the keyboard and anything else. */
export function viewOrientation(view: string, o: Orientation | undefined): Orientation | undefined {
  return view === 'rising' ? o : undefined
}

/** The canonical frame a layout was computed for. */
export function canonicalExtent(layout: KeyboardLayout): { w: number; h: number } {
  return { w: layout.stageW, h: layout.hitY + layout.keyboardH }
}

/** Canonical point -> screen point (CSS pixels inside the view). */
export function toScreen(o: Orientation | undefined, layout: KeyboardLayout, x: number, y: number): { x: number; y: number } {
  if (o !== 'horizontal') return { x, y }
  const { w, h } = canonicalExtent(layout)
  return { x: h - y, y: w - x }
}

/** Screen point -> canonical point, for hosts hit-testing a horizontal view. */
export function fromScreen(o: Orientation | undefined, layout: KeyboardLayout, sx: number, sy: number): { x: number; y: number } {
  if (o !== 'horizontal') return { x: sx, y: sy }
  const { w, h } = canonicalExtent(layout)
  return { x: w - sy, y: h - sx }
}

/** Applies the horizontal map to a 2D context (call inside save()/restore()). */
export function applyOrientation(ctx: CanvasRenderingContext2D, o: Orientation | undefined, layout: KeyboardLayout): void {
  if (o !== 'horizontal') return
  const { w, h } = canonicalExtent(layout)
  ctx.transform(0, -1, -1, 0, h, w)
}

/** pitchAt for a screen point in either orientation; -1 off the keys. */
export function pitchAtScreen(layout: KeyboardLayout, o: Orientation | undefined, sx: number, sy: number): number {
  const p = fromScreen(o, layout, sx, sy)
  return pitchAt(layout, p.x, p.y)
}
