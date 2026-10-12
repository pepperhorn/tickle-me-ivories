import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, waitFor, act, fireEvent, screen } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { RisingKeys } from './RisingKeys'
import { IvoriesProvider } from '../IvoriesProvider'
import { useIvories } from '../hooks'
import { AudioClock } from '../../core/clock/AudioClock'
import { ManualClock } from '../../core/clock/ManualClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'
import { stubCtx } from '../../core/render/pianoRoll.test-helpers'

const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

let iv: ReturnType<typeof useIvories> | null = null
function Grab() { iv = useIvories(); return null }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); iv = null })

describe('RisingKeys (rising-roll spec §2 Rising view)', () => {
  it('without a score it asks the provider for the live clock and carries the BPM', async () => {
    const { container } = render(<IvoriesProvider engine={fakeEngine()} bpm={132}><RisingKeys /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    const root = container.querySelector('.ivories-view.ivories-rising')!
    expect(root.getAttribute('data-ivories-view')).toBe('rising')
    expect(root.getAttribute('data-bpm')).toBe('132')
    expect(root.getAttribute('data-orientation')).toBe('vertical')
  })

  it('self-contained: outside a provider it builds one and hands it bpm', async () => {
    const { container } = render(<RisingKeys engine={fakeEngine()} bpm={90} />)
    await waitFor(() => expect(container.querySelector('.ivories-rising')?.getAttribute('data-bpm')).toBe('90'))
  })

  it('with a score the clock stays the score clock', async () => {
    render(<IvoriesProvider score={doc()} engine={fakeEngine()}><RisingKeys /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
  })

  it('unmounting the last rising view releases the live clock', async () => {
    function Toggle() {
      const [show, setShow] = useState(true)
      return <>{show && <RisingKeys />}<button type="button" onClick={() => setShow(false)}>hide</button></>
    }
    render(<IvoriesProvider engine={fakeEngine()}><Toggle /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    fireEvent.click(screen.getByText('hide'))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
  })

  it('a live note starts the clock and the view draws on (data-t advances), under the horizontal transform', async () => {
    const port = { id: 'k', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) }
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
    const stub = stubCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stub.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const { container } = render(<IvoriesProvider engine={fakeEngine()}><RisingKeys input="midi" orientation="horizontal" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    const root = () => container.querySelector<HTMLElement>('.ivories-rising')!
    await waitFor(() => expect(root().dataset.t).toBe('0'))
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 60, 100) }))
    await waitFor(() => expect(Number(root().dataset.t)).toBeGreaterThan(0))
    expect(stub.calls).toContain('transform(6)')
    expect(root().getAttribute('data-orientation')).toBe('horizontal')
  })
})
