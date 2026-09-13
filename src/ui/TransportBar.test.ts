import { describe, it, expect } from 'vitest'
import { mmss } from './TransportBar'

describe('mmss', () => {
  it('formats seconds as m:ss with a padded seconds field', () => {
    expect(mmss(0)).toBe('0:00')
    expect(mmss(9)).toBe('0:09')
    expect(mmss(61)).toBe('1:01')
    expect(mmss(600)).toBe('10:00')
  })

  it('floors partial seconds rather than rounding up', () => {
    expect(mmss(9.9)).toBe('0:09')
  })

  it('clamps negatives to zero rather than printing a negative time', () => {
    expect(mmss(-5)).toBe('0:00')
  })
})
