import type {
  AudioSettings, ChordDisplay, ChordPlacement, DisplaySettings, GlobalPrefs, GradientStop,
  NoteLabelContent, NoteLabelPlacement, SavedVoice, Settings, SongProfile, TextSettings, TextStyle,
  ThemeName, ThemeSettings, VelocityScheme,
} from './types'
import { DEFAULT_TEXT_STYLE, MAX_GRADIENT_STOPS, MIN_GRADIENT_STOPS } from './types'
import type { DisplayMode, TempoSetting, Voice } from '../model/types'
import { MAX_TEMPO_SCALE, MIN_TEMPO_SCALE } from '../model/tempoMap'
import { isInstrumentName } from '../audio/sounds'

// GlobalPrefs, SavedVoice and SongProfile now live in ./types (preflight F4);
// re-exported here so no call site of `../settings/profile` needs to change.
export type { GlobalPrefs, SavedVoice, SongProfile } from './types'

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
const SONG_FORMATS: readonly SongProfile['song']['format'][] = ['midi', 'musicxml']
/** Spec §8.5: a colour string is at most 64 characters. */
const MAX_COLOR_CHARS = 64
/** What a gradient stop colour that is not a colour becomes (preflight F8). */
const FALLBACK_STOP_COLOR = '#ffffff'
const THEME_NAMES: readonly ThemeName[] = ['classic', 'outline', 'contrast', 'transparent']
const LABEL_CONTENTS: readonly NoteLabelContent[] = ['off', 'pitch', 'midi', 'both']
const LABEL_PLACEMENTS: readonly NoteLabelPlacement[] = ['above', 'below']
const CHORD_DISPLAYS: readonly ChordDisplay[] = ['off', 'symbol', 'numeral', 'both']
const CHORD_PLACEMENTS: readonly ChordPlacement[] = ['stage-left', 'stage-centre', 'above-keys']
/** The on-stage text controls' ranges (TextSettings.tsx, and the chord-window slider). */
const TEXT_RANGES = {
  chordWindowMs: [100, 2000],
  weight: [100, 900],
  sizeRatio: [0.2, 1.4],
  letterSpacing: [-0.05, 0.3],
  opacity: [0, 1],
  strokeWidth: [0, 8],
} as const

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

/** Hex (#rgb, #rgba, #rrggbb, #rrggbbaa), a colour function with balanced
    parentheses, or a bare keyword. Only the fallback where the browser cannot
    be asked (jsdom has no CSS.supports); it is a shape check, not a parser. */
const COLOR_SYNTAX =
  /^(#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|[a-z]+)$/i

/**
 * Whether a string is a colour the browser will actually paint. A string that
 * is not (say `'not a colour!'`) is silently ignored by both CSS and the
 * canvas's fillStyle, which then keeps its PREVIOUS fill -- so an imported junk
 * stage colour renders as whatever was drawn last. Asks the browser via
 * CSS.supports where it exists, and falls back to a syntax check otherwise.
 */
export function isCssColor(v: string): boolean {
  // Spec §8.5 caps colours at 64 characters; nothing a colour picker makes
  // comes close, and it bounds what an untrusted payload can hand the browser.
  if (v.length > MAX_COLOR_CHARS) return false
  const css = (globalThis as { CSS?: { supports?: (prop: string, value: string) => boolean } }).CSS
  if (typeof css?.supports === 'function') return css.supports('color', v)
  return COLOR_SYNTAX.test(v.trim())
}

/**
 * Returns a clean copy of a valid velocity scheme, or null. A gradient must
 * have at least 2 stops (spec §8.5); more than 16 keeps only the first 16
 * rather than refusing the scheme (controller ruling, supersedes preflight
 * F8), and a stop colour that is a string but not a colour is replaced with
 * #ffffff rather than refusing the whole scheme.
 */
export function validVelocity(v: unknown): VelocityScheme | null {
  if (!isObj(v)) return null
  if (v.kind === 'lightness') {
    if (!isNum(v.lMax) || !isNum(v.lMin) || !isNum(v.sat)) return null
    return { kind: 'lightness', lMax: v.lMax, lMin: v.lMin, sat: v.sat }
  }
  if (v.kind === 'gradient') {
    // The editor stays within 2-16 stops. An import with fewer than 2 is
    // refused outright, but one with more than 16 (a pre-phase-2 save, or a
    // hostile payload) keeps its first 16 rather than losing the whole
    // scheme -- controller ruling, supersedes preflight F8's "refuse more
    // than 16". The slice happens BEFORE any per-stop work, so a 1000-stop
    // payload still costs nothing beyond the slice.
    if (!Array.isArray(v.stops) || v.stops.length < MIN_GRADIENT_STOPS) return null
    const capped = v.stops.length > MAX_GRADIENT_STOPS ? v.stops.slice(0, MAX_GRADIENT_STOPS) : v.stops
    const stops: GradientStop[] = []
    for (const st of capped as unknown[]) {
      if (!isObj(st) || !isUnit(st.at) || typeof st.color !== 'string') return null
      stops.push({ at: st.at, color: isCssColor(st.color) ? st.color : FALLBACK_STOP_COLOR })
    }
    return { kind: 'gradient', stops }
  }
  return null
}

/** Returns a clean copy of valid audio settings, or null. */
export function validAudio(a: unknown): AudioSettings | null {
  if (!isObj(a)) return null
  if (!isUnit(a.masterVolume) || !isUnit(a.metronomeVolume) || typeof a.metronome !== 'boolean') return null
  const out: AudioSettings = { masterVolume: a.masterVolume, metronome: a.metronome, metronomeVolume: a.metronomeVolume }
  // Added after the other three: absent (an older save) or malformed is
  // simply dropped, which reads as the default (on), rather than refusing the
  // whole audio block and with it the user's volumes.
  if (typeof a.countIn === 'boolean') out.countIn = a.countIn
  if (a.metronomeVoice === 'woodblock' || a.metronomeVoice === 'drum-machine' || a.metronomeVoice === 'click') out.metronomeVoice = a.metronomeVoice
  return out
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
  // A string that is not a colour is dropped to the theme's own token, the
  // same "drop the bad field, keep the block" treatment voices get.
  const override = typeof v.stageBgOverride === 'string' && isCssColor(v.stageBgOverride)
    ? v.stageBgOverride : null
  return { name: v.name as ThemeName, stageBgOverride: override }
}

/**
 * A Google Fonts family name: letters, digits and spaces only, starting with
 * an alphanumeric, up to 64 characters. Spec §8.5. Anything else can break out
 * of the `font-family` CSS declaration (a quote, a `;`, a `url(...)`), so a
 * family that fails this is never trusted verbatim.
 */
export const FONT_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$/

export function isSafeFontFamily(s: string): boolean {
  return FONT_FAMILY_RE.test(s)
}

/** Returns a clean copy of a valid text style, clamped to the control ranges, or null. */
export function validTextStyle(v: unknown): TextStyle | null {
  if (!isObj(v)) return null
  const { family, weight, sizeRatio, letterSpacing, color, opacity, strokeWidth, strokeColor } = v
  if (typeof family !== 'string' || typeof color !== 'string' || typeof strokeColor !== 'string') return null
  if (!isNum(weight) || !isNum(sizeRatio) || !isNum(letterSpacing) || !isNum(opacity) || !isNum(strokeWidth)) return null
  const r = TEXT_RANGES
  return {
    // An unsafe family (quotes, CSS breakout) falls back to the default
    // rather than refusing the whole profile over one field -- the same
    // treatment colour gets below.
    family: isSafeFontFamily(family) ? family : DEFAULT_TEXT_STYLE.family,
    weight: clamp(weight, ...r.weight),
    sizeRatio: clamp(sizeRatio, ...r.sizeRatio),
    letterSpacing: clamp(letterSpacing, ...r.letterSpacing),
    // A string that is not a colour falls back to the default rather than
    // refusing the whole profile over one field.
    color: isCssColor(color) ? color : DEFAULT_TEXT_STYLE.color,
    opacity: clamp(opacity, ...r.opacity),
    strokeWidth: clamp(strokeWidth, ...r.strokeWidth),
    strokeColor: isCssColor(strokeColor) ? strokeColor : DEFAULT_TEXT_STYLE.strokeColor,
  }
}

/**
 * Returns a clean copy of a valid on-stage text block, or null. Task 8 review:
 * this used to be an isObj-only check, but labels, placement and the font now
 * reach the DOM overlay, so an unknown enum member or a non-string family would
 * render as nothing (or throw) rather than as a setting anyone chose. Unknown
 * keys are not carried through.
 *
 * `{ keyOverride: false }` is the look variant (spec §8.1/§9.1, preflight F7):
 * keyOverride is song-specific, so a look never carries one. That form ignores
 * any keyOverride present and never returns one; the default form requires it.
 */
export function validText(v: unknown): TextSettings | null
export function validText(v: unknown, o: { keyOverride: false }): Omit<TextSettings, 'keyOverride'> | null
export function validText(
  v: unknown, o?: { keyOverride: false },
): TextSettings | Omit<TextSettings, 'keyOverride'> | null {
  if (!isObj(v)) return null
  if (!LABEL_CONTENTS.includes(v.labels as NoteLabelContent)) return null
  if (!LABEL_PLACEMENTS.includes(v.labelPlacement as NoteLabelPlacement)) return null
  if (!CHORD_DISPLAYS.includes(v.chord as ChordDisplay)) return null
  if (!CHORD_PLACEMENTS.includes(v.chordPlacement as ChordPlacement)) return null
  if (typeof v.chordAlternates !== 'boolean' || !isNum(v.chordWindowMs)) return null
  const style = validTextStyle(v.style)
  if (!style) return null
  const base: Omit<TextSettings, 'keyOverride'> = {
    labels: v.labels as NoteLabelContent,
    labelPlacement: v.labelPlacement as NoteLabelPlacement,
    chord: v.chord as ChordDisplay,
    chordPlacement: v.chordPlacement as ChordPlacement,
    chordAlternates: v.chordAlternates,
    chordWindowMs: clamp(v.chordWindowMs, ...TEXT_RANGES.chordWindowMs),
    style,
  }
  if (o?.keyOverride === false) return base
  // A string that does not parse as a key is harmless: keyOfScore ignores it.
  if (v.keyOverride !== null && typeof v.keyOverride !== 'string') return null
  return { ...base, keyOverride: v.keyOverride as string | null }
}

/** The display mode, or null for anything that is not one. */
export function validDisplayMode(v: unknown): DisplayMode | null {
  return DISPLAY_MODES.includes(v as DisplayMode) ? (v as DisplayMode) : null
}

/** A numeric fall time clamped to the slider's range, or null for a non-number. */
export function validFallSeconds(v: unknown): number | null {
  return isNum(v) ? clamp(v, MIN_FALL_SECONDS, MAX_FALL_SECONDS) : null
}

/**
 * Drops entries that are not objects with a string id, and omits any field of
 * the wrong type so mergeVoices keeps the parsed value for it. Volume is
 * clamped to 0-1 and hue to 0-360: both reach the engine or the colour maths.
 * An instrument that is not a GM sound name (or 'drums') is dropped
 * the same way -- mergeVoices then keeps the parsed voice's own instrument.
 */
export function sanitiseVoices(list: unknown[]): SavedVoice[] {
  const out: SavedVoice[] = []
  for (const v of list) {
    if (!isObj(v) || typeof v.id !== 'string') continue
    const s: SavedVoice = { id: v.id }
    if (typeof v.label === 'string') s.label = v.label
    if (isInstrumentName(v.instrument)) s.instrument = v.instrument
    if (isNum(v.hue)) s.hue = clamp(v.hue, 0, 360)
    if (isNum(v.volume)) s.volume = clamp(v.volume, 0, 1)
    if (typeof v.visible === 'boolean') s.visible = v.visible
    if (typeof v.audible === 'boolean') s.audible = v.audible
    out.push(s)
  }
  return out
}

/** The profile's song block, rebuilt field by field, or null. */
function validProfileSong(v: unknown): SongProfile['song'] | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id || typeof v.name !== 'string') return null
  if (!SONG_FORMATS.includes(v.format as SongProfile['song']['format'])) return null
  return { id: v.id, name: v.name, format: v.format as SongProfile['song']['format'] }
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
  const text = validText(raw.text)
  if (!text) throw new Error('Profile has invalid on-stage text settings.')
  const song = validProfileSong(raw.song)
  if (!song) throw new Error('Profile has an invalid song block.')

  const { mode: rawMode, fallSeconds: rawFall, settings } = raw.display as Obj
  const mode = validDisplayMode(rawMode)
  if (!mode) throw new Error('Profile has an invalid display mode.')
  const fallSeconds = validFallSeconds(rawFall)
  if (fallSeconds === null) throw new Error('Profile has an invalid fall time.')
  const display: SongProfile['display'] = { mode, fallSeconds }
  const ds = validDisplaySettings(settings)
  if (ds) display.settings = ds

  // Built key by key, never spread from raw (preflight F9, spec §9.1):
  // unknown keys at any level are dropped.
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    song,
    voices: sanitiseVoices(raw.voices),
    tempo: sanitiseTempo(raw.tempo),
    display,
    theme,
    text,
    global: { velocity, audio },
  }
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

/**
 * localStorage can throw (private mode, quota). Persistence is a convenience,
 * never a correctness requirement, so every access is guarded.
 *
 * Exported (preflight F6): this file is the sole localStorage call site in
 * the app. LocalStorageProvider (task 2.4, src/platform/local) must not call
 * `localStorage` itself -- it calls these guarded wrappers instead, so
 * `tmi.saves.*` lives behind the same single boundary as `tmi.profile.*` and
 * `tmi.globals`, and inherits the same throw-tolerance for free.
 */
export function storageGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function storageSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* quota or private mode */ }
}
export function storageRemove(key: string): void {
  try { localStorage.removeItem(key) } catch { /* quota or private mode */ }
}

export function saveProfile(p: SongProfile): void {
  storageSet(PROFILE_PREFIX + p.song.id, encodeProfile(p))
}

export function loadProfile(songId: string): SongProfile | null {
  const raw = storageGet(PROFILE_PREFIX + songId)
  if (!raw) return null
  try { return decodeProfile(raw) } catch { return null }
}

export function saveGlobals(g: GlobalPrefs): void {
  storageSet(GLOBALS_KEY, JSON.stringify(g))
}

export function loadGlobals(): GlobalPrefs | null {
  const raw = storageGet(GLOBALS_KEY)
  if (!raw) return null
  try {
    const g: unknown = JSON.parse(raw)
    if (!isObj(g)) return null
    const velocity = validVelocity(g.velocity)
    const audio = validAudio(g.audio)
    return velocity && audio ? { velocity, audio } : null
  } catch { return null }
}
