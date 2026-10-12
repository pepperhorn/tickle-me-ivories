import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TempoControl } from './TempoControl'
import type { TempoSetting } from '../model/types'

function setup(tempo: TempoSetting) {
  const onChange = vi.fn()
  render(<TempoControl tempo={tempo} effectiveBpm={120} onChange={onChange} />)
  return onChange
}

describe('TempoControl', () => {
  it('does nothing when the already-active mode is clicked', () => {
    const onChange = setup({ mode: 'scale', scale: 0.8 })
    fireEvent.click(screen.getByRole('button', { name: 'Scale %' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('switches mode when the other mode is clicked', () => {
    const onChange = setup({ mode: 'scale', scale: 0.8 })
    fireEvent.click(screen.getByRole('button', { name: 'Absolute' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'absolute', bpm: 120 })
  })

  it('does not commit on a blur with no edit', () => {
    const onChange = setup({ mode: 'absolute', bpm: 90 })
    const input = screen.getByLabelText('Absolute BPM')
    input.focus()
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits an edited BPM exactly once on Enter', () => {
    const onChange = setup({ mode: 'absolute', bpm: 90 })
    const input = screen.getByLabelText('Absolute BPM') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: '100' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Enter blurs; the blur commits. It must not commit a second time.
    expect(document.activeElement).not.toBe(input)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ mode: 'absolute', bpm: 100 })
  })

  it('reverts an out-of-range BPM without committing', () => {
    const onChange = setup({ mode: 'absolute', bpm: 90 })
    const input = screen.getByLabelText('Absolute BPM') as HTMLInputElement
    fireEvent.change(input, { target: { value: '999' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe('90')
  })
})
