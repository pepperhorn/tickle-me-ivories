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
  useLiveMidi.setState({ enabled: false, deviceId: null, audio: true, error: null })
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
})
