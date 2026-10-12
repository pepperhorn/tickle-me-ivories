import { describe, it, expect } from 'vitest'
import { StageRenderer, rangeFromProp } from './stageRenderer'
import { computeLayout, ensureFullBlackKeyGroups } from './geometry'
import { DEFAULT_THEME } from './theme'
import { stubCtx } from './pianoRoll.test-helpers'
import { DEFAULT_SETTINGS } from '../settings/types'
import type { StageInput } from './stageRenderer'

const input = (patch: Partial<StageInput> = {}): StageInput => ({
  score: null, settings: structuredClone(DEFAULT_SETTINGS), fallSeconds: 3, maxNoteDur: 0,
  showRoll: true, range: null, ...patch,
})

describe('StageRenderer', () => {
  it('caches the layout by size and range (no per-frame allocation)', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const a = r.draw(ctx, 800, 400, 0, input())
    const b = r.draw(ctx, 800, 400, 1, input())
    expect(b.layout).toBe(a.layout)
    const c = r.draw(ctx, 900, 400, 1, input())
    expect(c.layout).not.toBe(a.layout)
  })

  it('reads the theme once per layout, not per frame', () => {
    let reads = 0
    const r = new StageRenderer(() => { reads++; return DEFAULT_THEME })
    const { ctx } = stubCtx()
    for (let i = 0; i < 5; i++) r.draw(ctx, 800, 400, i, input())
    expect(reads).toBe(1)
  })

  it('an explicit range overrides the zoom setting', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input({ range: [48, 72] }))
    expect(f.layout.keys[0].pitch).toBe(48)
    expect(f.layout.keys.at(-1)!.pitch).toBe(72)
  })

  it('draws at 0x0 (hidden container) without NaN geometry (Review Focus 5)', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 0, 0, 0, input())
    for (const k of f.layout.keys) expect(Number.isFinite(k.x) && Number.isFinite(k.w)).toBe(true)
    expect(Number.isFinite(f.layout.hitY)).toBe(true)
  })
})

describe('range crop equals the full keyboard scaled to the range (spec §4, R5)', () => {
  it('matches key positions of the 88-key geometry, scaled and shifted', () => {
    const [lo, hi] = ensureFullBlackKeyGroups(48, 72)
    const crop = computeLayout(700, 400, { firstPitch: lo, lastPitch: hi })
    const fullW = 700 * (52 / crop.whiteCount)
    const full = computeLayout(fullW, 400)
    const shift = full.byPitch.get(lo)!.x
    for (const k of crop.keys) {
      const f = full.byPitch.get(k.pitch)!
      expect(k.x).toBeCloseTo(f.x - shift, 6)
      expect(k.w).toBeCloseTo(f.w, 6)
    }
  })

  it('rangeFromProp: full, a tuple widened to whole groups, or none', () => {
    expect(rangeFromProp('full')).toEqual([21, 108])
    expect(rangeFromProp([62, 70])).toEqual([60, 71])
    expect(rangeFromProp(undefined)).toBeNull()
  })
})

describe('StageRenderer orientation (R-H, Review Focus 2)', () => {
  it('horizontal: canonical geometry on the swapped box, drawn under the reflection', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx, calls } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input({ orientation: 'horizontal' }))
    expect(f.layout.stageW).toBe(400)
    expect(f.layout.hitY + f.layout.keyboardH).toBe(800)
    expect(calls[0]).toBe('save(0)')
    expect(calls).toContain('transform(6)')
    expect(calls.at(-1)).toBe('restore(0)')
  })

  it('vertical: same geometry as before and no transform', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx, calls } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input())
    expect(f.layout.stageW).toBe(800)
    expect(calls).not.toContain('transform(6)')
  })

  it('horizontal at 0x0 stays finite', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 0, 0, 0, input({ orientation: 'horizontal' }))
    for (const k of f.layout.keys) expect(Number.isFinite(k.x) && Number.isFinite(k.w)).toBe(true)
    expect(Number.isFinite(f.layout.hitY)).toBe(true)
  })
})
