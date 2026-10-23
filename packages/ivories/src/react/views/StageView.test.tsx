import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'
import { stubCtx } from '../../core/render/pianoRoll.test-helpers'
import { DEFAULT_SETTINGS } from '../../core/settings/types'
import { StageRenderer } from '../../core/render/stageRenderer'
import { DEFAULT_BAR_LABEL_PAINT } from '../../core/render/barLabels'
import { lookFromSettings } from '../../core/platform/look'
import type { KeyboardLayout } from '../../core/render/geometry'

const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

beforeEach(() => { vi.stubGlobal('CSS', { supports: (_p: string, v: string) => /^(#[0-9a-f]{3,8}|(rgba?|hsla?)\([^()]*\)|transparent)$/i.test(v) }) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

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
  it('Keyboard (roll hidden) lays out keys over the full stage height; FallingKeys keeps the 55% cap', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stubCtx().ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { width: 1220, height: 100, x: 0, y: 0, top: 0, left: 0, right: 1220, bottom: 100, toJSON: () => ({}) } as DOMRect,
    )
    const kb = vi.fn<(layout: KeyboardLayout) => void>()
    const fall = vi.fn<(layout: KeyboardLayout) => void>()
    render(
      <IvoriesProvider score={doc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}>
        <Keyboard onLayout={kb} />
        <FallingKeys onLayout={fall} />
      </IvoriesProvider>,
    )
    await waitFor(() => { expect(kb).toHaveBeenCalled(); expect(fall).toHaveBeenCalled() })
    expect(kb.mock.calls[0][0].keyboardH).toBeCloseTo(100, 6)
    expect(kb.mock.calls[0][0].hitY).toBeCloseTo(0, 6)
    expect(fall.mock.calls[0][0].keyboardH).toBeCloseTo(55, 6)
  })

  it('Keyboard ignores an orientation prop and stays vertical', async () => {
    const stub = stubCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stub.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const props = { orientation: 'horizontal' } as Record<string, unknown>
    const { container } = render(<Keyboard score={doc()} engine={fakeEngine()} {...props} />)
    await waitFor(() => expect(stub.calls.length).toBeGreaterThan(0))
    expect(stub.calls).not.toContain('transform(6)')
    expect(container.querySelector('.ivories-keyboard')!.getAttribute('data-orientation')).toBe('vertical')
  })

  it('FallingKeys orientation="horizontal" is deprecated: it draws vertical and warns once', async () => {
    const stub = stubCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stub.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<><FallingKeys score={doc()} engine={fakeEngine()} orientation="horizontal" /><FallingKeys score={doc()} engine={fakeEngine()} orientation="horizontal" /></>)
    await waitFor(() => expect(stub.calls.length).toBeGreaterThan(0))
    expect(stub.calls).not.toContain('transform(6)')
    expect(container.querySelector('.ivories-falling')!.getAttribute('data-orientation')).toBe('vertical')
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('deprecated'))).toHaveLength(1)
    warn.mockRestore()
  })
})

describe('StageView template (Review Focus 3, 5)', () => {
  const rootOf = (c: HTMLElement) => c.querySelector('.ivories-view') as HTMLElement
  const tok = (c: HTMLElement, k: string) => rootOf(c).style.getPropertyValue(k)

  it('no template: no template tokens inline, classic class, no data attribute', async () => {
    const { container } = render(<Keyboard score={doc()} engine={fakeEngine()} />)
    await waitFor(() => expect(rootOf(container)).not.toBeNull())
    expect(rootOf(container).classList.contains('ivories-theme-classic')).toBe(true)
    expect(tok(container, '--ivories-key-white')).toBe('')
    expect(rootOf(container).hasAttribute('data-ivories-template')).toBe(false)
  })

  it('template="chord-cards-crf" writes its tokens inline on the root', async () => {
    const { container } = render(<Keyboard score={doc()} engine={fakeEngine()} template="chord-cards-crf" />)
    await waitFor(() => expect(rootOf(container)).not.toBeNull())
    expect(tok(container, '--ivories-stage-bg')).toBe('#fbf8f1')
    expect(tok(container, '--ivories-key-outline')).toBe('#333333')
    expect(rootOf(container).classList.contains('ivories-theme-classic')).toBe(true)
    expect(rootOf(container).getAttribute('data-ivories-template')).toBe('chord-cards-crf')
  })

  it("stageBgOverride beats the template's stage.bg", async () => {
    const { container } = render(
      <Keyboard score={doc()} engine={fakeEngine()} template="chord-cards" settings={{ theme: { name: 'classic', stageBgOverride: '#00b140' } }} />,
    )
    await waitFor(() => expect(rootOf(container)).not.toBeNull())
    expect(tok(container, '--ivories-stage-bg')).toBe('#00b140')
  })

  it('a template extending a preset keeps the preset class', async () => {
    const tpl = { v: 1 as const, kind: 'ivories-template' as const, id: 'mine', name: 'Mine', extends: 'outline' as const }
    const { container } = render(<Keyboard score={doc()} engine={fakeEngine()} template={tpl} />)
    await waitFor(() => expect(rootOf(container)).not.toBeNull())
    expect(rootOf(container).classList.contains('ivories-theme-outline')).toBe(true)
  })

  it('switching back to classic removes the tokens', async () => {
    const { container, rerender } = render(<Keyboard score={doc()} engine={fakeEngine()} template="chord-cards-crf" />)
    await waitFor(() => expect(tok(container, '--ivories-key-white')).not.toBe(''))
    rerender(<Keyboard score={doc()} engine={fakeEngine()} />)
    await waitFor(() => expect(tok(container, '--ivories-key-white')).toBe(''))
  })

  it('the template from a look applies, and a per-view theme prop overrides it', async () => {
    const base = structuredClone(DEFAULT_SETTINGS)
    const look = lookFromSettings({ ...base, theme: { ...base.theme, template: 'chord-cards' } }, 'roll', 3)
    const lookProp = look as unknown as React.ComponentProps<typeof IvoriesProvider>['look']
    const { container, rerender } = render(
      <IvoriesProvider score={doc()} engine={fakeEngine()} look={lookProp}><Keyboard /></IvoriesProvider>,
    )
    await waitFor(() => expect(rootOf(container)).not.toBeNull())
    expect(tok(container, '--ivories-key-white')).not.toBe('')
    rerender(<IvoriesProvider score={doc()} engine={fakeEngine()} look={lookProp}><Keyboard theme="contrast" /></IvoriesProvider>)
    await waitFor(() => expect(rootOf(container).classList.contains('ivories-theme-contrast')).toBe(true))
    expect(tok(container, '--ivories-key-white')).toBe('')
  })
})

describe('StageView template identity', () => {
  it('an equal template object with a new identity keeps the resolved template (no re-decode)', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stubCtx().ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const spy = vi.spyOn(StageRenderer.prototype, 'draw')
    const tplOf = () => ({ v: 1 as const, kind: 'ivories-template' as const, id: 'mine', name: 'Mine', stage: { bg: '#123456' } })
    const score = doc(); const engine = fakeEngine()
    const { rerender } = render(<FallingKeys score={score} engine={engine} template={tplOf()} />)
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const first = (spy.mock.calls[spy.mock.calls.length - 1][4] as { template: unknown }).template
    spy.mockClear()
    rerender(<FallingKeys score={score} engine={engine} template={tplOf()} />)
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect((spy.mock.calls[spy.mock.calls.length - 1][4] as { template: unknown }).template).toBe(first)
  })
})

describe('StageView note bar labels', () => {
  const drawn = async (ui: React.ReactElement) => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stubCtx().ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const spy = vi.spyOn(StageRenderer.prototype, 'draw')
    render(ui)
    await waitFor(() => expect(spy).toHaveBeenCalled())
    return spy.mock.calls[spy.mock.calls.length - 1][4] as { barLabel?: unknown; barLabelPaint?: Record<string, unknown> }
  }

  it('noteBarLabels="none" draws no labels', async () => {
    const input = await drawn(<FallingKeys score={doc()} engine={fakeEngine()} noteBarLabels="none" />)
    expect(input.barLabel).toBeUndefined()
  })

  it('noteBarLabelStyle reaches the renderer as paint', async () => {
    const input = await drawn(<FallingKeys score={doc()} engine={fakeEngine()} noteBarLabelStyle={{ font: { color: '#000000', scale: 1.2 } }} />)
    expect(input.barLabel).toBeTypeOf('function')
    expect(input.barLabelPaint!.color).toBe('#000000')
    expect(input.barLabelPaint!.scale).toBe(1.2)
  })

  it('no label props: the default paint', async () => {
    const input = await drawn(<FallingKeys score={doc()} engine={fakeEngine()} />)
    expect(input.barLabelPaint).toEqual(DEFAULT_BAR_LABEL_PAINT)
  })

  it('an unsafe label family never reaches the canvas font', async () => {
    const input = await drawn(<FallingKeys score={doc()} engine={fakeEngine()} noteBarLabelStyle={{ font: { family: 'x"; evil' } }} />)
    expect(input.barLabelPaint!.family).toBe('Poppins, sans-serif')
  })
})
