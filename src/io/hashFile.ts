import { sha256 } from '@noble/hashes/sha2.js'

/**
 * SHA-256 hex digest of bytes. Uses the native Web Crypto API
 * (crypto.subtle) when it exists; otherwise falls back to a pure-JS
 * implementation (@noble/hashes, audited, no CDN, bundled). crypto.subtle
 * is undefined in an insecure context -- e.g. a LAN or Tailscale http://
 * dev server opened from a phone -- so a MIDI file loaded that way must
 * still hash successfully.
 *
 * Both paths MUST produce byte-identical lowercase hex: this hash is the
 * ScoreDocument id and the `local`/`midi` SongRef sha256, so an existing
 * autosave's songKey must not change depending on how the page was served.
 */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const subtle = globalThis.crypto?.subtle
  // `view` is never backed by a SharedArrayBuffer here (it comes from
  // File.arrayBuffer() or a plain Uint8Array), so this narrows safely.
  const digest = subtle
    ? new Uint8Array(await subtle.digest('SHA-256', view as Uint8Array<ArrayBuffer>))
    : sha256(view)
  return Array.from(digest)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Content hash of a loaded file. Used in plan 2 as the per-song profile key. */
export async function hashFile(bytes: ArrayBuffer): Promise<string> {
  return sha256Hex(bytes)
}
