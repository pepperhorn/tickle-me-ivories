import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { IvoriesProvider } from './IvoriesProvider'
import { useIvories } from './hooks'
import { AudioClock } from '../core/clock/AudioClock'
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

  it('fires onNoteOn from score playback as the clock moves', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    const onNoteOn = vi.fn()
    render(<IvoriesProvider score={scoreDoc()} clock={clock} engine={fakeEngine()} audio={false} onNoteOn={onNoteOn}><span /></IvoriesProvider>)
    act(() => clock.seek(0.1))
    await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 60, source: 'score' })))
    act(() => clock.seek(1.5))
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
