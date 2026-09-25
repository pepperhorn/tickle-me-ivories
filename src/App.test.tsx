import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import App from './App'
import { useTransport } from './transport/useTransport'
import { useSettings } from './settings/useSettings'
import { buildProfile, encodeProfile, loadProfile, saveProfile } from './settings/profile'
import { DEFAULT_SETTINGS } from './settings/types'
import { hashFile } from './io/hashFile'
import { LEFT_VOICE, RIGHT_VOICE } from './io/handSplit'
import type { Voice } from './model/types'

// The engine owns an AudioContext and smplr, neither of which jsdom has. The
// fake records what App asks of it; everything App decides is still real.
const engine = vi.hoisted(() => ({
  currentTime: 0,
  resume: vi.fn(async () => {}),
  setMasterVolume: vi.fn(),
  setVoiceVolume: vi.fn(),
  loadVoice: vi.fn(async () => {}),
  retainVoices: vi.fn(),
  play: vi.fn(),
  stopAll: vi.fn(),
}))
vi.mock('./audio/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audio/engine')>()),
  AudioEngine: function AudioEngine() { return engine },
}))
// The rAF + canvas loop is the draw path, covered by the render tests.
vi.mock('./render/useCanvasStage', () => ({ useCanvasStage: () => ({ current: null }) }))

/** A one-track file: C4 at 0s and E4 at 1s, at 120bpm (so tick 960 = 1s). */
function midiBytes(pitches = [60, 64]): Uint8Array<ArrayBuffer> {
  const midi = new Midi()
  midi.header.setTempo(120)
  const track = midi.addTrack()
  track.name = 'Piano'
  pitches.forEach((p, i) => track.addNote({ midi: p, time: i, duration: 0.5, velocity: 0.8 }))
  return new Uint8Array(midi.toArray())
}

const midiFile = (bytes: Uint8Array<ArrayBuffer>, name = 'song.mid') => new File([bytes], name, { type: 'audio/midi' })

async function idOf(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return hashFile(bytes.slice().buffer)
}

function profileFor(id: string, patch: {
  voices?: Voice[]; tempo?: Parameters<typeof buildProfile>[0]['tempo']
  theme?: typeof DEFAULT_SETTINGS.theme
} = {}) {
  return buildProfile({
    song: { id, name: 'song.mid', format: 'midi' },
    voices: patch.voices ?? [],
    tempo: patch.tempo ?? { mode: 'scale', scale: 0.5 },
    mode: 'keyboard',
    fallSeconds: 5,
    settings: { ...DEFAULT_SETTINGS, theme: patch.theme ?? { name: 'contrast', stageBgOverride: '#00b140' } },
  })
}

const voice = (id: string, patch: Partial<Voice>): Voice => ({
  id, label: id, hue: 0, instrument: 'acoustic_grand_piano',
  visible: true, audible: true, volume: 1, ...patch,
})

async function loadFile(file: File) {
  fireEvent.change(document.getElementById('file-input')!, { target: { files: [file] } })
  await waitFor(() => expect(useTransport.getState().score?.name).toBe(file.name))
  // Let the audio half of loadFile (resume, loadVoice, retainVoices) settle.
  await waitFor(() => expect(engine.retainVoices).toHaveBeenCalled())
}

function openProfileSection() {
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.click(screen.getByRole('button', { name: /Profile/ }))
}

async function importProfile(json: string) {
  const f = new File([json], 'song.tmi.json', { type: 'application/json' })
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Import profile file'), { target: { files: [f] } })
  })
}

const pristineTransport = useTransport.getState()

beforeEach(() => {
  localStorage.clear()
  useTransport.setState(pristineTransport, true)
  useSettings.getState().reset()
  vi.clearAllMocks()
})

describe('App: loading a file', () => {
  it("restores the file's autosaved profile, tempo first", async () => {
    const bytes = midiBytes()
    saveProfile(profileFor(await idOf(bytes), {
      voices: [voice(RIGHT_VOICE, { label: 'Melody', hue: 42, volume: 0.3 })],
    }))
    render(<App />)
    await loadFile(midiFile(bytes))

    const tr = useTransport.getState()
    expect(tr.tempo).toEqual({ mode: 'scale', scale: 0.5 })
    // Retimed at the restored tempo: the note at 1s now sounds at 2s.
    expect(tr.score!.notes.map((n) => n.startSec)).toEqual([0, 2])
    expect(tr.mode).toBe('keyboard')
    expect(tr.fallSeconds).toBe(5)
    expect(tr.score!.voices.find((v) => v.id === RIGHT_VOICE))
      .toMatchObject({ label: 'Melody', hue: 42, volume: 0.3 })
    expect(useSettings.getState().theme).toEqual({ name: 'contrast', stageBgOverride: '#00b140' })
  })

  it("does not carry the previous song's tempo into a song with no profile", async () => {
    const a = midiBytes([60, 64])
    const b = midiBytes([67, 72])
    saveProfile(profileFor(await idOf(a), { tempo: { mode: 'absolute', bpm: 60 } }))
    render(<App />)
    await loadFile(midiFile(a, 'a.mid'))
    expect(useTransport.getState().tempo).toEqual({ mode: 'absolute', bpm: 60 })

    fireEvent.click(screen.getByRole('button', { name: /load another/i }))
    await loadFile(midiFile(b, 'b.mid'))

    const tr = useTransport.getState()
    expect(tr.tempo).toEqual({ mode: 'scale', scale: 1 })
    expect(tr.score!.notes.map((n) => n.startSec)).toEqual([0, 1])
    // ...and the autosave records B at its own tempo, not A's.
    const idB = await idOf(b)
    await waitFor(() => expect(loadProfile(idB)?.tempo).toEqual({ mode: 'scale', scale: 1 }))
  })
})

describe('App: autosave flush', () => {
  it('flushes a pending autosave synchronously before "Load another file" clears the score', async () => {
    const a = midiBytes([60, 64])
    render(<App />)
    await loadFile(midiFile(a, 'a.mid'))
    const idA = await idOf(a)

    // Edit the tempo -- this schedules a 400ms-debounced autosave that has
    // not written anything to storage yet.
    act(() => { useTransport.getState().setTempo({ mode: 'absolute', bpm: 91 }, engine.currentTime) })
    expect(loadProfile(idA)?.tempo).not.toEqual({ mode: 'absolute', bpm: 91 })

    // "Load another" must flush that pending save before clearing the score,
    // well inside the 400ms window.
    fireEvent.click(screen.getByRole('button', { name: /load another/i }))
    expect(loadProfile(idA)?.tempo).toEqual({ mode: 'absolute', bpm: 91 })
  })

  it('flushes a pending autosave on pagehide', async () => {
    const a = midiBytes([60, 64])
    render(<App />)
    await loadFile(midiFile(a, 'a.mid'))
    const idA = await idOf(a)

    act(() => { useTransport.getState().setTempo({ mode: 'absolute', bpm: 77 }, engine.currentTime) })
    expect(loadProfile(idA)?.tempo).not.toEqual({ mode: 'absolute', bpm: 77 })

    act(() => { window.dispatchEvent(new Event('pagehide')) })
    expect(loadProfile(idA)?.tempo).toEqual({ mode: 'absolute', bpm: 77 })
  })
})

describe('App: importing a profile', () => {
  it('applies the imported profile to the loaded song', async () => {
    const bytes = midiBytes()
    render(<App />)
    await loadFile(midiFile(bytes))
    openProfileSection()

    await importProfile(encodeProfile(profileFor(await idOf(bytes), {
      tempo: { mode: 'absolute', bpm: 60 },
      voices: [voice(LEFT_VOICE, { label: 'Bass', hue: 300, volume: 0.25 })],
      theme: { name: 'outline', stageBgOverride: null },
    })))

    const tr = useTransport.getState()
    expect(tr.tempo).toEqual({ mode: 'absolute', bpm: 60 })
    expect(tr.score!.notes.map((n) => n.startSec)).toEqual([0, 2])
    expect(tr.mode).toBe('keyboard')
    expect(tr.fallSeconds).toBe(5)
    expect(tr.score!.voices.find((v) => v.id === LEFT_VOICE)).toMatchObject({ label: 'Bass', hue: 300 })
    expect(engine.setVoiceVolume).toHaveBeenCalledWith(LEFT_VOICE, 0.25)
    expect(engine.stopAll).toHaveBeenCalled() // the tempo change is paired with stopAll
    expect(useSettings.getState().theme).toEqual({ name: 'outline', stageBgOverride: null })
    expect(screen.queryByText(/profile/i, { selector: '.profile-error' })).toBeNull()
  })

  it('refuses an invalid profile, shows why, and changes nothing', async () => {
    render(<App />)
    await loadFile(midiFile(midiBytes()))
    openProfileSection()
    const before = { tr: useTransport.getState(), settings: structuredClone(useSettings.getState().theme) }

    await importProfile(JSON.stringify({ schemaVersion: 99 }))

    expect(document.querySelector('.profile-error')?.textContent).toMatch(/Unsupported profile version 99/)
    const tr = useTransport.getState()
    expect(tr.score).toBe(before.tr.score)
    expect(tr.tempo).toBe(before.tr.tempo)
    expect(tr.mode).toBe(before.tr.mode)
    expect(useSettings.getState().theme).toEqual(before.settings)
    expect(engine.stopAll).not.toHaveBeenCalled()
  })
})

describe('App: exporting a profile', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('clicks an anchor that is in the document, and revokes the URL only afterwards', async () => {
    render(<App />)
    await loadFile(midiFile(midiBytes()))
    openProfileSection()

    let attached = false
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      attached = document.body.contains(this)
      expect(this.download).toBe('song.tmi.json')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Export profile' }))

    expect(click).toHaveBeenCalledTimes(1)
    expect(attached).toBe(true)
    // Revoking in the same task can cancel the download in Safari/Firefox.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x'))
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
