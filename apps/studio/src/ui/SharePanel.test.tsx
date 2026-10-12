import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SharePanel } from './SharePanel'
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
})
