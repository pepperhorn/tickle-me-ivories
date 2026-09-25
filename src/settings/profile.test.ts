import { describe, it, expect, beforeEach } from 'vitest'
import {
  PROFILE_SCHEMA_VERSION, buildProfile, decodeProfile, encodeProfile,
  loadGlobals, loadProfile, mergeVoices, saveGlobals, saveProfile,
} from './profile'
import { DEFAULT_SETTINGS } from './types'
import { MAX_TEMPO_SCALE, MIN_TEMPO_SCALE } from '../model/tempoMap'
import type { Voice } from '../model/types'

const voice = (id: string, patch: Partial<Voice> = {}): Voice => ({
  id, label: id, hue: 200, instrument: 'acoustic_grand_piano',
  visible: true, audible: true, volume: 1, ...patch,
})

const profile = () => buildProfile({
  song: { id: 'sha-1', name: 'demo.mid', format: 'midi' },
  voices: [voice('l', { hue: 300, label: 'Bass' })],
  tempo: { mode: 'scale', scale: 0.75 },
  mode: 'keyboard',
  fallSeconds: 4.5,
  settings: DEFAULT_SETTINGS,
})

describe('profile encode/decode', () => {
  it('round-trips every song-scoped field', () => {
    const p = decodeProfile(encodeProfile(profile()))
    expect(p.song.id).toBe('sha-1')
    expect(p.voices[0].hue).toBe(300)
    expect(p.tempo).toEqual({ mode: 'scale', scale: 0.75 })
    expect(p.display).toMatchObject({ mode: 'keyboard', fallSeconds: 4.5 })
  })

  it('round-trips the display settings (zoom, grid, flash, middle C)', () => {
    const display = { zoom: 'full' as const, showGrid: false, showFlash: false, flashScale: 0.4, showMiddleC: false }
    const p = decodeProfile(encodeProfile(buildProfile({
      song: { id: 'sha-1', name: 'demo.mid', format: 'midi' },
      voices: [], tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 3,
      settings: { ...DEFAULT_SETTINGS, display },
    })))
    expect(p.display.settings).toEqual(display)
  })

  it('carries the global block as a separate snapshot', () => {
    const p = decodeProfile(encodeProfile(profile()))
    expect(p.global.velocity).toEqual(DEFAULT_SETTINGS.velocity)
    expect(p.global.audio).toEqual(DEFAULT_SETTINGS.audio)
  })

  it('stamps the current schema version', () => {
    expect(profile().schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
  })

  it('refuses an unknown schema version rather than half-applying it', () => {
    const raw = JSON.stringify({ ...profile(), schemaVersion: 99 })
    expect(() => decodeProfile(raw)).toThrow(/version/i)
  })

  it('refuses malformed JSON', () => {
    expect(() => decodeProfile('{ not json')).toThrow()
  })

  it('refuses an object that is missing its song block', () => {
    expect(() => decodeProfile(JSON.stringify({ schemaVersion: 1 }))).toThrow()
  })

  it('refuses a v1 file missing theme, text or global, and clamps an out-of-range tempo', () => {
    for (const key of ['theme', 'text', 'global'] as const) {
      const raw: Record<string, unknown> = { ...profile() }
      delete raw[key]
      expect(() => decodeProfile(JSON.stringify(raw))).toThrow(/missing/i)
    }
    const zeroScale = decodeProfile(JSON.stringify({ ...profile(), tempo: { mode: 'scale', scale: 0 } }))
    expect(zeroScale.tempo).toEqual({ mode: 'scale', scale: MIN_TEMPO_SCALE })
    const hugeScale = decodeProfile(JSON.stringify({ ...profile(), tempo: { mode: 'scale', scale: 50 } }))
    expect(hugeScale.tempo).toEqual({ mode: 'scale', scale: MAX_TEMPO_SCALE })
    const zeroBpm = decodeProfile(JSON.stringify({ ...profile(), tempo: { mode: 'absolute', bpm: 0 } }))
    expect(zeroBpm.tempo).toEqual({ mode: 'absolute', bpm: 20 })
    const hugeBpm = decodeProfile(JSON.stringify({ ...profile(), tempo: { mode: 'absolute', bpm: 9000 } }))
    expect(hugeBpm.tempo).toEqual({ mode: 'absolute', bpm: 300 })
  })
})

describe('mergeVoices', () => {
  it('adopts the saved fields for voices matched by id', () => {
    const merged = mergeVoices([voice('l'), voice('r')], [voice('r', { hue: 12, label: 'Top', volume: 0.3 })])
    expect(merged[1]).toMatchObject({ id: 'r', hue: 12, label: 'Top', volume: 0.3 })
  })

  it('leaves unmatched parsed voices at their parsed defaults', () => {
    const merged = mergeVoices([voice('l'), voice('r')], [voice('r', { hue: 12 })])
    expect(merged[0].hue).toBe(200)
  })

  it('ignores saved voices that no longer exist in the file', () => {
    const merged = mergeVoices([voice('l')], [voice('ghost', { hue: 9 })])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('l')
  })

  it('never lets a saved profile change a voice id', () => {
    const merged = mergeVoices([voice('l')], [{ ...voice('l'), id: 'tampered' } as Voice])
    expect(merged[0].id).toBe('l')
  })
})

describe('localStorage persistence', () => {
  beforeEach(() => { localStorage.clear() })

  it('saves and reloads a profile by song hash', () => {
    saveProfile(profile())
    expect(loadProfile('sha-1')!.voices[0].label).toBe('Bass')
  })

  it('returns null for a song it has never seen', () => {
    expect(loadProfile('nothing')).toBeNull()
  })

  it('returns null rather than throwing on a corrupt stored value', () => {
    localStorage.setItem('tmi.profile.broken', '{{{')
    expect(loadProfile('broken')).toBeNull()
  })

  it('stores globals under their own key, independent of any song', () => {
    saveGlobals({ velocity: DEFAULT_SETTINGS.velocity, audio: { ...DEFAULT_SETTINGS.audio, masterVolume: 0.2 } })
    expect(loadGlobals()!.audio.masterVolume).toBe(0.2)
    expect(loadProfile('sha-1')).toBeNull()
  })
})
