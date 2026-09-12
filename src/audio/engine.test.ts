import { describe, expect, it } from 'vitest'
import { clampToNow, foldVelocity } from './engine'

describe('clampToNow', () => {
  it('returns now when when is in the past', () => {
    expect(clampToNow(1, 5)).toBe(5)
  })

  it('returns when when it is in the future', () => {
    expect(clampToNow(10, 5)).toBe(10)
  })

  it('returns when when it exactly equals now', () => {
    expect(clampToNow(5, 5)).toBe(5)
  })
})

describe('foldVelocity', () => {
  it('is identity at volume 1', () => {
    expect(foldVelocity(100, 1)).toBe(100)
  })

  it('is 0 at volume 0', () => {
    expect(foldVelocity(100, 0)).toBe(0)
  })

  it('clamps to 127 for an out-of-range volume', () => {
    expect(foldVelocity(100, 2)).toBe(127)
  })
})
