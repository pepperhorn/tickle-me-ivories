import { describe, it, expect } from 'vitest'
import { noteFill, barGradient, flashRgb } from './noteStyle'
import { noteColor, DEFAULT_SCHEME } from './colors'
import { DEFAULT_THEME } from './theme'
import { state } from './pianoRoll.test-helpers'
import { resolveTemplate } from '../template/resolve'
import type { RenderState } from './pianoRoll'

const crf = (): RenderState => ({ ...state([]), template: resolveTemplate('chord-cards-crf') })

describe('noteStyle', () => {
  it("no template: noteFill is today's noteColor and bars keep the gradient", () => {
    const s = state([])
    expect(noteFill(s, 207, 60, 90)).toBe(noteColor(207, 90, s.velocity))
    expect(barGradient(s)).toBe(true)
  })

  it('pitch mode: the CRF colour by pitch class, flat, whatever the velocity', () => {
    const s = crf()
    expect(noteFill(s, 207, 60, 20)).toBe('#f86e6e')
    expect(noteFill(s, 28, 72, 120)).toBe('#f86e6e')
    expect(noteFill(s, 207, 66, 90)).toBe('#93d154')
    expect(barGradient(s)).toBe(false)
  })

  it("hand + flat: one colour, the velocity scheme's at that velocity", () => {
    const tpl = { ...resolveTemplate('classic'), bars: { ...resolveTemplate('classic').bars, shading: 'flat' as const } }
    const s: RenderState = { ...state([]), template: tpl }
    expect(noteFill(s, 207, 60, 90)).toBe(noteColor(207, 90, DEFAULT_SCHEME))
    expect(barGradient(s)).toBe(false)
  })

  it('flashRgb', () => {
    expect(flashRgb(state([]), 207, 60, 90)).toEqual({ core: DEFAULT_THEME.flashCoreRgb, warm: DEFAULT_THEME.flashWarmRgb })
    expect(flashRgb(crf(), 207, 60, 90)).toEqual({ core: '252, 183, 183', warm: '248, 110, 110' })
  })

  it('hand + note tint: warm is the note colour, core is it mixed 50% with white', () => {
    const base = resolveTemplate('classic')
    const s: RenderState = { ...state([]), template: { ...base, flash: { tint: 'note' } } }
    const f = flashRgb(s, 0, 60, 64)
    const [r, g, b] = f.warm.split(', ').map(Number)
    expect(f.core).toBe(`${Math.round((r + 255) / 2)}, ${Math.round((g + 255) / 2)}, ${Math.round((b + 255) / 2)}`)
  })
})
