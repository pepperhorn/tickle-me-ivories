import { describe, it, expect } from 'vitest'
import { drawKeyboard } from './keyboard'
import { computeLayout } from './geometry'
import { DEFAULT_THEME } from './theme'
import { DEFAULT_SCHEME } from './colors'
import { stubCtx, state } from './pianoRoll.test-helpers'

describe('the middle C label', () => {
  it('is drawn when white keys are wide enough to read it', () => {
    const { ctx, texts } = stubCtx()
    const layout = computeLayout(1220, 700)    // whiteW ~= 23.5, above the 14px floor
    drawKeyboard(
      ctx,
      { ...state([]), layout, theme: DEFAULT_THEME, velocity: DEFAULT_SCHEME, showMiddleC: true },
      new Map(),
    )
    expect(texts).toContain('C4')
  })

  it('is skipped below the legibility floor rather than drawn as mush', () => {
    const { ctx, texts } = stubCtx()
    const layout = computeLayout(600, 700)     // whiteW ~= 11.5, below the 14px floor
    drawKeyboard(
      ctx,
      { ...state([]), layout, theme: DEFAULT_THEME, velocity: DEFAULT_SCHEME, showMiddleC: true },
      new Map(),
    )
    expect(texts).not.toContain('C4')
  })

  it('is skipped entirely when the middle C marker is switched off', () => {
    const { ctx, texts } = stubCtx()
    const layout = computeLayout(1220, 700)
    drawKeyboard(
      ctx,
      { ...state([]), layout, theme: DEFAULT_THEME, velocity: DEFAULT_SCHEME, showMiddleC: false },
      new Map(),
    )
    expect(texts).not.toContain('C4')
  })

  it('is skipped when middle C is outside the zoomed range', () => {
    const { ctx, texts } = stubCtx()
    const layout = computeLayout(1220, 700, { firstPitch: 72, lastPitch: 95 })
    drawKeyboard(
      ctx,
      { ...state([]), layout, theme: DEFAULT_THEME, velocity: DEFAULT_SCHEME, showMiddleC: true },
      new Map(),
    )
    expect(texts).not.toContain('C4')
  })
})
