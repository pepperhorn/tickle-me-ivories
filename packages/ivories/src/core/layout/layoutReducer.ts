import { DEFAULT_PIP, MASK, clampRatio, clampSize } from './layout'
import type { Corner, Layout, LayoutKind, SlotName, SlotSource } from './types'

export type LayoutAction =
  | { type: 'swap' }
  | { type: 'setCorner'; corner: Corner }
  | { type: 'setRatio'; ratio: number }
  | { type: 'setSize'; size: number }
  | { type: 'setSource'; slot: SlotName; source: SlotSource }
  | { type: 'setKind'; kind: LayoutKind }

const primary = (l: Layout): SlotSource => (l.kind === 'split' ? l.top : l.main)
const secondary = (l: Layout): SlotSource => (l.kind === 'split' ? l.bottom : l.kind === 'pip' ? l.inset : MASK)

/** Pure (spec §5.1). Returns the same object when nothing changes. */
export function layoutReducer(l: Layout, a: LayoutAction): Layout {
  switch (a.type) {
    case 'swap':
      if (l.kind === 'split') return { ...l, top: l.bottom, bottom: l.top, ratio: clampRatio(1 - l.ratio) }
      if (l.kind === 'pip') return { ...l, main: l.inset, inset: l.main }
      return l
    case 'setCorner':
      return l.kind === 'pip' && l.corner !== a.corner ? { ...l, corner: a.corner } : l
    case 'setRatio':
      return l.kind === 'split' && Number.isFinite(a.ratio) ? { ...l, ratio: clampRatio(a.ratio) } : l
    case 'setSize':
      return l.kind === 'pip' && Number.isFinite(a.size) ? { ...l, size: clampSize(a.size) } : l
    case 'setSource':
      if (l.kind === 'single' && a.slot === 'main') return { ...l, main: a.source }
      if (l.kind === 'split' && a.slot === 'top') return { ...l, top: a.source }
      if (l.kind === 'split' && a.slot === 'bottom') return { ...l, bottom: a.source }
      if (l.kind === 'pip' && a.slot === 'main') return { ...l, main: a.source }
      if (l.kind === 'pip' && a.slot === 'inset') return { ...l, inset: a.source }
      return l
    case 'setKind': {
      if (l.kind === a.kind) return l
      const p = primary(l), s = secondary(l)
      if (a.kind === 'single') return { kind: 'single', main: p }
      if (a.kind === 'split') return { kind: 'split', top: p, bottom: s, ratio: 0.5 }
      return { kind: 'pip', main: p, inset: s, ...DEFAULT_PIP }
    }
  }
}
