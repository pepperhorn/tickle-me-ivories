// The scene codec (spec §8.1, §8.5, §9.1). Pure: no DOM, no storage.
//
// A scene is a song reference plus the full song profile for it. The payload
// types live in ./types (task 2.2a, so types.ts stays runtime-free for the
// plugin's typecheck); this module re-exports them and adds the functions.

import type { SceneV1, SongRefWithTitle } from './types'
import { invalidPayload, isObj, readEnvelope } from './codec'
import { MAX_NAME_CHARS, songKey, validSongRef } from './songRef'
import { decodeProfile } from '../settings/profile'
import type { SavedVoice, SongProfile } from '../settings/profile'
import type { DisplayMode, TempoSetting } from '../model/types'
import type {
  AudioSettings, DisplaySettings, TextSettings, ThemeSettings, VelocityScheme,
} from '../settings/types'

export type { LookV1, SceneV1, SongRef, SongRefWithTitle } from './types'
export { MAX_NAME_CHARS, songKey, validSongRef } from './songRef'

/** Spec §8.5 caps. */
export const MAX_SCENE_BYTES = 256 * 1024
export const MAX_SCENE_VOICES = 64

/** Clip to MAX_NAME_CHARS UTF-16 units without leaving half a surrogate pair. */
function clipName(s: string): string {
  if (s.length <= MAX_NAME_CHARS) return s
  const cut = s.slice(0, MAX_NAME_CHARS)
  const last = cut.charCodeAt(cut.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/**
 * Builds a scene from the current song and a profile made with buildProfile
 * (preflight F10a). Throws if the profile is for a different song (the §8.1
 * invariant) or the ref is not valid. Over-long names are clipped to the
 * §8.5 cap so a scene this app makes always passes its own decodeScene.
 */
export function sceneFromState(a: { song: SongRefWithTitle; profile: SongProfile }): SceneV1 {
  const { title, ...ref } = a.song
  if ('name' in ref) ref.name = clipName(ref.name)
  const clean = validSongRef(ref)
  if (!clean) throw new Error('Cannot build a scene: the song reference is not valid.')
  if (a.profile.song.id !== songKey(clean)) {
    throw new Error('Cannot build a scene: the profile belongs to a different song.')
  }
  const profile = structuredClone(a.profile)
  profile.song.name = clipName(profile.song.name)
  for (const v of profile.voices) if (typeof v.label === 'string') v.label = clipName(v.label)
  return { v: 1, kind: 'scene', song: { ...clean, title: clipName(title) }, profile }
}

/**
 * Decodes an untrusted scene (a parsed value or its JSON string). Throws a
 * PlatformError -- see codec.ts for the contract. The §8.5 caps (size, voice
 * count, name lengths) are checked before the profile is decoded; the
 * profile then goes through the existing decodeProfile, and the songKey
 * invariant is checked last. Unknown keys are dropped at every level.
 */
export function decodeScene(u: unknown): SceneV1 {
  const o = readEnvelope(u, 'scene', MAX_SCENE_BYTES)

  if (!isObj(o.song)) throw invalidPayload('scene', 'missing song')
  const ref = validSongRef(o.song)
  if (!ref) throw invalidPayload('scene', 'invalid song reference')
  const title = o.song.title
  if (typeof title !== 'string' || title.length > MAX_NAME_CHARS) {
    throw invalidPayload('scene', `song title must be text of at most ${MAX_NAME_CHARS} characters`)
  }

  const p = o.profile
  if (!isObj(p)) throw invalidPayload('scene', 'missing profile')
  if (Array.isArray(p.voices)) {
    if (p.voices.length > MAX_SCENE_VOICES) {
      throw invalidPayload('scene', `more than ${MAX_SCENE_VOICES} voices`)
    }
    for (const v of p.voices as unknown[]) {
      if (isObj(v) && typeof v.label === 'string' && v.label.length > MAX_NAME_CHARS) {
        throw invalidPayload('scene', `a voice label is over ${MAX_NAME_CHARS} characters`)
      }
    }
  }
  if (isObj(p.song) && typeof p.song.name === 'string' && p.song.name.length > MAX_NAME_CHARS) {
    throw invalidPayload('scene', `song name is over ${MAX_NAME_CHARS} characters`)
  }

  let profile: SongProfile
  try {
    profile = decodeProfile(JSON.stringify(p))
  } catch (e) {
    throw invalidPayload('scene', (e as Error).message.replace(/\.$/, ''))
  }
  if (profile.song.id !== songKey(ref)) {
    throw invalidPayload('scene', 'its settings belong to a different song')
  }
  return { v: 1, kind: 'scene', song: { ...ref, title }, profile }
}

/**
 * Everything applying a scene changes (preflight F10c), computed up front so
 * the caller can apply it all or nothing. `settings` is the Settings patch;
 * `text` keeps the scene's keyOverride (a scene is song-specific). velocity
 * is always included (it is part of the look, spec §8.1). `audio` is the
 * profile's device audio for an own scene and ALWAYS null for a shared one:
 * a recipient's volume is never someone else's to set.
 */
export interface SceneApplyPlan {
  settings: {
    theme: ThemeSettings
    text: TextSettings
    velocity: VelocityScheme
    display?: DisplaySettings
  }
  voices: SavedVoice[]
  tempo: TempoSetting
  mode: DisplayMode
  fallSeconds: number
  audio: AudioSettings | null
}

export function sceneApplyPlan(s: SceneV1, o: { shared: boolean }): SceneApplyPlan {
  const p = structuredClone(s.profile)
  return {
    settings: {
      theme: p.theme,
      text: p.text,
      velocity: p.global.velocity,
      ...(p.display.settings ? { display: p.display.settings } : {}),
    },
    voices: p.voices,
    tempo: p.tempo,
    mode: p.display.mode,
    fallSeconds: p.display.fallSeconds,
    audio: o.shared ? null : p.global.audio,
  }
}
