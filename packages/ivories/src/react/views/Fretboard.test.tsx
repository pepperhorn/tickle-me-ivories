import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Fretboard, FretboardDiagram } from './Fretboard'
import { Stage } from './Stage'
import { IvoriesProvider } from '../IvoriesProvider'
import { ManualClock } from '../../core/clock/ManualClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'

afterEach(() => vi.unstubAllGlobals())
describe('Fretboard', () => {
  it('switches note/fret labels, keeps pitches and exposes out-of-range notes', () => {
    const r = render(<FretboardDiagram pitches={[64, 10]} />)
    expect(r.container.querySelectorAll('.ivories-fretboard-note')).toHaveLength(3)
    expect(r.container.querySelector('[data-fret="0"] text')?.textContent).toBe('E')
    expect(screen.getByText('Outside displayed range: B♭-1')).toBeTruthy()
    r.rerender(<FretboardDiagram pitches={[64, 10]} noteLabels="fret" />)
    expect(r.container.querySelector('[data-fret="0"] text')?.textContent).toBe('0')
    expect(r.container.querySelector('[data-fret="9"] text')?.textContent).toBe('9')
  })
  it('uses B flat in note circles, titles and accessible sounding pitches', () => {
    const r = render(<FretboardDiagram pitches={[58]} />)
    expect(r.container.querySelector('[data-midi="58"] text')?.textContent).toBe('B♭')
    expect(r.container.querySelector('[data-midi="58"] title')?.textContent).toContain('B♭3')
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('B♭3')
    expect(r.container.textContent).not.toContain('A♯')
  })
  it.each([
    ['guitar', 'strat', 6], ['guitar', 'tele', 6], ['bass4', 'precision', 4], ['bass4', 'violin', 4], ['bass5', 'violin', 5],
  ] as const)('renders %s / %s with %i tuners and theme hooks', (instrument, headstock, count) => {
    const r = render(<FretboardDiagram instrument={instrument} headstock={headstock} appearance="light" pitches={[40]} />)
    expect(r.container.querySelectorAll('[data-tuner]')).toHaveLength(count)
    expect(r.container.querySelector(`[data-headstock="${headstock}"]`)).toBeTruthy()
    expect(r.container.querySelector('[data-appearance="light"]')).toBeTruthy()
    expect(r.container.querySelectorAll('.ivories-fretboard-tuning')).toHaveLength(count)
  })
  it('has distinct original headstock outlines', () => {
    const paths = ['strat', 'tele', 'precision', 'violin'].map((headstock) => {
      const r = render(<FretboardDiagram instrument={headstock === 'strat' || headstock === 'tele' ? 'guitar' : 'bass4'} headstock={headstock as 'strat'} />)
      const path = r.container.querySelector('.ivories-fretboard-wood')?.getAttribute('d')
      r.unmount()
      return path
    })
    expect(new Set(paths).size).toBe(4)
  })
  it('keeps Tele artwork resources local to each view in a split layout', () => {
    const r = render(<><FretboardDiagram headstock="tele" /><FretboardDiagram headstock="tele" appearance="light" /></>)
    const diagrams = r.container.querySelectorAll('svg')
    const ids = [...r.container.querySelectorAll('[id]')].map((el) => el.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const diagram of diagrams) {
      expect(diagram.querySelector('[data-body="tele"]')).toBeTruthy()
      expect(diagram.querySelector('[data-pickup="neck"]')).toBeTruthy()
      expect(diagram.querySelectorAll('[data-tuner]')).toHaveLength(6)
      const mask = diagram.querySelector('[mask]')?.getAttribute('mask')?.slice(5, -1)
      expect([...diagram.querySelectorAll('mask')].map((el) => el.id)).toContain(mask)
    }
  })
  it('Stage follows the provider clock across forward and backward seeks', async () => {
    const midi = new Midi()
    const track = midi.addTrack()
    track.addNote({ midi: 40, time: 0, duration: 1, velocity: 0.8 })
    track.addNote({ midi: 45, time: 1, duration: 1, velocity: 0.8 })
    const score = parseMidi(new Uint8Array(midi.toArray()).buffer, 'test.mid', { mode: 'scale', scale: 1 })
    const clock = new ManualClock()
    const r = render(<IvoriesProvider score={score} clock={clock} engine={fakeEngine()} audio={false}>
      <Stage layout={{ kind: 'single', main: { kind: 'ivories', view: 'fretboard', fretboard: { instrument: 'bass4', noteLabels: 'fret' } } }} />
    </IvoriesProvider>)
    for (const [time, pitch] of [[0.2, 40], [1.2, 45], [0.2, 40]]) {
      act(() => clock.seek(time))
      await waitFor(() => expect(r.container.querySelectorAll(`[data-midi="${pitch}"]`).length).toBeGreaterThan(0))
      expect(r.container.querySelector(`[data-midi="${pitch === 40 ? 45 : 40}"]`)).toBeNull()
    }
    act(() => clock.seek(2.5))
    await waitFor(() => expect(r.container.querySelectorAll('.ivories-fretboard-note')).toHaveLength(0))
  })
  it('enables MIDI and clears a released live note', async () => {
    const port = { id: 'keys', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) }
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
    const r = render(<Fretboard input="midi" engine={fakeEngine()} audio={false} />)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 64, 90) }))
    await waitFor(() => expect(r.container.querySelectorAll('[data-live="true"]')).toHaveLength(3))
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x80, 64, 0) }))
    await waitFor(() => expect(r.container.querySelectorAll('.ivories-fretboard-note')).toHaveLength(0))
  })
})
