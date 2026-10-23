import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useCanvasFont } from './useCanvasFont'

const links = () => document.head.querySelectorAll('link[data-google-font]')

afterEach(() => {
  document.head.querySelectorAll('link[data-google-font]').forEach((l) => l.remove())
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'fonts')
})

describe('useCanvasFont', () => {
  it('Poppins needs no load', () => {
    const { result } = renderHook(() => useCanvasFont('Poppins', 600))
    expect(result.current).toBe('Poppins, sans-serif')
    expect(links()).toHaveLength(0)
  })

  it('another family: sans-serif until fonts.load resolves, then the family, once', async () => {
    let resolve!: () => void
    const promise = new Promise<void>((r) => { resolve = r })
    const load = vi.fn(() => promise)
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })
    const { result } = renderHook(() => useCanvasFont('Nunito', 700))
    expect(result.current).toBe('sans-serif')
    expect(document.head.querySelector('link[data-google-font="Nunito"]')).not.toBeNull()
    await act(async () => { resolve(); await promise })
    await waitFor(() => expect(result.current).toBe('"Nunito", sans-serif'))
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('700 16px "Nunito"')
  })

  it('without document.fonts it returns the quoted family at once', () => {
    const { result } = renderHook(() => useCanvasFont('Nunito', 400))
    expect(result.current).toBe('"Nunito", sans-serif')
  })

  it('ignores a settle that arrives after the family changed', async () => {
    let resolveA!: () => void
    const a = new Promise<void>((r) => { resolveA = r })
    const load = vi.fn((spec: string) => (spec.includes('Nunito') ? a : new Promise<void>(() => {})))
    Object.defineProperty(document, 'fonts', { value: { load }, configurable: true })
    const { result, rerender } = renderHook(({ f }) => useCanvasFont(f, 400), { initialProps: { f: 'Nunito' } })
    rerender({ f: 'Lora' })
    await act(async () => { resolveA(); await a })
    expect(result.current).toBe('sans-serif')
  })

  it('an unsafe family falls back to Poppins and loads nothing', () => {
    const { result } = renderHook(() => useCanvasFont('x"; background:url(//evil)', 600))
    expect(result.current).toBe('Poppins, sans-serif')
    expect(links()).toHaveLength(0)
  })
})
