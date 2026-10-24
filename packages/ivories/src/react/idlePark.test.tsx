import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRef } from 'react'
import { render, waitFor, act, fireEvent } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { IvoriesProvider } from './IvoriesProvider'
import { AudioClock } from '../core/clock/AudioClock'
import { ManualClock } from '../core/clock/ManualClock'
import { parseMidi } from '../core/io/parseMidi'
import { LOOKAHEAD_SEC } from '../core/audio/scheduler'
import { fakeEngine } from './testEngine.test-helpers'
import { Transport } from './views/Transport'
import { FallingKeys } from './views/FallingKeys'
import { stubCtx, state } from '../core/render/pianoRoll.test-helpers'
import { drawRoll, visibleNotes } from '../core/render/pianoRoll'
import { risingSpan } from '../core/render/rising'
import { scoreBeatClock } from '../core/render/beats'
import { computeLayout } from '../core/render/geometry'
import type { IvoriesHandle } from './IvoriesProvider'
import type { NoteEvent } from '../core/model/types'

const SCALE_1 = { mode: 'scale', scale: 1 } as const

/** 120 bpm 4/4, a chord on the downbeat (t = 0) then a run; four bars long. */
const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  const t = m.addTrack()
  t.addNote({ midi: 64, time: 0, duration: 0.5, velocity: 0.8 })
  t.addNote({ midi: 67, time: 0, duration: 0.5, velocity: 0.8 })
  for (let i = 0; i < 16; i++) t.addNote({ midi: 60 + (i % 5), time: i * 0.5, duration: 0.5, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', SCALE_1)
}

/** Every bar rect drawRoll paints at t: [top, bottom] in canonical y, and the key line. */
function barsAt(notes: NoteEvent[], t: number, fallSeconds = 3) {
  const rects: { top: number; bottom: number }[] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, p: string) {
      if (p === 'createLinearGradient') return () => ({ addColorStop() {} })
      if (p === 'roundRect' || p === 'fillRect') return (_x: number, y: number, _w: number, h: number) => { rects.push({ top: y, bottom: y + h }) }
      return () => {}
    },
    set() { return true },
  })
  // The helper's one voice is 'v'; the parsed score names its own.
  const vs = notes.map((n) => ({ ...n, voiceId: 'v' }))
  const st = { ...state(vs), fallSeconds }
  drawRoll(ctx, st, t, visibleNotes(vs, t, fallSeconds, 3))
  return { rects, hitY: st.layout.hitY }
}

/** The provider's OWN clock (no clock prop): an AudioClock on the fake engine's time. */
function ownRig(extra: Record<string, unknown> = {}) {
  const src = { currentTime: 100 }
  const ref = createRef<IvoriesHandle>()
  const stub = stubCtx()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => stub.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext)
  const score = doc()
  const utils = render(
    <IvoriesProvider ref={ref} score={score} engine={fakeEngine(src)} {...extra}>
      <FallingKeys />
      <Transport />
    </IvoriesProvider>,
  )
  return { src, ref, score, ...utils }
}

afterEach(() => { vi.restoreAllMocks() })

describe('idle frame: the own clock parks at the start of the lead-in (user ruling 2026-10-22)', () => {
  const leads: [0 | 1 | 2, number][] = [[0, 0.5], [1, 2], [2, 4]]
  for (const [bars, sec] of leads) {
    it(`count-in ${bars}: parked at -${sec}s, no bar on the key line, readout 0:00, seek at the start, no count shown`, async () => {
      const r = ownRig({ countIn: bars })
      await waitFor(() => expect(r.ref.current).not.toBeNull())
      await waitFor(() => expect(r.ref.current!.clock.now()).toBeCloseTo(-sec, 9))
      const t = r.ref.current!.clock.now()
      // The frame actually drawn is the parked one.
      const view = r.container.querySelector<HTMLElement>('.ivories-falling')!
      await waitFor(() => expect(Number(view.dataset.t)).toBeCloseTo(-sec, 9))
      const { rects, hitY } = barsAt(r.score.notes, t)
      // Within the 3s fall window the downbeat chord is already on screen; two bars (4s) out, not yet.
      if (sec < 3) expect(rects.length).toBeGreaterThan(0)
      for (const b of rects) expect(b.bottom).toBeLessThan(hitY - 1)
      expect(r.container.querySelector('.ivories-transport-time')!.textContent).toMatch(/^0:00 \/ /)
      expect(r.container.querySelector<HTMLInputElement>('.ivories-transport-seek')!.value).toBe('0')
      expect(r.container.querySelector('.ivories-seek-wrap')!.hasAttribute('data-count-in')).toBe(false)
      const overlay = r.container.querySelector('.ivories-count-in-overlay')
      expect(overlay?.getAttribute('data-count') ?? null).toBeNull()
    })
  }

  it('the same score at t = 0 would put the downbeat chord on the keys (what the park avoids)', () => {
    const { rects, hitY } = barsAt(doc().notes, 0)
    expect(rects.some((b) => b.bottom >= hitY)).toBe(true)
  })

  it('Play from the park runs the whole count-in (plus one lookahead) as from 0:00', async () => {
    const r = ownRig()
    await waitFor(() => expect(r.ref.current!.clock.now()).toBeCloseTo(-2, 9))
    act(() => r.ref.current!.play())
    await waitFor(() => expect(r.ref.current!.clock.playing).toBe(true))
    expect(r.ref.current!.clock.now()).toBeCloseTo(-(2 + LOOKAHEAD_SEC), 9)
  })

  it('a seek to 0 while paused (reset to start) parks again; a seek elsewhere does not', async () => {
    const r = ownRig()
    const clock = await waitFor(() => r.ref.current!.clock)
    await waitFor(() => expect(clock.now()).toBeCloseTo(-2, 9))
    act(() => clock.seek(3))
    await act(async () => { await Promise.resolve() })
    expect(clock.now()).toBeCloseTo(3, 9)
    act(() => clock.seek(0))
    await waitFor(() => expect(clock.now()).toBeCloseTo(-2, 9))
  })

  it('changing the count-in while parked moves the park', async () => {
    const r = ownRig()
    const clock = await waitFor(() => r.ref.current!.clock)
    await waitFor(() => expect(clock.now()).toBeCloseTo(-2, 9))
    fireEvent.change(r.container.querySelector('.ivories-count-in-select')!, { target: { value: '2' } })
    await waitFor(() => expect(clock.now()).toBeCloseTo(-4, 9))
  })

  it('a pause mid-score stays put (only the top parks)', async () => {
    const r = ownRig()
    const clock = await waitFor(() => r.ref.current!.clock)
    act(() => clock.seek(1.5))
    act(() => r.ref.current!.play())
    await waitFor(() => expect(clock.playing).toBe(true))
    r.src.currentTime += 1
    act(() => r.ref.current!.pause())
    await act(async () => { await Promise.resolve() })
    expect(clock.now()).toBeCloseTo(2.5, 9)
  })

  it('host clocks are left alone: an AudioClock and a ManualClock stay at 0', async () => {
    for (const clock of [new AudioClock({ currentTime: 50 }), new ManualClock()]) {
      const ref = createRef<IvoriesHandle>()
      const { unmount } = render(<IvoriesProvider ref={ref} score={doc()} clock={clock} engine={fakeEngine()}><Transport /></IvoriesProvider>)
      await waitFor(() => expect(ref.current).not.toBeNull())
      await act(async () => { await Promise.resolve() })
      expect(clock.now()).toBe(0)
      unmount()
    }
  })

  it('rising is unaffected: at the park, as at 0, no tile has left the keys', () => {
    const s = doc()
    const beats = scoreBeatClock(s, SCALE_1)
    const layout = computeLayout(1000, 600)
    const beatPx = layout.hitY / 8
    for (const t of [-2, -0.5]) {
      for (const n of s.notes) expect(risingSpan(t, beats.beatAt(t), beats, n.startSec, n.endSec, layout.hitY, beatPx)).toBeNull()
    }
    // At t = 0 the downbeat tiles are zero-length, sitting on the key edge.
    for (const n of s.notes.filter((x) => x.startSec === 0)) {
      const span = risingSpan(0, beats.beatAt(0), beats, n.startSec, n.endSec, layout.hitY, beatPx)!
      expect(span.top).toBeCloseTo(layout.hitY, 6)
      expect(span.bottom).toBeCloseTo(layout.hitY, 6)
    }
  })
})
