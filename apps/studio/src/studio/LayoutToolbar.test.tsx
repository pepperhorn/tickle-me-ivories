import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { LayoutToolbar } from './LayoutToolbar'
import { useStudioStage } from './stageStore'
import { singleLayout } from 'ivories/core'
import { useTransport } from '../transport/useTransport'

const inputs = vi.hoisted(() => ({ list: [{ deviceId: 'cam-1', label: 'Desk cam' }] }))
vi.mock('ivories/core', async (orig) => ({
  ...(await orig<typeof import('ivories/core')>()),
  listVideoInputs: async () => inputs.list,
}))

beforeEach(() => {
  inputs.list = [{ deviceId: 'cam-1', label: 'Desk cam' }]
  useStudioStage.setState({ layout: singleLayout('falling'), aspect: 'free' })
  useTransport.getState().setMode('roll')
})

describe('LayoutToolbar (spec §6)', () => {
  it('switches layout kind, swaps, and sets the PIP corner and aspect', () => {
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'split' } })
    expect(useStudioStage.getState().layout).toMatchObject({ kind: 'split', bottom: { kind: 'camera', mode: 'mask' } })
    fireEvent.click(screen.getByRole('button', { name: 'Swap slots' }))
    expect(useStudioStage.getState().layout).toMatchObject({ top: { kind: 'camera' } })
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'pip' } })
    fireEvent.change(screen.getByLabelText('Inset corner'), { target: { value: 'tl' } })
    expect(useStudioStage.getState().layout).toMatchObject({ kind: 'pip', corner: 'tl' })
    fireEvent.change(screen.getByLabelText('Aspect'), { target: { value: '9:16' } })
    expect(useStudioStage.getState().aspect).toBe('9:16')
  })

  it('picks a webcam source, its device and mirror', async () => {
    useStudioStage.setState({ layout: { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'camera', mode: 'mask', fill: 'transparent' }, ratio: 0.5 } })
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Bottom source'), { target: { value: 'webcam' } })
    expect(useStudioStage.getState().layout).toMatchObject({ bottom: { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Desk cam' })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Bottom camera'), { target: { value: 'cam-1' } })
    fireEvent.click(screen.getByLabelText('Bottom mirror'))
    expect(useStudioStage.getState().layout).toMatchObject({ bottom: { deviceId: 'cam-1', mirror: false } })
  })

  it('offers a green chroma mask', () => {
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'mask-green' } })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'camera', mode: 'mask', fill: '#00b140' } })
  })

  it('mask fills are only transparent or hex colours (validFill refuses names)', () => {
    render(<LayoutToolbar />)
    const values = [...screen.getByLabelText('Main source').querySelectorAll('option')].map((o) => o.value)
    expect(values).toEqual(['falling', 'rising', 'keyboard', 'notation', 'endless', 'webcam', 'mask-transparent', 'mask-green', 'mask-blue'])
    for (const v of ['mask-transparent', 'mask-green', 'mask-blue']) {
      fireEvent.change(screen.getByLabelText('Main source'), { target: { value: v } })
      const main = useStudioStage.getState().layout
      expect(main.kind === 'single' && main.main.kind === 'camera' && main.main.mode === 'mask' && main.main.fill).toMatch(/^(transparent|#[0-9a-f]{6})$/)
    }
  })

  it('every control and option carries a contextual class name', () => {
    useStudioStage.setState({ layout: { kind: 'pip', main: { kind: 'ivories', view: 'falling' }, inset: { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' }, corner: 'br', size: 0.3, margin: 0.02 } })
    const { container } = render(<LayoutToolbar />)
    for (const el of container.querySelectorAll('select, option, button, input, label, span')) {
      expect(el.className, el.outerHTML).toMatch(/^[a-z]+(-[a-z]+)+\b/)
    }
  })

  it('keeps the display mode in step when the primary slot changes view (R7)', () => {
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'keyboard' } })
    expect(useTransport.getState().mode).toBe('keyboard')
    // A secondary keys slot does not drive the mode.
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'split' } })
    fireEvent.change(screen.getByLabelText('Bottom source'), { target: { value: 'falling' } })
    expect(useTransport.getState().mode).toBe('keyboard')
    // When the top stops showing keys, the bottom becomes the primary slot and drives the mode.
    fireEvent.change(screen.getByLabelText('Top source'), { target: { value: 'notation' } })
    expect(useTransport.getState().mode).toBe('roll')
  })

  it('a swap re-syncs the mode from the new primary slot', () => {
    useStudioStage.setState({ layout: { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: 0.5 } })
    render(<LayoutToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Swap slots' }))
    expect(useTransport.getState().mode).toBe('keyboard')
    fireEvent.click(screen.getByRole('button', { name: 'Swap slots' }))
    expect(useTransport.getState().mode).toBe('roll')
  })

  it('a layout kind change re-syncs the mode', () => {
    useStudioStage.setState({ layout: { kind: 'split', top: { kind: 'camera', mode: 'mask', fill: 'transparent' }, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: 0.5 } })
    render(<LayoutToolbar />)
    // A mask on top: switching kind keeps the keyboard as the inset, now the primary keys slot.
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'pip' } })
    expect(useStudioStage.getState().layout).toMatchObject({ kind: 'pip', inset: { kind: 'ivories', view: 'keyboard' } })
    expect(useTransport.getState().mode).toBe('keyboard')
  })

  it('a Stage-driven layout change (setLayout) re-syncs the mode', () => {
    useStudioStage.getState().setLayout({ kind: 'pip', main: { kind: 'ivories', view: 'keyboard' }, inset: { kind: 'ivories', view: 'falling' }, corner: 'br', size: 0.3, margin: 0.02 })
    expect(useTransport.getState().mode).toBe('keyboard')
  })

  it('re-lists cameras on devicechange so labels refresh', async () => {
    const listeners: Record<string, () => void> = {}
    const md = {
      getUserMedia: vi.fn(() => new Promise<MediaStream>(() => {})),
      enumerateDevices: vi.fn(async () => []),
      addEventListener: (t: string, f: () => void) => { listeners[t] = f },
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true })
    try {
      inputs.list = [{ deviceId: 'cam-1', label: 'Camera 1' }]
      useStudioStage.setState({ layout: { kind: 'single', main: { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' } } })
      render(<LayoutToolbar />)
      await waitFor(() => expect(screen.getByRole('option', { name: 'Camera 1' })).toBeTruthy())
      inputs.list = [{ deviceId: 'cam-1', label: 'Desk cam' }]
      listeners.devicechange()
      await waitFor(() => expect(screen.getByRole('option', { name: 'Desk cam' })).toBeTruthy())
    } finally {
      Reflect.deleteProperty(navigator, 'mediaDevices')
    }
  })

  it('offers rising notes and an orientation for rising slots only (falling is vertical only); kept across falling <-> rising (R-M)', () => {
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'rising' } })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising' } })
    fireEvent.change(screen.getByLabelText('Main orientation'), { target: { value: 'horizontal' } })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising', orientation: 'horizontal' } })
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'falling' } })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'falling', orientation: 'horizontal' } })
    expect(screen.queryByLabelText('Main orientation')).toBeNull()
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'keyboard' } })
    expect(screen.queryByLabelText('Main orientation')).toBeNull()
  })

  it('shows the BPM field only with no score and a rising slot (R-S)', () => {
    const score = useTransport.getState().score
    try {
      useTransport.setState({ score: null })
      render(<LayoutToolbar />)
      expect(screen.queryByLabelText('BPM')).toBeNull()
      act(() => { useStudioStage.setState({ layout: singleLayout('rising') }) })
      expect(screen.getByLabelText('BPM')).toBeTruthy()
      act(() => { useTransport.setState({ score: { name: 'x' } as never }) })
      expect(screen.queryByLabelText('BPM')).toBeNull()
    } finally {
      useTransport.setState({ score })
    }
  })
})
