import { describe, it, expect, vi } from 'vitest'
import { useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { IvoriesProvider } from './IvoriesProvider'
import { useIvories } from './hooks'

const made = vi.hoisted(() => ({ opts: [] as unknown[], engines: [] as { setSounds: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] }))
vi.mock('../core/audio/engine', async (orig) => {
  const real = await orig<typeof import('../core/audio/engine')>()
  const { fakeEngine } = await import('./testEngine.test-helpers')
  return { ...real, AudioEngine: vi.fn(function (o: unknown) { made.opts.push(o); const e = fakeEngine(); made.engines.push(e as never); return e }) }
})

describe('provider sounds option (R-G)', () => {
  it('builds its own engine with sounds; the same content keeps the engine untouched', async () => {
    const kid = <span className="kid" />
    const { rerender, container } = render(<IvoriesProvider sounds={{ pack: 'complete' }}>{kid}</IvoriesProvider>)
    await waitFor(() => expect(container.querySelector('.kid')).not.toBeNull())
    expect(made.opts.at(-1)).toMatchObject({ sounds: { pack: 'complete' } })
    const n = made.opts.length
    const eng = made.engines.at(-1)!
    rerender(<IvoriesProvider sounds={{ pack: 'complete' }}>{kid}</IvoriesProvider>)
    await new Promise((r) => setTimeout(r, 20))
    expect(made.opts.length).toBe(n)
    // Only ever the same content, which the engine ignores (engine.test: same content is a no-op).
    for (const [o] of eng.setSounds.mock.calls) expect(o).toEqual({ pack: 'complete' })
    expect(eng.dispose).not.toHaveBeenCalled()
  })

  it('new sounds content reloads the instrument in place: no new engine, children stay mounted (final review 2)', async () => {
    let mounts = 0
    let seen: unknown[] = []
    function Kid() {
      const iv = useIvories()
      seen.push(iv.engine)
      useEffect(() => { mounts++ }, [])
      return <span className="kid" />
    }
    const { rerender, container } = render(<IvoriesProvider sounds={{ pack: 'complete' }}><Kid /></IvoriesProvider>)
    await waitFor(() => expect(container.querySelector('.kid')).not.toBeNull())
    const n = made.opts.length
    const eng = made.engines.at(-1)!
    seen = []
    rerender(<IvoriesProvider sounds={{ pack: 'core', instrument: 'bright_acoustic_piano' }}><Kid /></IvoriesProvider>)
    await waitFor(() => expect(eng.setSounds).toHaveBeenLastCalledWith({ pack: 'core', instrument: 'bright_acoustic_piano' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(made.opts.length).toBe(n)
    expect(eng.dispose).not.toHaveBeenCalled()
    expect(mounts).toBe(1)
    expect(container.querySelector('.kid')).not.toBeNull()
    expect(seen.every((e) => e === eng)).toBe(true)
  })

  it('without sounds the engine is built exactly as before', async () => {
    const { container } = render(<IvoriesProvider><span className="kid" /></IvoriesProvider>)
    await waitFor(() => expect(container.querySelector('.kid')).not.toBeNull())
    expect((made.opts.at(-1) as { sounds?: unknown }).sounds).toBeUndefined()
  })
})
