import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'
import { stubCtx } from '../../core/render/pianoRoll.test-helpers'
import type { KeyboardLayout } from '../../core/render/geometry'

const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

afterEach(() => { vi.restoreAllMocks() })

describe('Keyboard and FallingKeys (spec §4)', () => {
  it('self-contained: a Keyboard outside a provider builds its own', async () => {
    const onReady = vi.fn()
    const { container } = render(<Keyboard score={doc()} engine={fakeEngine()} onReady={onReady} />)
    await waitFor(() => expect(container.querySelector('.ivories-view.ivories-keyboard')).not.toBeNull())
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('provider mode: two views share one provider (one onReady)', async () => {
    const onReady = vi.fn()
    const { container } = render(
      <IvoriesProvider score={doc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onReady={onReady}>
        <FallingKeys lookahead={2} />
        <Keyboard range={[48, 72]} />
      </IvoriesProvider>,
    )
    await waitFor(() => expect(container.querySelectorAll('.ivories-view')).toHaveLength(2))
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.ivories-falling canvas.ivories-canvas')).not.toBeNull()
  })

  it('carries the theme class and the stage background override', async () => {
    const { container } = render(
      <Keyboard score={doc()} engine={fakeEngine()} settings={{ theme: { name: 'contrast', stageBgOverride: '#00b140' } }} />,
    )
    await waitFor(() => expect(container.querySelector('.ivories-theme-contrast')).not.toBeNull())
    const root = container.querySelector('.ivories-view') as HTMLElement
    expect(root.style.getPropertyValue('--ivories-stage-bg')).toBe('#00b140')
  })

  it('shows a score error inline and keeps its box (spec §8)', async () => {
    const onError = vi.fn()
    const { container } = render(<FallingKeys midi={new Uint8Array([9])} engine={fakeEngine()} onError={onError} />)
    await waitFor(() => expect(container.querySelector('.ivories-message')?.textContent).toMatch(/Could not read/))
    expect(onError.mock.calls[0][0].code).toBe('score-parse')
  })

  it('mounts in a 0x0 box without throwing and reports finite geometry (Review Focus 5)', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stubCtx().ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const consoleError = vi.spyOn(console, 'error')
    const onLayout = vi.fn<(layout: KeyboardLayout) => void>()
    const { container } = render(
      <div style={{ width: 0, height: 0 }}><Keyboard score={doc()} engine={fakeEngine()} onLayout={onLayout} /></div>,
    )
    await waitFor(() => expect(onLayout).toHaveBeenCalled())
    expect(container.querySelector('.ivories-keyboard')).not.toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    const layout = onLayout.mock.calls[0][0]
    expect(layout.keys.length).toBeGreaterThan(0)
    for (const k of layout.keys) {
      expect(Number.isFinite(k.x)).toBe(true)
      expect(Number.isFinite(k.w)).toBe(true)
    }
    expect(Number.isFinite(layout.hitY)).toBe(true)
  })

  it('exposes the last drawn time as data-t on the view root (e2e sync check)', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stubCtx().ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const clock = new AudioClock({ currentTime: 0 })
    const { container } = render(
      <IvoriesProvider score={doc()} engine={fakeEngine()} clock={clock}>
        <FallingKeys />
      </IvoriesProvider>,
    )
    await waitFor(() => expect(container.querySelector<HTMLElement>('.ivories-falling')?.dataset.t).toBe('0'))
    clock.seek(0.75)
    await waitFor(() => expect(container.querySelector<HTMLElement>('.ivories-falling')?.dataset.t).toBe('0.75'))
  })

  it('a throwing draw reports render-failed once and shows an inline message (R11)', async () => {
    // Every drawing call throws, so renderer.draw fails inside the rAF callback,
    // where no React error boundary can catch it.
    const throwing = new Proxy({} as CanvasRenderingContext2D, {
      get(_t, prop) {
        if (prop === 'canvas') return { width: 1, height: 1 }
        // Sizing (in the mount effect) works; every drawing call throws.
        if (prop === 'setTransform') return () => {}
        return () => { throw new Error('boom') }
      },
      set() { return true },
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => throwing) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn()
    const { container } = render(<Keyboard score={doc()} engine={fakeEngine()} onError={onError} />)
    await waitFor(() => expect(container.querySelector('.ivories-keyboard .ivories-message[role="alert"]')).not.toBeNull())
    // Let several more frames run: the failed view must stay unsubscribed.
    await new Promise((r) => setTimeout(r, 120))
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].code).toBe('render-failed')
    expect(consoleError).not.toHaveBeenCalled()
  })
})
