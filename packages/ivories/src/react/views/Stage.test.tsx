import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Stage } from './Stage'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMusicXml } from '../../core/io/parseMusicXml'
import { fakeEngine } from '../testEngine.test-helpers'
import type { StageHandle } from './Stage'
import { stubCtx } from '../../core/render/pianoRoll.test-helpers'
import type { Layout } from '../../core/layout/types'

vi.mock('pepperscore', () => ({ PepperScore: () => { throw new Error('engraver crashed') } }))

const xml = readFileSync(join(__dirname, '../../core/io/__fixtures__/clock-contract.musicxml'), 'utf8')
const score = () => parseMusicXml(xml, 'c.musicxml', { mode: 'scale', scale: 1 })
const falling = { kind: 'ivories', view: 'falling' } as const
const mask = { kind: 'camera', mode: 'mask', fill: '#00b140' } as const

function inProvider(ui: React.ReactNode) {
  return render(<IvoriesProvider score={score()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}>{ui}</IvoriesProvider>)
}
const slots = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.ivories-slot')].map((s) => `${s.dataset.ivoriesSlot}:${s.dataset.source}`)

describe('Stage (spec §5.2)', () => {
  it('single: one slot inside the aspect box', async () => {
    const { container } = inProvider(<Stage layout={{ kind: 'single', main: falling }} aspect="16:9" />)
    await waitFor(() => expect(slots(container)).toEqual(['main:falling']))
    expect(container.querySelector('.ivories-stage-box')!.getAttribute('data-aspect')).toBe('16:9')
  })

  it('split: ratio sizes the slots; the divider is keyboard-accessible and clamped', async () => {
    const onLayoutChange = vi.fn()
    const layout: Layout = { kind: 'split', top: falling, bottom: mask, ratio: 0.3 }
    const { container } = inProvider(<Stage layout={layout} onLayoutChange={onLayoutChange} />)
    await waitFor(() => expect(slots(container)).toEqual(['top:falling', 'bottom:mask']))
    expect((container.querySelector('.ivories-slot-top') as HTMLElement).style.height).toBe('30%')
    const divider = screen.getByRole('separator')
    expect(divider.getAttribute('aria-valuenow')).toBe('30')
    fireEvent.keyDown(divider, { key: 'ArrowDown' })
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...layout, ratio: 0.35 })
    fireEvent.keyDown(divider, { key: 'Home' })
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...layout, ratio: 0.15 })
  })

  it('swapSlots (handle) swaps uncontrolled slots and keeps their views mounted', async () => {
    const ref = createRef<StageHandle>()
    const { container } = inProvider(<Stage ref={ref} layout={{ kind: 'split', top: falling, bottom: mask, ratio: 0.5 }} />)
    await waitFor(() => expect(container.querySelector('.ivories-falling')).not.toBeNull())
    const view = container.querySelector('.ivories-falling')
    act(() => ref.current!.swapSlots())
    expect(slots(container)).toContain('bottom:falling')
    expect(container.querySelector('.ivories-falling')).toBe(view)
  })

  it('uncontrolled: an equal layout literal on re-render keeps the Stage\'s own changes', async () => {
    const ref = createRef<StageHandle>()
    const ui = () => <Stage ref={ref} layout={{ kind: 'split', top: falling, bottom: mask, ratio: 0.5 }} />
    const r = inProvider(ui())
    await waitFor(() => expect(slots(r.container)).toEqual(['top:falling', 'bottom:mask']))
    act(() => ref.current!.swapSlots())
    expect(slots(r.container)).toEqual(['top:mask', 'bottom:falling'])
    r.rerender(<IvoriesProvider score={score()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}>{ui()}</IvoriesProvider>)
    await act(async () => {})
    expect(slots(r.container)).toEqual(['top:mask', 'bottom:falling'])
  })

  describe('pip inset drag', () => {
    const base: Layout = { kind: 'pip', main: falling, inset: mask, corner: 'br', size: 0.25, margin: 0.02 }
    const wrap = (ui: React.ReactNode) => <IvoriesProvider score={score()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}>{ui}</IvoriesProvider>

    async function setup(layout: Layout = base, insetRect = { left: 50, top: 300, width: 200, height: 100 }) {
      const onLayoutChange = vi.fn()
      const r = inProvider(<Stage layout={layout} onLayoutChange={onLayoutChange} />)
      await waitFor(() => expect(r.container.querySelector('.ivories-slot-inset')).not.toBeNull())
      const inset = r.container.querySelector('.ivories-slot-inset') as HTMLElement
      const box = r.container.querySelector('.ivories-stage-box') as HTMLElement
      vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 400 } as DOMRect)
      vi.spyOn(inset, 'getBoundingClientRect').mockReturnValue(insetRect as DOMRect)
      return { ...r, inset, onLayoutChange }
    }

    it.each([
      ['tl', 'br', { left: 50, top: 20, width: 200, height: 100 }],
      ['tr', 'bl', { left: 550, top: 20, width: 200, height: 100 }],
      ['bl', 'br', { left: 50, top: 280, width: 200, height: 100 }],
      ['br', 'tl', { left: 550, top: 280, width: 200, height: 100 }],
    ] as const)('snaps to the nearest corner on release: %s (from %s)', async (target, from, rect) => {
      const layout: Layout = { ...base, corner: from }
      const { inset, onLayoutChange } = await setup(layout, rect)
      expect(inset.dataset.corner).toBe(from)
      fireEvent.pointerDown(inset, { button: 0, buttons: 1, clientX: 400, clientY: 200, pointerId: 1 })
      fireEvent.pointerMove(inset, { buttons: 1, clientX: 300, clientY: 150, pointerId: 1 })
      expect(inset.style.transform).toBe('translate(-100px, -50px)')
      fireEvent.pointerUp(inset, { clientX: 300, clientY: 150, pointerId: 1 })
      expect(onLayoutChange).toHaveBeenCalledTimes(1)
      expect(onLayoutChange).toHaveBeenLastCalledWith({ ...layout, corner: target })
      expect(inset.style.transform).toBe('')
    })

    it('a sub-threshold click does not drag or dispatch', async () => {
      const { inset, onLayoutChange } = await setup(base, { left: 50, top: 20, width: 200, height: 100 })
      fireEvent.pointerDown(inset, { button: 0, buttons: 1, clientX: 700, clientY: 350, pointerId: 1 })
      fireEvent.pointerMove(inset, { buttons: 1, clientX: 702, clientY: 351, pointerId: 1 })
      fireEvent.pointerUp(inset, { clientX: 702, clientY: 351, pointerId: 1 })
      expect(inset.style.transform).toBe('')
      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('a plain hover after a press released outside does not move the inset', async () => {
      const { inset, onLayoutChange } = await setup()
      fireEvent.pointerDown(inset, { button: 0, buttons: 1, clientX: 700, clientY: 350, pointerId: 1 })
      fireEvent.pointerMove(inset, { buttons: 1, clientX: 701, clientY: 350, pointerId: 1 })
      // ...the pointer leaves before the threshold and is released outside (no pointerup reaches the inset)
      fireEvent.pointerMove(inset, { buttons: 0, clientX: 600, clientY: 300, pointerId: 1 })
      expect(inset.style.transform).toBe('')
      fireEvent.pointerMove(inset, { buttons: 0, clientX: 500, clientY: 250, pointerId: 1 })
      expect(inset.style.transform).toBe('')
      fireEvent.pointerUp(inset, { clientX: 500, clientY: 250, pointerId: 1 })
      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('a move with no button held aborts a drag in progress', async () => {
      const { inset, onLayoutChange } = await setup()
      fireEvent.pointerDown(inset, { button: 0, buttons: 1, clientX: 700, clientY: 350, pointerId: 1 })
      fireEvent.pointerMove(inset, { buttons: 1, clientX: 400, clientY: 350, pointerId: 1 })
      expect(inset.style.transform).not.toBe('')
      fireEvent.pointerMove(inset, { buttons: 0, clientX: 300, clientY: 350, pointerId: 1 })
      expect(inset.style.transform).toBe('')
      fireEvent.pointerUp(inset, { clientX: 300, clientY: 350, pointerId: 1 })
      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('lost pointer capture ends the drag', async () => {
      const { inset, onLayoutChange } = await setup()
      fireEvent.pointerDown(inset, { button: 0, buttons: 1, clientX: 700, clientY: 350, pointerId: 1 })
      fireEvent.pointerMove(inset, { buttons: 1, clientX: 400, clientY: 350, pointerId: 1 })
      fireEvent.lostPointerCapture(inset, { pointerId: 1 })
      expect(inset.style.transform).toBe('')
      fireEvent.pointerUp(inset, { clientX: 400, clientY: 350, pointerId: 1 })
      expect(onLayoutChange).not.toHaveBeenCalled()
    })

    it('a second pointer neither starts nor hijacks the drag', async () => {
      const { inset } = await setup()
      fireEvent.pointerDown(inset, { button: 0, buttons: 1, clientX: 700, clientY: 350, pointerId: 1 })
      fireEvent.pointerDown(inset, { button: 0, buttons: 1, clientX: 100, clientY: 100, pointerId: 2 })
      fireEvent.pointerMove(inset, { buttons: 1, clientX: 300, clientY: 100, pointerId: 2 })
      expect(inset.style.transform).toBe('')
      fireEvent.pointerMove(inset, { buttons: 1, clientX: 600, clientY: 350, pointerId: 1 })
      expect(inset.style.transform).toBe('translate(-100px, 0px)')
    })

    it('switching away from pip mid-drag leaves no stale translate behind', async () => {
      const { inset, onLayoutChange, rerender, container } = await setup()
      fireEvent.pointerDown(inset, { button: 0, buttons: 1, clientX: 700, clientY: 350, pointerId: 1 })
      fireEvent.pointerMove(inset, { buttons: 1, clientX: 400, clientY: 350, pointerId: 1 })
      expect(inset.style.transform).not.toBe('')
      rerender(wrap(<Stage layout={{ kind: 'split', top: falling, bottom: mask, ratio: 0.5 }} onLayoutChange={onLayoutChange} />))
      await waitFor(() => expect(container.querySelector('.ivories-slot-inset')).toBeNull())
      rerender(wrap(<Stage layout={base} onLayoutChange={onLayoutChange} />))
      await waitFor(() => expect(container.querySelector('.ivories-slot-inset')).not.toBeNull())
      const again = container.querySelector('.ivories-slot-inset') as HTMLElement
      expect(again.style.transform).toBe('')
      fireEvent.pointerMove(again, { buttons: 1, clientX: 100, clientY: 100, pointerId: 1 })
      expect(again.style.transform).toBe('')
    })
  })

  it('split divider: primary-button pointer drag only, aborted by a buttonless move; aria range from the clamp', async () => {
    const onLayoutChange = vi.fn()
    const layout: Layout = { kind: 'split', top: falling, bottom: mask, ratio: 0.3 }
    const { container } = inProvider(<Stage layout={layout} onLayoutChange={onLayoutChange} />)
    await waitFor(() => expect(container.querySelector('.ivories-split-divider')).not.toBeNull())
    const divider = screen.getByRole('separator')
    expect(divider.getAttribute('aria-valuemin')).toBe('15')
    expect(divider.getAttribute('aria-valuemax')).toBe('85')
    const box = container.querySelector('.ivories-stage-box') as HTMLElement
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 400 } as DOMRect)
    fireEvent.pointerDown(divider, { button: 2, buttons: 2, clientY: 120, pointerId: 1 })
    fireEvent.pointerMove(divider, { buttons: 2, clientY: 200, pointerId: 1 })
    expect(onLayoutChange).not.toHaveBeenCalled()
    fireEvent.pointerDown(divider, { button: 0, buttons: 1, clientY: 120, pointerId: 1 })
    fireEvent.pointerMove(divider, { buttons: 1, clientY: 200, pointerId: 2 })
    expect(onLayoutChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(divider, { buttons: 1, clientY: 200, pointerId: 1 })
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...layout, ratio: 0.5 })
    fireEvent.pointerMove(divider, { buttons: 0, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(divider, { buttons: 1, clientY: 100, pointerId: 1 })
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(divider, { button: 0, buttons: 1, clientY: 200, pointerId: 1 })
    fireEvent.lostPointerCapture(divider, { pointerId: 1 })
    fireEvent.pointerMove(divider, { buttons: 1, clientY: 100, pointerId: 1 })
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
  })

  it('a crashing slot never tears down its sibling (spec §8)', async () => {
    const { container } = inProvider(<Stage layout={{ kind: 'split', top: { kind: 'ivories', view: 'notation' }, bottom: falling, ratio: 0.5 }} />)
    await waitFor(() => expect(container.querySelector('.ivories-slot-top [role="alert"]')).not.toBeNull())
    expect(container.querySelector('.ivories-slot-bottom .ivories-falling')).not.toBeNull()
  })

  it('slotViewProps: a per-slot override reaches only that slot (onLayout for the primary keys slot)', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stubCtx().ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const shared = vi.fn(), topOnly = vi.fn()
    const layout: Layout = { kind: 'split', top: falling, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: 0.5 }
    inProvider(<Stage layout={layout} viewProps={{ onLayout: shared }} slotViewProps={{ top: { onLayout: topOnly }, bottom: { onLayout: undefined } }} />)
    await waitFor(() => expect(topOnly).toHaveBeenCalled())
    // The top slot's override replaces the shared callback; the bottom slot's clears it.
    expect(shared).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
