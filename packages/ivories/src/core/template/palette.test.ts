import { describe, it, expect } from 'vitest'
import { CRF_PITCH_PALETTE } from './palette'

describe('CRF_PITCH_PALETTE', () => {
  it('pins the 12 CRF colours in pitch-class order', () => {
    expect([...CRF_PITCH_PALETTE]).toEqual([
      '#f86e6e', '#f58841', '#ffbc57', '#b8a334', '#fff56d', '#b3f888',
      '#93d154', '#6bc6a0', '#7ee8df', '#88a7f8', '#cc97e8', '#e277b1',
    ])
    expect(Object.isFrozen(CRF_PITCH_PALETTE)).toBe(true)
  })
})
