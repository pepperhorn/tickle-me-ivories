import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoicePanel } from './VoicePanel'
import type { Voice } from '../model/types'

const voices: Voice[] = [
  { id: 'l', label: 'Left hand', hue: 207, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 },
  { id: 'r', label: 'Right hand', hue: 28, instrument: 'acoustic_grand_piano', visible: true, audible: false, volume: 0.5 },
]

describe('VoicePanel', () => {
  it('renders a row per voice, labelled by its current name', () => {
    render(<VoicePanel voices={voices} onChange={() => {}} />)
    expect(screen.getByDisplayValue('Left hand')).toBeTruthy()
    expect(screen.getByDisplayValue('Right hand')).toBeTruthy()
  })

  it('reports a rename against the right voice id', () => {
    const onChange = vi.fn()
    render(<VoicePanel voices={voices} onChange={onChange} />)
    fireEvent.change(screen.getByDisplayValue('Right hand'), { target: { value: 'Melody' } })
    expect(onChange).toHaveBeenCalledWith('r', { label: 'Melody' })
  })

  it('reports hue as a number, not the input element string', () => {
    const onChange = vi.fn()
    render(<VoicePanel voices={voices} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Left hand colour'), { target: { value: '300' } })
    expect(onChange).toHaveBeenCalledWith('l', { hue: 300 })
  })

  it('shows the audible toggle pressed only for audible voices', () => {
    render(<VoicePanel voices={voices} onChange={() => {}} />)
    expect(screen.getByLabelText('Mute Left hand').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByLabelText('Mute Right hand').getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles visibility to the opposite of the current value', () => {
    const onChange = vi.fn()
    render(<VoicePanel voices={voices} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Hide Left hand'))
    expect(onChange).toHaveBeenCalledWith('l', { visible: false })
  })
})
