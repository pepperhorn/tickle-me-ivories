import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { IvoriesProvider } from './IvoriesProvider'
import { Keyboard } from './views/Keyboard'
import { Transport } from './views/Transport'
import { parseMidi } from '../core/io/parseMidi'

/**
 * The provider's OWN engine on a fake pepperscore/audio (real claimPlayback slot, fake sounds):
 * a context whose clock is real time, and instruments that record every start (what pepperscore
 * turns into an AudioBufferSourceNode start in a browser).
 */
const ps = vi.hoisted(() => {
  const gain = () => ({
    gain: { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {} },
    connect() {}, disconnect() {},
  })
  const ctx = { get currentTime() { return performance.now() / 1000 }, state: 'running', destination: {}, createGain: gain, resume: async () => {} }
  type Inst = { sound: string; base: unknown; starts: { note: unknown; time: number }[]; stops: number }
  return { ctx, instruments: [] as Inst[], metronomes: 0 }
})
vi.mock('pepperscore/audio', async (orig) => {
  const real = await orig<typeof import('pepperscore/audio')>()
  return {
    ...real,
    getSharedAudio: () => ({ context: ps.ctx, master: {} }),
    resumeAudio: async () => true,
    loadInstrument: async (sound: string, o: { assetBaseUrl?: string }) => {
      const inst = { sound, base: o.assetBaseUrl, starts: [] as { note: unknown; time: number }[], stops: 0 }
      ps.instruments.push(inst)
      return {
        start: (n: { note: unknown; time: number }) => { inst.starts.push({ note: n.note, time: n.time }); return () => {} },
        stop: () => { inst.stops++ },
        dispose: () => {},
      }
    },
    createMetronome: async () => {
      ps.metronomes++
      return { output: { gain: { value: 0.5 } }, tick: () => () => {}, setVoice: async () => {}, stop: () => {}, dispose: () => {} }
    },
  }
})

const score = () => {
  const m = new Midi(); m.header.setTempo(240)
  const t = m.addTrack()
  for (let i = 0; i < 16; i++) t.addNote({ midi: 60 + (i % 5), time: i * 0.125, duration: 0.1, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

const of = (base: string) => ps.instruments.filter((i) => i.base === base)
const startsOf = (base: string) => of(base).reduce((n, i) => n + i.starts.length, 0)

beforeEach(() => { ps.instruments.length = 0; ps.metronomes = 0 })

describe('provider audio on pepperscore/audio (regressions for the 0.1.1 silence)', () => {
  it('a keyboard-only view with `sounds` plays: Play hands the score to the instrument as MIDI note numbers', async () => {
    render(
      <IvoriesProvider score={score()} sounds={{ assetBaseUrl: 'https://a.test/' }} countIn={0}>
        <Keyboard /><Transport />
      </IvoriesProvider>,
    )
    await waitFor(() => expect(of('https://a.test/').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(startsOf('https://a.test/')).toBeGreaterThanOrEqual(5), { timeout: 3000 })
    const notes = of('https://a.test/').flatMap((i) => i.starts.map((s) => s.note))
    expect(notes.slice(0, 5)).toEqual([60, 61, 62, 63, 64])
    expect(notes.every((n) => typeof n === 'number')).toBe(true)
    // The count-in is off and the metronome is off: nothing loads the 6 MB wood blocks.
    expect(ps.metronomes).toBe(0)
  })

  it('the count-in loads the metronome lazily, on Play', async () => {
    render(<IvoriesProvider score={score()} sounds={{ assetBaseUrl: 'https://a.test/' }}><Keyboard /><Transport /></IvoriesProvider>)
    await waitFor(() => expect(of('https://a.test/').length).toBeGreaterThan(0))
    expect(ps.metronomes).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(ps.metronomes).toBe(1))
  })

  it('Stop cancels the queued notes (pepperscore stop) and hands nothing more over', async () => {
    render(<IvoriesProvider score={score()} sounds={{ assetBaseUrl: 'https://a.test/' }} countIn={0}><Keyboard /><Transport /></IvoriesProvider>)
    await waitFor(() => expect(of('https://a.test/').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(startsOf('https://a.test/')).toBeGreaterThan(0), { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(of('https://a.test/').some((i) => i.stops > 0)).toBe(true)
    const handed = startsOf('https://a.test/')
    await new Promise((r) => setTimeout(r, 300))
    expect(startsOf('https://a.test/')).toBe(handed)
  })

  it('two providers on one page never double-play: starting one stops the other', async () => {
    render(
      <>
        <div data-testid="a"><IvoriesProvider score={score()} sounds={{ assetBaseUrl: 'https://a.test/' }} countIn={0}><Keyboard /><Transport /></IvoriesProvider></div>
        <div data-testid="b"><IvoriesProvider score={score()} sounds={{ assetBaseUrl: 'https://b.test/' }} countIn={0}><Keyboard /><Transport /></IvoriesProvider></div>
      </>,
    )
    await waitFor(() => expect(of('https://a.test/').length * of('https://b.test/').length).toBeGreaterThan(0))
    const a = within(screen.getByTestId('a'))
    const b = within(screen.getByTestId('b'))
    fireEvent.click(a.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(startsOf('https://a.test/')).toBeGreaterThan(0), { timeout: 3000 })
    fireEvent.click(b.getByRole('button', { name: 'Play' }))
    await waitFor(() => expect(startsOf('https://b.test/')).toBeGreaterThan(0), { timeout: 3000 })
    // A was paused by B's claim: its button reads Play again, its queued notes were cancelled.
    await a.findByRole('button', { name: 'Play' })
    expect(of('https://a.test/').some((i) => i.stops > 0)).toBe(true)
    const aHanded = startsOf('https://a.test/')
    const bHanded = startsOf('https://b.test/')
    await new Promise((r) => setTimeout(r, 300))
    expect(startsOf('https://a.test/')).toBe(aHanded)
    expect(startsOf('https://b.test/')).toBeGreaterThan(bHanded)
  })
})
