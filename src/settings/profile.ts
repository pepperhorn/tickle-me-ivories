import type {
  AudioSettings, DisplaySettings, GradientStop, Settings, TextSettings, ThemeName, ThemeSettings, VelocityScheme,
} from './types'
import type { ScoreDocument, TempoSetting, Voice } from '../model/types'
import type { DisplayMode } from '../transport/useTransport'
import { MAX_TEMPO_SCALE, MIN_TEMPO_SCALE } from '../model/tempoMap'

export const PROFILE_SCHEMA_VERSION = 1

const PROFILE_PREFIX = 'tmi.profile.'
const GLOBALS_KEY = 'tmi.globals'

/** The absolute-BPM range the tempo control accepts. */
const MIN_BPM = 20
const MAX_BPM = 300
/** The fall-time slider's range (DisplaySettings). */
const MIN_FALL_SECONDS = 0.5
const MAX_FALL_SECONDS = 8
const MAX_FLASH_SCALE = 1.5
const DISPLAY_MODES: readonly DisplayMode[] = ['keyboard', 'roll']
const THEME_NAMES: readonly ThemeName[] = ['classic', 'outline', 'contrast', 'transparent']

/** App-wide preferences: they follow the user, not the song. */
export interface GlobalPrefs {
  velocity: VelocityScheme
  audio: AudioSettings
}

/** A voice as stored in a profile. Only `id` is guaranteed: a decoded entry
    omits any field that failed validation, and mergeVoices keeps the parsed value. */
export type SavedVoice = Partial<Voice> & { id: string }

export interface SongProfile {
  schemaVersion: number
  song: { id: string; name: string; format: ScoreDocument['sourceFormat'] }
  voices: SavedVoice[]
  tempo: TempoSetting
  /** `settings` is the song-scoped display block: zoom, grid, flash, middle C.
      Optional on decode: an invalid block is dropped rather than applied. */
  display: { mode: DisplayMode; fallSeconds: number; settings?: DisplaySettings }
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
  if (t.mode === 'scale' && isNum(t.scale)) {
    return { mode: 'scale', scale: clamp(t.scale, MIN_TEMPO_SCALE, MAX_TEMPO_SCALE) }
  }
  if (t.mode === 'absolute' && isNum(t.bpm)) {
    return { mode: 'absolute', bpm: clamp(t.bpm, MIN_BPM, MAX_BPM) }
  }
  throw new Error('Profile has an invalid tempo setting.')
}

// ---- Validators for untrusted JSON (imported files and localStorage). ----
// A value that reaches the render path or an AudioParam with the wrong type
// either unmounts the app or throws inside the engine, so every field is
// checked here, before anything is applied.

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isUnit = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1

/** Returns a clean copy of a valid velocity scheme, or null. */
export function validVelocity(v: unknown): VelocityScheme | null {
  if (!isObj(v)) return null
  if (v.kind === 'lightness') {
    if (!isNum(v.lMax) || !isNum(v.lMin) || !isNum(v.sat)) return null
    return { kind: 'lightness', lMax: v.lMax, lMin: v.lMin, sat: v.sat }
  }
  if (v.kind === 'gradient') {
    // The editor never goes below two stops; neither does an import.
    if (!Array.isArray(v.stops) || v.stops.length < 2) return null
    const stops: GradientStop[] = []
    for (const st of v.stops as unknown[]) {
      if (!isObj(st) || !isUnit(st.at) || typeof st.color !== 'string') return null
      stops.push({ at: st.at, color: st.color })
    }
    return { kind: 'gradient', stops }
  }
  return null
}

/** Returns a clean copy of valid audio settings, or null. */
export function validAudio(a: unknown): AudioSettings | null {
  if (!isObj(a)) return null
  if (!isUnit(a.masterVolume) || !isUnit(a.metronomeVolume) || typeof a.metronome !== 'boolean') return null
  return { masterVolume: a.masterVolume, metronome: a.metronome, metronomeVolume: a.metronomeVolume }
}

/** Returns a clean copy of valid display settings, or null (the caller drops it). */
export function validDisplaySettings(d: unknown): DisplaySettings | null {
  if (!isObj(d)) return null
  if (d.zoom !== 'full' && d.zoom !== 'fit') return null
  if (typeof d.showGrid !== 'boolean' || typeof d.showFlash !== 'boolean' || typeof d.showMiddleC !== 'boolean') return null
  if (!isNum(d.flashScale)) return null
  return {
    zoom: d.zoom, showGrid: d.showGrid, showFlash: d.showFlash,
    flashScale: clamp(d.flashScale, 0, MAX_FLASH_SCALE), showMiddleC: d.showMiddleC,
  }
}

/**
 * Returns a clean copy of a valid theme block, or null. Task 8 review: this
 * used to be an isObj-only truthiness check, so a corrupt or foreign
 * `theme.name` would reach the `.theme-${name}` class and every CSS custom
 * property `themeFor` resolves from it -- silently falling back to whatever
 * the browser does with an unknown class rather than a known theme.
 */
export function validTheme(v: unknown): ThemeSettings | null {
  if (!isObj(v)) return null
  if (!THEME_NAMES.includes(v.name as ThemeName)) return null
  if (v.stageBgOverride !== null && typeof v.stageBgOverride !== 'string') return null
  return { name: v.name as ThemeName, stageBgOverride: v.stageBgOverride as string | null }
}

/**
 * Drops entries that are not objects with a string id, and omits any field of
 * the wrong type so mergeVoices keeps the parsed value for it. Volume is
 * clamped to 0-1 and hue to 0-360: both reach the engine or the colour maths.
 */
export function sanitiseVoices(list: unknown[]): SavedVoice[] {
  const out: SavedVoice[] = []
  for (const v of list) {
    if (!isObj(v) || typeof v.id !== 'string') continue
    const s: SavedVoice = { id: v.id }
    if (typeof v.label === 'string') s.label = v.label
    if (typeof v.instrument === 'string') s.instrument = v.instrument
    if (isNum(v.hue)) s.hue = clamp(v.hue, 0, 360)
    if (isNum(v.volume)) s.volume = clamp(v.volume, 0, 1)
    if (typeof v.visible === 'boolean') s.visible = v.visible
    if (typeof v.audible === 'boolean') s.audible = v.audible
    out.push(s)
  }
  return out
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
    !isObj(raw.song) || typeof raw.song.id !== 'string' || !raw.song.id
    || !Array.isArray(raw.voices) || !isObj(raw.tempo) || !isObj(raw.display)
    || !isObj(raw.theme) || !isObj(raw.text) || !isObj(raw.global)
  ) {
    throw new Error('Profile is missing required fields.')
  }
  const velocity = validVelocity(raw.global.velocity)
  if (!velocity) throw new Error('Profile has an invalid velocity colour scheme.')
  const audio = validAudio(raw.global.audio)
  if (!audio) throw new Error('Profile has invalid audio settings.')
  const theme = validTheme(raw.theme)
  if (!theme) throw new Error('Profile has an invalid theme.')

  const { mode, fallSeconds, settings } = raw.display as Obj
  if (!DISPLAY_MODES.includes(mode as DisplayMode)) throw new Error('Profile has an invalid display mode.')
  if (!isNum(fallSeconds)) throw new Error('Profile has an invalid fall time.')
  const display: SongProfile['display'] = {
    mode: mode as DisplayMode,
    fallSeconds: clamp(fallSeconds, MIN_FALL_SECONDS, MAX_FALL_SECONDS),
  }
  const ds = validDisplaySettings(settings)
  if (ds) display.settings = ds

  return {
    ...raw,
    voices: sanitiseVoices(raw.voices),
    tempo: sanitiseTempo(raw.tempo),
    display,
    theme,
    global: { velocity, audio },
  } as SongProfile
}

/**
 * Saved settings are applied ONTO the freshly parsed voices, matched by id. The
 * parsed voice is the source of truth for identity; the profile only supplies
 * presentation. A saved id that no longer exists is dropped, and a saved entry
 * can never rename an id -- otherwise a stale profile would orphan every note,
 * whose voiceId still points at the parsed value.
 */
export function mergeVoices(parsed: Voice[], saved: SavedVoice[]): Voice[] {
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
    const g: unknown = JSON.parse(raw)
    if (!isObj(g)) return null
    const velocity = validVelocity(g.velocity)
    const audio = validAudio(g.audio)
    return velocity && audio ? { velocity, audio } : null
  } catch { return null }
}
