// The offline default StorageProvider (spec §2 "Offline defaults" table).
//
// Keys: `tmi.saves.<kind>.<id>` hold the payload; `tmi.saves.index` holds the
// two summary lists (preflight F17). Every localStorage access goes through
// the guarded wrappers in settings/profile.ts (preflight F6) -- this file
// never calls `localStorage` itself, so `tmi.saves.*` inherits the same
// throw-tolerance (private mode, quota) as `tmi.profile.*` and `tmi.globals`.
//
// "Every load goes through decode" (spec §2): `load` decodes with
// decodeScene/decodeLook and returns null for a missing or undecodable entry,
// mirroring loadProfile (F17). The one exception is PayloadVersionError: the
// StorageProvider interface types `load` as `Promise<SceneV1 | null>` with no
// documented throw contract (unlike decodeScene/decodeLook, which are typed
// as throwing), so nothing in the type stops it rejecting -- and spec §8.5
// wants a "made with a newer version" message to reach the user rather than
// a silent null. So a PayloadVersionError specifically is rethrown, letting
// the UI (task 2.5) catch it and show that message; every other decode
// failure (corrupt JSON, a plain 'invalid' or 'too_large' PlatformError) is
// swallowed to null, same as loadProfile.
//
// `save` runs the payload through decodeScene/decodeLook BEFORE writing
// anything (controller ruling, 2.3 review): sceneFromState can build a scene
// decodeScene would refuse (over 64 voices, or over 256 KiB), so an oversize
// save must fail visibly here rather than being written and then silently
// loading as null later. The decoded (clean, unknown-keys-dropped) copy is
// what gets persisted, not the caller's raw object.

import type { SaveInput, SaveKind, SaveSummary, StorageProvider } from '../types'
import type { SceneV1 } from '../scene'
import type { LookV1 } from '../look'
import { decodeScene } from '../scene'
import { decodeLook } from '../look'
import { isPayloadVersionError } from '../codec'
import { MAX_NAME_CHARS } from '../songRef'
import { PlatformError } from '../errors'
import { storageGet, storageRemove, storageSet } from '../../settings/profile'

const INDEX_KEY = 'tmi.saves.index'
const payloadKey = (kind: SaveKind, id: string) => `tmi.saves.${kind}.${id}`

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

const VISIBILITIES = ['private', 'link_view', 'link_edit', 'public']

function isSaveSummary(v: unknown): v is SaveSummary {
  if (!isObj(v)) return false
  if (typeof v.id !== 'string' || !v.id) return false
  if (v.kind !== 'scene' && v.kind !== 'look') return false
  if (typeof v.name !== 'string') return false
  if (typeof v.updatedAt !== 'string') return false
  if (typeof v.visibility !== 'string' || !VISIBILITIES.includes(v.visibility)) return false
  if (v.songTitle !== undefined && typeof v.songTitle !== 'string') return false
  return true
}

interface SaveIndex { scene: SaveSummary[]; look: SaveSummary[] }
const EMPTY_INDEX = (): SaveIndex => ({ scene: [], look: [] })

/** Reads the index (F17), dropping any row that is not shaped like a SaveSummary. */
function readIndex(): SaveIndex {
  const raw = storageGet(INDEX_KEY)
  if (!raw) return EMPTY_INDEX()
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return EMPTY_INDEX() }
  if (!isObj(parsed)) return EMPTY_INDEX()
  const scene = Array.isArray(parsed.scene) ? parsed.scene.filter(isSaveSummary) : []
  const look = Array.isArray(parsed.look) ? parsed.look.filter(isSaveSummary) : []
  return { scene, look }
}

function writeIndex(idx: SaveIndex): void {
  storageSet(INDEX_KEY, JSON.stringify(idx))
}

/** Clip to MAX_NAME_CHARS UTF-16 units without leaving half a surrogate pair
    (duplicated from scene.ts's private clipName -- small, pure, not worth a
    shared export for one caller on each side). */
function clipName(s: string): string {
  if (s.length <= MAX_NAME_CHARS) return s
  const cut = s.slice(0, MAX_NAME_CHARS)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/** crypto.randomUUID is undefined in an insecure context, e.g. a LAN
    http:// dev server (preflight F18c). getRandomValues works everywhere, so
    build a UUID v4 by hand when randomUUID is missing. */
function randomId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export class LocalStorageProvider implements StorageProvider {
  readonly id = 'local'
  readonly remote = false

  async list(kind: SaveKind): Promise<SaveSummary[]> {
    const idx = readIndex()
    const rows = idx[kind]
    const kept: SaveSummary[] = []
    let changed = false
    for (const row of rows) {
      if (storageGet(payloadKey(kind, row.id)) === null) { changed = true; continue }
      kept.push(row)
    }
    if (changed) writeIndex({ ...idx, [kind]: kept })
    return kept
  }

  load(kind: 'scene', id: string): Promise<SceneV1 | null>
  load(kind: 'look', id: string): Promise<LookV1 | null>
  async load(kind: SaveKind, id: string): Promise<SceneV1 | LookV1 | null> {
    const raw = storageGet(payloadKey(kind, id))
    if (raw === null) {
      // F17: self-heal an index row whose payload key is missing.
      const idx = readIndex()
      const rows = idx[kind]
      if (rows.some((r) => r.id === id)) {
        writeIndex({ ...idx, [kind]: rows.filter((r) => r.id !== id) })
      }
      return null
    }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { return null }
    try {
      return kind === 'scene' ? decodeScene(parsed) : decodeLook(parsed)
    } catch (e) {
      if (isPayloadVersionError(e)) throw e
      return null
    }
  }

  async save(input: SaveInput): Promise<SaveSummary> {
    const name = clipName(input.name.trim())
    if (!name) throw new PlatformError('invalid', 'A save needs a name.')

    // Throws the resulting PlatformError (or PayloadVersionError) for an
    // oversize or otherwise invalid payload, BEFORE anything is written.
    const decoded = input.kind === 'scene' ? decodeScene(input.payload) : decodeLook(input.payload)

    const id = input.id ?? randomId()
    const summary: SaveSummary = {
      id, kind: input.kind, name, updatedAt: new Date().toISOString(), visibility: 'private',
      ...(input.kind === 'scene' ? { songTitle: (decoded as SceneV1).song.title } : {}),
    }

    storageSet(payloadKey(input.kind, id), JSON.stringify(decoded))

    const idx = readIndex()
    const rows = idx[input.kind].filter((r) => r.id !== id)
    rows.push(summary)
    writeIndex({ ...idx, [input.kind]: rows })

    return summary
  }

  async remove(kind: SaveKind, id: string): Promise<void> {
    storageRemove(payloadKey(kind, id))
    const idx = readIndex()
    writeIndex({ ...idx, [kind]: idx[kind].filter((r) => r.id !== id) })
  }
}
