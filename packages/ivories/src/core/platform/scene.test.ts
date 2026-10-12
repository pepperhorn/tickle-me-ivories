import { describe, it, expect } from 'vitest'
import {
  MAX_NAME_CHARS, MAX_SCENE_BYTES, MAX_SCENE_VOICES, decodeScene, sceneApplyPlan, sceneFromState, songKey,
} from './scene'
import type { SceneV1, SongRefWithTitle } from './scene'
import { PayloadVersionError } from './codec'
import { isPlatformError } from './errors'
import { buildProfile } from '../settings/profile'
import { DEFAULT_SETTINGS } from '../settings/types'
import type { Voice } from '../model/types'

const SHA = 'b'.repeat(64)
const voice = (id: string, patch: Partial<Voice> = {}): Voice => ({
  id, label: id, hue: 200, instrument: 'acoustic_grand_piano',
  visible: true, audible: true, volume: 1, ...patch,
})
const song = (): SongRefWithTitle => ({ kind: 'local', sha256: SHA, name: 'demo.mid', format: 'midi', title: 'Demo' })
const profile = (id = SHA) => buildProfile({
  song: { id, name: 'demo.mid', format: 'midi' },
  voices: [voice('l', { hue: 300, label: 'Bass' })],
  tempo: { mode: 'scale', scale: 0.75 },
  mode: 'roll',
  fallSeconds: 4.5,
  settings: {
    ...DEFAULT_SETTINGS,
    audio: { masterVolume: 0.1, metronome: true, metronomeVolume: 0.2 },
    text: { ...DEFAULT_SETTINGS.text, keyOverride: 'Eb major' },
  },
})
const scene = (): SceneV1 => sceneFromState({ song: song(), profile: profile() })
const raw = (): Record<string, any> => JSON.parse(JSON.stringify(scene()))
const caught = (f: () => unknown): unknown => { try { f() } catch (e) { return e } return undefined }
const isCode = (e: unknown, code: string) => isPlatformError(e) && e.code === code

describe('sceneFromState', () => {
  it('builds a v1 scene that satisfies the songKey invariant', () => {
    const s = scene()
    expect(s).toMatchObject({ v: 1, kind: 'scene', song: song() })
    expect(s.profile.song.id).toBe(songKey(s.song))
  })

  it('throws when the profile belongs to a different song', () => {
    expect(() => sceneFromState({ song: song(), profile: profile('c'.repeat(64)) })).toThrow(/song/i)
  })

  it('clips over-long names so its own output always decodes', () => {
    const long = 'n'.repeat(300)
    const p = profile()
    p.voices[0].label = long
    p.song.name = long
    const s = sceneFromState({ song: { kind: 'local', sha256: SHA, format: 'midi', title: long, name: long }, profile: p })
    expect(s.song.title).toHaveLength(MAX_NAME_CHARS)
    expect(s.profile.voices[0].label).toHaveLength(MAX_NAME_CHARS)
    expect(() => decodeScene(JSON.parse(JSON.stringify(s)))).not.toThrow()
  })

  it('does not alias its inputs', () => {
    const p = profile()
    const s = sceneFromState({ song: song(), profile: p })
    p.voices[0].hue = 1
    expect(s.profile.voices[0].hue).toBe(300)
  })
})

describe('decodeScene', () => {
  it('round-trips through JSON, as an object or a string', () => {
    expect(decodeScene(raw())).toEqual(scene())
    expect(decodeScene(JSON.stringify(scene()))).toEqual(scene())
  })

  it('round-trips an opensongs scene', () => {
    const os: SongRefWithTitle = { kind: 'opensongs', id: 'fur-elise', ref: 'v1.0.0', title: 'Für Elise' }
    const s = sceneFromState({ song: os, profile: profile(songKey(os)) })
    expect(decodeScene(JSON.parse(JSON.stringify(s)))).toEqual(s)
  })

  it('refuses an unknown v with a distinct "newer version" error', () => {
    const e = caught(() => decodeScene({ ...raw(), v: 2 }))
    expect(e).toBeInstanceOf(PayloadVersionError)
    expect((e as Error).message).toMatch(/newer version/i)
  })

  it('refuses a non-integer v, wrong kind or non-object as invalid', () => {
    for (const bad of [{ ...raw(), v: 0 }, { ...raw(), v: 1.5 }, { ...raw(), kind: 'look' }, null, [], '{'])
      expect(isCode(caught(() => decodeScene(bad)), 'invalid')).toBe(true)
  })

  it('refuses a songKey mismatch', () => {
    const s = raw(); s.profile.song.id = 'c'.repeat(64)
    const e = caught(() => decodeScene(s))
    expect(isCode(e, 'invalid')).toBe(true)
    expect((e as Error).message).toMatch(/song/i)
  })

  it('refuses a bad song ref or a missing/over-long title', () => {
    for (const edit of [
      (s: any) => { s.song.kind = 'youtube' },
      (s: any) => { s.song.sha256 = 'zz' },
      (s: any) => { delete s.song.title },
      (s: any) => { s.song.title = 't'.repeat(MAX_NAME_CHARS + 1) },
      (s: any) => { s.profile.song.name = 'n'.repeat(MAX_NAME_CHARS + 1) },
    ]) {
      const s = raw(); edit(s)
      expect(isCode(caught(() => decodeScene(s)), 'invalid')).toBe(true)
    }
  })

  it('refuses more than 64 voices or a voice label over 128 characters', () => {
    expect(MAX_SCENE_VOICES).toBe(64)
    const many = raw()
    many.profile.voices = Array.from({ length: 65 }, (_, i) => ({ id: `v${i}` }))
    expect(isCode(caught(() => decodeScene(many)), 'invalid')).toBe(true)
    many.profile.voices.pop()
    expect(decodeScene(many).profile.voices).toHaveLength(64)

    const label = raw(); label.profile.voices[0].label = 'x'.repeat(MAX_NAME_CHARS + 1)
    expect(isCode(caught(() => decodeScene(label)), 'invalid')).toBe(true)
  })

  it('refuses a payload over 256 KiB before decoding it', () => {
    expect(MAX_SCENE_BYTES).toBe(256 * 1024)
    const big = { ...raw(), padding: 'x'.repeat(MAX_SCENE_BYTES) }
    expect(isCode(caught(() => decodeScene(big)), 'too_large')).toBe(true)
    expect(isCode(caught(() => decodeScene(JSON.stringify(big))), 'too_large')).toBe(true)
  })

  it('counts UTF-8 bytes, not UTF-16 code units, against the cap', () => {
    const s = raw(); s.padding = 'é'.repeat(MAX_SCENE_BYTES / 2)  // 2 bytes each
    expect(isCode(caught(() => decodeScene(s)), 'too_large')).toBe(true)
  })

  it('wraps a profile decode failure as invalid, keeping its message', () => {
    const s = raw(); s.profile.global.velocity = { kind: 'rainbow' }
    const e = caught(() => decodeScene(s))
    expect(isCode(e, 'invalid')).toBe(true)
    expect((e as Error).message).toMatch(/velocity/i)
  })

  it('drops unknown keys at every level it owns', () => {
    const s = raw(); s.evil = 1; s.song.evil = 2; s.profile.evil = 3; s.profile.song.evil = 4
    const d = decodeScene(s) as any
    expect(d).not.toHaveProperty('evil')
    expect(d.song).not.toHaveProperty('evil')
    expect(d.profile).not.toHaveProperty('evil')
    expect(d.profile.song).not.toHaveProperty('evil')
  })
})

describe('sceneApplyPlan', () => {
  it('a shared scene never yields global.audio', () => {
    const plan = sceneApplyPlan(decodeScene(raw()), { shared: true })
    expect(plan.audio).toBeNull()
    expect(plan.settings).not.toHaveProperty('audio')
  })

  it("an own scene carries the saved device audio", () => {
    expect(sceneApplyPlan(scene(), { shared: false }).audio)
      .toEqual({ masterVolume: 0.1, metronome: true, metronomeVolume: 0.2 })
  })

  it('applies velocity (part of the look), theme, text with keyOverride, display, voices, tempo, mode, fall', () => {
    const s = scene()
    const plan = sceneApplyPlan(s, { shared: true })
    expect(plan.settings.velocity).toEqual(s.profile.global.velocity)
    expect(plan.settings.theme).toEqual(s.profile.theme)
    expect(plan.settings.text.keyOverride).toBe('Eb major')
    expect(plan.settings.display).toEqual(s.profile.display.settings)
    expect(plan.voices).toEqual(s.profile.voices)
    expect(plan.tempo).toEqual({ mode: 'scale', scale: 0.75 })
    expect(plan.mode).toBe('roll')
    expect(plan.fallSeconds).toBe(4.5)
  })

  it('omits display settings when the profile has none', () => {
    const s = scene(); delete s.profile.display.settings
    expect(sceneApplyPlan(s, { shared: false }).settings).not.toHaveProperty('display')
  })

  it('returns copies, not the scene itself', () => {
    const s = scene()
    const plan = sceneApplyPlan(s, { shared: false })
    plan.voices[0].hue = 1
    plan.settings.theme.name = 'outline'
    expect(s.profile.voices[0].hue).toBe(300)
    expect(s.profile.theme.name).toBe('classic')
  })
})
