// The user-facing message for anything a StorageProvider/ShareProvider call,
// or a scene/look decode, threw. PlatformError messages (including the §8.5
// "made with a newer version" PayloadVersionError) are already written for
// the user, so they are shown as they are.

import { isPlatformError } from 'ivories/core'
import { isPayloadVersionError } from 'ivories/core'

export function saveErrorMessage(e: unknown, fallback: string): string {
  if (isPayloadVersionError(e) || isPlatformError(e)) return e.message
  if (e instanceof Error && e.message) return `${fallback}: ${e.message}`
  return fallback
}
