import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { render, waitFor } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Ivories } from './Ivories'
import { fakeEngine } from '../testEngine.test-helpers'
import type { IvoriesHandle } from '../IvoriesProvider'

const bytes = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return new Uint8Array(m.toArray())
}

describe('Ivories presets (spec §4)', () => {
  it.each([
    ['falling', '.ivories-falling'],
    ['keyboard', '.ivories-keyboard'],
  ] as const)('view=%s renders its view and a full transport', async (view, sel) => {
    const { container } = render(<Ivories view={view} midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(container.querySelector(sel)).not.toBeNull())
    expect(container.querySelector('.ivories-transport .ivories-seek')).not.toBeNull()
  })

  it('chrome="minimal" keeps only play; chrome="none" has no transport', async () => {
    const a = render(<Ivories chrome="minimal" midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(a.container.querySelector('.ivories-btn-play')).not.toBeNull())
    expect(a.container.querySelector('.ivories-seek')).toBeNull()
    const b = render(<Ivories chrome="none" midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(b.container.querySelector('.ivories-falling')).not.toBeNull())
    expect(b.container.querySelector('.ivories-transport')).toBeNull()
  })

  it('exposes the handle on its ref', async () => {
    const ref = createRef<IvoriesHandle>()
    render(<Ivories ref={ref} midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(ref.current?.clock).toBeTruthy())
    ref.current!.seek(0.5)
    expect(ref.current!.clock.now()).toBe(0.5)
  })
})
