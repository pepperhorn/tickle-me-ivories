import { describe, it, expect } from 'vitest'
import { primaryOrientation, primarySlot, withPrimaryMode } from './modeSync'
import type { Layout } from 'ivories/core'

const cam = { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' } as const

describe('display mode <-> layout (R7)', () => {
  it('rewrites only the primary falling/keyboard slot', () => {
    const l: Layout = { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: 0.5 }
    expect(primarySlot(l)).toBe('top')
    expect(withPrimaryMode(l, 'keyboard')).toEqual({ ...l, top: { kind: 'ivories', view: 'keyboard' } })
  })

  it('is the same object when nothing changes or no slot shows keys', () => {
    const l: Layout = { kind: 'pip', main: cam, inset: { kind: 'ivories', view: 'notation' }, corner: 'br', size: 0.3, margin: 0.02 }
    expect(primarySlot(l)).toBeNull()
    expect(withPrimaryMode(l, 'roll')).toBe(l)
    const f: Layout = { kind: 'single', main: { kind: 'ivories', view: 'falling' } }
    expect(withPrimaryMode(f, 'roll')).toBe(f)
  })

  it('a rising slot is a roll: the roll toggle keeps it, the keyboard toggle replaces it (R-M)', () => {
    const r: Layout = { kind: 'single', main: { kind: 'ivories', view: 'rising', orientation: 'horizontal' } }
    expect(primarySlot(r)).toBe('main')
    expect(withPrimaryMode(r, 'roll')).toBe(r)
    expect(withPrimaryMode(r, 'keyboard')).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'keyboard' } })
  })

  it('keyboard -> roll gives a plain falling slot', () => {
    const k: Layout = { kind: 'single', main: { kind: 'ivories', view: 'keyboard' } }
    expect(withPrimaryMode(k, 'roll')).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'falling' } })
  })
})

describe('primaryOrientation (CountIn placement)', () => {
  it('a horizontal roll is horizontal', () => {
    const r: Layout = { kind: 'single', main: { kind: 'ivories', view: 'rising', orientation: 'horizontal' } }
    expect(primaryOrientation(r)).toBe('horizontal')
  })

  it('a keyboard slot with a stored horizontal orientation is vertical (it draws vertical)', () => {
    const k = { kind: 'single', main: { kind: 'ivories', view: 'keyboard', orientation: 'horizontal' } } as Layout
    expect(primaryOrientation(k)).toBeUndefined()
  })

  it('no keys slot: undefined', () => {
    expect(primaryOrientation({ kind: 'single', main: cam })).toBeUndefined()
  })
})
