import { describe, it, expect } from 'vitest'
import { aspectBox, nearestCorner, slotRects } from './geometry'
import type { Layout } from './types'

const f = { kind: 'ivories', view: 'falling' } as const

describe('stage geometry (spec §5.2)', () => {
  it('letterboxes 16:9 and 9:16 in the container; free fills it', () => {
    expect(aspectBox(1000, 1000, '16:9')).toEqual({ x: 0, y: 218.75, w: 1000, h: 562.5 })
    expect(aspectBox(1000, 500, '9:16')).toEqual({ x: 359.375, y: 0, w: 281.25, h: 500 })
    expect(aspectBox(800, 600, 'free')).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })

  it('splits by ratio, top share', () => {
    const r = slotRects({ kind: 'split', top: f, bottom: f, ratio: 0.25 }, 400, 800)
    expect(r.top).toEqual({ x: 0, y: 0, w: 400, h: 200 })
    expect(r.bottom).toEqual({ x: 0, y: 200, w: 400, h: 600 })
  })

  it('places the pip inset in each corner, margin as a fraction of width, same aspect as the stage', () => {
    const base: Layout = { kind: 'pip', main: f, inset: f, corner: 'tl', size: 0.25, margin: 0.05 }
    expect(slotRects(base, 800, 400).inset).toEqual({ x: 40, y: 40, w: 200, h: 100 })
    expect(slotRects({ ...base, corner: 'br' }, 800, 400).inset).toEqual({ x: 560, y: 260, w: 200, h: 100 })
    expect(slotRects({ ...base, corner: 'tr' }, 800, 400).inset!.x).toBe(560)
    expect(slotRects({ ...base, corner: 'bl' }, 800, 400).inset!.y).toBe(260)
  })

  it('snaps a released inset to the nearest corner', () => {
    expect(nearestCorner(10, 10, 100, 100)).toBe('tl')
    expect(nearestCorner(90, 10, 100, 100)).toBe('tr')
    expect(nearestCorner(10, 90, 100, 100)).toBe('bl')
    expect(nearestCorner(90, 90, 100, 100)).toBe('br')
  })
})
