import { create } from 'zustand'
import { DEFAULT_SETTINGS } from './types'
import type {
  AudioSettings, DisplaySettings, Settings, TextSettings, TextStyle,
  ThemeSettings, VelocityScheme,
} from './types'

export interface SettingsActions {
  setTheme: (patch: Partial<ThemeSettings>) => void
  setDisplay: (patch: Partial<DisplaySettings>) => void
  /** Replaced whole, never merged: the two scheme kinds are a discriminated union. */
  setVelocity: (scheme: VelocityScheme) => void
  setText: (patch: Partial<TextSettings>) => void
  setTextStyle: (patch: Partial<TextStyle>) => void
  setAudio: (patch: Partial<AudioSettings>) => void
  replaceAll: (s: Settings) => void
  reset: () => void
}

/** Deep-ish clone of the defaults so no store ever aliases the shared constant. */
function freshDefaults(): Settings {
  return structuredClone(DEFAULT_SETTINGS)
}

export const useSettings = create<Settings & SettingsActions>((set) => ({
  ...freshDefaults(),

  setTheme: (patch) => set((s) => ({ theme: { ...s.theme, ...patch } })),
  setDisplay: (patch) => set((s) => ({ display: { ...s.display, ...patch } })),
  setVelocity: (velocity) => set({ velocity }),
  setText: (patch) => set((s) => ({ text: { ...s.text, ...patch } })),
  setTextStyle: (patch) => set((s) => ({ text: { ...s.text, style: { ...s.text.style, ...patch } } })),
  setAudio: (patch) => set((s) => ({ audio: { ...s.audio, ...patch } })),

  replaceAll: (s) => set(structuredClone(s)),
  reset: () => set(freshDefaults()),
}))

/** The plain serialisable slice, with the actions stripped. Used by the profile. */
export function currentSettings(): Settings {
  const { theme, display, velocity, text, audio } = useSettings.getState()
  return structuredClone({ theme, display, velocity, text, audio })
}
