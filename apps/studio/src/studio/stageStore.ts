import { create } from 'zustand'
import { layoutReducer, singleLayout, sourceAt } from 'ivories/core'
import type { Aspect, Layout, LayoutAction } from 'ivories/core'
import { modeForView, primarySlot } from './modeSync'
import { useTransport } from '../transport/useTransport'

interface StudioStage {
  layout: Layout
  aspect: Aspect
  dispatch(a: LayoutAction): void
  setLayout(l: Layout): void
  setAspect(a: Aspect): void
  replace(l: Layout, a: Aspect): void
}

/**
 * The display mode follows the primary keys slot after every layout write
 * (toolbar, Stage drags/keys, scenes), and App's mode -> layout effect covers
 * the other direction (R7). Writes only on a real difference, so the two
 * directions settle instead of looping.
 */
function syncModeFrom(layout: Layout): void {
  const slot = primarySlot(layout)
  const s = slot ? sourceAt(layout, slot) : null
  const mode = s?.kind === 'ivories' ? modeForView(s.view) : null
  const tr = useTransport.getState()
  if (mode && tr.mode !== mode) tr.setMode(mode)
}

/** The studio's stage layout and aspect (spec §6); scenes save and load it. */
export const useStudioStage = create<StudioStage>((set, get) => {
  const writeLayout = (layout: Layout, aspect?: Aspect) => {
    if (layout === get().layout && (aspect === undefined || aspect === get().aspect)) return
    set(aspect === undefined ? { layout } : { layout, aspect })
    syncModeFrom(layout)
  }
  return {
    layout: singleLayout('falling'),
    aspect: 'free',
    dispatch: (a) => writeLayout(layoutReducer(get().layout, a)),
    setLayout: (layout) => writeLayout(layout),
    setAspect: (aspect) => set({ aspect }),
    replace: (layout, aspect) => writeLayout(layout, aspect),
  }
})
