import { vi } from 'vitest'
import type { AudioEngine } from '../core/audio/engine'

/** An AudioEngine stand-in for jsdom (no AudioContext). */
export function fakeEngine(src = { currentTime: 0 }) {
  return {
    get currentTime() { return src.currentTime },
    running: true,
    resume: vi.fn(async () => {}),
    play: vi.fn(),
    stopAll: vi.fn(),
    metronome: () => ({ click: vi.fn(), stop: vi.fn() }),
    loadVoice: vi.fn(async () => {}),
    retainVoices: vi.fn(),
    setMasterVolume: vi.fn(),
    setVoiceVolume: vi.fn(),
    dispose: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    prepareLive: vi.fn(async () => {}),
    setSounds: vi.fn(async () => {}),
    setMetronomeVoice: vi.fn(),
    prepareMetronome: vi.fn(async () => {}),
  } as unknown as AudioEngine & {
    play: ReturnType<typeof vi.fn>
    noteOn: ReturnType<typeof vi.fn>
    noteOff: ReturnType<typeof vi.fn>
    prepareLive: ReturnType<typeof vi.fn>
    setSounds: ReturnType<typeof vi.fn>
    setMetronomeVoice: ReturnType<typeof vi.fn>
    prepareMetronome: ReturnType<typeof vi.fn>
  }
}
