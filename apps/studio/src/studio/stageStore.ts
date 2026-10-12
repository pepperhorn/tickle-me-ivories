import { create } from 'zustand'
import { layoutReducer, singleLayout } from 'ivories/core'
import type { Aspect, Layout, LayoutAction } from 'ivories/core'

interface StudioStage {
  layout: Layout
  aspect: Aspect
  dispatch(a: LayoutAction): void
  setLayout(l: Layout): void
  setAspect(a: Aspect): void
  replace(l: Layout, a: Aspect): void
}

/** The studio's stage layout and aspect (spec §6); scenes save and load it. */
export const useStudioStage = create<StudioStage>((set, get) => ({
  layout: singleLayout('falling'),
  aspect: 'free',
  dispatch: (a) => set({ layout: layoutReducer(get().layout, a) }),
  setLayout: (layout) => set({ layout }),
  setAspect: (aspect) => set({ aspect }),
  replace: (layout, aspect) => set({ layout, aspect }),
}))
