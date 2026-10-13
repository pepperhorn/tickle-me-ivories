import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountMenu } from './AccountMenu'
import { fakeAuth } from './testing/fakeAuth'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

  it('traps Tab inside the dialog: Tab from Cancel wraps to the first focusable, Shift+Tab back', () => {
    render(<AccountMenu auth={fakeAuth()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    const email = screen.getByLabelText('Email')
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(document.activeElement).toBe(email)
    fireEvent.keyDown(email, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)
  })

  it('re-focuses digit 1 after a wrong code', async () => {
    render(<AccountMenu auth={fakeAuth()} />)
    await signIn('00000000')
    await screen.findByRole('alert')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Digit 1 of 8')))
  })

  it('has no revoke button on the current device row', async () => {
    render(<AccountMenu auth={fakeAuth()} />)
    await signIn()
    fireEvent.click(await screen.findByRole('button', { name: '@ana' }))
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }))
    const rows = await screen.findAllByRole('listitem')
    const current = rows.find((r) => r.textContent?.includes('(this device)'))!
    expect(current.querySelector('.btn-revoke-device')).toBeNull()
    expect(rows.find((r) => r !== current)!.querySelector('.btn-revoke-device')).not.toBeNull()
  })

  it('Escape closes the panel; the trigger announces its popup', async () => {
    render(<AccountMenu auth={fakeAuth()} />)
    await signIn()
    const trigger = await screen.findByRole('button', { name: '@ana' })
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-haspopup')).toBe('true')
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!)
    expect(panel?.classList.contains('account-menu-panel')).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.account-menu-panel')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('focuses the Sign in trigger after signing out from the panel', async () => {
    render(<AccountMenu auth={fakeAuth()} />)
    await signIn()
    fireEvent.click(await screen.findByRole('button', { name: '@ana' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })) })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign in' })))
  })

  it('is hidden in transparent (OBS) mode', () => {
    const studioCss = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8')
    expect(studioCss).toMatch(/html\.ivories-transparent \.account-menu\s*\{\s*display:\s*none/)
  })
})
