import { describe, it, expect } from 'vitest'
import { applyLabels } from './labels'
import { DEFAULT_SETTINGS } from '../../core/settings/types'

describe('labels prop (R10)', () => {
  const text = DEFAULT_SETTINGS.text
  it('booleans map to pitch names and chord symbols, or off', () => {
    expect(applyLabels(text, { noteNames: true, chords: true })).toMatchObject({ labels: 'pitch', chord: 'symbol' })
    expect(applyLabels({ ...text, labels: 'midi', chord: 'both' }, { noteNames: false, chords: false }))
      .toMatchObject({ labels: 'off', chord: 'off' })
  })
  it('explicit modes pass through and absent keys keep the settings', () => {
    expect(applyLabels(text, { noteNames: 'both' })).toMatchObject({ labels: 'both', chord: text.chord })
    expect(applyLabels(text, undefined)).toBe(text)
  })
})
