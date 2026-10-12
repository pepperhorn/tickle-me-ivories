import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { render, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { IvoriesProvider } from './IvoriesProvider'
import { useIvories } from './hooks'
import { AudioClock } from '../core/clock/AudioClock'
import { ManualClock } from '../core/clock/ManualClock'
import { parseMidi } from '../core/io/parseMidi'
import { fakeEngine } from './testEngine.test-helpers'
import { Keyboard } from './views/Keyboard'

const scoreDoc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

function stubMidi() {
  const port = { id: 'k', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) }
  vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
  return port
}

let iv: ReturnType<typeof useIvories> | null = null
function Grab() { iv = useIvories(); return null }
let mounts = 0
function Counter() { useEffect(() => { mounts++ }, []); return null }
function Requester() {
  const { requestLiveClock } = useIvories()
  useEffect(() => requestLiveClock(), [requestLiveClock])
  return null
}
const on = (port: ReturnType<typeof stubMidi>, midi: number, vel = 90) => port.onmidimessage!({ data: Uint8Array.of(0x90, midi, vel) })
const off = (port: ReturnType<typeof stubMidi>, midi: number) => port.onmidimessage!({ data: Uint8Array.of(0x80, midi, 0) })

beforeEach(() => { iv = null; mounts = 0 })
afterEach(() => { vi.unstubAllGlobals() })

describe('live clock (rising-roll spec §2 Live clock, R-L)', () => {
  it('liveClock with no score runs a ManualClock that waits for the first live note and never schedules audio', async () => {
    const port = stubMidi()
    render(<IvoriesProvider liveClock engine={fakeEngine()}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    expect(iv!.clock.playing).toBe(false)
    expect(iv!.audio).toBe(false)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 60))
    expect(iv!.clock.playing).toBe(true)
    const [n] = iv!.live.trail.get()
    expect(n).toMatchObject({ midi: 60, velocity: 90, endSec: null })
    expect(n.startSec).toBeGreaterThanOrEqual(0)
    expect(n.startSec).toBeLessThan(0.05)
    await new Promise((r) => setTimeout(r, 30))
    act(() => off(port, 60))
    const [m] = iv!.live.trail.get()
    expect(m.endSec!).toBeGreaterThan(m.startSec)
  })

  it('with liveAudio, a live key resumes a suspended engine and sounds', async () => {
    const port = stubMidi()
    const engine = fakeEngine()
    ;(engine as unknown as { running: boolean }).running = false
    render(<IvoriesProvider liveClock liveAudio engine={engine}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 60))
    expect(engine.resume).toHaveBeenCalled()
    expect(engine.noteOn).toHaveBeenCalledWith(60, 90)
  })

  it('autoStart starts the live clock at mount', async () => {
    render(<IvoriesProvider liveClock autoStart engine={fakeEngine()}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    await waitFor(() => expect(iv!.clock.playing).toBe(true))
  })

  it('a host clock always wins; a score keeps the own AudioClock', async () => {
    const host = new AudioClock({ currentTime: 0 })
    const a = render(<IvoriesProvider liveClock clock={host} engine={fakeEngine()}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBe(host))
    a.unmount()
    iv = null
    render(<IvoriesProvider liveClock score={scoreDoc()} engine={fakeEngine()}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
  })

  it('a child asking for the live clock switches to it without remounting children; releasing switches back', async () => {
    const engine = fakeEngine()
    const tree = (kids: ReactNode) => <IvoriesProvider engine={engine}><Counter />{kids}<Grab /></IvoriesProvider>
    const { rerender } = render(tree(<Requester />))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    rerender(tree(null))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
    expect(mounts).toBe(1)
  })

  it('a score arriving ends the live clock and clears the trail; children stay mounted (Review Focus 5)', async () => {
    const port = stubMidi()
    const engine = fakeEngine()
    const tree = (score: ReturnType<typeof scoreDoc> | null) => (
      <IvoriesProvider liveClock score={score} engine={engine}><Keyboard input="midi" /><Counter /><Grab /></IvoriesProvider>
    )
    const { rerender } = render(tree(null))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 60))
    expect(iv!.live.trail.get()).toHaveLength(1)
    rerender(tree(scoreDoc()))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
    expect(iv!.live.trail.get()).toEqual([])
    expect(mounts).toBe(1)
  })

  it('taking away a host clock falls back to the own clock without remounting children (preflight T4-1)', async () => {
    const engine = fakeEngine()
    const host = new ManualClock()
    const tree = (clock: ManualClock | undefined) => <IvoriesProvider clock={clock} engine={engine}><Counter /><Grab /></IvoriesProvider>
    const { rerender } = render(tree(host))
    await waitFor(() => expect(iv?.clock).toBe(host))
    rerender(tree(undefined))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
    expect(mounts).toBe(1)
  })
})

describe('live trail on the provider clock (R-T)', () => {
  it('a seek drops finished trail notes and restarts held ones at the new position (Review Focus 1)', async () => {
    const port = stubMidi()
    const host = new ManualClock()
    render(<IvoriesProvider score={scoreDoc()} clock={host} engine={fakeEngine()}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => { on(port, 60); on(port, 62, 80); off(port, 62) })
    expect(iv!.live.trail.get()).toHaveLength(2)
    act(() => host.seek(5))
    expect(iv!.live.trail.get()).toEqual([{ midi: 60, velocity: 90, startSec: 5, endSec: null }])
  })

  it('stamps notes with clock time, not the MIDI timestamp', async () => {
    const port = stubMidi()
    const host = new ManualClock()
    host.seek(12)
    render(<IvoriesProvider score={scoreDoc()} clock={host} engine={fakeEngine()}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 64))
    expect(iv!.live.trail.get()[0].startSec).toBe(12)
    expect(iv!.live.held.get().get(64)!.time).not.toBe(12)   // LiveNote.time stays on performance.now()
  })
})

describe('bpm (R-P, Review Focus 3)', () => {
  it('defaults to 100, follows the prop, and setBpm clamps, rounds, ignores NaN and reports', async () => {
    const engine = fakeEngine()
    const onBpmChange = vi.fn()
    const { rerender } = render(<IvoriesProvider engine={engine} onBpmChange={onBpmChange}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv).not.toBeNull())
    expect(iv!.bpm).toBe(100)
    act(() => iv!.setBpm(500))
    expect(iv!.bpm).toBe(300)
    expect(onBpmChange).toHaveBeenLastCalledWith(300)
    act(() => iv!.setBpm(Number.NaN))
    expect(iv!.bpm).toBe(300)
    expect(onBpmChange).toHaveBeenCalledTimes(1)
    act(() => iv!.setBpm(87.4))
    expect(iv!.bpm).toBe(87)
    rerender(<IvoriesProvider engine={engine} bpm={132} onBpmChange={onBpmChange}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv!.bpm).toBe(132))
    rerender(<IvoriesProvider engine={engine} bpm={5} onBpmChange={onBpmChange}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv!.bpm).toBe(20))
  })

  it('changing the BPM never re-times the trail', async () => {
    const port = stubMidi()
    render(<IvoriesProvider liveClock engine={fakeEngine()}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 60))
    const before = iv!.live.trail.get()
    act(() => iv!.setBpm(60))
    expect(iv!.live.trail.get()).toBe(before)
  })
})
