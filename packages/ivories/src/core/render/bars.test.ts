import { describe, it, expect } from 'vitest'
import { screenShadowSign, drawNoteBar } from './bars'
import { toScreen } from './orientation'
import { resolveTemplate } from '../template/resolve'
import { stubCtx, state } from './pianoRoll.test-helpers'

describe('screenShadowSign', () => {
  it('is down-right on screen in both orientations', () => {
    expect(screenShadowSign(undefined, 2)).toBe(2)
    expect(screenShadowSign('vertical', 2)).toBe(2)
    expect(screenShadowSign('horizontal', 2)).toBe(-2)
    const L = state([]).layout
    const dx = screenShadowSign('horizontal', 2), dy = dx
    const a = toScreen('horizontal', L, 100 + dx, 50 + dy)
    const b = toScreen('horizontal', L, 100, 50)
    expect({ x: a.x - b.x, y: a.y - b.y }).toEqual({ x: 2, y: 2 })
  })
})

describe('drawNoteBar', () => {
  it('horizontal: the shadow rect is offset (-d, -d) in canonical coords, down-right on screen', () => {
    const rects: number[][] = []
    const ctx = {
      beginPath() {}, fill() {}, stroke() {}, fillRect() {}, strokeRect() {},
      roundRect(...a: number[]) { rects.push(a) },
    } as unknown as CanvasRenderingContext2D
    const s = { ...state([]), orientation: 'horizontal' as const, template: resolveTemplate('chord-cards') }
    drawNoteBar(ctx, s, 100, 50, 8, 30, '#abcdef')
    const d = s.template.bars.shadowDepth
    expect(rects[0].slice(0, 2)).toEqual([100 - d, 50 - d])
    expect(rects[1].slice(0, 2)).toEqual([100, 50])
    const a = toScreen('horizontal', s.layout, rects[0][0], rects[0][1])
    const b = toScreen('horizontal', s.layout, 100, 50)
    expect({ x: a.x - b.x, y: a.y - b.y }).toEqual({ x: d, y: d })
  })

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
