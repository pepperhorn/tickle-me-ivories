import { describe, it, expect } from 'vitest'
import { DEFAULT_THEME, isTransparent, lineDash, parsePx, readTheme } from './theme'

/** jsdom does not resolve CSS custom properties, so the reader is injected. */
const reader = (tokens: Record<string, string>) => () => ({
  getPropertyValue: (k: string) => tokens[k] ?? '',
})

const el = {} as Element

describe('parsePx', () => {
  it('reads a px value', () => { expect(parsePx('3px', 1)).toBe(3) })
  it('reads a bare number', () => { expect(parsePx('2', 1)).toBe(2) })
  it('reads a fractional value', () => { expect(parsePx('0.5px', 1)).toBe(0.5) })
  it('falls back on an empty or junk value', () => {
    expect(parsePx('', 7)).toBe(7)
    expect(parsePx('thick', 7)).toBe(7)
  })
})

describe('lineDash', () => {
  it('maps solid to no dash at all', () => { expect(lineDash('solid', 1)).toEqual([]) })
  it('maps dashed and dotted to their spec patterns', () => {
    expect(lineDash('dashed', 1)).toEqual([6, 4])
    expect(lineDash('dotted', 1)).toEqual([1, 3])
  })
  it('scales the pattern by line width, so a thick dash stays proportional', () => {
    expect(lineDash('dashed', 2)).toEqual([12, 8])
  })
  it('falls back to solid for anything it does not know', () => {
    expect(lineDash('groovy', 1)).toEqual([])
    expect(lineDash('', 1)).toEqual([])
  })
})

describe('isTransparent', () => {
  it('detects the keyword', () => { expect(isTransparent('transparent')).toBe(true) })
  it('detects a zero-alpha rgba, which is what getComputedStyle returns', () => {
    expect(isTransparent('rgba(0, 0, 0, 0)')).toBe(true)
    expect(isTransparent('rgb(0 0 0 / 0)')).toBe(true)
  })
  it('does not fire on an opaque colour', () => {
    expect(isTransparent('#000000')).toBe(false)
    expect(isTransparent('rgba(0, 0, 0, 0.01)')).toBe(false)
  })
})

describe('readTheme', () => {
  it('returns every default when no token resolves', () => {
    expect(readTheme(el, reader({}))).toEqual(DEFAULT_THEME)
  })

  it('returns every default for a null element, so the first frame never throws', () => {
    expect(readTheme(null)).toEqual(DEFAULT_THEME)
  })

  it('adopts a colour token', () => {
    const t = readTheme(el, reader({ '--tmi-key-white': '#ff0000' }))
    expect(t.keyWhite).toBe('#ff0000')
    expect(t.keyBlack).toBe(DEFAULT_THEME.keyBlack)
  })

  it('parses numeric tokens rather than leaving them as strings', () => {
    const t = readTheme(el, reader({ '--tmi-key-radius': '6px', '--tmi-bar-radius': '0px' }))
    expect(t.keyRadius).toBe(6)
    expect(t.barRadius).toBe(0)
  })

  it('resolves the grid dash from its style token AND its width token', () => {
    const t = readTheme(el, reader({ '--tmi-grid-line-style': 'dotted', '--tmi-grid-line-width': '2px' }))
    expect(t.gridLineDash).toEqual([2, 6])
    expect(t.gridLineWidth).toBe(2)
  })

  it('carries a transparent stage background through verbatim', () => {
    const t = readTheme(el, reader({ '--tmi-stage-bg': 'transparent' }))
    expect(isTransparent(t.stageBg)).toBe(true)
  })

  it('trims whitespace, which getComputedStyle leaves on custom properties', () => {
    const t = readTheme(el, reader({ '--tmi-key-white': '  #abcdef  ' }))
    expect(t.keyWhite).toBe('#abcdef')
  })

  it('F32: defaults keyOutline to transparent, and adopts an explicit token', () => {
    expect(isTransparent(readTheme(el, reader({})).keyOutline)).toBe(true)
    const t = readTheme(el, reader({ '--tmi-key-outline': 'rgba(255, 255, 255, 0.85)' }))
    expect(t.keyOutline).toBe('rgba(255, 255, 255, 0.85)')
  })
})
