/** The explicit stave scale tried first when pepperscore's default ('fit', resolved internally) overflows. */
export const PROBE_ZOOM = 1
const MIN_ZOOM = 0.2
const MAX_ZOOM = 4
/** Aim a little under the panel height: air under the bottom staff. */
const FILL = 0.95
/** Under-filled below this share of the panel: grow back. */
const UNDERFILL = 0.8
/** Zoom changes smaller than this (relative) are not worth a re-engrave. */
const SETTLE = 0.03
/** The panel must grow this much before pepperscore's default is tried again. */
const REGROW_PX = 24

export interface NotationFit {
  /** Explicit stave scale, or null for pepperscore's own default. */
  zoom: number | null
  /** The panel height the current zoom was fitted to (null while on the default or probing). */
  fittedTo: number | null
  /** The smallest explicit zoom seen to overflow this panel: growth stays under it. */
  ceiling: number | null
}

export const DEFAULT_FIT: NotationFit = { zoom: null, fittedTo: null, ceiling: null }

/**
 * One step of fitting the engraving to the notation panel so a whole system --
 * a grand staff, treble and bass -- is always visible (user ruling 2026-10-22).
 * `systemPx` is the tallest engraved system AT THE CURRENT ZOOM, `availPx` the
 * height the panel has for it. A system's height scales with the zoom, so the
 * next zoom is the current one times avail / system (a little under).
 * pepperscore does not report the zoom its default resolves to, so an
 * overflowing default first steps to PROBE_ZOOM and is fitted from there.
 * Returns the same object when nothing should change.
 */
export function nextNotationFit(cur: NotationFit, systemPx: number, availPx: number): NotationFit {
  if (!(systemPx > 0) || !(availPx > 0)) return cur
  const overflows = systemPx > availPx + 1
  if (cur.zoom === null) return overflows ? { zoom: PROBE_ZOOM, fittedTo: null, ceiling: null } : cur
  const ceiling = overflows ? Math.min(cur.ceiling ?? Infinity, cur.zoom) : cur.ceiling
  // The panel grew well past what the zoom was fitted to: let the default try again.
  if (!overflows && cur.fittedTo !== null && availPx > cur.fittedTo + REGROW_PX) return DEFAULT_FIT
  const underfilled = systemPx < availPx * UNDERFILL
  if (!overflows && !underfilled) return cur.fittedTo === null ? { ...cur, fittedTo: availPx } : cur
  let target = cur.zoom * (availPx * FILL) / systemPx
  if (ceiling !== null) target = Math.min(target, ceiling * 0.97)
  target = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target)) * 1000) / 1000
  if (Math.abs(target - cur.zoom) / cur.zoom < SETTLE) {
    // Already as close as is worth it; an overflow still steps down a little.
    return overflows && target > MIN_ZOOM ? { zoom: Math.max(MIN_ZOOM, Math.round(cur.zoom * 970) / 1000), fittedTo: availPx, ceiling }
      : cur.fittedTo === null || cur.ceiling !== ceiling ? { ...cur, fittedTo: availPx, ceiling } : cur
  }
  return { zoom: target, fittedTo: availPx, ceiling }
}
