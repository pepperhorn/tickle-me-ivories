import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Transport } from './Transport'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'
import { formatTime } from '../format'

const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 4, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

function setup(controls?: Parameters<typeof Transport>[0]['controls'], engine = fakeEngine()) {
  const clock = new AudioClock({ currentTime: 0 })
  render(<IvoriesProvider score={doc()} clock={clock} engine={engine}><Transport controls={controls} /></IvoriesProvider>)
  return { clock, engine }
}

describe('Transport (spec §4)', () => {
  it('formats m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(75.9)).toBe('1:15')
    expect(formatTime(-3)).toBe('0:00')
  })

  it('play toggles the provider clock and resumes audio', async () => {
    const { clock, engine } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }))
    expect(engine.resume).toHaveBeenCalled()
    // The clock starts once resume() settles (the downbeat is not lost to a starting context).
    await waitFor(() => expect(clock.playing).toBe(true))
    await screen.findByRole('button', { name: 'Pause' })
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(clock.playing).toBe(false)
  })

  it('the seek bar seeks and the tempo slider sets the clock rate', async () => {
    const { clock } = setup()
    fireEvent.change(await screen.findByLabelText('Seek'), { target: { value: '2.5' } })
    expect(clock.now()).toBeCloseTo(2.5, 9)
    fireEvent.change(screen.getByLabelText('Tempo'), { target: { value: '0.5' } })
    expect(clock.rate).toBe(0.5)
  })

  it('controls overrides hide pieces', async () => {
    setup({ seek: false, tempo: false, metronome: false })
    await screen.findByRole('button', { name: 'Play' })
    expect(screen.queryByLabelText('Seek')).toBeNull()
    expect(screen.queryByLabelText('Tempo')).toBeNull()
    expect(screen.queryByLabelText('Metronome')).toBeNull()
  })

  it('offers "Tap to enable sound" while the clock runs silently', async () => {
    const engine = fakeEngine()
    ;(engine as unknown as { running: boolean }).running = false
    const { clock } = setup(undefined, engine)
    await screen.findByRole('button', { name: 'Play' })
    act(() => clock.play())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tap to enable sound' })).toBeTruthy())
  })
})

describe('Transport BPM field (rising-roll spec §2 BPM wiring)', () => {
  it('shows with no score and sets the provider BPM', async () => {
    const onBpmChange = vi.fn()
    render(<IvoriesProvider engine={fakeEngine()} liveClock onBpmChange={onBpmChange}><Transport /></IvoriesProvider>)
    const field = await screen.findByLabelText('BPM') as HTMLInputElement
    expect(field.value).toBe('100')
    fireEvent.change(field, { target: { value: '120' } })
    expect(onBpmChange).toHaveBeenLastCalledWith(120)
    await waitFor(() => expect(field.value).toBe('120'))
  })

  it('typing an invalid BPM never commits it; blur restores the current value (Review Focus 3)', async () => {
    const onBpmChange = vi.fn()
    render(<IvoriesProvider engine={fakeEngine()} liveClock onBpmChange={onBpmChange}><Transport /></IvoriesProvider>)
    const field = await screen.findByLabelText('BPM') as HTMLInputElement
    for (const v of ['', '5', '1', '1e9', '301']) fireEvent.change(field, { target: { value: v } })
    expect(onBpmChange).not.toHaveBeenCalled()
    fireEvent.blur(field)
    expect(field.value).toBe('100')
  })

  it('is hidden with a score', async () => {
    setup()
    await screen.findByRole('button', { name: 'Play' })
    expect(screen.queryByLabelText('BPM')).toBeNull()
  })

  it('controls.bpm=false hides it in live mode too', async () => {
    render(<IvoriesProvider engine={fakeEngine()} liveClock><Transport controls={{ bpm: false }} /></IvoriesProvider>)
    await screen.findByRole('button', { name: 'Play' })
    expect(screen.queryByLabelText('BPM')).toBeNull()
  })
})
