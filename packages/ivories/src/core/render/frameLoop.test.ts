import { describe, it, expect, vi, afterEach } from 'vitest'
import { FrameLoop } from './frameLoop'

afterEach(() => { vi.unstubAllGlobals() })

describe('FrameLoop (one rAF loop per provider)', () => {
  it('reads the clock once per frame and hands every view the same t', () => {
    const now = vi.fn(() => 1.25)
    const loop = new FrameLoop(now)
    const a = vi.fn(), b = vi.fn()
    loop.add(a); loop.add(b)
    loop.tick()
    expect(now).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(1.25)
    expect(b).toHaveBeenCalledWith(1.25)
    loop.dispose()
  })

  it('a throwing subscriber does not stop the others', () => {
    const loop = new FrameLoop(() => 0)
    const ok = vi.fn()
    loop.add(() => { throw new Error('boom') })
    loop.add(ok)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loop.tick()
    expect(ok).toHaveBeenCalled()
    loop.dispose()
  })

  it('starts requestAnimationFrame on the first subscriber and stops on the last', () => {
    const raf = vi.fn(() => 7)
    const caf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', caf)
    const loop = new FrameLoop(() => 0)
    const off = loop.add(() => {})
    expect(raf).toHaveBeenCalledTimes(1)
    loop.add(() => {})
    expect(raf).toHaveBeenCalledTimes(1)
    off()
    loop.dispose()
    expect(caf).toHaveBeenCalledWith(7)
  })
})
