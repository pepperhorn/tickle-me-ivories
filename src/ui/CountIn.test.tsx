import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { CountIn } from './CountIn'

const LEAD = { sec: 2, beats: 4, beatSec: 0.5 }

// A fake clock the overlay reads the playhead from, stepped with rAF.
let clock = 0
const head = () => clock - 2   // playing from the top: the playhead starts at -2

beforeEach(() => {
  clock = 0
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
})
afterEach(() => { vi.useRealTimers() })

function advanceTo(sec: number) {
  act(() => { clock = sec; vi.advanceTimersByTime(16) })
}

const shown = () => document.querySelector('.count-in-number')?.textContent ?? null

describe('CountIn', () => {
  it('shows 1..N in order, each on its beat, and clears at t = 0', () => {
    render(<CountIn active enabled lead={LEAD} head={head} gate={null} onTapToStart={() => {}} />)
    expect(shown()).toBe('1')
    const seen: (string | null)[] = []
    for (const t of [0.1, 0.5, 0.9, 1.0, 1.5, 1.99, 2.0, 2.5]) { advanceTo(t); seen.push(shown()) }
    expect(seen).toEqual(['1', '2', '2', '3', '4', '4', null, null])
  })

  it('re-mounts the number on each beat so its pop animation restarts', () => {
    render(<CountIn active enabled lead={LEAD} head={head} gate={null} onTapToStart={() => {}} />)
    const first = document.querySelector('.count-in-number')
    advanceTo(0.5)
    expect(document.querySelector('.count-in-number')).not.toBe(first)
  })

  it('announces the count politely', () => {
    render(<CountIn active enabled lead={LEAD} head={head} gate={null} onTapToStart={() => {}} />)
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('1')
  })

  it('shows nothing when the count-in setting is off', () => {
    render(<CountIn active enabled={false} lead={LEAD} head={head} gate={null} onTapToStart={() => {}} />)
    advanceTo(0.6)
    expect(shown()).toBeNull()
  })

  it('shows nothing while not playing', () => {
    render(<CountIn active={false} enabled lead={LEAD} head={head} gate={null} onTapToStart={() => {}} />)
    expect(shown()).toBeNull()
  })

  it('offers "Tap to start sound" while audio is suspended, and taps through', () => {
    const onTap = vi.fn()
    render(<CountIn active={false} enabled lead={LEAD} head={head} gate="sound" onTapToStart={onTap} />)
    fireEvent.click(screen.getByRole('button', { name: /tap to start sound/i }))
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it('says the sounds are loading while the instruments load', () => {
    render(<CountIn active={false} enabled lead={LEAD} head={head} gate="loading" onTapToStart={() => {}} />)
    expect(screen.getByText(/loading sounds/i)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/loading sounds/i)
  })

  it('moves focus to "Tap to start sound" when it appears', () => {
    render(<CountIn active={false} enabled lead={LEAD} head={head} gate="sound" onTapToStart={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /tap to start sound/i }))
  })
})
