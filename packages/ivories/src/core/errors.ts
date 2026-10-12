export type IvoriesErrorCode =
  | 'score-load' | 'score-parse' | 'audio-unavailable' | 'midi-unavailable'
  | 'camera-unavailable' | 'notation-unavailable' | 'notation-needs-musicxml'
  | 'render-failed'

/** What onError receives (spec §8): { code, message, cause }. Never thrown into the host. */
export class IvoriesError extends Error {
  readonly code: IvoriesErrorCode

  constructor(code: IvoriesErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'IvoriesError'
    this.code = code
  }
}

/** Duck-typed so it survives a second copy of the module. */
export function isIvoriesError(e: unknown): e is IvoriesError {
  return e instanceof Error && e.name === 'IvoriesError' && typeof (e as { code?: unknown }).code === 'string'
}
