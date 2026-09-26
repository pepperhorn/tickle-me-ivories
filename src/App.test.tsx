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
import { HashShareProvider } from './platform/local/HashShareProvider'
import { getDefaults } from './platform/registry'
import { sceneFromState } from './platform/scene'
import { lookFromSettings } from './platform/look'
import type { SceneV1 } from './platform/types'

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

  it('loads a file when crypto.subtle is unavailable (an insecure origin, e.g. LAN/Tailscale http://)', async () => {
    const realCrypto = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) })
    expect(globalThis.crypto.subtle).toBeUndefined()
    try {
      render(<App />)
      await loadFile(midiFile(midiBytes()))
      expect(document.querySelector('.stage-error')).toBeNull()
      expect(useTransport.getState().score!.notes.length).toBeGreaterThan(0)
    } finally {
      vi.unstubAllGlobals()
    }
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

// ---- task 2.5: scenes, looks and share links ----

const shareOrigin = () => location.origin

async function shareHash(kind: 'scene' | 'look', payload: unknown): Promise<string> {
  const p = new HashShareProvider(shareOrigin())
  const r = await p.share({ kind, payload } as Parameters<HashShareProvider['share']>[0])
  return new URL(r.url).hash
}

function sceneFor(id: string, name = 'song.mid', over: { masterVolume?: number } = {}): SceneV1 {
  const profile = buildProfile({
    song: { id, name, format: 'midi' },
    voices: [voice(RIGHT_VOICE, { label: 'Lead', hue: 99, volume: 0.4, instrument: 'electric_piano_1' })],
    tempo: { mode: 'absolute', bpm: 60 },
    mode: 'keyboard',
    fallSeconds: 6,
    settings: {
      ...DEFAULT_SETTINGS,
      theme: { name: 'outline', stageBgOverride: null },
      audio: { ...DEFAULT_SETTINGS.audio, masterVolume: over.masterVolume ?? DEFAULT_SETTINGS.audio.masterVolume },
    },
  })
  return sceneFromState({ song: { kind: 'local', sha256: id, name, format: 'midi', title: 'Song' }, profile })
}

const outlineLook = () => lookFromSettings(
  { ...DEFAULT_SETTINGS, theme: { name: 'contrast', stageBgOverride: '#123456' } }, 'keyboard', 7,
)

async function mountAt(hash: string) {
  history.replaceState(null, '', `/${hash}`)
  render(<App />)
}

describe('App: shared links (#share=)', () => {
  afterEach(() => { history.replaceState(null, '', '/') })

  it('shows the banner on mount and changes nothing until Apply; Apply applies and clears the hash', async () => {
    await mountAt(await shareHash('look', outlineLook()))
    const banner = await screen.findByRole('region', { name: 'Shared preview' })
    expect(banner.textContent).toMatch(/Shared look/)
    // Nothing applied yet.
    expect(useSettings.getState().theme).toEqual(DEFAULT_SETTINGS.theme)
    expect(location.hash).toMatch(/^#share=/)

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(useSettings.getState().theme).toEqual({ name: 'contrast', stageBgOverride: '#123456' })
    expect(useTransport.getState().fallSeconds).toBe(7)
    expect(location.hash).toBe('')
    expect(screen.queryByRole('region', { name: 'Shared preview' })).toBeNull()
  })

  it('Dismiss clears the hash and applies nothing', async () => {
    await mountAt(await shareHash('look', outlineLook()))
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(location.hash).toBe('')
    expect(useSettings.getState().theme).toEqual(DEFAULT_SETTINGS.theme)
    expect(document.querySelector('.shared-preview-banner')).toBeNull()
  })

  it('Save a copy stores the shared look locally and clears the hash', async () => {
    await mountAt(await shareHash('look', outlineLook()))
    const btn = await screen.findByRole('button', { name: 'Save a copy' })
    await act(async () => { fireEvent.click(btn) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy())
    expect(await getDefaults().storage.list('look')).toHaveLength(1)
    expect(location.hash).toBe('')
    expect(useSettings.getState().theme).toEqual(DEFAULT_SETTINGS.theme)
  })

  it('shows the "made with a newer version" message for a newer payload', async () => {
    await mountAt(await shareHash('look', { ...outlineLook(), v: 2 }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/made with a newer version/)
    expect(document.querySelector('.btn-apply-share')).toBeNull()
  })

  it('a shared scene asks for its file (§8.3), then loads it and applies the scene without its audio', async () => {
    const bytes = midiBytes()
    const id = await idOf(bytes)
    await mountAt(await shareHash('scene', sceneFor(id, 'song.mid', { masterVolume: 0.1 })))
    expect((await screen.findByRole('region', { name: 'Shared preview' })).textContent)
      .toMatch(/Shared scene: Song/)

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(document.querySelector('.scene-file-prompt')?.textContent)
      .toMatch(/This scene uses song\.mid\. Drop the file to continue\./)
    expect(location.hash).toBe('')

    fireEvent.change(screen.getByLabelText('Scene song file'), { target: { files: [midiFile(bytes)] } })
    await waitFor(() => expect(useTransport.getState().tempo).toEqual({ mode: 'absolute', bpm: 60 }))
    const tr = useTransport.getState()
    expect(tr.score!.id).toBe(id)
    expect(tr.fallSeconds).toBe(6)
    expect(tr.score!.voices.find((v) => v.id === RIGHT_VOICE)).toMatchObject({ label: 'Lead', hue: 99 })
    expect(useSettings.getState().theme).toEqual({ name: 'outline', stageBgOverride: null })
    // A shared scene never sets the recipient's volume.
    expect(useSettings.getState().audio.masterVolume).toBe(DEFAULT_SETTINGS.audio.masterVolume)
    expect(document.querySelector('.scene-file-prompt')).toBeNull()
  })

  it('applies the scene even when audio never starts (resume waits for a gesture)', async () => {
    engine.resume.mockImplementation(() => new Promise<void>(() => {}))
    try {
      const bytes = midiBytes()
      await mountAt(await shareHash('scene', sceneFor(await idOf(bytes))))
      fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
      fireEvent.change(screen.getByLabelText('Scene song file'), { target: { files: [midiFile(bytes)] } })
      await waitFor(() => expect(useSettings.getState().theme).toEqual({ name: 'outline', stageBgOverride: null }))
      expect(document.querySelector('.scene-file-prompt')).toBeNull()
    } finally {
      engine.resume.mockImplementation(async () => {})
    }
  })

  it('refuses a file whose hash does not match, then "use anyway" loads it', async () => {
    const want = midiBytes([60, 64])
    const other = midiBytes([67, 72])
    await mountAt(await shareHash('scene', sceneFor(await idOf(want))))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    fireEvent.change(screen.getByLabelText('Scene song file'), { target: { files: [midiFile(other, 'other.mid')] } })
    await waitFor(() => expect(document.querySelector('.scene-file-mismatch')).not.toBeNull())
    expect(useTransport.getState().score).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Use anyway (voices may not match)' }))
    await waitFor(() => expect(useTransport.getState().score?.name).toBe('other.mid'))
    await waitFor(() => expect(useSettings.getState().theme).toEqual({ name: 'outline', stageBgOverride: null }))
  })

  it('a midi ref whose bytes do not match its sha256 is treated like a local mismatch', async () => {
    const bytes = midiBytes()
    const id = await idOf(bytes)
    const s = sceneFor(id)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    const midiScene = { ...s, song: { kind: 'midi', sha256: 'd'.repeat(64), name: 'song.mid', dataB64: btoa(bin), title: 'Song' },
      profile: { ...s.profile, song: { ...s.profile.song, id: 'd'.repeat(64) } } }
    // A midi scene cannot go through HashShareProvider (it refuses), so it is
    // saved and loaded through the panel instead.
    await getDefaults().storage.save({ kind: 'scene', name: 'Embedded', payload: midiScene as SceneV1 })
    render(<App />)
    await loadFile(midiFile(midiBytes([67, 72]), 'b.mid'))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: /Scenes/ }))
    const load = await screen.findByRole('button', { name: 'Load Embedded' })
    await act(async () => { fireEvent.click(load) })
    await waitFor(() => expect(document.querySelector('.scene-file-mismatch')).not.toBeNull())
    expect(useTransport.getState().score?.name).toBe('b.mid')
  })
})

describe('App: saved scenes', () => {
  it('saves the current scene and loads it back over later edits, audio included', async () => {
    const bytes = midiBytes()
    render(<App />)
    await loadFile(midiFile(bytes))
    act(() => { useSettings.getState().setTheme({ name: 'outline' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: /Scenes/ }))
    fireEvent.change(screen.getByLabelText('Save name'), { target: { value: 'Mine' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save scene' })) })
    const load = await screen.findByRole('button', { name: 'Load Mine' })

    act(() => {
      useSettings.getState().setTheme({ name: 'contrast' })
      useSettings.getState().setAudio({ masterVolume: 0.2 })
    })
    await act(async () => { fireEvent.click(load) })
    expect(useSettings.getState().theme.name).toBe('outline')
    // An own scene restores its audio (only a shared one never does).
    expect(useSettings.getState().audio.masterVolume).toBe(DEFAULT_SETTINGS.audio.masterVolume)
    expect(engine.setMasterVolume).toHaveBeenLastCalledWith(DEFAULT_SETTINGS.audio.masterVolume)
  })
})

describe('App: task 2.5 fix round 1', () => {
  afterEach(() => { history.replaceState(null, '', '/') })

  it("the audio half of the file load does not overwrite the scene's voices in the engine", async () => {
    const bytes = midiBytes()
    await mountAt(await shareHash('scene', sceneFor(await idOf(bytes))))
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
    fireEvent.change(screen.getByLabelText('Scene song file'), { target: { files: [midiFile(bytes)] } })
    await waitFor(() => expect(engine.retainVoices).toHaveBeenCalled())
    const rightLoads = engine.loadVoice.mock.calls
      .map((c) => (c as unknown as [Voice])[0])
      .filter((v) => v.id === RIGHT_VOICE)
    expect(rightLoads.at(-1)).toMatchObject({ instrument: 'electric_piano_1', volume: 0.4 })
  })

  it("Save a copy of a shared scene stores the recipient's audio, so a later Load keeps their volume", async () => {
    const bytes = midiBytes()
    await mountAt(await shareHash('scene', sceneFor(await idOf(bytes), 'song.mid', { masterVolume: 0.1 })))
    act(() => { useSettings.getState().setAudio({ masterVolume: 0.33 }) })
    const save = await screen.findByRole('button', { name: 'Save a copy' })
    await act(async () => { fireEvent.click(save) })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await loadFile(midiFile(bytes))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: /Scenes/ }))
    const load = await screen.findByRole('button', { name: 'Load Song' })
    await act(async () => { fireEvent.click(load) })
    expect(useSettings.getState().theme).toEqual({ name: 'outline', stageBgOverride: null })
    expect(useSettings.getState().audio.masterVolume).toBe(0.33)
  })

  it('Scenes & looks works with no song loaded: Save scene is disabled, and loading a scene asks for its file', async () => {
    const bytes = midiBytes()
    await getDefaults().storage.save({ kind: 'scene', name: 'Kept', payload: sceneFor(await idOf(bytes)) })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Scenes & looks' }))
    const card = screen.getByRole('region', { name: 'Scenes and looks' })
    expect((screen.getByRole('button', { name: 'Save scene' }) as HTMLButtonElement).disabled).toBe(true)
    expect(card.querySelector('.save-scene-hint')?.textContent).toMatch(/Load a song to save a scene/)
    expect((screen.getByRole('button', { name: /share link \(scene\)/ }) as HTMLButtonElement).disabled).toBe(true)

    const load = await screen.findByRole('button', { name: 'Load Kept' })
    await act(async () => { fireEvent.click(load) })
    expect(document.querySelector('.scene-file-prompt')?.textContent).toMatch(/This scene uses song\.mid/)

    // The main drop zone now routes through the hash check too.
    fireEvent.change(document.getElementById('file-input')!, { target: { files: [midiFile(bytes)] } })
    await waitFor(() => expect(useTransport.getState().tempo).toEqual({ mode: 'absolute', bpm: 60 }))
    expect(useSettings.getState().theme).toEqual({ name: 'outline', stageBgOverride: null })
    expect(document.querySelector('.scene-file-prompt')).toBeNull()
  })

  it('"use anyway" with an unreadable file keeps the current song and clears busy', async () => {
    const a = midiBytes([60, 64])
    await getDefaults().storage.save({ kind: 'scene', name: 'Other', payload: sceneFor('e'.repeat(64)) })
    render(<App />)
    await loadFile(midiFile(a, 'a.mid'))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    fireEvent.click(screen.getByRole('button', { name: /Scenes/ }))
    const load = await screen.findByRole('button', { name: 'Load Other' })
    await act(async () => { fireEvent.click(load) })

    const junk = new File([new Uint8Array([1, 2, 3])], 'junk.mid', { type: 'audio/midi' })
    fireEvent.change(screen.getByLabelText('Scene song file'), { target: { files: [junk] } })
    await waitFor(() => expect(document.querySelector('.scene-file-mismatch')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Use anyway (voices may not match)' }))

    await waitFor(() => expect(document.querySelector('.stage-error')?.textContent).toMatch(/Could not read junk\.mid/))
    expect(useTransport.getState().score?.name).toBe('a.mid')
    await waitFor(() => expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false))
  })
})
