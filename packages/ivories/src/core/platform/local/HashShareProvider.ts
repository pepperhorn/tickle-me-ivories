// The offline default ShareProvider (spec §2 "Offline defaults" table,
// §8.2-§8.4). Encodes the whole payload into the URL fragment, so it needs no
// server: `share()` returns `${origin}/#share=<base64url(deflate-raw(JSON))>`.
//
// `resolve` returns the decompressed payload as `unknown` -- ALWAYS untrusted
// (spec §2's ResolvedShare comment). It does not call decodeScene/decodeLook
// itself: the host decodes it after resolve() returns, same as any other
// ShareProvider's resolve. This provider only needs to know enough about the
// shape to route on `kind`.
//
// Only `origin` is threaded in (not the whole TickleHost): resolve() never
// decodes, and the URL shape needs nothing else.

import type { LookV1, SceneV1, ShareProvider, ShareResult, ResolvedShare } from '../types'
import { PlatformError } from '../errors'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Spec §8.5/§2: the encoded blob (what actually goes in the URL) is capped
    at 8 KiB, measured on the encoded string itself. */
export const MAX_SHARE_ENCODED_BYTES = 8 * 1024

/** Preflight F18b: a roughly 8 KiB deflate blob can expand ~1000x. Cap how
    much decompressed data resolve() will ever hold, so a hostile or corrupt
    link cannot be used to exhaust memory. */
const MAX_INFLATED_BYTES = 256 * 1024

const enc = new TextEncoder()
const dec = new TextDecoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad) // throws on invalid base64
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// lib.dom's CompressionStream/DecompressionStream type their `writable` side
// as WritableStream<BufferSource>, which recent TS (the Uint8Array<TArrayBuffer>
// generic) no longer accepts as a ReadableWritablePair<Uint8Array, Uint8Array>
// without help; the runtime shape is exactly right (both accept and emit
// Uint8Array chunks), so this narrows the type back for pipeThrough.
function asBytePair(t: CompressionStream | DecompressionStream): ReadableWritablePair<Uint8Array, Uint8Array> {
  return t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>
}

/**
 * Built from `new ReadableStream({ start(c){ c.enqueue(bytes); c.close() } })`
 * rather than `Blob.stream()` (preflight F18a): jsdom replaces Blob, so a
 * stream built from one does not survive the round trip under vitest.
 */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes); controller.close() },
  }).pipeThrough(asBytePair(new CompressionStream('deflate-raw')))
  return readAll(stream)
}

/** Inflates, aborting once the decompressed total exceeds MAX_INFLATED_BYTES
    (preflight F18b) rather than reading an unbounded stream to the end. */
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes); controller.close() },
  }).pipeThrough(asBytePair(new DecompressionStream('deflate-raw')))
  return readAll(stream, MAX_INFLATED_BYTES)
}

async function readAll(stream: ReadableStream<Uint8Array>, maxBytes?: number): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (maxBytes !== undefined && total > maxBytes) {
        await reader.cancel()
        throw new Error('stream exceeded the size cap')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) { out.set(c, offset); offset += c.length }
  return out
}

/** F20 / controller ruling: the error an uploaded-MIDI scene is refused
    with, shared by share() (before encoding) and resolve() (after decoding
    an untrusted payload) so both refuse the same way with the same message. */
function midiSceneRefusal(): PlatformError {
  return new PlatformError(
    'too_large',
    'A scene with an uploaded MIDI file cannot be shared as a link. Save it and share that instead.',
  )
}

export class HashShareProvider implements ShareProvider {
  readonly id = 'hash'
  readonly supports = { anonymous: true, owned: false, revoke: false, fork: false }
  private readonly origin: string

  // erasableSyntaxOnly forbids parameter properties (preflight F1's rule for
  // PlatformError applies here too), so the field is declared above and
  // assigned explicitly.
  constructor(origin: string) {
    this.origin = origin
  }

  async share(input: { kind: 'scene'; payload: SceneV1 } | { kind: 'look'; payload: LookV1 }): Promise<ShareResult> {
    // F20 / controller ruling: refuse an uploaded-MIDI scene BEFORE encoding
    // -- it can be up to ~171 KiB of base64 on its own, far past the 8 KiB
    // share cap, so there is no point compressing it first.
    if (input.kind === 'scene' && input.payload.song.kind === 'midi') {
      throw midiSceneRefusal()
    }

    const json = JSON.stringify(input.payload)
    const compressed = await deflate(enc.encode(json))
    const blob = bytesToBase64Url(compressed)
    if (blob.length > MAX_SHARE_ENCODED_BYTES) {
      throw new PlatformError(
        'too_large',
        `This ${input.kind} is too large to share as a link (over ${MAX_SHARE_ENCODED_BYTES / 1024} KiB encoded).`,
      )
    }

    return { code: blob, url: `${this.origin}/#share=${blob}`, shortUrl: null }
  }

  // Finding 2 (phase 2 review): the code is capped at the same 8 KiB share()
  // encodes to, checked before it is anything but a matched string -- a
  // hash carrying a far larger "code" is not a link this provider ever
  // produced, and match() should not treat it as one.
  match(loc: { pathname: string; hash: string }): string | null {
    const m = /^#share=([A-Za-z0-9_-]+)$/.exec(loc.hash)
    const code = m ? m[1] : null
    return code && code.length <= MAX_SHARE_ENCODED_BYTES ? code : null
  }

  async resolve(code: string): Promise<ResolvedShare | null> {
    // Same cap, checked again here (before any decode work) so a caller that
    // reaches resolve() without going through match() first -- a plugin, a
    // future caller -- cannot hand a huge string to atob/DecompressionStream.
    if (code.length > MAX_SHARE_ENCODED_BYTES) return null
    let bytes: Uint8Array
    try {
      bytes = base64UrlToBytes(code)
    } catch {
      return null
    }
    let inflated: Uint8Array
    try {
      inflated = await inflate(bytes)
    } catch {
      return null
    }
    let payload: unknown
    try {
      payload = JSON.parse(dec.decode(inflated))
    } catch {
      return null
    }
    if (!isObj(payload) || (payload.kind !== 'scene' && payload.kind !== 'look')) return null

    // Finding 2: an embedded-midi scene is refused the same way share()
    // refuses one going out -- a link this provider itself would never have
    // produced (share() rejects it before encoding), so decoding one here
    // means the payload was hand-crafted or came from elsewhere.
    if (payload.kind === 'scene' && isObj(payload.song) && payload.song.kind === 'midi') {
      throw midiSceneRefusal()
    }

    return {
      code,
      kind: payload.kind,
      payload,
      owner: null,
      visibility: 'link_view',
      isOwner: false,
      canEdit: false,
      canFork: false,
    }
  }
}
