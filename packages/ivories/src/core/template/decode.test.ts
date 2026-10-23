import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BUILTIN_TEMPLATES, BUILTIN_TEMPLATE_IDS, isBuiltinTemplateId } from './builtins'
import { CSS_THEME_OF } from './cssTheme'
import { decodeTemplate, validTemplateRef, validBarLabelStyle, MAX_TEMPLATE_BYTES } from './decode'
import { isPayloadVersionError } from '../platform/codec'
import { isPlatformError } from '../platform/errors'

const t = (o: Record<string, unknown> = {}) => ({ v: 1, kind: 'ivories-template', id: 'mine', name: 'Mine', ...o })

function thrown(fn: () => unknown): unknown {
  try { fn() } catch (e) { return e }
  throw new Error('did not throw')
}
const code = (fn: () => unknown) => {
  const e = thrown(fn)
  expect(isPlatformError(e)).toBe(true)
  return (e as { code: string }).code
}
// jsdom has no CSS.supports, and isCssColor's fallback accepts any bare word
// (so 'nope' would pass). Stand in for a browser that knows only these colours.
const fakeSupports = (_prop: string, v: string) => /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([^()]*\)|transparent)$/i.test(v)
beforeEach(() => { vi.stubGlobal('CSS', { supports: fakeSupports }) })
afterEach(() => { vi.unstubAllGlobals() })

const pal12 = ['#f86e6e', '#f58841', '#ffbc57', '#b8a334', '#fff56d', '#b3f888', '#93d154', '#6bc6a0', '#7ee8df', '#88a7f8', '#cc97e8', '#e277b1']

describe('built-in templates', () => {
  it('every built-in decodes to itself', () => {
    for (const id of BUILTIN_TEMPLATE_IDS) {
      expect(decodeTemplate(BUILTIN_TEMPLATES[id])).toEqual(BUILTIN_TEMPLATES[id])
      expect(BUILTIN_TEMPLATES[id].id).toBe(id)
      expect(isBuiltinTemplateId(id)).toBe(true)
      expect(CSS_THEME_OF[id]).toBeTruthy()
    }
    expect(isBuiltinTemplateId('nope')).toBe(false)
    expect(Object.isFrozen(BUILTIN_TEMPLATES['chord-cards'].keys?.raised)).toBe(true)
  })

  it('the built-ins carry the spec values', () => {
    const cc = BUILTIN_TEMPLATES['chord-cards']
    expect(cc.keys).toMatchObject({ white: '#fafafa', black: '#222222', outline: '#333333', whiteRadius: 3, blackRadius: 2 })
    expect(cc.keys?.raised).toEqual({ enabled: true, shadowColor: '#231f20', shadowDepth: 2, lipColor: '#4a4a4a', lipDepth: 6 })
    expect(cc.keys?.plate).toEqual({ enabled: true, fill: '#ffffff', borderColor: '#231f20', borderWidth: 2, shadowColor: '#231f20', shadowDepth: 4, padding: 6 })
    expect(cc.bars).toEqual({ radius: 4, outlineColor: '#231f20', outlineWidth: 1.5, shadowColor: '#231f20', shadowDepth: 2, shading: 'flat' })
    expect(cc.stage?.bg).toBe('#fbf8f1')
    expect(BUILTIN_TEMPLATES['chord-cards-crf']).toEqual({
      v: 1, kind: 'ivories-template', id: 'chord-cards-crf', name: 'Chord cards + CRF colours',
      extends: 'chord-cards', colour: { mode: 'pitch' }, flash: { tint: 'note' },
    })
    expect(BUILTIN_TEMPLATES['classic-crf']).toEqual({
      v: 1, kind: 'ivories-template', id: 'classic-crf', name: 'Classic + CRF colours',
      extends: 'classic', colour: { mode: 'pitch' }, flash: { tint: 'note' },
    })
    for (const id of ['classic', 'outline', 'contrast', 'transparent'] as const) {
      const b = BUILTIN_TEMPLATES[id]
      for (const k of ['stage', 'keys', 'bars', 'colour', 'flash', 'labels'] as const) expect(b[k]).toBeUndefined()
    }
  })
})

describe('decodeTemplate', () => {
  it('the envelope: wrong v or kind throws an invalid PlatformError, a newer v a PayloadVersionError', () => {
    expect(isPayloadVersionError(thrown(() => decodeTemplate(t({ v: 2 }))))).toBe(true)
    for (const bad of [t({ kind: 'look' }), t({ v: 0 }), 'not json', null, []]) {
      expect(code(() => decodeTemplate(bad))).toBe('invalid')
    }
  })

  it('over 16 KiB throws too_large before any field is read', () => {
    expect(MAX_TEMPLATE_BYTES).toBe(16 * 1024)
    expect(code(() => decodeTemplate(t({ name: 'x'.repeat(17000) })))).toBe('too_large')
  })

  it('id must be [a-z0-9-]{1,48}', () => {
    for (const id of ['Bad Id', '', 'a'.repeat(49)]) expect(code(() => decodeTemplate(t({ id })))).toBe('invalid')
    expect(decodeTemplate(t({ id: 'my-look-2' })).id).toBe('my-look-2')
  })

  it('name: a non-string becomes the id, a long one is cut to 64 chars', () => {
    expect(decodeTemplate(t({ name: 7 })).name).toBe('mine')
    expect(decodeTemplate(t({ name: 'y'.repeat(100) })).name).toBe('y'.repeat(64))
  })

  it('unknown keys are dropped at every level', () => {
    const d = decodeTemplate(t({ evil: 1, stage: { bg: '#000', x: 1 }, keys: { raised: { enabled: true, y: 2 } } })) as unknown as Record<string, unknown>
    expect(d.evil).toBeUndefined()
    expect((d.stage as Record<string, unknown>).x).toBeUndefined()
    expect(((d.keys as { raised: Record<string, unknown> }).raised).y).toBeUndefined()
    expect((d.stage as Record<string, unknown>).bg).toBe('#000')
  })

  it('a colour that is not a colour is dropped (resolution falls back to the base)', () => {
    expect(decodeTemplate(t({ stage: { bg: 'url(x)', gridLine: '#123' } })).stage).toEqual({ gridLine: '#123' })
  })

  it('numbers are clamped to their ranges', () => {
    const d = decodeTemplate(t({
      keys: { borderWidth: 99, gap: -3, whiteRadius: 20, blackRadius: -1, raised: { shadowDepth: 50, lipDepth: 50 }, plate: { borderWidth: 50, shadowDepth: 50, padding: 50 } },
      bars: { radius: 99, outlineWidth: 9, shadowDepth: 99 },
    }))
    expect(d.keys).toMatchObject({ borderWidth: 4, gap: 0, whiteRadius: 8, blackRadius: 0 })
    expect(d.keys?.raised).toEqual({ shadowDepth: 6, lipDepth: 12 })
    expect(d.keys?.plate).toEqual({ borderWidth: 6, shadowDepth: 12, padding: 16 })
    expect(d.bars).toEqual({ radius: 12, outlineWidth: 4, shadowDepth: 8 })
    const dropped = decodeTemplate(t({ keys: { gap: '3', borderWidth: NaN }, bars: { radius: '4' } }))
    expect(dropped.keys?.gap).toBeUndefined()
    expect(dropped.keys?.borderWidth).toBeUndefined()
    expect(dropped.bars?.radius).toBeUndefined()
  })

  it('enums: an unknown value is dropped', () => {
    const d = decodeTemplate(t({ bars: { shading: 'glossy' }, colour: { mode: 'rainbow' }, flash: { tint: 'red' }, extends: 'chord-card' }))
    expect(d.bars?.shading).toBeUndefined()
    expect(d.colour?.mode).toBeUndefined()
    expect(d.flash?.tint).toBeUndefined()
    expect(d.extends).toBeUndefined()
    expect(decodeTemplate(t({ extends: 'chord-cards', bars: { shading: 'flat' } })).extends).toBe('chord-cards')
  })

  it('a palette that is not exactly 12 hex colours is dropped (CRF applies)', () => {
    const bad = [pal12.slice(0, 11), [...pal12, '#000000'], [...pal12.slice(0, 11), 'red'], [...pal12.slice(0, 11), 'url(x)']]
    for (const palette of bad) expect(decodeTemplate(t({ colour: { palette } })).colour?.palette).toBeUndefined()
    const mixed = [...pal12.slice(0, 11), '#abc']
    expect(decodeTemplate(t({ colour: { palette: mixed } })).colour?.palette).toEqual(mixed)
  })

  it('labels: font family through isSafeFontFamily, weight 100-900 to the nearest 100, scale 0.5-1.5, strokeWidth 0-8', () => {
    const d = decodeTemplate(t({
      labels: { font: { family: "Nunito'; x", weight: 651, scale: 3, strokeWidth: 20, color: 'nope', case: 'title' }, format: 'solfege', accidentals: 'ascii', show: false },
    }))
    expect(d.labels).toEqual({ show: false, format: 'solfege', accidentals: 'ascii', font: { weight: 700, scale: 1.5, strokeWidth: 8 } })
    expect(validBarLabelStyle({ font: { family: 'Nunito', case: 'upper', weight: 20 } })).toEqual({ font: { family: 'Nunito', case: 'upper', weight: 100 } })
    expect(validBarLabelStyle('x')).toEqual({})
  })

  it('chrome keeps only colour strings, at most 32 keys', () => {
    expect(decodeTemplate(t({ chrome: { bg: '#000', bad: 'url(x)', n: 3 } })).chrome).toEqual({ bg: '#000' })
    const many: Record<string, string> = {}
    for (let i = 0; i < 50; i++) many[`k${i}`] = '#fff'
    expect(Object.keys(decodeTemplate(t({ chrome: many })).chrome ?? {})).toHaveLength(32)
  })
})

describe('validTemplateRef', () => {
  it('passes built-in ids, decodes objects, and gives undefined for anything else', () => {
    expect(validTemplateRef('chord-cards-crf')).toBe('chord-cards-crf')
    expect(validTemplateRef('nope')).toBeUndefined()
    expect(validTemplateRef(3)).toBeUndefined()
    expect(validTemplateRef(t({ kind: 'look' }))).toBeUndefined()
    const input = t({ stage: { bg: '#000' } })
    const out = validTemplateRef(input)
    expect(out).toEqual(decodeTemplate(input))
    expect(out).not.toBe(input)
  })
})
