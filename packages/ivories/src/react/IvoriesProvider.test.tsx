import { describe, it, expect, vi, afterEach } from 'vitest'
import { StrictMode, createRef } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { IvoriesProvider } from './IvoriesProvider'
import { useIvories } from './hooks'
import { AudioClock } from '../core/clock/AudioClock'
import { ManualClock } from '../core/clock/ManualClock'
import { MediaClock } from '../core/clock/MediaClock'
import { FakeMedia } from '../core/clock/fakeMediaElement.test-helpers'
import { parseMidi } from '../core/io/parseMidi'
import { fakeEngine } from './testEngine.test-helpers'
import { Keyboard } from './views/Keyboard'
import type { IvoriesHandle } from './IvoriesProvider'

const bytes = () => {
  const m = new Midi(); m.header.setTempo(120)
  const t = m.addTrack()
  t.addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  t.addNote({ midi: 64, time: 1, duration: 1, velocity: 0.8 })
  return new Uint8Array(m.toArray())
}
const scoreDoc = () => parseMidi(bytes().buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })

function ScoreName() {
  const { score } = useIvories()
  return <span data-testid="name">{score?.name ?? 'none'}</span>
}

describe('IvoriesProvider (spec §3.2)', () => {
  it('renders children with the controlled score once ready', async () => {
    render(<IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}><ScoreName /></IvoriesProvider>)
    expect((await screen.findByTestId('name')).textContent).toBe('a.mid')
  })

  it('self-contained: loads a midi source and fires onReady with the duration', async () => {
    const onReady = vi.fn()
    render(<IvoriesProvider midi={bytes()} engine={fakeEngine()} onReady={onReady}><ScoreName /></IvoriesProvider>)
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(onReady.mock.calls[0][0].duration).toBeCloseTo(2, 3)
  })

  it('never retimes a self-loaded score: tempo does not change it (R1)', async () => {
    const onReady = vi.fn()
    render(<IvoriesProvider midi={bytes()} tempo={{ mode: 'scale', scale: 0.5 }} engine={fakeEngine()} onReady={onReady}><ScoreName /></IvoriesProvider>)
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(onReady.mock.calls[0][0].duration).toBeCloseTo(2, 3)
  })

  it('reports a bad source through onError and keeps rendering', async () => {
    const onError = vi.fn()
    render(<IvoriesProvider midi={new Uint8Array([1, 2, 3])} engine={fakeEngine()} onError={onError}><ScoreName /></IvoriesProvider>)
    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(onError.mock.calls[0][0].code).toBe('score-parse')
    expect(screen.getByTestId('name').textContent).toBe('none')
  })

  it('fires onNoteOn from score playback as a host ManualClock moves (spec §9)', async () => {
    const clock = new ManualClock()
    const onNoteOn = vi.fn()
    render(<IvoriesProvider score={scoreDoc()} clock={clock} engine={fakeEngine()} audio={false} onNoteOn={onNoteOn}><span /></IvoriesProvider>)
    act(() => clock.seek(0.1))
    await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 60, source: 'score' })))
    act(() => clock.set(1.5))
    await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 64 })))
  })

  it('only one provider on the page plays at a time', async () => {
    const a = new AudioClock({ currentTime: 0 }), b = new AudioClock({ currentTime: 0 })
    render(<>
      <IvoriesProvider score={scoreDoc()} clock={a} engine={fakeEngine()}><span /></IvoriesProvider>
      <IvoriesProvider score={scoreDoc()} clock={b} engine={fakeEngine()}><span /></IvoriesProvider>
    </>)
    await waitFor(() => expect(document.querySelectorAll('span')).toHaveLength(2))
    act(() => a.play())
    act(() => b.play())
    expect(b.playing).toBe(true)
    expect(a.playing).toBe(false)
  })

  it('exposes play/pause/seek/setRate/clock on its ref', async () => {
    const ref = createRef<IvoriesHandle>()
    const clock = new AudioClock({ currentTime: 0 })
    render(<IvoriesProvider ref={ref} score={scoreDoc()} clock={clock} engine={fakeEngine()}><span /></IvoriesProvider>)
    await waitFor(() => expect(ref.current).not.toBeNull())
    act(() => ref.current!.seek(1.25))
    expect(clock.now()).toBe(1.25)
    act(() => ref.current!.setRate(0.5))
    expect(ref.current!.clock.rate).toBe(0.5)
  })
})

describe('IvoriesProvider with host clocks (spec §3.1, §9)', () => {
  it('a MediaClock mutes the engine by default; audio={true} re-enables it', async () => {
    const el = new FakeMedia()
    const engine = fakeEngine()
    const { unmount } = render(<IvoriesProvider score={scoreDoc()} clock={new MediaClock(el as unknown as HTMLMediaElement)} engine={engine}><span /></IvoriesProvider>)
    await waitFor(() => expect(document.querySelector('span')).not.toBeNull())
    act(() => { void el.play() })
    await new Promise((r) => setTimeout(r, 80))
    expect(engine.play).not.toHaveBeenCalled()
    unmount()

    const el2 = new FakeMedia()
    const engine2 = fakeEngine()
    render(<IvoriesProvider score={scoreDoc()} clock={new MediaClock(el2 as unknown as HTMLMediaElement)} engine={engine2} audio><span /></IvoriesProvider>)
    await waitFor(() => expect(document.querySelector('span')).not.toBeNull())
    act(() => { void el2.play() })
    await waitFor(() => expect(engine2.play).toHaveBeenCalled())
  })

  it('a ManualClock defaults to silent too; an AudioClock or no clock schedules audio', async () => {
    const engine = fakeEngine()
    const clock = new ManualClock()
    const { unmount } = render(<IvoriesProvider score={scoreDoc()} clock={clock} engine={engine}><span /></IvoriesProvider>)
    await waitFor(() => expect(document.querySelector('span')).not.toBeNull())
    act(() => clock.play())
    await new Promise((r) => setTimeout(r, 80))
    expect(engine.play).not.toHaveBeenCalled()
    unmount()

    const engine2 = fakeEngine()
    const ref = createRef<IvoriesHandle>()
    render(<IvoriesProvider ref={ref} score={scoreDoc()} engine={engine2}><span /></IvoriesProvider>)
    await waitFor(() => expect(ref.current).not.toBeNull())
    act(() => ref.current!.play())
    await waitFor(() => expect(engine2.play).toHaveBeenCalled())
  })

  it('a MediaClock playing past the score end is not paused by the driver', async () => {
    const el = new FakeMedia()
    render(<IvoriesProvider score={scoreDoc()} clock={new MediaClock(el as unknown as HTMLMediaElement)} engine={fakeEngine()}><span /></IvoriesProvider>)
    await waitFor(() => expect(document.querySelector('span')).not.toBeNull())
    act(() => { el.currentTime = 5; void el.play() })
    await new Promise((r) => setTimeout(r, 80))
    expect(el.paused).toBe(false)
  })
})

describe('IvoriesProvider robustness', () => {
  it('a score that arrives while the clock is paused lights its notes at t (lastT resets)', async () => {
    const clock = new ManualClock()
    clock.seek(0.1)
    const onNoteOn = vi.fn()
    const engine = fakeEngine()
    const onTimeUpdate = vi.fn()
    const { rerender } = render(<IvoriesProvider score={null} clock={clock} engine={engine} audio={false} onNoteOn={onNoteOn} onTimeUpdate={onTimeUpdate}><span /></IvoriesProvider>)
    await waitFor(() => expect(onTimeUpdate).toHaveBeenCalled())   // frames have seen t with no score
    await new Promise((r) => setTimeout(r, 40))
    rerender(<IvoriesProvider score={scoreDoc()} clock={clock} engine={engine} audio={false} onNoteOn={onNoteOn} onTimeUpdate={onTimeUpdate}><span /></IvoriesProvider>)
    await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 60, source: 'score' })))
  })

  it('without Web Audio it reports audio-unavailable and the clock still runs silently', async () => {
    expect(typeof (globalThis as { AudioContext?: unknown }).AudioContext).toBe('undefined')
    const onError = vi.fn()
    const onNoteOn = vi.fn()
    const ref = createRef<IvoriesHandle>()
    const frameErrors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<IvoriesProvider ref={ref} score={scoreDoc()} onError={onError} onNoteOn={onNoteOn}><span /></IvoriesProvider>)
      await waitFor(() => expect(ref.current).not.toBeNull())
      act(() => ref.current!.seek(0.1))
      act(() => ref.current!.play())
      await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 60 })))
      expect(ref.current!.clock.playing).toBe(true)
      const t0 = ref.current!.clock.now()
      await new Promise((r) => setTimeout(r, 60))
      expect(ref.current!.clock.now()).toBeGreaterThan(t0)
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'audio-unavailable' }))
      expect(frameErrors).not.toHaveBeenCalled()
    } finally {
      frameErrors.mockRestore()
    }
  })

  it('a host ManualClock with audio on and no Web Audio reports audio-unavailable once and never throws', async () => {
    const clock = new ManualClock()
    const engine = fakeEngine({ get currentTime(): number { throw new Error('no Web Audio') } } as { currentTime: number })
    const onError = vi.fn()
    const onNoteOn = vi.fn()
    const uncaught = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.addEventListener('error', uncaught)
    try {
      render(<IvoriesProvider score={scoreDoc()} clock={clock} engine={engine} audio onError={onError} onNoteOn={onNoteOn}><span /></IvoriesProvider>)
      await waitFor(() => expect(document.querySelector('span')).not.toBeNull())
      act(() => clock.play())
      await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 60 })))
      await new Promise((r) => setTimeout(r, 120))
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'audio-unavailable' }))
      expect(engine.play).not.toHaveBeenCalled()
      expect(uncaught).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('error', uncaught)
      consoleError.mockRestore()
    }
  })

  it('a suspended engine schedules nothing; once running, only notes from the head on are handed over (no burst)', async () => {
    let ms = 0
    const clock = new ManualClock({ nowMs: () => ms })
    const engine = fakeEngine() as ReturnType<typeof fakeEngine> & { running: boolean }
    engine.running = false
    render(<IvoriesProvider score={scoreDoc()} clock={clock} engine={engine} audio><span /></IvoriesProvider>)
    await waitFor(() => expect(document.querySelector('span')).not.toBeNull())
    act(() => clock.play())
    await new Promise((r) => setTimeout(r, 80))   // the note at 0 passes while suspended
    expect(engine.play).not.toHaveBeenCalled()
    engine.running = true
    ms = 900                                       // the note at 1.0 enters the lookahead
    await waitFor(() => expect(engine.play).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 60))
    const pitches = engine.play.mock.calls.map((c) => (c[0] as { note: { pitch: number } }).note.pitch)
    expect(pitches).toEqual([64])
  })

  it('an instrument-load failure calls onError but leaves status.error unset (the score plays silently)', async () => {
    const onError = vi.fn()
    let status: { error: unknown } | null = null
    function Peek() { const iv = useIvories(); status = iv.status.get(); return <span>{iv.score ? 'loaded' : ''}</span> }
    render(<IvoriesProvider score={scoreDoc()} onError={onError}><Peek /></IvoriesProvider>)
    // The provider's own engine has no AudioContext in jsdom, so loadVoice rejects.
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'audio-unavailable', message: expect.stringContaining('instruments') })))
    expect(status!.error).toBeNull()
  })
})

describe('live MIDI (spec §4.1)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  function stubMidi() {
    const port = { id: 'k', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) }
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
    return port
  }
  function ActivePeek({ onActive }: { onActive(a: ReturnType<ReturnType<typeof useIvories>['active']['get']>): void }) {
    const iv = useIvories()
    onActive(iv.active.get())
    return null
  }

  it('lights, reports and (with liveAudio) sounds live notes', async () => {
    const port = stubMidi()
    const engine = fakeEngine()
    const onNoteOn = vi.fn()
    const onNoteOff = vi.fn()
    let iv: ReturnType<typeof useIvories> | null = null
    function Grab() { iv = useIvories(); return null }
    render(<IvoriesProvider score={scoreDoc()} engine={engine} clock={new AudioClock({ currentTime: 0 })} liveAudio onNoteOn={onNoteOn} onNoteOff={onNoteOff}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    expect(engine.prepareLive).toHaveBeenCalled()
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 62, 70) }))
    expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 62, velocity: 70, source: 'live' }))
    expect(engine.noteOn).toHaveBeenCalledWith(62, 70)
    expect(iv!.active.get().live.has(62)).toBe(true)
    expect(iv!.live.held.get().get(62)).toMatchObject({ midi: 62, velocity: 70 })
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x80, 62, 0) }))
    expect(onNoteOff).toHaveBeenCalledWith(expect.objectContaining({ midi: 62, source: 'live' }))
    expect(engine.noteOff).toHaveBeenCalledWith(62)
    expect(iv!.active.get().live.has(62)).toBe(false)
  })

  it('without liveAudio it lights but never sounds; noteOff still reaches the engine', async () => {
    const port = stubMidi()
    const engine = fakeEngine()
    render(<IvoriesProvider score={scoreDoc()} engine={engine} clock={new AudioClock({ currentTime: 0 })}><Keyboard input="midi" /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 62, 70) }))
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x80, 62, 0) }))
    expect(engine.prepareLive).not.toHaveBeenCalled()
    expect(engine.noteOn).not.toHaveBeenCalled()
    expect(engine.noteOff).toHaveBeenCalledWith(62)
  })

  it('input="none" (the default) never asks for MIDI', async () => {
    const request = vi.fn(async () => ({ inputs: { forEach() {} }, onstatechange: null }))
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: request })
    const { container } = render(<IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}><Keyboard /></IvoriesProvider>)
    await waitFor(() => expect(container.querySelector('.ivories-keyboard')).not.toBeNull())
    expect(request).not.toHaveBeenCalled()
  })

  it('unmounting the last live view stops MIDI and clears the held keys', async () => {
    const port = stubMidi()
    const engine = fakeEngine()
    const onNoteOff = vi.fn()
    let seen: { live: ReadonlyMap<number, unknown> } | null = null
    const tree = (on: boolean) => (
      <IvoriesProvider score={scoreDoc()} engine={engine} clock={new AudioClock({ currentTime: 0 })} onNoteOff={onNoteOff}>
        {on && <Keyboard input="midi" />}
        <ActivePeek onActive={(a) => { seen = a }} />
      </IvoriesProvider>
    )
    const { rerender } = render(tree(true))
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 60, 70) }))
    rerender(tree(false))
    expect(port.onmidimessage).toBeNull()
    // The key still down at release is let go: nothing keeps sounding or stays reported held.
    expect(engine.noteOff).toHaveBeenCalledWith(60)
    expect(onNoteOff).toHaveBeenCalledWith(expect.objectContaining({ midi: 60, source: 'live' }))
    rerender(tree(false))
    expect(seen!.live.size).toBe(0)
  })

  it('reports midi-unavailable and keeps rendering when Web MIDI is missing', async () => {
    const onError = vi.fn()
    const { container } = render(<IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}><Keyboard input="midi" /></IvoriesProvider>)
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'midi-unavailable' })))
    expect(container.querySelector('.ivories-keyboard')).not.toBeNull()
  })

  it('midi-unavailable only calls onError: a loading score stays loading and unerrored', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    const onError = vi.fn()
    let status: { loading: boolean; error: unknown } | null = null
    function Peek() { status = useIvories().status.get(); return null }
    const { container } = render(<IvoriesProvider scoreUrl="/never.mid" engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}><Keyboard input="midi" /><Peek /></IvoriesProvider>)
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'midi-unavailable' })))
    const st = status as unknown as { loading: boolean; error: unknown }
    expect(st.error).toBeNull()
    expect(st.loading).toBe(true)
    expect(container.textContent).toContain('Loading score')
  })

  it('reports midi-unavailable once under StrictMode (the discarded first MidiInput stays quiet)', async () => {
    const onError = vi.fn()
    render(<StrictMode><IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}><Keyboard input="midi" /></IvoriesProvider></StrictMode>)
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'midi-unavailable' })))
    await new Promise((r) => setTimeout(r, 30))
    expect(onError.mock.calls.filter(([e]) => e.code === 'midi-unavailable')).toHaveLength(1)
  })
})
