import { describe, it, expect } from 'vitest'
import {
  velocityLightness, noteColor, flashIntensity,
  hueForVoiceIndex, DEFAULT_COLORS, FLASH_MS,
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
