import { describe, it, expect } from 'vitest'
import {
  velocityLightness, noteColor, flashIntensity,
  hueForVoiceIndex, DEFAULT_COLORS, FLASH_MS,
  gradientColor, hexToRgb, DEFAULT_SCHEME,
} from './colors'

describe('velocityLightness', () => {
  it('is lightest at the softest velocity and darkest at the hardest', () => {
    expect(velocityLightness(1, DEFAULT_COLORS)).toBeGreaterThan(70)
    expect(velocityLightness(127, DEFAULT_COLORS)).toBeCloseTo(38, 9)
  })

  it('decreases monotonically across the whole velocity range', () => {
    let prev = Infinity
    for (let v = 0; v <= 127; v++) {
      const l = velocityLightness(v, DEFAULT_COLORS)
      expect(l).toBeLessThanOrEqual(prev)
      prev = l
    }
  })

  it('stays inside the configured endpoints', () => {
    for (let v = 0; v <= 127; v++) {
      const l = velocityLightness(v, DEFAULT_COLORS)
      expect(l).toBeLessThanOrEqual(DEFAULT_COLORS.lMax)
      expect(l).toBeGreaterThanOrEqual(DEFAULT_COLORS.lMin)
    }
  })
})

describe('noteColor', () => {
  it('emits an hsl string carrying the voice hue', () => {
    expect(noteColor(207, 64)).toMatch(/^hsl\(207 85% [\d.]+%\)$/)
  })
})

describe('flashIntensity', () => {
  it('is zero before the note starts', () => {
    expect(flashIntensity(-0.01, 127)).toBe(0)
  })

  it('peaks at onset and reaches zero at FLASH_MS', () => {
    expect(flashIntensity(0, 127)).toBeCloseTo(1, 9)
    expect(flashIntensity(FLASH_MS / 1000, 127)).toBe(0)
    expect(flashIntensity(FLASH_MS / 1000 + 0.1, 127)).toBe(0)
  })

  it('decays monotonically and never goes negative', () => {
    let prev = Infinity
    for (let ms = 0; ms <= 400; ms += 5) {
      const i = flashIntensity(ms / 1000, 100)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThanOrEqual(prev + 1e-12)
      prev = i
    }
  })

  it('scales with velocity but keeps a floor so soft notes still flare', () => {
    expect(flashIntensity(0, 1)).toBeGreaterThan(0.4)
    expect(flashIntensity(0, 1)).toBeLessThan(flashIntensity(0, 127))
  })

  it('is a pure function of age, so scrubbing backwards is correct', () => {
    const a = flashIntensity(0.05, 90)
    flashIntensity(0.2, 90)          // advance
    expect(flashIntensity(0.05, 90)).toBe(a)   // and go back
  })
})

describe('hueForVoiceIndex', () => {
  it('uses the reference hues for the first two voices', () => {
    expect(hueForVoiceIndex(0, 2)).toBe(207)
    expect(hueForVoiceIndex(1, 2)).toBe(28)
  })

  it('spreads additional voices around the wheel without repeating', () => {
    const hues = Array.from({ length: 6 }, (_, i) => hueForVoiceIndex(i, 6))
    expect(new Set(hues).size).toBe(6)
    for (const h of hues) { expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(360) }
  })
})

describe('hexToRgb', () => {
  it('parses six-digit hex', () => {
    expect(hexToRgb('#4a7cff')).toEqual([0x4a, 0x7c, 0xff])
  })

  it('parses three-digit hex by doubling each nibble', () => {
    expect(hexToRgb('#0f8')).toEqual([0, 255, 0x88])
  })

  it('falls back to mid grey rather than NaN on junk', () => {
    expect(hexToRgb('not a colour')).toEqual([128, 128, 128])
  })
})

describe('gradientColor', () => {
  const stops = [
    { at: 0, color: '#000000' },
    { at: 0.5, color: '#ff0000' },
    { at: 1, color: '#ffffff' },
  ]

  it('returns a stop colour exactly at that stop', () => {
    expect(gradientColor(0, stops)).toBe('rgb(0, 0, 0)')
    expect(gradientColor(127, stops)).toBe('rgb(255, 255, 255)')
  })

  it('interpolates linearly between two stops', () => {
    // velocity 31.75 is a quarter of the way = halfway between stop 0 and stop 1
    expect(gradientColor(127 * 0.25, stops)).toBe('rgb(128, 0, 0)')
  })

  it('clamps velocity outside 0-127 to the end stops', () => {
    expect(gradientColor(-50, stops)).toBe('rgb(0, 0, 0)')
    expect(gradientColor(999, stops)).toBe('rgb(255, 255, 255)')
  })

  it('sorts unsorted stops rather than producing nonsense', () => {
    const jumbled = [{ at: 1, color: '#ffffff' }, { at: 0, color: '#000000' }]
    expect(gradientColor(0, jumbled)).toBe('rgb(0, 0, 0)')
    expect(gradientColor(127, jumbled)).toBe('rgb(255, 255, 255)')
  })

  it('survives an empty or single-stop list', () => {
    expect(() => gradientColor(64, [])).not.toThrow()
    expect(gradientColor(64, [{ at: 0.3, color: '#123456' }])).toBe('rgb(18, 52, 86)')
  })

  it('picks up an edited stop colour from a freshly-built stops array (cache invalidation)', () => {
    // The store never mutates scheme.stops in place -- an edit always replaces
    // the array (see VelocityEditor), so a new array identity with the same
    // shape but a different colour must produce the new colour, not a value
    // cached under the previous array.
    const original = [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }]
    expect(gradientColor(0, original)).toBe('rgb(0, 0, 0)')

    const edited = original.map((s, i) => (i === 0 ? { ...s, color: '#ff0000' } : s))
    expect(gradientColor(0, edited)).toBe('rgb(255, 0, 0)')
    // The original array's cached parse is untouched by the edit.
    expect(gradientColor(0, original)).toBe('rgb(0, 0, 0)')
  })
})

describe('noteColor scheme dispatch', () => {
  it('uses the voice hue in lightness mode', () => {
    expect(noteColor(207, 100, DEFAULT_SCHEME)).toContain('hsl(207')
  })

  it('ignores the voice hue in gradient mode, by design', () => {
    const scheme = { kind: 'gradient' as const, stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }] }
    expect(noteColor(207, 127, scheme)).toBe(noteColor(28, 127, scheme))
  })

  it('stays monotonic in gradient mode across the whole velocity range', () => {
    const scheme = { kind: 'gradient' as const, stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }] }
    let prev = -1
    for (let v = 0; v <= 127; v++) {
      const m = /rgb\((\d+)/.exec(noteColor(0, v, scheme))!
      expect(Number(m[1])).toBeGreaterThanOrEqual(prev)
      prev = Number(m[1])
    }
  })
})
