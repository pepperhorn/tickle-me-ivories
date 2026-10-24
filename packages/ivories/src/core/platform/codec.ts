// Shared envelope handling for the scene and look codecs (spec §8.5, §9.1).
// Pure: no DOM, no storage, no CompressionStream (that is HashShareProvider's,
// task 2.4). Every untrusted payload -- a share, a hash link, an imported or
// locally stored save -- enters through readEnvelope before any field is read.
//
// Failure contract (preflight F17, codec side): the decoders THROW, matching
// spec §2 `TickleHost.decodeScene(u): SceneV2 // throws`. A caller that wants
// null-on-corrupt (LocalStorageProvider.load, mirroring loadProfile) catches.
// What is thrown is always a PlatformError, so isPlatformError(e) holds:
//   - 'too_large': the serialized payload is over the kind's cap;
//   - 'invalid':   anything structurally wrong;
//   - PayloadVersionError (code 'invalid' too, but distinguishable with
//     isPayloadVersionError): `v` is a higher integer than this app reads,
//     i.e. the payload was made with a newer version (§8.5).

import { PlatformError } from './errors'

type Obj = Record<string, unknown>
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The default (look) payload envelope version; scenes pass their own maxVersion. */
export const PAYLOAD_VERSION = 1

/** What a payload envelope can be. */
export type PayloadKind = 'scene' | 'look' | 'ivories-template'

/** The word the messages use for a kind. */
const noun = (kind: PayloadKind): string => (kind === 'ivories-template' ? 'template' : kind)

export class PayloadVersionError extends PlatformError {
  readonly version: number

  constructor(kind: PayloadKind, version: number) {
    super('invalid', `This ${noun(kind)} was made with a newer version of the app (format v${version}). Update the app to open it.`)
    this.name = 'PayloadVersionError'
    this.version = version
  }
}

/** Duck-typed, like isPlatformError, so it survives a second copy of this module. */
export function isPayloadVersionError(e: unknown): e is PayloadVersionError {
  return e instanceof Error && e.name === 'PayloadVersionError'
}

/** UTF-8 byte length of a string (what the §8.5 caps measure). */
export function utf8Bytes(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1)
      if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i++ } else n += 3
    } else n += 3
  }
  return n
}

/** The 'invalid' PlatformError every structural refusal uses. */
export function invalidPayload(kind: PayloadKind, why: string): PlatformError {
  return new PlatformError('invalid', `This ${noun(kind)} is not valid: ${why}.`)
}
const invalid = invalidPayload

/**
 * Accepts a payload either as its serialized JSON string or as an already
 * parsed value, enforces the serialized size cap BEFORE decoding anything, and
 * returns a fresh plain-data copy with `v` and `kind` checked. Working on a
 * JSON round-tripped copy means no getter, prototype or shared reference from
 * the caller's object can reach the field validators.
 */
export function readEnvelope(u: unknown, kind: PayloadKind, maxBytes: number, maxVersion = PAYLOAD_VERSION): Obj {
  let json: string | undefined
  if (typeof u === 'string') {
    json = u
  } else {
    try { json = JSON.stringify(u) } catch { throw invalid(kind, 'it cannot be serialized') }
    if (json === undefined) throw invalid(kind, 'it is empty')
  }
  if (utf8Bytes(json) > maxBytes) {
    throw new PlatformError('too_large', `This ${noun(kind)} is too large (over ${Math.round(maxBytes / 1024)} KiB).`)
  }
  let o: unknown
  try { o = JSON.parse(json) } catch { throw invalid(kind, 'it is not JSON') }
  if (!isObj(o)) throw invalid(kind, 'it is not an object')
  const v = o.v
  const known = typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= maxVersion
  if (!known) {
    if (typeof v === 'number' && Number.isInteger(v) && v > maxVersion) throw new PayloadVersionError(kind, v)
    throw invalid(kind, 'unknown format version')
  }
  if (o.kind !== kind) throw invalid(kind, `expected a ${noun(kind)}`)
  return o
}
