// Platform error type (spec §2). Split into its own module, separate from
// types.ts, per plan task 2.2's file list; types.ts re-exports it.
//
// preflight F1: the spec writes `PlatformError` with parameter properties
// (`constructor(readonly code: …, message, readonly retryAfterSec?)`).
// tsconfig.app.json sets `erasableSyntaxOnly: true`, so parameter properties
// fail `tsc -b` (TS1294) and break `npm run build`. Fields are declared
// explicitly and assigned in the constructor body instead; the spec's shape
// (code, message, retryAfterSec) is unchanged.

export type PlatformErrorCode =
  | 'network' | 'unavailable' | 'unauthorized' | 'forbidden' | 'not_found'
  | 'conflict' | 'rate_limited' | 'too_large' | 'invalid' | 'invalid_code'
  | 'upload_requires_sign_in'

const PLATFORM_ERROR_CODES: readonly PlatformErrorCode[] = [
  'network', 'unavailable', 'unauthorized', 'forbidden', 'not_found',
  'conflict', 'rate_limited', 'too_large', 'invalid', 'invalid_code',
  'upload_requires_sign_in',
]

export class PlatformError extends Error {
  readonly code: PlatformErrorCode
  readonly retryAfterSec: number | undefined

  constructor(code: PlatformErrorCode, message: string, retryAfterSec?: number) {
    super(message)
    this.name = 'PlatformError'
    this.code = code
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * Duck-typed check (preflight F11): a plugin loaded via dynamic `import()`
 * from a separately bundled module compiles against its own `errors.ts` (the
 * plugin imports tickle's *types* only, per spec §4, not its runtime code),
 * so it constructs its own `PlatformError` class object. `instanceof
 * PlatformError` against tickle's class reference is then false for a
 * genuine platform error the plugin throws. The app must use this check —
 * never `instanceof PlatformError` — anywhere a plugin-thrown error might
 * reach.
 */
export function isPlatformError(e: unknown): e is PlatformError {
  if (typeof e !== 'object' || e === null) return false
  const code: unknown = (e as { code?: unknown }).code
  const message: unknown = (e as { message?: unknown }).message
  return typeof message === 'string'
    && typeof code === 'string'
    && PLATFORM_ERROR_CODES.includes(code as PlatformErrorCode)
}
