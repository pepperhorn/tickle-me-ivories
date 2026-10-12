import { describe, it, expect, beforeEach } from 'vitest'
import { useSettings } from './useSettings'
import { DEFAULT_SETTINGS } from './types'

const get = () => useSettings.getState()

describe('useSettings', () => {
  beforeEach(() => { get().reset() })

  it('starts at the documented defaults', () => {
    expect(get().velocity).toEqual({ kind: 'lightness', lMax: 78, lMin: 38, sat: 85 })
    expect(get().theme.name).toBe('classic')
    expect(get().text.chordWindowMs).toBe(600)
  })

  it('defaults display.zoom to fit, per spec §8 auto-fit on load', () => {
    expect(get().display.zoom).toBe('fit')
  })

  it('patches one display field without disturbing its siblings', () => {
    get().setDisplay({ showGrid: false })
    expect(get().display.showGrid).toBe(false)
    expect(get().display.flashScale).toBe(1)
    expect(get().display.zoom).toBe('fit')
  })

  it('patches the nested text style without replacing the whole text block', () => {
    get().setTextStyle({ family: 'Inter' })
    expect(get().text.style.family).toBe('Inter')
    expect(get().text.style.weight).toBe(600)
    expect(get().text.chord).toBe('off')
  })

  it('replaces a whole velocity scheme rather than merging it', () => {
    get().setVelocity({ kind: 'gradient', stops: [{ at: 0, color: '#000' }] })
    expect(get().velocity).toEqual({ kind: 'gradient', stops: [{ at: 0, color: '#000' }] })
    // A merge would have left lMax behind and produced an impossible union value.
    expect('lMax' in get().velocity).toBe(false)
  })

  it('replaceAll adopts an entire settings object, for profile import', () => {
    get().replaceAll({
      ...DEFAULT_SETTINGS,
      theme: { name: 'transparent', stageBgOverride: '#00b140' },
    })
    expect(get().theme).toEqual({ name: 'transparent', stageBgOverride: '#00b140' })
  })

  it('reset returns every section to defaults', () => {
    get().setDisplay({ showGrid: false })
    get().setAudio({ masterVolume: 0.1 })
    get().reset()
    expect(get().display).toEqual(DEFAULT_SETTINGS.display)
    expect(get().audio).toEqual(DEFAULT_SETTINGS.audio)
  })

  it('does not share mutable default sub-objects with DEFAULT_SETTINGS', () => {
    get().setTextStyle({ family: 'Inter' })
    expect(DEFAULT_SETTINGS.text.style.family).toBe('Poppins')
  })
})
