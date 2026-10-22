import type { DisplayMode, ScoreDocument, TempoSetting, Voice } from '../model/types'

export type ThemeName = 'classic' | 'outline' | 'contrast' | 'transparent'
export type ZoomMode = 'full' | 'fit'
export type NoteLabelContent = 'off' | 'pitch' | 'midi' | 'both'
export type NoteLabelPlacement = 'above' | 'below'
export type ChordDisplay = 'off' | 'symbol' | 'numeral' | 'both'
export type ChordPlacement = 'stage-left' | 'stage-centre' | 'above-keys'

/** A stop in the multi-stop velocity gradient. `at` is normalised velocity 0-1. */
export interface GradientStop { at: number; color: string }

export type VelocityScheme =
  | { kind: 'lightness'; lMax: number; lMin: number; sat: number }
  | { kind: 'gradient'; stops: GradientStop[] }

export interface TextStyle {
  family: string          // Google Font family name, e.g. 'Poppins'
  weight: number          // 400-900
  sizeRatio: number       // multiple of whiteW, so text scales with the keyboard
  letterSpacing: number   // em
  color: string
  opacity: number         // 0-1
  strokeWidth: number     // px; 0 turns the dark outline off
  strokeColor: string
}

export interface DisplaySettings {
  zoom: ZoomMode
  showGrid: boolean
  showFlash: boolean
  flashScale: number      // 0-1.5 multiplier on flash intensity
  showMiddleC: boolean
}

export interface TextSettings {
  labels: NoteLabelContent
  labelPlacement: NoteLabelPlacement
  chord: ChordDisplay
  chordPlacement: ChordPlacement
  chordAlternates: boolean
  chordWindowMs: number   // rolling window so arpeggios resolve to one chord
  /** Overrides the file's key signature. `null` = file, then C major. */
  keyOverride: string | null
  style: TextStyle
}

/** The metronome's sound (pepperscore/audio's metronome voices). Spelled out here so this module stays import-free. */
export type MetronomeVoiceName = 'woodblock' | 'drum-machine' | 'click'

export interface AudioSettings {
  masterVolume: number    // 0-1
  metronome: boolean
  metronomeVolume: number // 0-1
  /** The one-bar count-in (numbers on stage, and its clicks -- with the
      metronome off too since 0.1.1). Optional so settings, profiles and scenes
      saved before it existed stay valid; absent means on. The lead-in bar
      itself always plays. */
  countIn?: boolean
  /** The metronome and count-in sound. Optional like countIn (older saves stay valid); absent means 'woodblock'. */
  metronomeVoice?: MetronomeVoiceName
}

export interface ThemeSettings {
  name: ThemeName
  /** Flat matte colour for keyed workflows (§13.2). `null` = use the theme token. */
  stageBgOverride: string | null
}

export interface Settings {
  theme: ThemeSettings
  display: DisplaySettings
  velocity: VelocityScheme
  text: TextSettings
  audio: AudioSettings
}

/**
 * App-wide preferences: they follow the user, not the song. Moved here from
 * settings/profile.ts (preflight F4): src/platform/types.ts is type-checked
 * standalone by the PepperHorn plugin bundle under its own tsconfig, so it
 * (and everything it imports) must stay runtime-free -- no zustand, no
 * @tonejs/midi. profile.ts re-exports this so no call site changes.
 */
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

/**
 * Gradient stop bounds (spec §8.5). The editor never goes below the minimum or
 * above the maximum, and validVelocity refuses anything outside them, so a
 * gradient a user builds always survives their own decoder (preflight F8).
 */
export const MIN_GRADIENT_STOPS = 2
export const MAX_GRADIENT_STOPS = 16

/** The default gradient: blue -> green -> yellow -> red, per spec §7. */
export const DEFAULT_GRADIENT: GradientStop[] = [
  { at: 0, color: '#4a7cff' },
  { at: 0.4, color: '#38d17a' },
  { at: 0.7, color: '#f5c542' },
  { at: 1, color: '#e8384f' },
]

export const DEFAULT_TEXT_STYLE: TextStyle = {
  family: 'Poppins',
  weight: 600,
  sizeRatio: 0.55,
  letterSpacing: 0,
  color: '#ffffff',
  opacity: 1,
  strokeWidth: 3,
  strokeColor: 'rgba(0,0,0,0.35)',
}

/**
 * The lightness-scheme default. Exported once (F12) so later tasks
 * (velocity colour scale, VelocityEditor defaults) reuse this constant
 * rather than re-declaring the literal.
 */
export const DEFAULT_LIGHTNESS = { lMax: 78, lMin: 38, sat: 85 }

export const DEFAULT_SETTINGS: Settings = {
  theme: { name: 'classic', stageBgOverride: null },
  // zoom defaults to 'fit': spec §8 says the keyboard auto-fits on load (F14).
  display: { zoom: 'fit', showGrid: true, showFlash: true, flashScale: 1, showMiddleC: true },
  velocity: { kind: 'lightness', ...DEFAULT_LIGHTNESS },
  text: {
    labels: 'off',
    labelPlacement: 'above',
    chord: 'off',
    chordPlacement: 'stage-left',
    chordAlternates: false,
    chordWindowMs: 600,
    keyOverride: null,
    style: DEFAULT_TEXT_STYLE,
  },
  audio: { masterVolume: 0.8, metronome: false, metronomeVolume: 0.5, countIn: true },
}
