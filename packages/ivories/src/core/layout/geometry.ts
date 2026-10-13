import type { Aspect, Corner, Layout, SlotName } from './types'

export interface Rect { x: number; y: number; w: number; h: number }

/** The stage box inside its container: letterboxed to the aspect, centred; 'free' fills. */
export function aspectBox(cw: number, ch: number, aspect: Aspect): Rect {
  if (aspect === 'free' || cw <= 0 || ch <= 0) return { x: 0, y: 0, w: Math.max(0, cw), h: Math.max(0, ch) }
  const r = aspect === '16:9' ? 16 / 9 : 9 / 16
  if (cw / ch > r) {
    const w = ch * r
    return { x: (cw - w) / 2, y: 0, w, h: ch }
  }
  const h = cw / r
  return { x: 0, y: (ch - h) / 2, w: cw, h }
}

/** Slot boxes in a w x h stage (the same maths the CSS in style.css expresses). */
export function slotRects(l: Layout, w: number, h: number): Partial<Record<SlotName, Rect>> {
  if (l.kind === 'single') return { main: { x: 0, y: 0, w, h } }
  if (l.kind === 'split') {
    const th = h * l.ratio
    return { top: { x: 0, y: 0, w, h: th }, bottom: { x: 0, y: th, w, h: h - th } }
  }
  const iw = l.size * w
  const ih = l.size * h
  const m = l.margin * w
  const x = l.corner === 'tl' || l.corner === 'bl' ? m : w - iw - m
  const y = l.corner === 'tl' || l.corner === 'tr' ? m : h - ih - m
  return { main: { x: 0, y: 0, w, h }, inset: { x, y, w: iw, h: ih } }
}

export function nearestCorner(cx: number, cy: number, w: number, h: number): Corner {
  const top = cy < h / 2
  const left = cx < w / 2
  return top ? (left ? 'tl' : 'tr') : (left ? 'bl' : 'br')
}
