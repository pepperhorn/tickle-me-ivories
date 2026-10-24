import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, waitFor, act, fireEvent } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { IvoriesProvider } from './IvoriesProvider'
import { AudioClock } from '../core/clock/AudioClock'
import { parseMidi } from '../core/io/parseMidi'
import { LOOKAHEAD_SEC } from '../core/audio/scheduler'
import { fakeEngine } from './testEngine.test-helpers'
import { Transport } from './views/Transport'
import { FallingKeys } from './views/FallingKeys'
import { stubCtx } from '../core/render/pianoRoll.test-helpers'
import type { IvoriesHandle } from './IvoriesProvider'
import { DEFAULT_SETTINGS } from '../core/settings/types'
import { Keyboard } from './views/Keyboard'

/** 120 bpm 4/4, first note on the downbeat; four bars long. */
const bytes = (num = 4, den = 4) => {
  const m = new Midi(); m.header.setTempo(120)
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [num, den] })
  const t = m.addTrack()
  for (let i = 0; i < 16; i++) t.addNote({ midi: 60 + (i % 5), time: i * 0.5, duration: 0.5, velocity: 0.8 })
  return new Uint8Array(m.toArray())
}
const doc = (num = 4, den = 4) => parseMidi(bytes(num, den).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })

function rig(extra: Record<string, unknown> = {}, num = 4, den = 4) {
  const src = { currentTime: 100 }
  const clock = new AudioClock(src)
  const ref = createRef<IvoriesHandle>()
  const utils = render(<IvoriesProvider ref={ref} score={doc(num, den)} clock={clock} engine={fakeEngine(src)} {...extra}><Transport /></IvoriesProvider>)
  return { src, clock, ref, ...utils }
}

describe('count-in on Play (user ruling 2026-10-22)', () => {
  it('Play from 0:00 starts one bar (plus one lookahead) before the downbeat', async () => {
    const r = rig()
    await waitFor(() => expect(r.ref.current).not.toBeNull())
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.clock.playing).toBe(true))
    expect(r.clock.now()).toBeCloseTo(-(2 + LOOKAHEAD_SEC), 9)
  })

  it('two bars of 3/4, and 6/8, follow the opening metre', async () => {
    const a = rig({ countIn: 2 }, 3, 4)
    await waitFor(() => expect(a.ref.current).not.toBeNull())
    act(() => a.ref.current!.play())
    await waitFor(() => expect(a.clock.playing).toBe(true))
    expect(a.clock.now()).toBeCloseTo(-(3 + LOOKAHEAD_SEC), 9)
    a.unmount()
    const b = rig({ countIn: 1 }, 6, 8)
    await waitFor(() => expect(b.ref.current).not.toBeNull())
    act(() => b.ref.current!.play())
    await waitFor(() => expect(b.clock.playing).toBe(true))
    expect(b.clock.now()).toBeCloseTo(-(1.5 + LOOKAHEAD_SEC), 9)
  })

  it('count-in off: one silent beat, no lookahead pad (there is no click to schedule early)', async () => {
    const r = rig({ countIn: 0 })
    await waitFor(() => expect(r.ref.current).not.toBeNull())
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.clock.playing).toBe(true))
    expect(r.clock.now()).toBeCloseTo(-0.5, 9)
  })

  it('a resume from pause or a play after a seek does not replay the count-in', async () => {
    const r = rig()
    await waitFor(() => expect(r.ref.current).not.toBeNull())
    act(() => r.clock.seek(3.25))
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.clock.playing).toBe(true))
    expect(r.clock.now()).toBeCloseTo(3.25, 9)
    r.src.currentTime += 1
    act(() => r.ref.current!.pause())
    expect(r.clock.now()).toBeCloseTo(4.25, 9)
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.clock.playing).toBe(true))
    expect(r.clock.now()).toBeCloseTo(4.25, 9)
  })

  it('a pause inside the count-in resumes where it stopped', async () => {
    const r = rig()
    await waitFor(() => expect(r.ref.current).not.toBeNull())
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.clock.playing).toBe(true))
    r.src.currentTime += 1
    act(() => r.ref.current!.pause())
    const at = r.clock.now()
    expect(at).toBeLessThan(0)
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.clock.playing).toBe(true))
    expect(r.clock.now()).toBeCloseTo(at, 9)
  })

  it('Play after the end starts again from the top, with the count-in', async () => {
    const r = rig()
    await waitFor(() => expect(r.ref.current).not.toBeNull())
    act(() => r.clock.seek(8))
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.clock.playing).toBe(true))
    expect(r.clock.now()).toBeCloseTo(-(2 + LOOKAHEAD_SEC), 9)
  })

  it('the Transport Count-in select switches between Off, 1 bar and 2 bars', async () => {
    const r = rig()
    const select = await waitFor(() => r.container.querySelector<HTMLSelectElement>('.ivories-count-in-select')!)
    expect(select.value).toBe('1')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Off', '1 bar', '2 bars'])
    fireEvent.change(select, { target: { value: '2' } })
    expect(select.value).toBe('2')
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.clock.playing).toBe(true))
    expect(r.clock.now()).toBeCloseTo(-(4 + LOOKAHEAD_SEC), 9)
  })

  it('the Transport track carries a mark per beat (the seek SVG reports how many)', async () => {
    const r = rig()
    const track = await waitFor(() => r.container.querySelector('.ivories-seek-track')!)
    // jsdom has no layout: give the SVG a width and let the effect measure it again on remount.
    expect(track).not.toBeNull()
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 814, height: 16, top: 0, left: 0, right: 814, bottom: 16, x: 0, y: 0, toJSON() {} } as DOMRect)
    r.unmount()
    const again = rig()
    await waitFor(() => expect(Number(again.container.querySelector('.ivories-seek-track')!.getAttribute('data-beat-ticks'))).toBeGreaterThan(0))
    // Four bars of 4/4 = 16 beats; the first and last edges are the track's own ends.
    expect(again.container.querySelector('.ivories-seek-track')!.getAttribute('data-beat-ticks')).toBe('15')
    expect(again.container.querySelectorAll('.ivories-seek-bar-marks')).toHaveLength(1)
    vi.restoreAllMocks()
  })

  it('the falling view shows the count "1 2 3 4" during the lead-in, and nothing from t = 0', async () => {
    const stub = stubCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => stub.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext)
    const src = { currentTime: 100 }
    const clock = new AudioClock(src)
    const { container } = render(<IvoriesProvider score={doc()} clock={clock} engine={fakeEngine(src)}><FallingKeys /></IvoriesProvider>)
    const overlay = await waitFor(() => container.querySelector('.ivories-count-in-overlay')!)
    const shown = async (t: number) => {
      act(() => clock.seek(t))
      await waitFor(() => expect(overlay.getAttribute('data-count') ?? '0').toBe(String(expected(t))))
      return overlay.querySelector('.ivories-count-in-number')?.textContent ?? ''
    }
    const expected = (t: number) => (t < -2 || t >= 0 ? 0 : Math.floor(t + 2) * 2 + (t + 2 - Math.floor(t + 2) >= 0.5 ? 2 : 1))
    expect(await shown(-2)).toBe('1')
    expect(await shown(-1.4)).toBe('2')
    expect(await shown(-0.9)).toBe('3')
    expect(await shown(-0.1)).toBe('4')
    expect(await shown(0)).toBe('')
    vi.restoreAllMocks()
  })

  it('changing the Count-in while playing hands no note or click to Web Audio twice', async () => {
    const src = { currentTime: 100 }
    const clock = new AudioClock(src)
    const engine = fakeEngine(src)
    const clicks: number[] = []
    const metro = { click: (t: number) => { clicks.push(t) }, stop: () => {} }
    ;(engine as unknown as { metronome: () => typeof metro }).metronome = () => metro
    const ref = createRef<IvoriesHandle>()
    const { container } = render(
      <IvoriesProvider ref={ref} score={doc()} clock={clock} engine={engine} settings={{ audio: { ...DEFAULT_SETTINGS.audio, metronome: true } }}>
        <Transport />
      </IvoriesProvider>,
    )
    await waitFor(() => expect(ref.current).not.toBeNull())
    // Past the top (no count-in); the beat and the note at 0.5 sit inside the lookahead.
    act(() => { clock.seek(0.4); clock.play() })
    await waitFor(() => expect(engine.play).toHaveBeenCalled())
    await waitFor(() => expect(clicks.length).toBeGreaterThan(0))
    const select = container.querySelector<HTMLSelectElement>('.ivories-count-in-select')!
    fireEvent.change(select, { target: { value: '2' } })
    await new Promise((r) => setTimeout(r, 60))
    fireEvent.change(select, { target: { value: '0' } })
    await new Promise((r) => setTimeout(r, 60))
    const ids = engine.play.mock.calls.map((c) => (c[0] as { note: { id: number } }).note.id)
    expect(ids).toEqual([...new Set(ids)])
    expect(clicks).toEqual([...new Set(clicks)])
  })

  it('the count is announced once per count-in, by one stage view, not every beat by every view', async () => {
    const stub = stubCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => stub.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext)
    const src = { currentTime: 100 }
    const clock = new AudioClock(src)
    const { container } = render(<IvoriesProvider score={doc()} clock={clock} engine={fakeEngine(src)}><FallingKeys /><Keyboard /></IvoriesProvider>)
    await waitFor(() => expect(container.querySelectorAll('.ivories-count-in-overlay').length).toBe(2))
    const overlays = [...container.querySelectorAll('.ivories-count-in-overlay')]
    // The big numbers are visual only.
    for (const o of overlays) {
      expect(o.getAttribute('aria-live')).toBeNull()
      expect(o.getAttribute('aria-hidden')).toBe('true')
    }
    const status = () => [...container.querySelectorAll('.ivories-count-in-status')]
    expect(status()).toHaveLength(1)
    expect(status()[0].getAttribute('role')).toBe('status')
    const texts: string[] = []
    for (const t of [-2, -1.4, -0.9, -0.1]) {
      act(() => clock.seek(t))
      await waitFor(() => expect(overlays[0].getAttribute('data-count')).not.toBeNull())
      texts.push(status()[0].textContent ?? '')
    }
    expect(new Set(texts)).toEqual(new Set(['Count-in']))
    act(() => clock.seek(0.5))
    await waitFor(() => expect(status()[0].textContent).toBe(''))
    vi.restoreAllMocks()
  })

  it('Play claims the page at once, before the audio has resumed: another playing provider stops on the press', async () => {
    const srcA = { currentTime: 100 }, srcB = { currentTime: 100 }
    const clockA = new AudioClock(srcA), clockB = new AudioClock(srcB)
    const engineB = fakeEngine(srcB)
    // B's context takes its time to start (Play waits up to RESUME_WAIT_MS for it).
    ;(engineB as unknown as { resume: () => Promise<void> }).resume = () => new Promise(() => {})
    const a = createRef<IvoriesHandle>(), b = createRef<IvoriesHandle>()
    render(
      <>
        <IvoriesProvider ref={a} score={doc()} clock={clockA} engine={fakeEngine(srcA)}><Transport /></IvoriesProvider>
        <IvoriesProvider ref={b} score={doc()} clock={clockB} engine={engineB}><Transport /></IvoriesProvider>
      </>,
    )
    await waitFor(() => expect(a.current && b.current).toBeTruthy())
    act(() => a.current!.play())
    await waitFor(() => expect(clockA.playing).toBe(true))
    act(() => b.current!.play())
    expect(clockA.playing).toBe(false)
    expect(clockB.playing).toBe(false)
    await waitFor(() => expect(clockB.playing).toBe(true), { timeout: 2000 })
    act(() => b.current!.pause())
  })
})
