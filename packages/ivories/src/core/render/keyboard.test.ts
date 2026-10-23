import { describe, it, expect } from 'vitest'
import { drawKeyboard } from './keyboard'
import { computeLayout } from './geometry'
import { DEFAULT_THEME } from './theme'
import { DEFAULT_SCHEME, noteColor } from './colors'
import { stubCtx, state } from './pianoRoll.test-helpers'
import { resolveTemplate } from '../template/resolve'

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

describe('live input on the keys (spec §4.1)', () => {
  it('lights live keys in the live hue over the score colour', () => {
    const score = { pitch: 60, startSec: 0, endSec: 1, velocity: 80, voiceId: 'v' } as never
    const s = { ...state([]), live: new Map([[60, { midi: 60, velocity: 100, time: 0 }]]) }
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, s, new Map([[60, score]]))
    expect(fillStyles).toContain(noteColor(s.theme.liveHue, 100, s.velocity))
    expect(fillStyles).not.toContain(noteColor(207, 80, s.velocity))
  })

  it('lights a live black key and marks its top', () => {
    const s = { ...state([]), live: new Map([[61, { midi: 61, velocity: 64, time: 0 }]]) }
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, s, new Map())
    expect(fillStyles).toContain(noteColor(s.theme.liveHue, 64, s.velocity))
    expect(fillStyles).toContain(s.theme.blackKeyTop)
  })
})

describe('drawKeyboard in a horizontal view (R-H)', () => {
  it('draws the C4 label upright through a local counter-transform', () => {
    const { ctx, calls, texts } = stubCtx()
    drawKeyboard(ctx, { ...state([]), orientation: 'horizontal' }, new Map())
    expect(texts).toContain('C4')
    expect(calls).toContain('translate(2)')
    expect(calls).toContain('transform(6)')
  })

  it('a vertical view never transforms', () => {
    const { ctx, calls } = stubCtx()
    drawKeyboard(ctx, state([]), new Map())
    expect(calls).not.toContain('transform(6)')
  })
})

describe('pitch colour mode on the keys', () => {
  it('pressed and live keys take the pitch colour in pitch mode', () => {
    const template = resolveTemplate('chord-cards-crf')
    const held = { pitch: 62, startSec: 0, endSec: 1, velocity: 80, voiceId: 'v' } as never
    const s = { ...state([]), template, live: new Map([[64, { midi: 64, velocity: 100, time: 0 }]]) }
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, s, new Map([[62, held]]))
    expect(fillStyles).toContain('#ffbc57')
    expect(fillStyles).toContain('#fff56d')
  })

  it('with no template, live keys still use noteColor(theme.liveHue, ...)', () => {
    const s = { ...state([]), live: new Map([[64, { midi: 64, velocity: 100, time: 0 }]]) }
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, s, new Map())
    expect(fillStyles).toContain(noteColor(s.theme.liveHue, 100, s.velocity))
  })
})
