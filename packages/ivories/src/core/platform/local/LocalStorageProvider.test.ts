import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalStorageProvider } from './LocalStorageProvider'
import { isPayloadVersionError } from '../codec'
import { isPlatformError } from '../errors'
import { buildProfile } from '../../settings/profile'
import { DEFAULT_SETTINGS } from '../../settings/types'
import type { SceneV2, SongRefWithTitle } from '../scene'
import { SCENE_VERSION, defaultLayoutFor, sceneFromState } from '../scene'
import { lookFromSettings } from '../look'
import type { LookV1 } from '../look'
import type { Voice } from '../../model/types'

const SHA = 'b'.repeat(64)
const voice = (id: string, patch: Partial<Voice> = {}): Voice => ({
  id, label: id, hue: 200, instrument: 'acoustic_grand_piano',
  visible: true, audible: true, volume: 1, ...patch,
})
const song = (title = 'Demo'): SongRefWithTitle => ({ kind: 'local', sha256: SHA, name: 'demo.mid', format: 'midi', title })
const profile = (voices: Voice[] = [voice('l')]) => buildProfile({
  song: { id: SHA, name: 'demo.mid', format: 'midi' },
  voices,
  tempo: { mode: 'scale', scale: 1 },
  mode: 'roll',
  fallSeconds: 4,
  settings: DEFAULT_SETTINGS,
})
const scene = (voices: Voice[] = [voice('l')]): SceneV2 => sceneFromState({ song: song(), profile: profile(voices) })
const look = (): LookV1 => lookFromSettings(DEFAULT_SETTINGS, 'keyboard', 3)

describe('LocalStorageProvider', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.restoreAllMocks() })

  it('is a local, non-remote provider', () => {
    const p = new LocalStorageProvider()
    expect(p.id).toBe('local')
    expect(p.remote).toBe(false)
  })

  describe('save / load round trip', () => {
    it('mints an id, persists the scene, and returns a matching summary', async () => {
      const p = new LocalStorageProvider()
      const summary = await p.save({ kind: 'scene', name: 'My Scene', payload: scene() })
      expect(summary.id).toBeTruthy()
      expect(summary.kind).toBe('scene')
      expect(summary.name).toBe('My Scene')
      expect(summary.visibility).toBe('private')
      expect(summary.songTitle).toBe('Demo')
      expect(new Date(summary.updatedAt).toString()).not.toBe('Invalid Date')

      const loaded = await p.load('scene', summary.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.song.title).toBe('Demo')
      expect(loaded!.profile.voices[0].label).toBe('l')
    })

    it('round-trips a look, with no songTitle on the summary', async () => {
      const p = new LocalStorageProvider()
      const summary = await p.save({ kind: 'look', name: 'My Look', payload: look() })
      expect(summary.songTitle).toBeUndefined()
      const loaded = await p.load('look', summary.id)
      expect(loaded).not.toBeNull()
      expect(loaded!.kind).toBe('look')
    })

    it('uses a caller-supplied id to update an existing save in place', async () => {
      const p = new LocalStorageProvider()
      const first = await p.save({ kind: 'scene', name: 'Original', payload: scene() })
      const second = await p.save({ kind: 'scene', id: first.id, name: 'Renamed', payload: scene() })
      expect(second.id).toBe(first.id)
      const list = await p.list('scene')
      expect(list).toHaveLength(1)
      expect(list[0].name).toBe('Renamed')
    })

    it('mints ids that do not collide across two saves', async () => {
      const p = new LocalStorageProvider()
      const a = await p.save({ kind: 'scene', name: 'A', payload: scene() })
      const b = await p.save({ kind: 'scene', name: 'B', payload: scene() })
      expect(a.id).not.toBe(b.id)
    })

    it('keeps scene and look saves in separate lists', async () => {
      const p = new LocalStorageProvider()
      await p.save({ kind: 'scene', name: 'S', payload: scene() })
      await p.save({ kind: 'look', name: 'L', payload: look() })
      expect(await p.list('scene')).toHaveLength(1)
      expect(await p.list('look')).toHaveLength(1)
    })
  })

  describe('load: corrupt and missing entries (F17, mirroring loadProfile)', () => {
    it('returns null for an id it has never seen', async () => {
      const p = new LocalStorageProvider()
      expect(await p.load('scene', 'nope')).toBeNull()
    })

    it('returns null for a corrupt (non-JSON) stored payload', async () => {
      localStorage.setItem('tmi.saves.scene.broken', '{{{')
      const p = new LocalStorageProvider()
      expect(await p.load('scene', 'broken')).toBeNull()
    })

    it('returns null for a payload that fails decodeScene (e.g. invalid song ref)', async () => {
      const bad = { v: 1, kind: 'scene', song: { kind: 'nope' }, profile: {} }
      localStorage.setItem('tmi.saves.scene.bad', JSON.stringify(bad))
      const p = new LocalStorageProvider()
      expect(await p.load('scene', 'bad')).toBeNull()
    })

    it('surfaces (does not null out) a PayloadVersionError: made with a newer app version', async () => {
      const newer = { v: SCENE_VERSION + 1, kind: 'scene', song: song(), profile: profile() }
      localStorage.setItem('tmi.saves.scene.newer', JSON.stringify(newer))
      const p = new LocalStorageProvider()
      await expect(p.load('scene', 'newer')).rejects.toSatisfy(isPayloadVersionError)
    })

    it('upgrades a stored V1 scene to V2 on load (R7)', async () => {
      const v1 = { v: 1, kind: 'scene', song: song(), profile: profile() }
      localStorage.setItem('tmi.saves.scene.old', JSON.stringify(v1))
      const loaded = await new LocalStorageProvider().load('scene', 'old')
      expect(loaded).toMatchObject({ v: 2, layout: defaultLayoutFor('roll'), aspect: 'free' })
    })

    it('keeps camera deviceIds in a local save (only shares drop them)', async () => {
      const s = sceneFromState({
        song: song(), profile: profile(),
        layout: { kind: 'pip', main: { kind: 'ivories', view: 'falling' }, inset: { kind: 'camera', mode: 'webcam', deviceId: 'cam-9', mirror: false, fit: 'contain' }, corner: 'br', size: 0.3, margin: 0.02 },
      })
      const p = new LocalStorageProvider()
      const saved = await p.save({ kind: 'scene', name: 'cam', payload: s })
      expect((await p.load('scene', saved.id))?.layout).toEqual(s.layout)
    })
  })

  describe('save: refuses an oversize scene before writing (controller ruling, 2.3 review)', () => {
    it('throws the PlatformError from decodeScene for a scene with more than 64 voices', async () => {
      const tooMany = Array.from({ length: 70 }, (_, i) => voice(`v${i}`))
      const p = new LocalStorageProvider()
      const attempt = p.save({ kind: 'scene', name: 'Huge', payload: scene(tooMany) })
      await expect(attempt).rejects.toSatisfy(isPlatformError)
      // Nothing should have been written for a save that failed validation.
      expect(await p.list('scene')).toHaveLength(0)
    })
  })

  describe('remove', () => {
    it('deletes the payload and drops it from the index', async () => {
      const p = new LocalStorageProvider()
      const summary = await p.save({ kind: 'scene', name: 'Gone soon', payload: scene() })
      await p.remove('scene', summary.id)
      expect(await p.load('scene', summary.id)).toBeNull()
      expect(await p.list('scene')).toHaveLength(0)
    })

    it('is idempotent for an id that does not exist', async () => {
      const p = new LocalStorageProvider()
      await expect(p.remove('scene', 'never-existed')).resolves.toBeUndefined()
    })
  })

  describe('index shape and self-healing (F17)', () => {
    it('treats a missing index as empty', async () => {
      const p = new LocalStorageProvider()
      expect(await p.list('scene')).toEqual([])
    })

    it('treats a malformed index (wrong shape) as empty rather than throwing', async () => {
      localStorage.setItem('tmi.saves.index', JSON.stringify([1, 2, 3]))
      const p = new LocalStorageProvider()
      expect(await p.list('scene')).toEqual([])
      expect(await p.list('look')).toEqual([])
    })

    it('drops individual bad rows from an otherwise valid index', async () => {
      const good = await new LocalStorageProvider().save({ kind: 'scene', name: 'Good', payload: scene() })
      const idx = JSON.parse(localStorage.getItem('tmi.saves.index')!)
      idx.scene.push({ not: 'a valid summary' })
      idx.scene.push(null)
      localStorage.setItem('tmi.saves.index', JSON.stringify(idx))

      const p = new LocalStorageProvider()
      const list = await p.list('scene')
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(good.id)
    })

    it('self-heals an index entry whose payload key is missing', async () => {
      const p = new LocalStorageProvider()
      const summary = await p.save({ kind: 'scene', name: 'Ghost', payload: scene() })
      // Simulate the payload having been removed some other way, leaving a
      // dangling index row.
      localStorage.removeItem('tmi.saves.scene.' + summary.id)

      expect(await p.list('scene')).toEqual([])

      // The dangling row must actually be gone from the persisted index, not
      // just filtered on the way out, or it would keep reappearing (and
      // shadow a future id collision).
      const idx = JSON.parse(localStorage.getItem('tmi.saves.index')!)
      expect(idx.scene).toEqual([])
    })
  })

  describe('tolerates a throwing localStorage (F6, inherited from profile.ts)', () => {
    it('save resolves with a summary even though nothing could actually be written', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded') })
      const p = new LocalStorageProvider()
      const summary = await p.save({ kind: 'scene', name: 'Doomed', payload: scene() })
      expect(summary.name).toBe('Doomed')
    })

    it('load, list and remove degrade to their empty/null results instead of throwing', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
      const p = new LocalStorageProvider()
      await expect(p.load('scene', 'anything')).resolves.toBeNull()
      await expect(p.list('scene')).resolves.toEqual([])
      await expect(p.remove('scene', 'anything')).resolves.toBeUndefined()
    })
  })
})
