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

  it('pip: the inset snaps to the nearest corner on release', async () => {
    const onLayoutChange = vi.fn()
    const layout: Layout = { kind: 'pip', main: falling, inset: mask, corner: 'br', size: 0.25, margin: 0.02 }
    const { container } = inProvider(<Stage layout={layout} onLayoutChange={onLayoutChange} />)
    await waitFor(() => expect(container.querySelector('.ivories-slot-inset')).not.toBeNull())
    const inset = container.querySelector('.ivories-slot-inset') as HTMLElement
    expect(inset.dataset.corner).toBe('br')
    const box = container.querySelector('.ivories-stage-box') as HTMLElement
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 400 } as DOMRect)
    vi.spyOn(inset, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 300, width: 200, height: 100 } as DOMRect)
    fireEvent.pointerDown(inset, { button: 0, clientX: 700, clientY: 350, pointerId: 1 })
    fireEvent.pointerMove(inset, { clientX: 150, clientY: 350, pointerId: 1 })
    fireEvent.pointerUp(inset, { clientX: 150, clientY: 350, pointerId: 1 })
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...layout, corner: 'bl' })
  })

  it('a crashing slot never tears down its sibling (spec §8)', async () => {
    const { container } = inProvider(<Stage layout={{ kind: 'split', top: { kind: 'ivories', view: 'notation' }, bottom: falling, ratio: 0.5 }} />)
    await waitFor(() => expect(container.querySelector('.ivories-slot-top [role="alert"]')).not.toBeNull())
    expect(container.querySelector('.ivories-slot-bottom .ivories-falling')).not.toBeNull()
  })
})
