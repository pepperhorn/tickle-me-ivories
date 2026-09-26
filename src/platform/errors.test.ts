import { describe, it, expect } from 'vitest'
import { PlatformError, isPlatformError } from './errors'
import type { PlatformErrorCode } from './errors'

describe('PlatformError', () => {
  it('carries code, message and an optional retryAfterSec', () => {
    const e = new PlatformError('rate_limited', 'slow down', 30)
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('rate_limited')
    expect(e.message).toBe('slow down')
    expect(e.retryAfterSec).toBe(30)
    expect(e.name).toBe('PlatformError')
  })

  it('leaves retryAfterSec undefined when omitted', () => {
    const e = new PlatformError('invalid', 'nope')
    expect(e.retryAfterSec).toBeUndefined()
  })
})

describe('isPlatformError', () => {
  it('accepts a real PlatformError', () => {
    expect(isPlatformError(new PlatformError('not_found', 'gone'))).toBe(true)
  })

  it('accepts a duck-typed error from a different module graph (preflight F11)', () => {
    // A plugin loaded via dynamic import compiles against its own copy of
    // this class (spec §4: the plugin imports tickle's types, not its
    // runtime), so `instanceof PlatformError` is false for its errors even
    // though the shape is identical. isPlatformError must accept it anyway.
    class OtherPlatformError extends Error {
      code: PlatformErrorCode
      constructor(code: PlatformErrorCode, message: string) {
        super(message)
        this.code = code
      }
    }
    const e = new OtherPlatformError('forbidden', 'nope')
    expect(e instanceof PlatformError).toBe(false)
    expect(isPlatformError(e)).toBe(true)
  })

  it('rejects a plain Error, non-error values, and an unknown code', () => {
    expect(isPlatformError(new Error('boom'))).toBe(false)
    expect(isPlatformError('boom')).toBe(false)
    expect(isPlatformError(null)).toBe(false)
    expect(isPlatformError(undefined)).toBe(false)
    expect(isPlatformError({ code: 'not_a_real_code', message: 'x' })).toBe(false)
  })
})
