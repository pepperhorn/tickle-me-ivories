import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { IvoriesProvider } from './IvoriesProvider'
import { useMidiRecorder } from './useMidiRecorder'
import { AudioClock } from '../core/clock/AudioClock'
import { fakeEngine } from './testEngine.test-helpers'
import type { ScoreDocument } from '../core/model/types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useMidiRecorder (spec §4.2)', () => {
  it('records live notes into a score that can be loaded back', async () => {
    const port = { id: 'k', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array; timeStamp: number }) => void) }
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
    let api: ReturnType<typeof useMidiRecorder> | null = null
    function Probe() { api = useMidiRecorder(); return null }
    render(<IvoriesProvider score={null} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}><Probe /></IvoriesProvider>)
    await waitFor(() => expect(api).not.toBeNull())
    vi.spyOn(performance, 'now').mockReturnValue(10_000)
    act(() => api!.start())
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 60, 100), timeStamp: 10_500 }))
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x80, 60, 0), timeStamp: 11_000 }))
    let score: ScoreDocument | null = null
    await act(async () => { score = await api!.stop() })
    expect(score!.notes.map((n) => [n.pitch, n.startSec, n.endSec])).toEqual([[60, 0.5, 1]])
    expect(score!.id).toMatch(/^[0-9a-f]{64}$/)
  })
})
