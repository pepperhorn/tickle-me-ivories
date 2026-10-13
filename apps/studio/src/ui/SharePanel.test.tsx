import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { REVOKE_KEY_MAX_COUNT, SharePanel } from './SharePanel'
import { HashShareProvider } from 'ivories/core'
import { PlatformError } from 'ivories/core'
import { lookFromSettings } from 'ivories/core'
import { DEFAULT_SETTINGS } from 'ivories/core'
import type { SceneV2, ShareProvider } from 'ivories/core'

const look = () => lookFromSettings(DEFAULT_SETTINGS, 'keyboard', 3)
const props = (share: ShareProvider) => ({
  share, canShareScene: true,
  buildScene: (): SceneV2 => { throw new Error('unused') },
  buildLook: look,
})

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function setClipboard(v: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: v, configurable: true })
}
afterEach(() => {
  if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard)
  else delete (navigator as { clipboard?: unknown }).clipboard
})

describe('SharePanel', () => {
  it('copies the link and shows it in .share-url', async () => {
    const writeText = vi.fn(async () => {})
    setClipboard({ writeText })
    render(<SharePanel {...props(new HashShareProvider('https://x.test'))} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /share link \(look\)/ })) })
    await waitFor(() => expect(document.querySelector('.share-status')).not.toBeNull())
    const url = (document.querySelector('.share-url') as HTMLInputElement).value
    expect(url).toMatch(/^https:\/\/x\.test\/#share=[A-Za-z0-9_-]+$/)
    expect(writeText).toHaveBeenCalledWith(url)
    expect(document.querySelector('.share-status')?.textContent).toMatch(/copied/i)
  })

  it('falls back to a select-able field when the clipboard is unavailable', async () => {
    setClipboard(undefined)
    render(<SharePanel {...props(new HashShareProvider('https://x.test'))} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /share link \(look\)/ })) })
    await waitFor(() => expect(document.querySelector('.share-status')).not.toBeNull())
    const input = document.querySelector('.share-url') as HTMLInputElement
    expect(input.readOnly).toBe(true)
    expect(input.value).toMatch(/#share=/)
    expect(document.querySelector('.share-status')?.textContent).toMatch(/Copy the link below/)
  })

  it('shows a refused share', async () => {
    const share = new HashShareProvider('https://x.test')
    vi.spyOn(share, 'share').mockRejectedValue(new PlatformError('too_large', 'This look is too large to share as a link.'))
    render(<SharePanel {...props(share)} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /share link \(look\)/ })) })
    expect(screen.getByRole('alert').textContent).toMatch(/too large to share/)
    expect(document.querySelector('.share-url')).toBeNull()
  })

  it('mints one link on a double-click: the buttons are disabled while a share is pending', async () => {
    setClipboard(undefined)
    let resolve!: (v: { code: string; url: string; shortUrl: null }) => void
    const share = new HashShareProvider('https://x.test')
    const spy = vi.spyOn(share, 'share').mockImplementation(() => new Promise((r) => { resolve = r }))
    render(<SharePanel {...props(share)} />)
    const btn = screen.getByRole('button', { name: /share link \(look\)/ }) as HTMLButtonElement
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(btn.disabled).toBe(true)
    expect((screen.getByRole('button', { name: /share link \(scene\)/ }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { resolve({ code: 'QwErTyUiOp', url: 'https://x.test/s/QwErTyUiOp', shortUrl: null }) })
    await waitFor(() => expect(btn.disabled).toBe(false))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('signed in: an owned link (no revoke key) still offers Stop sharing, which calls revoke', async () => {
    setClipboard(undefined)
    const share: ShareProvider = {
      id: 'remote', supports: { anonymous: true, owned: true, revoke: true, fork: true },
      share: vi.fn(async () => ({ code: 'OwNeDcOdE1', url: 'https://x.test/s/OwNeDcOdE1', shortUrl: null })),
      match: () => null, resolve: vi.fn(async () => null),
      revoke: vi.fn(async () => {}),
    }
    render(<SharePanel {...props(share)} signedIn />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /share link \(look\)/ })) })
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('OwNeDcOdE1', undefined))
    expect(await screen.findByText(/Sharing stopped/)).toBeTruthy()
  })

  it('signed out: a link without a revoke key offers no Stop sharing', async () => {
    setClipboard(undefined)
    const share: ShareProvider = {
      id: 'remote', supports: { anonymous: true, owned: true, revoke: true, fork: true },
      share: vi.fn(async () => ({ code: 'OwNeDcOdE1', url: 'https://x.test/s/OwNeDcOdE1', shortUrl: null })),
      match: () => null, resolve: vi.fn(async () => null),
      revoke: vi.fn(async () => {}),
    }
    render(<SharePanel {...props(share)} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /share link \(look\)/ })) })
    await screen.findByLabelText('Share link')
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).toBeNull()
  })

  it(`keeps only the newest ${REVOKE_KEY_MAX_COUNT} stored revoke keys (anonymous links never expire)`, async () => {
    localStorage.clear()
    setClipboard(undefined)
    for (let i = 0; i < REVOKE_KEY_MAX_COUNT; i++) {
      localStorage.setItem(`tmi.shareRevoke.K${String(i).padStart(9, '0')}`, JSON.stringify({ key: `k${i}`, at: 1_000 + i }))
    }
    localStorage.setItem('tmi.shareRevoke.Unreadable', 'not json')
    localStorage.setItem('unrelated.key', 'kept')
    const share: ShareProvider = {
      id: 'remote', supports: { anonymous: true, owned: false, revoke: true, fork: false },
      share: vi.fn(async () => ({ code: 'NeWnEwNeW1', url: 'https://x.test/s/NeWnEwNeW1', shortUrl: null, revokeKey: 'new' })),
      match: () => null, resolve: vi.fn(async () => null),
      revoke: vi.fn(async () => {}),
    }
    render(<SharePanel {...props(share)} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /share link \(look\)/ })) })
    await screen.findByRole('button', { name: 'Stop sharing' })
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('tmi.shareRevoke.'))
    expect(keys).toHaveLength(REVOKE_KEY_MAX_COUNT)
    expect(localStorage.getItem('tmi.shareRevoke.NeWnEwNeW1')).not.toBeNull()
    expect(localStorage.getItem('tmi.shareRevoke.K000000000')).toBeNull() // the oldest
    expect(localStorage.getItem('tmi.shareRevoke.K000000001')).not.toBeNull()
    expect(localStorage.getItem('tmi.shareRevoke.Unreadable')).toBeNull()
    expect(localStorage.getItem('unrelated.key')).toBe('kept')
  })
})
