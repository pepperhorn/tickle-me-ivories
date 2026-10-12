// The user-facing message for anything a StorageProvider/ShareProvider call,
// or a scene/look decode, threw. PlatformError messages (including the §8.5
// "made with a newer version" PayloadVersionError) are already written for
// the user, so they are shown as they are.

import { isPlatformError } from '../platform/errors'
import { isPayloadVersionError } from '../platform/codec'

export function saveErrorMessage(e: unknown, fallback: string): string {
  if (isPayloadVersionError(e) || isPlatformError(e)) return e.message
  if (e instanceof Error && e.message) return `${fallback}: ${e.message}`
  return fallback
}
