import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LiveMidiSettings } from './LiveMidiSettings'
import { useLiveMidi } from './liveMidi'

const devices = vi.hoisted(() => ({ list: [{ id: 'k1', name: 'Stage Piano' }] as { id: string; name: string }[] }))
vi.mock('ivories/core', async (orig) => ({
  ...(await orig<typeof import('ivories/core')>()),
  listMidiDevices: async () => devices.list,
}))

beforeEach(() => {
  devices.list = [{ id: 'k1', name: 'Stage Piano' }]
  useLiveMidi.setState({ enabled: false, deviceId: null, audio: true, error: null, bpm: 100, session: false })
})

describe('Live MIDI settings (spec §6 toolbar: live MIDI device picker)', () => {
  it('enables input, lists devices and picks one', async () => {
    render(<LiveMidiSettings />)
    fireEvent.click(screen.getByLabelText('Live MIDI input'))
    expect(useLiveMidi.getState().enabled).toBe(true)
    const select = await screen.findByLabelText('MIDI device')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Stage Piano' })).toBeTruthy())
    fireEvent.change(select, { target: { value: 'k1' } })
    expect(useLiveMidi.getState().deviceId).toBe('k1')
  })

  it('"Play live notes" defaults on and toggles', () => {
    render(<LiveMidiSettings />)
    const box = screen.getByLabelText('Play live notes') as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(useLiveMidi.getState().audio).toBe(false)
  })

  it('says so when no devices are found', async () => {
    devices.list = []
    render(<LiveMidiSettings />)
    fireEvent.click(screen.getByLabelText('Live MIDI input'))
    expect((await screen.findByRole('status')).textContent).toBe('No MIDI devices found')
  })

  it('says so when the provider reports MIDI unavailable', async () => {
    useLiveMidi.setState({ enabled: true, error: 'MIDI unavailable in this browser' })
    render(<LiveMidiSettings />)
    expect((await screen.findByRole('status')).textContent).toBe('MIDI unavailable in this browser')
  })

  it('clears a stale error when input is switched off', () => {
    useLiveMidi.setState({ enabled: true, error: 'MIDI unavailable in this browser' })
    render(<LiveMidiSettings />)
    fireEvent.click(screen.getByLabelText('Live MIDI input'))
    expect(useLiveMidi.getState().error).toBeNull()
  })

  it('shows the live BPM when enabled and commits only valid values; showBpm={false} hides it', () => {
    useLiveMidi.setState({ enabled: true })
    const { unmount } = render(<LiveMidiSettings />)
    const field = screen.getByLabelText('BPM') as HTMLInputElement
    expect(field.value).toBe('100')
    fireEvent.change(field, { target: { value: '9' } })
    expect(useLiveMidi.getState().bpm).toBe(100)
    fireEvent.change(field, { target: { value: '144' } })
    expect(useLiveMidi.getState().bpm).toBe(144)
    fireEvent.blur(field)
    expect(field.value).toBe('144')
    unmount()
    render(<LiveMidiSettings showBpm={false} />)
    expect(screen.queryByLabelText('BPM')).toBeNull()
  })
})
