import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveTemplate, isClassicLook, resolveBarLabels, DEFAULT_BAR_LABEL_STYLE } from './resolve'
import { CRF_PITCH_PALETTE } from './palette'
import { BUILTIN_TEMPLATES } from './builtins'

const fakeSupports = (_p: string, v: string) => /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([^()]*\)|transparent)$/i.test(v)
beforeEach(() => { vi.stubGlobal('CSS', { supports: fakeSupports }) })
afterEach(() => { vi.unstubAllGlobals() })

const t = (o: Record<string, unknown> = {}) => ({ v: 1, kind: 'ivories-template', id: 'mine', name: 'Mine', ...o }) as never

const CARD_TOKENS = {
  '--ivories-stage-bg': '#fbf8f1', '--ivories-grid-line': 'rgba(35,31,32,0.08)', '--ivories-grid-line-c4': 'rgba(35,31,32,0.18)',
  '--ivories-beat-line': 'rgba(35,31,32,0.08)', '--ivories-bar-line': 'rgba(35,31,32,0.2)',
  '--ivories-middle-c-mark': 'rgba(35,31,32,0.55)', '--ivories-progress-track': 'rgba(35,31,32,0.08)',
  '--ivories-progress-fill': '#231f20', '--ivories-count-in-ink': 'rgba(35,31,32,0.3)', '--ivories-key-white': '#fafafa', '--ivories-key-black': '#222222',
  '--ivories-key-border': 'transparent', '--ivories-key-border-width': '1px', '--ivories-key-gap': '1px',
  '--ivories-key-outline': '#333333', '--ivories-bar-radius': '4px',
}

describe('resolveTemplate', () => {
  it('a built-in passed as an object (or a JSON copy) resolves like its id', () => {
    for (const id of ['outline', 'contrast', 'chord-cards'] as const) {
      for (const obj of [BUILTIN_TEMPLATES[id], JSON.parse(JSON.stringify(BUILTIN_TEMPLATES[id]))]) {
        const r = resolveTemplate(obj)
        expect(r.cssTheme, id).toBe(resolveTemplate(id).cssTheme)
        expect(r.tokens, id).toEqual(resolveTemplate(id).tokens)
      }
    }
    expect(resolveTemplate(BUILTIN_TEMPLATES.outline).cssTheme).toBe('outline')
  })

  it("a user template that only borrows a built-in's id does not inherit that preset", () => {
    const r = resolveTemplate(t({ id: 'outline', name: 'Mine', stage: { bg: '#123456' } }))
    expect(r.cssTheme).toBe('classic')
    expect(r.tokens).toEqual({ '--ivories-stage-bg': '#123456' })
    expect(resolveTemplate(t({ id: 'outline', extends: 'outline' })).cssTheme).toBe('outline')
  })

  it('no template and classic resolve to the same frozen object with no tokens', () => {
    const c = resolveTemplate()
    expect(resolveTemplate(null)).toBe(c)
    expect(resolveTemplate('classic')).toBe(c)
    expect(c.tokens).toEqual({})
    expect(c.cssTheme).toBe('classic')
    expect(c.keys.whiteRadius).toBeNull()
    expect(c.keys.blackRadius).toBeNull()
    expect(c.keys.raised.enabled).toBe(false)
    expect(c.keys.plate.enabled).toBe(false)
    expect(c.bars).toEqual({ outlineColor: 'transparent', outlineWidth: 0, shadowColor: 'transparent', shadowDepth: 0, shading: 'velocity' })
    expect(c.colour.mode).toBe('hand')
    expect(c.flash.tint).toBe('white')
    expect(c.labels).toEqual(DEFAULT_BAR_LABEL_STYLE)
    expect(isClassicLook(c)).toBe(true)
    expect(Object.isFrozen(c)).toBe(true)
  })

  it('the legacy presets resolve to their CSS class and no tokens', () => {
    for (const id of ['outline', 'contrast', 'transparent'] as const) {
      const r = resolveTemplate(id)
      expect(r.cssTheme).toBe(id)
      expect(r.tokens).toEqual({})
      expect(isClassicLook(r)).toBe(true)
    }
  })

  it('chord-cards writes its stage and key values as --ivories-* tokens', () => {
    const r = resolveTemplate('chord-cards')
    expect(r.tokens).toEqual(CARD_TOKENS)
    expect(r.cssTheme).toBe('classic')
    expect(r.keys.whiteRadius).toBe(3)
    expect(r.colour.mode).toBe('hand')
    expect(r.flash.tint).toBe('note')
    expect(isClassicLook(r)).toBe(false)
  })

  it('chord-cards-crf inherits chord-cards and switches colour and flash', () => {
    const r = resolveTemplate('chord-cards-crf')
    expect(r.tokens).toEqual(CARD_TOKENS)
    expect(r.colour.mode).toBe('pitch')
    expect(r.colour.palette).toEqual(CRF_PITCH_PALETTE)
    expect(r.colour.paletteRgb[0]).toBe('248, 110, 110')
    expect(r.colour.paletteCoreRgb[0]).toBe('252, 183, 183')
    expect(r.flash.tint).toBe('note')
  })

  it('a custom template deep-merges over its extends', () => {
    const r = resolveTemplate(t({ extends: 'chord-cards', keys: { raised: { shadowDepth: 3 } }, stage: { bg: '#000000' } }))
    expect(r.keys.raised.enabled).toBe(true)
    expect(r.keys.raised.lipColor).toBe('#4a4a4a')
    expect(r.keys.raised.shadowDepth).toBe(3)
    expect(r.tokens['--ivories-stage-bg']).toBe('#000000')
    expect(r.tokens['--ivories-key-white']).toBe('#fafafa')
  })

  it('no extends means classic', () => {
    const r = resolveTemplate(t({ colour: { mode: 'pitch' } }))
    expect(r.tokens).toEqual({})
    expect(r.cssTheme).toBe('classic')
    expect(r.colour.mode).toBe('pitch')
  })

  it('extends a preset: the class stays, the overrides go inline', () => {
    const r = resolveTemplate(t({ extends: 'outline', keys: { white: '#111111' } }))
    expect(r.cssTheme).toBe('outline')
    expect(r.tokens).toEqual({ '--ivories-key-white': '#111111' })
  })

  it('an object decodeTemplate rejects resolves to classic', () => {
    expect(resolveTemplate({ v: 1, kind: 'look' } as never)).toBe(resolveTemplate())
  })

  it('the same object resolves to the same result (cached by identity)', () => {
    const o = t({ extends: 'chord-cards' })
    expect(resolveTemplate(o)).toBe(resolveTemplate(o))
    expect(resolveTemplate('nope' as never)).toBe(resolveTemplate())
  })

  it('a custom palette is used, and its rgb precomputed', () => {
    const pal = ['#ff0000', '#00ff00', '#0000ff', '#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999']
    const r = resolveTemplate(t({ colour: { mode: 'pitch', palette: pal } }))
    expect(r.colour.palette).toEqual(pal)
    expect(r.colour.paletteRgb[0]).toBe('255, 0, 0')
    expect(r.colour.paletteCoreRgb[0]).toBe('255, 128, 128')
  })
})

describe('resolveBarLabels', () => {
  const base = DEFAULT_BAR_LABEL_STYLE
  it('returns base when nothing is given', () => { expect(resolveBarLabels(base)).toBe(base) })
  it('maps the shorthand', () => {
    expect(resolveBarLabels(base, 'none').show).toBe(false)
    const po = resolveBarLabels(base, 'pitch-octave')
    expect(po.format).toBe('pitch-octave')
    expect(po.show).toBe(true)
  })
  it('style wins over the shorthand', () => {
    expect(resolveBarLabels(base, 'pitch', { format: 'solfege' }).format).toBe('solfege')
  })
  it('merges font per field', () => {
    const r = resolveBarLabels(base, undefined, { font: { family: 'Nunito' } })
    expect(r.font.family).toBe('Nunito')
    expect(r.font.weight).toBe(600)
  })
  it('ignores an unsafe family', () => {
    const r = resolveBarLabels(base, undefined, { font: { family: 'x;}</style>' } })
    expect(r.font.family).toBe('Poppins')
  })
})
