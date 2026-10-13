import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Notation } from './Notation'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMusicXml } from '../../core/io/parseMusicXml'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'
import type { PepperScoreClockProps } from './loadPepperscore'

const seen: { props: PepperScoreClockProps | null } = vi.hoisted(() => ({ props: null }))
vi.mock('pepperscore', () => ({
  PepperScore: (p: PepperScoreClockProps) => { seen.props = p; return <div data-testid="pepperscore" /> },
}))

const xml = readFileSync(join(__dirname, '../../core/io/__fixtures__/clock-contract.musicxml'), 'utf8')
const xmlScore = () => parseMusicXml(xml, 'c.musicxml', { mode: 'scale', scale: 1 })
const midiScore = () => {
  const m = new Midi(); m.addTrack().addNote({ midi: 60, time: 0, duration: 1 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

describe('Notation (spec §4.3)', () => {
  it('passes pepperscore the MusicXML in clock mode: chrome none, audio off, a clock adapter', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    render(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()}><Notation view="endless" zoom={1.2} /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    const p = seen.props!
    expect(p).toMatchObject({ musicXml: xml, chrome: 'none', audio: false, view: 'endless', settings: { zoom: 1.2 } })
    act(() => clock.seek(2.5))
    expect(p.clock!.now()).toBe(2.5)
    expect(p.clock!.playing).toBe(false)
  })

  it('forwards clock events to pepperscore with own-tempo times', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    render(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()}><Notation /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    const events: { type: string; time: number }[] = []
    const off = seen.props!.clock!.subscribe((e) => events.push(e))
    act(() => clock.seek(1.25))
    off()
    act(() => clock.seek(3))
    expect(events).toEqual([{ type: 'seek', time: 1.25 }])
  })

  it('keeps the adapter identity across re-renders (pepperscore resubscribes on change, R17)', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    const { rerender } = render(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()}><Notation /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    const first = seen.props!.clock
    rerender(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()} fallSeconds={5}><Notation zoom={2} /></IvoriesProvider>)
    await waitFor(() => expect(seen.props!.settings).toEqual({ zoom: 2 }))
    expect(seen.props!.clock).toBe(first)
  })

  it('onSeek from a click in the score seeks the provider clock', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    render(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()}><Notation /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    act(() => seen.props!.onSeek!(4.5))
    expect(clock.now()).toBe(4.5)
  })

  it('maps a studio-retimed provider time to own-tempo seconds and back', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    const half = { mode: 'scale', scale: 0.5 } as const
    const retimed = parseMusicXml(xml, 'c.musicxml', half)
    render(<IvoriesProvider score={retimed} tempo={half} clock={clock} engine={fakeEngine()}><Notation /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    act(() => clock.seek(1))           // 1 retimed second = 0.5 own seconds at 120 bpm
    expect(seen.props!.clock!.now()).toBeCloseTo(0.5, 9)
    act(() => seen.props!.onSeek!(0.5))
    expect(clock.now()).toBeCloseTo(1, 9)
  })

  it('renders the notation root with its view attribute', async () => {
    const { container } = render(<IvoriesProvider score={xmlScore()} clock={new AudioClock({ currentTime: 0 })} engine={fakeEngine()}><Notation view="endless" height={300} /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    const root = container.querySelector('div.ivories.ivories-view.ivories-notation') as HTMLElement
    expect(root.dataset.ivoriesView).toBe('endless')
    expect(root.style.height).toBe('300px')
  })

  it('a MIDI-only score shows the needs-MusicXML message and reports it', async () => {
    const onError = vi.fn()
    render(<IvoriesProvider score={midiScore()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}><Notation /></IvoriesProvider>)
    expect((await screen.findByRole('status')).textContent).toMatch(/needs MusicXML/)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'notation-needs-musicxml' }))
  })
})
