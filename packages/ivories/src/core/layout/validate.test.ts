import { describe, it, expect } from 'vitest'
import { validAspect, validFill, validLayout } from './validate'

describe('layout validators (untrusted scenes, Review Focus 4)', () => {
  it('accepts transparent, hex and rgb/hsl fills; refuses CSS injection', () => {
    for (const ok of ['transparent', '#0f0', '#00b140', '#00b140ff', 'rgb(0, 177, 64)', 'hsla(140 100% 35% / 1)']) {
      expect(validFill(ok)).toBe(ok)
    }
    for (const bad of ['red;background:url(x)', 'url(x)', 'var(--x)', 'expression(alert(1))', '#12', 42, '']) {
      expect(validFill(bad)).toBeNull()
    }
  })

  it('clamps an out-of-range ratio/size/margin, refuses NaN and unknown kinds', () => {
    const top = { kind: 'ivories', view: 'falling' }
    expect(validLayout({ kind: 'split', top, bottom: top, ratio: 5 })).toMatchObject({ ratio: 0.85 })
    expect(validLayout({ kind: 'split', top, bottom: top, ratio: 'x' })).toBeNull()
    expect(validLayout({ kind: 'pip', main: top, inset: top, corner: 'br', size: 9, margin: -1 })).toMatchObject({ size: 0.5, margin: 0 })
    expect(validLayout({ kind: 'pip', main: top, inset: top, corner: 'middle', size: 0.3, margin: 0 })).toBeNull()
    expect(validLayout({ kind: 'grid', main: top })).toBeNull()
    expect(validLayout({ kind: 'single', main: { kind: 'ivories', view: 'piano' } })).toBeNull()
    expect(validLayout({ kind: 'single', main: { kind: 'camera', mode: 'mask', fill: 'red;x' } })).toBeNull()
  })

  it('drops a deviceId when asked (shares), keeps it otherwise (local saves), and drops unknown keys', () => {
    const cam = { kind: 'camera', mode: 'webcam', deviceId: 'abc', mirror: true, fit: 'cover', evil: 1 }
    expect(validLayout({ kind: 'single', main: cam })).toEqual({ kind: 'single', main: { kind: 'camera', mode: 'webcam', deviceId: 'abc', mirror: true, fit: 'cover' } })
    expect(validLayout({ kind: 'single', main: cam }, { keepDeviceId: false })).toEqual({ kind: 'single', main: { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' } })
  })

  it('aspects', () => {
    expect(validAspect('16:9')).toBe('16:9')
    expect(validAspect('4:3')).toBeNull()
  })

  it('refuses a crafted shared layout with an injected fill and clamps the rest', () => {
    const top = { kind: 'ivories', view: 'falling' }
    const evil = { kind: 'camera', mode: 'mask', fill: 'red;background:url(x)' }
    expect(validLayout({ kind: 'split', top, bottom: evil, ratio: Number.NaN })).toBeNull()
    expect(validLayout({ kind: 'pip', main: top, inset: evil, corner: 'br', size: 0.3, margin: 0 }, { keepDeviceId: false })).toBeNull()
    expect(validLayout({ kind: 'pip', main: top, inset: top, corner: 'br', size: 0.3, margin: 5 })).toMatchObject({ margin: 0.1 })
  })

  it('accepts a rising slot and keeps orientation only on falling/rising, only when valid (R-V)', () => {
    const single = (main: unknown) => validLayout({ kind: 'single', main })
    expect(single({ kind: 'ivories', view: 'rising', orientation: 'horizontal' }))
      .toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising', orientation: 'horizontal' } })
    expect(single({ kind: 'ivories', view: 'falling', orientation: 'vertical' }))
      .toEqual({ kind: 'single', main: { kind: 'ivories', view: 'falling', orientation: 'vertical' } })
    expect(single({ kind: 'ivories', view: 'keyboard', orientation: 'horizontal' }))
      .toEqual({ kind: 'single', main: { kind: 'ivories', view: 'keyboard' } })
    expect(single({ kind: 'ivories', view: 'rising', orientation: 'diagonal;background:url(x)' }))
      .toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising' } })
  })
})
