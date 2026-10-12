import { layoutReducer, slotsOf, sourceAt, viewForMode } from 'ivories/core'
import type { DisplayMode, IvoriesView, Layout, SlotName } from 'ivories/core'

export function modeForView(v: IvoriesView): DisplayMode | null {
  return v === 'falling' ? 'roll' : v === 'keyboard' ? 'keyboard' : null
}

/** The first slot showing keys: the one the roll/keyboard toggle drives (R7, primary slot only). */
export function primarySlot(l: Layout): SlotName | null {
  for (const name of slotsOf(l)) {
    const s = sourceAt(l, name)
    if (s?.kind === 'ivories' && modeForView(s.view)) return name
  }
  return null
}

/** The layout with its primary keys slot showing `mode`; the same object when nothing changes. */
export function withPrimaryMode(l: Layout, mode: DisplayMode): Layout {
  const slot = primarySlot(l)
  if (!slot) return l
  const s = sourceAt(l, slot)
  const view = viewForMode(mode)
  if (s?.kind === 'ivories' && s.view === view) return l
  return layoutReducer(l, { type: 'setSource', slot, source: { kind: 'ivories', view } })
}
