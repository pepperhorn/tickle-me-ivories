const SAFE_NAME = /^[a-z0-9_]+$/

/** Is this a plain lowercase GM instrument name (no path, scheme or case)? Internal: not part of the public surface. */
export function isSafeSoundName(name: string): boolean {
  return SAFE_NAME.test(name)
}
