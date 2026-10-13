import { create } from 'zustand'
import { DEFAULT_LIVE_BPM } from 'ivories/core'

interface LiveMidiState {
  enabled: boolean
  deviceId: string | null
  /** liveAudio: default on in the studio (spec §4.1). */
  audio: boolean
  /** Why live MIDI cannot run (provider onError 'midi-unavailable'), shown in the settings section. */
  error: string | null
  /** Live BPM: speed and grid of a rising view with no score (provider bpm, R-P). */
  bpm: number
  /** "Play live": no score, the stage shows live input instead of the drop zone (R-S). */
  session: boolean
  set(patch: Partial<Omit<LiveMidiState, 'set'>>): void
}

export const useLiveMidi = create<LiveMidiState>((set) => ({
  enabled: false,
  deviceId: null,
  audio: true,
  error: null,
  bpm: DEFAULT_LIVE_BPM,
  session: false,
  set: (patch) => set(patch),
}))
