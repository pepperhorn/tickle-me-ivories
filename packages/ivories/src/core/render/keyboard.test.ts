import { describe, it, expect } from 'vitest'
import { drawKeyboard, chordlUnit, keyBox, CHORDL_WHITE_W } from './keyboard'
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

// Theme tokens chord cards puts on the stage (Task 4 writes them as CSS; readTheme reads them back).
const CARDS_THEME = { ...DEFAULT_THEME, keyWhite: '#fafafa', keyBlack: '#222222', keyOutline: '#333333', keyBorder: 'transparent', keyBorderWidth: 1, keyGap: 1 }

/** True when `seq` appears in order (not necessarily adjacent) in `arr`, starting at `from`. */
function inOrder(arr: string[], seq: string[], from = 0): boolean {
  let i = from
  for (const want of seq) {
    while (i < arr.length && arr[i] !== want) i++
    if (i >= arr.length) return false
    i++
  }
  return true
}

describe('chord cards keys (Task 7)', () => {
  it('chordlUnit: radius 3 is 3px on a 25.3px white key and 6px on 50.6px', () => {
    const L = computeLayout(1000, 600)
    expect(CHORDL_WHITE_W).toBe(25.3)
    expect(3 * chordlUnit({ ...L, whiteW: 25.3 })).toBeCloseTo(3, 10)
    expect(3 * chordlUnit({ ...L, whiteW: 50.6 })).toBe(6)
  })

  it('keyBox without a plate is today\'s box', () => {
    const L = computeLayout(1300, 700)
    const today = { top: L.hitY, whiteH: L.keyboardH, blackH: L.blackH }
    expect(keyBox(L)).toEqual(today)
    expect(keyBox(L, resolveTemplate('classic'))).toEqual(today)
  })

  it('keyBox with the chord-cards plate', () => {
    const L = computeLayout(1300, 700)
    const u = chordlUnit(L)
    const b = keyBox(L, resolveTemplate('chord-cards'))
    expect(b.top).toBeCloseTo(L.hitY + 6 * u, 10)
    expect(b.whiteH).toBeCloseTo(L.keyboardH - 12 * u, 10)
    expect(b.blackH).toBeCloseTo(L.blackH * b.whiteH / L.keyboardH, 10)
  })

  it('keyBox never goes negative or NaN at phone width or 0x0', () => {
    const t = resolveTemplate('chord-cards')
    for (const L of [computeLayout(375, 300), computeLayout(1, 1)]) {
      const b = keyBox(L, t)
      for (const v of [b.top, b.whiteH, b.blackH]) expect(Number.isFinite(v)).toBe(true)
      expect(b.whiteH).toBeGreaterThanOrEqual(1)
      expect(b.blackH).toBeGreaterThan(0)
    }
    const z = keyBox(computeLayout(0, 0), t)
    for (const v of [z.top, z.whiteH, z.blackH]) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('drawKeyboard at phone width and 0x0 never passes a negative or NaN size', () => {
    const t = resolveTemplate('chord-cards-crf')
    for (const [w, h] of [[375, 300], [1, 1], [0, 0]]) {
      const args: number[] = []
      const { ctx } = stubCtx()
      const rec = new Proxy(ctx, {
        get(target, prop: string) {
          const f = (target as unknown as Record<string, unknown>)[prop]
          if (typeof f !== 'function' || !['fillRect', 'roundRect', 'strokeRect'].includes(prop)) return f
          return (...a: number[]) => { args.push(...a.slice(2, 4)); return (f as (...x: number[]) => void)(...a) }
        },
        set(target, prop, v) { (target as unknown as Record<string | symbol, unknown>)[prop] = v; return true },
      })
      const held = { pitch: 61, startSec: 0, endSec: 1, velocity: 80, voiceId: 'v' } as never
      drawKeyboard(rec, { ...state([]), layout: computeLayout(w, h), theme: CARDS_THEME, template: t }, new Map([[61, held]]))
      expect(args.length).toBeGreaterThan(0)
      for (const v of args) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0) }
    }
  })

  it('chord-cards draws the plate before the keys', () => {
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, { ...state([]), theme: CARDS_THEME, template: resolveTemplate('chord-cards') }, new Map())
    expect(fillStyles.slice(0, 4)).toEqual(['#231f20', '#ffffff', '#231f20', '#fafafa'])
  })

  it('an idle raised black key: ink shadow, key fill, light lip', () => {
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, { ...state([]), theme: CARDS_THEME, template: resolveTemplate('chord-cards') }, new Map())
    const firstBlack = fillStyles.indexOf('#222222')
    expect(fillStyles.slice(firstBlack - 1, firstBlack + 2)).toEqual(['#231f20', '#222222', '#4a4a4a'])
    expect(fillStyles).not.toContain(CARDS_THEME.blackKeyTop)
  })

  it('a held raised black key sinks: darker lip, its fill the note colour', () => {
    const held = { pitch: 61, startSec: 0, endSec: 1, velocity: 80, voiceId: 'v' } as never
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, { ...state([]), theme: CARDS_THEME, template: resolveTemplate('chord-cards-crf') }, new Map([[61, held]]))
    const i = fillStyles.indexOf('#f58841')
    expect(fillStyles.slice(i - 1, i + 2)).toEqual(['#231f20', '#f58841', 'rgba(0,0,0,0.18)'])
    expect(fillStyles).not.toContain(CARDS_THEME.blackKeyTop)
  })

  it('a live raised black key also takes the darker lip', () => {
    const { ctx, fillStyles } = stubCtx()
    const s = { ...state([]), theme: CARDS_THEME, template: resolveTemplate('chord-cards-crf'), live: new Map([[63, { midi: 63, velocity: 90, time: 0 }]]) }
    drawKeyboard(ctx, s, new Map())
    const i = fillStyles.indexOf('#b8a334')
    expect(fillStyles.slice(i - 1, i + 2)).toEqual(['#231f20', '#b8a334', 'rgba(0,0,0,0.18)'])
  })

  it('no template: drawKeyboard output is unchanged', () => {
    const held = { pitch: 61, startSec: 0, endSec: 1, velocity: 80, voiceId: 'v' } as never
    const s = state([])
    const { ctx, fillStyles, calls } = stubCtx()
    drawKeyboard(ctx, s, new Map([[61, held]]))
    const T = s.theme
    const whites = s.layout.keys.filter((k) => !k.black).length
    const blacks = s.layout.keys.filter((k) => k.black).length
    const lit = noteColor(207, 80, s.velocity)
    // Whites (two middle C marks after C4's key), then blacks (61 lit, with its top strip), then the hit line.
    const expected: string[] = []
    for (const k of s.layout.keys) {
      if (k.black) continue
      expected.push(T.keyWhite)
      if (k.pitch === 60) expected.push(T.middleCMark, T.middleCMark)
    }
    for (const k of s.layout.keys) {
      if (!k.black) continue
      expected.push(k.pitch === 61 ? lit : T.keyBlack)
      if (k.pitch === 61) expected.push(T.blackKeyTop)
    }
    expected.push(T.keyBorder)
    expect(whites + blacks).toBe(88)
    expect(fillStyles).toEqual(expected)
    expect(calls.filter((c) => c === 'roundRect(5)' || c === 'fillRect(4)').length).toBeGreaterThan(88)
  })

  it('the plate draws over a transparent stage', () => {
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, { ...state([]), theme: { ...CARDS_THEME, stageBg: 'transparent' }, template: resolveTemplate('chord-cards') }, new Map())
    expect(inOrder(fillStyles, ['#231f20', '#ffffff', '#231f20', '#fafafa'])).toBe(true)
    expect(fillStyles[1]).toBe('#ffffff')
  })
})
