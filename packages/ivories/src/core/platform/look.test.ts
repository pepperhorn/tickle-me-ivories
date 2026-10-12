import { describe, it, expect } from 'vitest'
import { MAX_LOOK_BYTES, applyLook, decodeLook, lookFromSettings } from './look'
import type { LookV1 } from './look'
import { PayloadVersionError } from './codec'
import { isPlatformError } from './errors'
import { DEFAULT_SETTINGS } from '../settings/types'
import type { Settings } from '../settings/types'

const settings = (): Settings => structuredClone({
  ...DEFAULT_SETTINGS,
  theme: { name: 'contrast', stageBgOverride: '#00b140' },
  text: { ...DEFAULT_SETTINGS.text, keyOverride: 'Eb major', labels: 'pitch' },
  velocity: { kind: 'gradient', stops: [{ at: 0, color: '#000000' }, { at: 1, color: '#ffffff' }] },
})

const look = (): LookV1 => lookFromSettings(settings(), 'roll', 3)
const raw = (): Record<string, any> => JSON.parse(JSON.stringify(look()))

describe('lookFromSettings', () => {
  it('builds a v1 look with no keyOverride and no audio', () => {
    const l = look()
    expect(l).toMatchObject({ v: 1, kind: 'look', display: { mode: 'roll', fallSeconds: 3 } })
    expect(l.text).not.toHaveProperty('keyOverride')
    expect(l).not.toHaveProperty('audio')
    expect(l.theme).toEqual({ name: 'contrast', stageBgOverride: '#00b140' })
  })

  it('does not alias the settings it was built from', () => {
    const s = settings()
    const l = lookFromSettings(s, 'keyboard', 4)
    s.text.style.family = 'Changed'
    expect(l.text.style.family).toBe('Poppins')
  })
})

describe('decodeLook', () => {
  it('round-trips through JSON', () => {
    expect(decodeLook(JSON.parse(JSON.stringify(look())))).toEqual(look())
  })

  it('accepts the serialized string form too', () => {
    expect(decodeLook(JSON.stringify(look()))).toEqual(look())
  })

  it('refuses an unknown v with a distinct "newer version" error', () => {
    const e = (() => { try { decodeLook({ ...raw(), v: 2 }) } catch (x) { return x } })()
    expect(e).toBeInstanceOf(PayloadVersionError)
    expect((e as Error).message).toMatch(/newer version/i)
  })

  it('refuses a non-numeric v or a wrong kind as invalid', () => {
    for (const bad of [{ ...raw(), v: '1' }, { ...raw(), kind: 'scene' }, null, 'nope', []]) {
      const e = (() => { try { decodeLook(bad) } catch (x) { return x } })()
      expect(isPlatformError(e) && e.code === 'invalid').toBe(true)
    }
  })

  it('refuses a payload over 16 KiB before decoding it', () => {
    expect(MAX_LOOK_BYTES).toBe(16 * 1024)
    const big = { ...raw(), padding: 'x'.repeat(MAX_LOOK_BYTES) }
    const e = (() => { try { decodeLook(big) } catch (x) { return x } })()
    expect(isPlatformError(e) && e.code === 'too_large').toBe(true)
    const e2 = (() => { try { decodeLook(JSON.stringify(big)) } catch (x) { return x } })()
    expect(isPlatformError(e2) && e2.code === 'too_large').toBe(true)
  })

  it('refuses a missing or invalid block', () => {
    for (const edit of [
      (l: any) => { delete l.theme },
      (l: any) => { l.theme.name = 'neon' },
      (l: any) => { l.display.mode = 'notation' },
      (l: any) => { l.display.fallSeconds = 'slow' },
      (l: any) => { l.display.settings = {} },
      (l: any) => { l.text.labels = 'solfege' },
      (l: any) => { l.velocity = { kind: 'rainbow' } },
    ]) {
      const l = raw(); edit(l)
      expect(() => decodeLook(l)).toThrow()
    }
  })

  it('drops unknown keys and any keyOverride or audio a look carries', () => {
    const l = raw()
    l.audio = { masterVolume: 1, metronome: true, metronomeVolume: 1 }
    l.text.keyOverride = 'F# major'
    l.evil = '<script>'
    const d = decodeLook(l) as unknown as Record<string, any>
    expect(d).not.toHaveProperty('audio')
    expect(d).not.toHaveProperty('evil')
    expect(d.text).not.toHaveProperty('keyOverride')
  })

  it('clamps the fall time to the slider range', () => {
    const l = raw(); l.display.fallSeconds = 99
    expect(decodeLook(l).display.fallSeconds).toBe(8)
  })

  describe('a malicious look', () => {
    it('cleans bad colours to safe values', () => {
      const l = raw()
      l.theme.stageBgOverride = 'red; background:url(//evil)'
      l.text.style.color = 'url(javascript:1)'
      l.velocity.stops[0].color = '</style><script>'
      // Shape-valid, but past the §8.5 64-character colour cap.
      l.velocity.stops[1].color = 'rgb(' + ' '.repeat(70) + '0,0,0)'
      const d = decodeLook(l)
      expect(d.theme.stageBgOverride).toBeNull()
      expect(d.text.style.color).toBe(DEFAULT_SETTINGS.text.style.color)
      expect(d.velocity).toEqual({ kind: 'gradient', stops: [{ at: 0, color: '#ffffff' }, { at: 1, color: '#ffffff' }] })
    })

    it('falls a quoted font family back to Poppins', () => {
      const l = raw(); l.text.style.family = 'x"; background:url(//evil)'
      expect(decodeLook(l).text.style.family).toBe('Poppins')
    })

    it('refuses 1000 gradient stops', () => {
      const l = raw()
      l.velocity.stops = Array.from({ length: 1000 }, (_, i) => ({ at: i / 999, color: '#fff' }))
      expect(() => decodeLook(l)).toThrow()
    })
  })
})

describe('applyLook', () => {
  it('returns the settings patch plus mode and fall time, never audio or keyOverride', () => {
    const a = applyLook(look())
    expect(a).toEqual({
      theme: settings().theme,
      display: settings().display,
      velocity: settings().velocity,
      text: (({ keyOverride: _k, ...rest }) => rest)(settings().text),
      mode: 'roll',
      fallSeconds: 3,
    })
    expect(a).not.toHaveProperty('audio')
    expect(a.text).not.toHaveProperty('keyOverride')
  })

  it('returns a copy, not the look itself', () => {
    const l = look()
    const a = applyLook(l)
    a.text.style.family = 'Mutated'
    expect(l.text.style.family).toBe('Poppins')
  })
})
