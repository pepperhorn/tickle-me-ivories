import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountMenu } from './AccountMenu'
import { fakeAuth } from './testing/fakeAuth'

async function signIn(code = '12345678') {
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  const first = await screen.findByLabelText('Digit 1 of 8')
  fireEvent.paste(first, { clipboardData: { getData: () => code } })
}

describe('AccountMenu', () => {
  it('renders nothing without an auth provider (the open build)', () => {
    const { container } = render(<AccountMenu auth={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('signs in with a pasted code and shows the handle', async () => {
    const auth = fakeAuth()
    render(<AccountMenu auth={auth} />)
    await signIn()
    await waitFor(() => expect(screen.getByRole('button', { name: '@ana' })).toBeTruthy())
    expect(auth.requested).toEqual(['ana@example.test'])
    expect(document.querySelectorAll('.otp-digit')).toHaveLength(0)
    expect(document.querySelector('.account-menu-trigger--signed-in')).not.toBeNull()
  })

  it('a wrong code shows the provider message and clears the digits', async () => {
    const auth = fakeAuth()
    render(<AccountMenu auth={auth} />)
    await signIn('00000000')
    expect((await screen.findByRole('alert')).textContent).toBe('That code is not right, or it has expired.')
    const digits = [...document.querySelectorAll<HTMLInputElement>('.otp-digit')]
    expect(digits).toHaveLength(8)
    expect(digits.every((d) => d.value === '')).toBe(true)
  })

  it('holds "Resend" for the cooldown', async () => {
    render(<AccountMenu auth={fakeAuth()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    const resend = await screen.findByRole('button', { name: /Resend in \d+s/ })
    expect((resend as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists devices, signs another one out, and signs this browser out', async () => {
    const auth = fakeAuth()
    render(<AccountMenu auth={auth} />)
    await signIn()
    fireEvent.click(await screen.findByRole('button', { name: '@ana' }))
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('(this device)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Phone browser' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })) })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('Escape closes the dialog', () => {
    render(<AccountMenu auth={fakeAuth()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('returns focus to the trigger when the dialog closes', () => {
    render(<AccountMenu auth={fakeAuth()} />)
    const trigger = screen.getByRole('button', { name: 'Sign in' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(document.activeElement).toBe(trigger)
  })
})
