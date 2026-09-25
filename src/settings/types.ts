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

export interface AudioSettings {
  masterVolume: number    // 0-1
  metronome: boolean
  metronomeVolume: number // 0-1
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
  audio: { masterVolume: 0.8, metronome: false, metronomeVolume: 0.5 },
}
