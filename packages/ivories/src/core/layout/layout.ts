import type { Corner, IvoriesView, Layout, SlotName, SlotSource } from './types'

export const SPLIT_RATIO_MIN = 0.15
export const SPLIT_RATIO_MAX = 0.85
export const PIP_SIZE_MIN = 0.15
export const PIP_SIZE_MAX = 0.5
export const PIP_MARGIN_MAX = 0.1
export const DEFAULT_PIP: { corner: Corner; size: number; margin: number } = { corner: 'br', size: 0.3, margin: 0.02 }
export const MASK: SlotSource = { kind: 'camera', mode: 'mask', fill: 'transparent' }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const clampRatio = (r: number) => clamp(r, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX)
export const clampSize = (s: number) => clamp(s, PIP_SIZE_MIN, PIP_SIZE_MAX)
export const clampMargin = (m: number) => clamp(m, 0, PIP_MARGIN_MAX)

export function singleLayout(view: IvoriesView): Layout {
  return { kind: 'single', main: { kind: 'ivories', view } }
}

export function slotsOf(l: Layout): SlotName[] {
  return l.kind === 'single' ? ['main'] : l.kind === 'split' ? ['top', 'bottom'] : ['main', 'inset']
}

export function sourceAt(l: Layout, slot: SlotName): SlotSource | null {
  switch (l.kind) {
    case 'single': return slot === 'main' ? l.main : null
    case 'split': return slot === 'top' ? l.top : slot === 'bottom' ? l.bottom : null
    case 'pip': return slot === 'main' ? l.main : slot === 'inset' ? l.inset : null
  }
}

/** Device ids are per-browser: never put them in a share (spec §5.4). */
export function stripDeviceIds(l: Layout): Layout {
  const strip = (s: SlotSource): SlotSource => {
    if (s.kind === 'camera' && s.mode === 'webcam' && s.deviceId !== undefined) {
      const { deviceId: _drop, ...rest } = s
      return rest
    }
    return s
  }
  switch (l.kind) {
    case 'single': return { ...l, main: strip(l.main) }
    case 'split': return { ...l, top: strip(l.top), bottom: strip(l.bottom) }
    case 'pip': return { ...l, main: strip(l.main), inset: strip(l.inset) }
  }
}
