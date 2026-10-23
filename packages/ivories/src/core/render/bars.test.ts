import { describe, it, expect } from 'vitest'
import { screenShadowOffset, drawNoteBar } from './bars'
import { toScreen } from './orientation'
import { resolveTemplate } from '../template/resolve'
import { stubCtx, state } from './pianoRoll.test-helpers'

describe('screenShadowOffset', () => {
  it('is down-right on screen in both orientations', () => {
    expect(screenShadowOffset(undefined, 2)).toEqual({ dx: 2, dy: 2 })
    expect(screenShadowOffset('vertical', 2)).toEqual({ dx: 2, dy: 2 })
    expect(screenShadowOffset('horizontal', 2)).toEqual({ dx: -2, dy: -2 })
    const L = state([]).layout
    const { dx, dy } = screenShadowOffset('horizontal', 2)
    const a = toScreen('horizontal', L, 100 + dx, 50 + dy)
    const b = toScreen('horizontal', L, 100, 50)
    expect({ x: a.x - b.x, y: a.y - b.y }).toEqual({ x: 2, y: 2 })
  })
})

describe('drawNoteBar', () => {
  it('no template: one fill and one roundRect, nothing else', () => {
    const { ctx, calls, fillStyles } = stubCtx()
    drawNoteBar(ctx, state([]), 10, 20, 8, 30, '#123456')
    expect(fillStyles).toEqual(['#123456'])
    expect(calls).toEqual(['beginPath(0)', 'roundRect(5)', 'fill(0)'])
  })

  it('chord-cards: shadow first in ink, then the bar, then a 1.5px ink outline', () => {
    const { ctx, calls, fillStyles } = stubCtx()
    const widths: number[] = []
    const rec = new Proxy(ctx, {
      set(t, p, v) { if (p === 'lineWidth') widths.push(v); return Reflect.set(t, p, v) },
    })
    drawNoteBar(rec, { ...state([]), template: resolveTemplate('chord-cards') }, 10, 20, 8, 30, '#abcdef')
    expect(fillStyles).toEqual(['#231f20', '#abcdef'])
    expect(widths).toEqual([1.5])
    expect(calls.filter((c) => c.startsWith('roundRect'))).toHaveLength(3)
    expect(calls[calls.length - 1]).toBe('stroke(0)')
  })
})
