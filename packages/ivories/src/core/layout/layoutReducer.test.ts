import { describe, it, expect } from 'vitest'
import { layoutReducer } from './layoutReducer'
import { MASK, singleLayout, slotsOf, sourceAt, stripDeviceIds } from './layout'
import type { Layout, SlotSource } from './types'

const falling: SlotSource = { kind: 'ivories', view: 'falling' }
const cam: SlotSource = { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' }
const split: Layout = { kind: 'split', top: falling, bottom: cam, ratio: 0.3 }
const pip: Layout = { kind: 'pip', main: falling, inset: cam, corner: 'br', size: 0.3, margin: 0.02 }

describe('layoutReducer (spec §5.1)', () => {
  it('swap exchanges split slots (each keeps its size) and pip slots; single is unchanged', () => {
    expect(layoutReducer(split, { type: 'swap' })).toEqual({ kind: 'split', top: cam, bottom: falling, ratio: 0.7 })
    expect(layoutReducer(pip, { type: 'swap' })).toMatchObject({ main: cam, inset: falling, corner: 'br' })
    const single = singleLayout('falling')
    expect(layoutReducer(single, { type: 'swap' })).toBe(single)
  })

  it('setRatio and setSize clamp; non-finite values change nothing', () => {
    expect(layoutReducer(split, { type: 'setRatio', ratio: 0.99 })).toMatchObject({ ratio: 0.85 })
    expect(layoutReducer(split, { type: 'setRatio', ratio: 0.01 })).toMatchObject({ ratio: 0.15 })
    expect(layoutReducer(split, { type: 'setRatio', ratio: Number.NaN })).toBe(split)
    expect(layoutReducer(pip, { type: 'setSize', size: 2 })).toMatchObject({ size: 0.5 })
    expect(layoutReducer(pip, { type: 'setSize', size: 0 })).toMatchObject({ size: 0.15 })
    expect(layoutReducer(split, { type: 'setSize', size: 0.4 })).toBe(split)
  })

  it('setCorner applies to pip only', () => {
    expect(layoutReducer(pip, { type: 'setCorner', corner: 'tl' })).toMatchObject({ corner: 'tl' })
    expect(layoutReducer(split, { type: 'setCorner', corner: 'tl' })).toBe(split)
  })

  it('setSource replaces a slot that exists, and ignores one that does not', () => {
    expect(layoutReducer(split, { type: 'setSource', slot: 'bottom', source: MASK })).toMatchObject({ bottom: MASK })
    expect(layoutReducer(split, { type: 'setSource', slot: 'inset', source: MASK })).toBe(split)
    expect(layoutReducer(singleLayout('keyboard'), { type: 'setSource', slot: 'main', source: cam })).toEqual({ kind: 'single', main: cam })
  })

  it('setKind keeps sources: single->split puts main on top over a mask; split<->pip maps top<->main, bottom<->inset', () => {
    expect(layoutReducer(singleLayout('falling'), { type: 'setKind', kind: 'split' }))
      .toEqual({ kind: 'split', top: falling, bottom: MASK, ratio: 0.5 })
    expect(layoutReducer(split, { type: 'setKind', kind: 'pip' }))
      .toEqual({ kind: 'pip', main: falling, inset: cam, corner: 'br', size: 0.3, margin: 0.02 })
    expect(layoutReducer(pip, { type: 'setKind', kind: 'split' }))
      .toEqual({ kind: 'split', top: falling, bottom: cam, ratio: 0.5 })
    expect(layoutReducer(pip, { type: 'setKind', kind: 'single' })).toEqual({ kind: 'single', main: falling })
    expect(layoutReducer(pip, { type: 'setKind', kind: 'pip' })).toBe(pip)
  })

  it('slotsOf, sourceAt and stripDeviceIds', () => {
    expect(slotsOf(split)).toEqual(['top', 'bottom'])
    expect(slotsOf(pip)).toEqual(['main', 'inset'])
    expect(sourceAt(pip, 'inset')).toBe(cam)
    expect(sourceAt(split, 'main')).toBeNull()
    const withId: Layout = { kind: 'single', main: { kind: 'camera', mode: 'webcam', deviceId: 'abc', mirror: true, fit: 'cover' } }
    expect(stripDeviceIds(withId)).toEqual({ kind: 'single', main: cam })
  })
})
