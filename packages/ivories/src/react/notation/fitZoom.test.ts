import { describe, it, expect } from 'vitest'
import { DEFAULT_FIT, PROBE_ZOOM, nextNotationFit } from './fitZoom'
import type { NotationFit } from './fitZoom'

/** A grand staff whose system is `perZoom` px tall at zoom 1 (pepperscore's default resolving to `def`). */
function settle(perZoom: number, avail: number, def = 1.4, start: NotationFit = DEFAULT_FIT) {
  let fit = start
  const seen: NotationFit[] = []
  for (let i = 0; i < 12; i++) {
    const z = fit.zoom ?? def
    const next = nextNotationFit(fit, perZoom * z, avail)
    if (next === fit) break
    fit = next
    seen.push(fit)
  }
  return { fit, steps: seen.length, height: perZoom * (fit.zoom ?? def) }
}

describe('nextNotationFit (a whole grand staff stays visible)', () => {
  it('leaves pepperscore\'s default alone when the system fits', () => {
    expect(nextNotationFit(DEFAULT_FIT, 120, 150)).toBe(DEFAULT_FIT)
  })

  it('an overflowing default probes an explicit zoom first', () => {
    expect(nextNotationFit(DEFAULT_FIT, 344, 136)).toEqual({ zoom: PROBE_ZOOM, fittedTo: null, ceiling: null })
  })

  it('settles in a few steps with the whole system inside the panel and the panel well used', () => {
    const r = settle(246, 136)
    expect(r.height).toBeLessThanOrEqual(136)
    expect(r.height).toBeGreaterThan(136 * 0.8)
    expect(r.steps).toBeLessThanOrEqual(4)
  })

  it('never grows to a zoom already seen to overflow', () => {
    // At the probe the system fits loosely; growth stops under the default that overflowed.
    const r = settle(60, 136, 3)
    expect(r.fit.zoom).not.toBeNull()
    expect(r.height).toBeLessThanOrEqual(136)
  })

  it('a shrinking panel shrinks the zoom; a much taller one tries the default again', () => {
    const r = settle(246, 136)
    const smaller = nextNotationFit(r.fit, r.height, 100)
    expect(smaller.zoom!).toBeLessThan(r.fit.zoom!)
    expect(nextNotationFit(r.fit, r.height, 136 + 40)).toEqual(DEFAULT_FIT)
  })

  it('ignores nonsense measurements', () => {
    expect(nextNotationFit(DEFAULT_FIT, 0, 100)).toBe(DEFAULT_FIT)
    expect(nextNotationFit(DEFAULT_FIT, 100, 0)).toBe(DEFAULT_FIT)
  })
})
