import type { AudioSettings, DisplaySettings, Settings, TextSettings, ThemeSettings, VelocityScheme } from './types'
import type { ScoreDocument, TempoSetting, Voice } from '../model/types'
import type { DisplayMode } from '../transport/useTransport'
import { MAX_TEMPO_SCALE, MIN_TEMPO_SCALE } from '../model/tempoMap'

export const PROFILE_SCHEMA_VERSION = 1

const PROFILE_PREFIX = 'tmi.profile.'
const GLOBALS_KEY = 'tmi.globals'

/** The absolute-BPM range the tempo control accepts. */
const MIN_BPM = 20
const MAX_BPM = 300

/** App-wide preferences: they follow the user, not the song. */
export interface GlobalPrefs {
  velocity: VelocityScheme
  audio: AudioSettings
}

export interface SongProfile {
  schemaVersion: number
  song: { id: string; name: string; format: ScoreDocument['sourceFormat'] }
  voices: Voice[]
  tempo: TempoSetting
  /** `settings` is the song-scoped display block: zoom, grid, flash, middle C. */
  display: { mode: DisplayMode; fallSeconds: number; settings: DisplaySettings }
  theme: ThemeSettings
  text: TextSettings
  /** A snapshot of the globals at export time. Import applies it only on request. */
  global: GlobalPrefs
}

export function buildProfile(args: {
  song: SongProfile['song']
  voices: Voice[]
  tempo: TempoSetting
  mode: DisplayMode
  fallSeconds: number
  settings: Settings
}): SongProfile {
  return structuredClone({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    song: args.song,
    voices: args.voices,
    tempo: args.tempo,
    display: { mode: args.mode, fallSeconds: args.fallSeconds, settings: args.settings.display },
    theme: args.settings.theme,
    text: args.settings.text,
    global: { velocity: args.settings.velocity, audio: args.settings.audio },
  })
}

export function encodeProfile(p: SongProfile): string {
  return JSON.stringify(p, null, 2)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * A hand-edited file can carry a scale or BPM of 0, which would reach
 * ticksToSec and collapse every note onto t=0. Clamp to the ranges the tempo
 * control itself enforces; refuse anything that is not a number at all.
 */
function sanitiseTempo(t: TempoSetting): TempoSetting {
  if (t.mode === 'scale' && Number.isFinite(t.scale)) {
    return { mode: 'scale', scale: clamp(t.scale, MIN_TEMPO_SCALE, MAX_TEMPO_SCALE) }
  }
  if (t.mode === 'absolute' && Number.isFinite(t.bpm)) {
    return { mode: 'absolute', bpm: clamp(t.bpm, MIN_BPM, MAX_BPM) }
  }
  throw new Error('Profile has an invalid tempo setting.')
}

/**
 * Throws rather than returning a partial profile. Spec §11: an unknown
 * schemaVersion must be refused outright, keeping current settings, instead of
 * being half-applied and leaving the app in a state nobody chose.
 */
export function decodeProfile(json: string): SongProfile {
  const raw = JSON.parse(json) as Partial<SongProfile>
  if (raw.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported profile version ${String(raw.schemaVersion)} — this app reads version ${PROFILE_SCHEMA_VERSION}.`,
    )
  }
  if (
    !raw.song?.id || !Array.isArray(raw.voices) || !raw.tempo || !raw.display
    || !raw.theme || !raw.text || !raw.global?.velocity || !raw.global.audio
  ) {
    throw new Error('Profile is missing required fields.')
  }
  return { ...raw, tempo: sanitiseTempo(raw.tempo) } as SongProfile
}

/**
 * Saved settings are applied ONTO the freshly parsed voices, matched by id. The
 * parsed voice is the source of truth for identity; the profile only supplies
 * presentation. A saved id that no longer exists is dropped, and a saved entry
 * can never rename an id -- otherwise a stale profile would orphan every note,
 * whose voiceId still points at the parsed value.
 */
export function mergeVoices(parsed: Voice[], saved: Voice[]): Voice[] {
  const by = new Map(saved.map((v) => [v.id, v]))
  return parsed.map((v) => {
    const s = by.get(v.id)
    if (!s) return v
    return {
      ...v,
      label: s.label ?? v.label,
      hue: s.hue ?? v.hue,
      instrument: s.instrument ?? v.instrument,
      visible: s.visible ?? v.visible,
      audible: s.audible ?? v.audible,
      volume: s.volume ?? v.volume,
    }
  })
}

/** localStorage can throw (private mode, quota). Persistence is a convenience,
    never a correctness requirement, so every access is guarded. */
function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* quota or private mode */ }
}

export function saveProfile(p: SongProfile): void {
  write(PROFILE_PREFIX + p.song.id, encodeProfile(p))
}

export function loadProfile(songId: string): SongProfile | null {
  const raw = read(PROFILE_PREFIX + songId)
  if (!raw) return null
  try { return decodeProfile(raw) } catch { return null }
}

export function saveGlobals(g: GlobalPrefs): void {
  write(GLOBALS_KEY, JSON.stringify(g))
}

export function loadGlobals(): GlobalPrefs | null {
  const raw = read(GLOBALS_KEY)
  if (!raw) return null
  try {
    const g = JSON.parse(raw) as Partial<GlobalPrefs>
    return g.velocity && g.audio ? (g as GlobalPrefs) : null
  } catch { return null }
}
