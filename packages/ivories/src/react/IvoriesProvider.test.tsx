import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
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
