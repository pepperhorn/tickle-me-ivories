import { describe, it, expect } from 'vitest'
import { resolveSettings } from './resolve'
import { lookFromSettings } from '../platform/look'
import { DEFAULT_SETTINGS } from './types'

const withTpl = { ...DEFAULT_SETTINGS, theme: { name: 'classic' as const, stageBgOverride: null, template: 'chord-cards' as const } }

describe('resolveSettings and the template', () => {
  it('the template prop lands in theme.template', () => {
    expect(resolveSettings({ template: 'classic-crf' }).theme.template).toBe('classic-crf')
  })

  it('template beats theme when both are given', () => {
    expect(resolveSettings({ theme: 'contrast', template: 'chord-cards' }).theme)
      .toEqual({ name: 'contrast', stageBgOverride: null, template: 'chord-cards' })
  })

  it('an explicit theme prop clears a template from a look or settings', () => {
    const look = lookFromSettings(withTpl, 'roll', 3)
    expect(resolveSettings({ look, theme: 'contrast' }).theme).toEqual({ name: 'contrast', stageBgOverride: null })
    expect(resolveSettings({ look, theme: 'contrast' }).theme).not.toHaveProperty('template')
    const r = resolveSettings({ settings: { theme: withTpl.theme }, theme: 'contrast' })
    expect(r.theme).not.toHaveProperty('template')
    expect(r.theme.name).toBe('contrast')
  })

  it("a look's template applies when no prop overrides it", () => {
    const look = lookFromSettings(withTpl, 'roll', 3)
    expect(resolveSettings({ look }).theme.template).toBe('chord-cards')
  })
})
