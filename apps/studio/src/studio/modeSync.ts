import { layoutReducer, slotsOf, sourceAt, viewForMode, viewOrientation } from 'ivories/core'
import type { DisplayMode, IvoriesView, Layout, Orientation, SlotName } from 'ivories/core'

export function modeForView(v: IvoriesView): DisplayMode | null {
  // A rising slot is a roll too (R-M), so it can be the primary keys slot.
  return v === 'falling' || v === 'rising' ? 'roll' : v === 'keyboard' ? 'keyboard' : null
}

/** The first slot showing keys: the one the roll/keyboard toggle drives (R7, primary slot only). */
export function primarySlot(l: Layout): SlotName | null {
  for (const name of slotsOf(l)) {
    const s = sourceAt(l, name)
    if (s?.kind === 'ivories' && modeForView(s.view)) return name
  }
  return null
}

/** How the primary keys slot actually draws (CountIn sits beside a horizontal
    keyboard): a keyboard slot is vertical whatever orientation it stored. */
export function primaryOrientation(l: Layout): Orientation | undefined {
  const slot = primarySlot(l)
  const s = slot ? sourceAt(l, slot) : null
  return s?.kind === 'ivories' ? viewOrientation(s.view, s.orientation) : undefined
}

/** The layout with its primary keys slot showing `mode`; the same object when nothing changes. */
export function withPrimaryMode(l: Layout, mode: DisplayMode): Layout {
  const slot = primarySlot(l)
  if (!slot) return l
  const s = sourceAt(l, slot)
  if (s?.kind !== 'ivories') return l
  // The roll toggle leaves either roll alone (a rising slot stays rising, R-M).
  if (mode === 'roll' && (s.view === 'falling' || s.view === 'rising')) return l
  const view = viewForMode(mode)
  if (s.view === view) return l
  return layoutReducer(l, { type: 'setSource', slot, source: { kind: 'ivories', view } })
}
