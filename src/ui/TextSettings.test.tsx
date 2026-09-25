import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TextSettings } from './TextSettings'
import { DEFAULT_SETTINGS } from '../settings/types'
import type { TextSettings as TextSettingsType } from '../settings/types'

function setup(text: TextSettingsType = DEFAULT_SETTINGS.text) {
  const onChange = vi.fn()
  const onStyle = vi.fn()
  render(<TextSettings text={text} onChange={onChange} onStyle={onStyle} />)
  return { onChange, onStyle }
}

describe('TextSettings font family', () => {
  it('does not commit on every keystroke', () => {
    const { onStyle } = setup()
    const input = screen.getByLabelText('Font family')
    fireEvent.change(input, { target: { value: 'M' } })
    fireEvent.change(input, { target: { value: 'Mo' } })
    fireEvent.change(input, { target: { value: 'Mon' } })
    expect(onStyle).not.toHaveBeenCalled()
  })

  it('commits once on blur', () => {
    const { onStyle } = setup()
    const input = screen.getByLabelText('Font family')
    fireEvent.change(input, { target: { value: 'Montserrat' } })
    fireEvent.blur(input)
    expect(onStyle).toHaveBeenCalledTimes(1)
    expect(onStyle).toHaveBeenCalledWith({ family: 'Montserrat' })
  })

  it('commits exactly once on Enter, not twice', () => {
    const { onStyle } = setup()
    const input = screen.getByLabelText('Font family') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'Montserrat' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // Enter blurs; the blur commits. It must not commit a second time.
    expect(document.activeElement).not.toBe(input)
    expect(onStyle).toHaveBeenCalledTimes(1)
  })

  it('does not commit on a blur with no edit', () => {
    const { onStyle } = setup()
    const input = screen.getByLabelText('Font family')
    input.focus()
    fireEvent.blur(input)
    expect(onStyle).not.toHaveBeenCalled()
  })

  it('resyncs the draft when the committed family changes externally', () => {
    const text = DEFAULT_SETTINGS.text
    const { rerender } = render(
      <TextSettings text={text} onChange={vi.fn()} onStyle={vi.fn()} />,
    )
    const input = screen.getByLabelText('Font family') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Draft only' } })
    rerender(
      <TextSettings text={{ ...text, style: { ...text.style, family: 'Inter' } }} onChange={vi.fn()} onStyle={vi.fn()} />,
    )
    expect(input.value).toBe('Inter')
  })
})
