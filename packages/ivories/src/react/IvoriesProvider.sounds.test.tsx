import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { IvoriesProvider } from './IvoriesProvider'

const made = vi.hoisted(() => ({ opts: [] as unknown[] }))
vi.mock('../core/audio/engine', async (orig) => {
  const real = await orig<typeof import('../core/audio/engine')>()
  const { fakeEngine } = await import('./testEngine.test-helpers')
  return { ...real, AudioEngine: vi.fn(function (o: unknown) { made.opts.push(o); return fakeEngine() }) }
})

describe('provider sounds option (R-G)', () => {
  it('builds its own engine with sounds; the same content keeps the engine, new content rebuilds it', async () => {
    const kid = <span className="kid" />
    const { rerender, container } = render(<IvoriesProvider sounds={{ pack: 'complete' }}>{kid}</IvoriesProvider>)
    await waitFor(() => expect(container.querySelector('.kid')).not.toBeNull())
    expect(made.opts.at(-1)).toMatchObject({ sounds: { pack: 'complete' } })
    const n = made.opts.length
    rerender(<IvoriesProvider sounds={{ pack: 'complete' }}>{kid}</IvoriesProvider>)
    await new Promise((r) => setTimeout(r, 20))
    expect(made.opts.length).toBe(n)
    rerender(<IvoriesProvider sounds={{ pack: 'core', instrument: 'bright_acoustic_piano' }}>{kid}</IvoriesProvider>)
    await waitFor(() => expect(made.opts.at(-1)).toMatchObject({ sounds: { pack: 'core', instrument: 'bright_acoustic_piano' } }))
  })

  it('without sounds the engine is built exactly as before', async () => {
    const { container } = render(<IvoriesProvider><span className="kid" /></IvoriesProvider>)
    await waitFor(() => expect(container.querySelector('.kid')).not.toBeNull())
    expect((made.opts.at(-1) as { sounds?: unknown }).sounds).toBeUndefined()
  })
})
