import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VelocityEditor } from './VelocityEditor'
import type { VelocityScheme } from '../settings/types'

function setup(scheme: VelocityScheme) {
  const onChange = vi.fn()
  render(<VelocityEditor scheme={scheme} onChange={onChange} />)
  return onChange
}

describe('VelocityEditor', () => {
  it('does nothing when the already-active scheme is clicked, preserving tuned values', () => {
    const tuned: VelocityScheme = { kind: 'lightness', lMax: 91, lMin: 12, sat: 50 }
    const onChange = setup(tuned)
    fireEvent.click(screen.getByRole('button', { name: 'lightness' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not wipe tuned gradient stops when gradient is re-clicked while already active', () => {
    const tuned: VelocityScheme = {
      kind: 'gradient',
      stops: [{ at: 0, color: '#111111' }, { at: 1, color: '#222222' }],
    }
    const onChange = setup(tuned)
    fireEvent.click(screen.getByRole('button', { name: 'gradient' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('switches to the other scheme, using its defaults', () => {
    const onChange = setup({ kind: 'lightness', lMax: 91, lMin: 12, sat: 50 })
    fireEvent.click(screen.getByRole('button', { name: 'gradient' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].kind).toBe('gradient')
  })
})
