import { create } from 'zustand'

interface LiveMidiState {
  enabled: boolean
  deviceId: string | null
  /** liveAudio: default on in the studio (spec §4.1). */
  audio: boolean
  /** Why live MIDI cannot run (provider onError 'midi-unavailable'), shown in the settings section. */
  error: string | null
  set(patch: Partial<Omit<LiveMidiState, 'set'>>): void
}

export const useLiveMidi = create<LiveMidiState>((set) => ({
  enabled: false,
  deviceId: null,
  audio: true,
  error: null,
  set: (patch) => set(patch),
}))
