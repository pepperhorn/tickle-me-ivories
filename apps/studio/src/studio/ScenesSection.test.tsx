import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { buildProfile, DEFAULT_SETTINGS, lookFromSettings, PlatformError, sceneFromState } from 'ivories/core'
import type { ShareProvider, StorageProvider } from 'ivories/core'
import { ScenesSection } from './ScenesSection'
import { getDefaults } from '../platform/registry'
import type { Platform } from '../platform/registry'
import type { useScenes } from '../ui/useScenes'
import { fakeAuth } from '../ui/testing/fakeAuth'

const SHA = 'a'.repeat(64)
const scene = () => sceneFromState({
  song: { kind: 'local', sha256: SHA, name: 'song.mid', format: 'midi', title: 'Song' },
  profile: buildProfile({ song: { id: SHA, name: 'song.mid', format: 'midi' }, voices: [], tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 3, settings: DEFAULT_SETTINGS }),
})
const webcamScene = () => ({ ...scene(), layout: { kind: 'split' as const, ratio: 0.5, top: { kind: 'ivories' as const, view: 'falling' as const }, bottom: { kind: 'camera' as const, mode: 'webcam' as const, deviceId: 'cam-1', mirror: true, fit: 'cover' as const } } })
const scenes = { savesVersion: 0, openScene: vi.fn(), applyLook: vi.fn() } as unknown as ReturnType<typeof useScenes>

function remoteStorage(): StorageProvider {
  return {
    id: 'remote', remote: true,
    list: vi.fn(async (kind: string) => (kind === 'scene'
      ? [{ id: 'r1', kind: 'scene', name: 'Cloud scene', updatedAt: '2026-10-13T00:00:00.000Z', visibility: 'private' }]
      : [])),
    load: vi.fn(async () => null), save: vi.fn(), remove: vi.fn(),
  } as unknown as StorageProvider
}

function remoteShare(): ShareProvider {
  return {
    id: 'remote', supports: { anonymous: true, owned: true, revoke: true, fork: true },
    share: vi.fn(), match: () => null, resolve: vi.fn(async () => null),
    shareSaved: vi.fn(async () => ({ code: 'AbCdEfGhJk', url: 'https://ivories.test/s/AbCdEfGhJk', shortUrl: 'https://phrn.link/Xy12345' })),
    revoke: vi.fn(async () => {}),
  }
}

async function signedIn() {
  const auth = fakeAuth()
  await auth.requestCode('ana@example.test')
  await auth.verifyCode('ana@example.test', '12345678')
  return auth
}

function renderSection(platform: Platform) {
  return render(
    <ScenesSection
      platform={platform} scenes={scenes} canSave defaultName="Song"
      buildScene={scene} buildShareScene={scene} buildLook={() => lookFromSettings(DEFAULT_SETTINGS, 'roll', 3)}
    />,
  )
}

beforeEach(async () => {
  localStorage.clear()
  await getDefaults().storage.save({ kind: 'scene', name: 'Local scene', payload: scene() })
})
afterEach(() => { vi.clearAllMocks() })

describe('ScenesSection with a remote provider', () => {
  it('signed out: lists the browser saves, no toggle, no Share (Review Focus 5)', async () => {
    const storage = remoteStorage()
    renderSection({ auth: fakeAuth(), storage, share: remoteShare(), content: [] })
    expect(await screen.findByText('Local scene')).toBeTruthy()
    expect(storage.list).not.toHaveBeenCalled()
    expect(document.querySelector('.saves-source-toggle')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Share / })).toBeNull()
  })

  it('signed in: lists account saves, and the toggle switches to this browser', async () => {
    const auth = fakeAuth()
    await auth.requestCode('ana@example.test')
    await auth.verifyCode('ana@example.test', '12345678')
    renderSection({ auth, storage: remoteStorage(), share: remoteShare(), content: [] })
    expect(await screen.findByText('Cloud scene')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share Cloud scene' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'This browser' }))
    expect(await screen.findByText('Local scene')).toBeTruthy()
    expect(screen.queryByText('Cloud scene')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Share / })).toBeNull()
  })

  it('shares a saved scene as anyone-with-the-link (no public listing in 0.1), shows the short link, and stops sharing', async () => {
    const auth = fakeAuth()
    await auth.requestCode('ana@example.test')
    await auth.verifyCode('ana@example.test', '12345678')
    const share = remoteShare()
    renderSection({ auth, storage: remoteStorage(), share, content: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Share Cloud scene' }))
    const row = document.querySelector('.scene-row-share') as HTMLElement
    expect(within(row).getByText('Anyone with the link')).toBeTruthy()
    expect(within(row).queryByText(/Public/)).toBeNull()
    expect(within(row).queryByRole('combobox')).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Get link' }))
    await waitFor(() => expect((within(row).getByLabelText('Share link') as HTMLInputElement).value).toBe('https://phrn.link/Xy12345'))
    expect(share.shareSaved).toHaveBeenCalledWith('scene', 'r1', 'link_view')
    fireEvent.click(within(row).getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('AbCdEfGhJk'))
    expect(await screen.findByText(/Sharing stopped for “Cloud scene”/)).toBeTruthy()
  })

  it('Get link mints one link on a double-click (in-flight guard)', async () => {
    const share = remoteShare()
    let resolve!: (v: { code: string; url: string; shortUrl: string }) => void
    share.shareSaved = vi.fn(() => new Promise((r) => { resolve = r })) as unknown as ShareProvider['shareSaved']
    renderSection({ auth: await signedIn(), storage: remoteStorage(), share, content: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Share Cloud scene' }))
    const row = document.querySelector('.scene-row-share') as HTMLElement
    const get = within(row).getByRole('button', { name: 'Get link' }) as HTMLButtonElement
    fireEvent.click(get)
    fireEvent.click(get)
    expect(get.disabled).toBe(true)
    resolve({ code: 'AbCdEfGhJk', url: 'https://ivories.test/s/AbCdEfGhJk', shortUrl: 'https://phrn.link/Xy12345' })
    await waitFor(() => expect((within(row).getByLabelText('Share link') as HTMLInputElement).value).toBe('https://phrn.link/Xy12345'))
    expect(share.shareSaved).toHaveBeenCalledTimes(1)
  })

  it('keeps a live link: no second Get link, and Stop sharing ends the original link', async () => {
    const share = remoteShare()
    renderSection({ auth: await signedIn(), storage: remoteStorage(), share, content: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Share Cloud scene' }))
    const row = document.querySelector('.scene-row-share') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: 'Get link' }))
    await waitFor(() => expect((within(row).getByLabelText('Share link') as HTMLInputElement).value).toBe('https://phrn.link/Xy12345'))
    expect(within(row).getByText('Your link stays live until you stop it.')).toBeTruthy()
    expect(within(row).queryByRole('button', { name: 'Get link' })).toBeNull()
    fireEvent.click(within(row).getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('AbCdEfGhJk'))
    expect(share.shareSaved).toHaveBeenCalledTimes(1)
  })

  it('keeps a live link when the share area is closed and reopened', async () => {
    const share = remoteShare()
    renderSection({ auth: await signedIn(), storage: remoteStorage(), share, content: [] })
    const btn = await screen.findByRole('button', { name: 'Share Cloud scene' })
    fireEvent.click(btn)
    fireEvent.click(within(document.querySelector('.scene-row-share') as HTMLElement).getByRole('button', { name: 'Get link' }))
    await waitFor(() => expect(document.querySelector('.share-url')).not.toBeNull())
    fireEvent.click(btn)
    expect(document.querySelector('.scene-row-share')).toBeNull()
    expect(btn.textContent).toBe('Shared')
    fireEvent.click(btn)
    const row = document.querySelector('.scene-row-share') as HTMLElement
    expect((within(row).getByLabelText('Share link') as HTMLInputElement).value).toBe('https://phrn.link/Xy12345')
    fireEvent.click(within(row).getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('AbCdEfGhJk'))
  })

  it('tells the owner to re-pick their camera only when sharing would drop one', async () => {
    const storage = remoteStorage()
    storage.load = vi.fn(async () => webcamScene()) as unknown as StorageProvider['load']
    renderSection({ auth: await signedIn(), storage, share: remoteShare(), content: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Share Cloud scene' }))
    const row = document.querySelector('.scene-row-share') as HTMLElement
    expect(await within(row).findByText(/pick your camera again/)).toBeTruthy()
    expect(storage.load).toHaveBeenCalledWith('scene', 'r1')
  })

  it('shows no camera note for a scene without a camera', async () => {
    const storage = remoteStorage()
    storage.load = vi.fn(async () => scene()) as unknown as StorageProvider['load']
    renderSection({ auth: await signedIn(), storage, share: remoteShare(), content: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Share Cloud scene' }))
    await waitFor(() => expect(storage.load).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/pick your camera again/)).toBeNull()
  })

  it('an anonymous share keeps its revoke key in localStorage only, and sends it only to revoke()', async () => {
    const share = remoteShare()
    share.share = vi.fn(async () => ({ code: 'QwErTyUiOp', url: 'https://ivories.test/s/QwErTyUiOp', shortUrl: null, revokeKey: 'secret-revoke-key' }))
    renderSection({ auth: fakeAuth(), storage: remoteStorage(), share, content: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link (look)' }))
    const url = await screen.findByLabelText('Share link') as HTMLInputElement
    await waitFor(() => expect(url.value).toBe('https://ivories.test/s/QwErTyUiOp'))
    expect(url.value).not.toContain('secret-revoke-key')
    expect(document.body.textContent).not.toContain('secret-revoke-key')
    expect(JSON.parse(localStorage.getItem('tmi.shareRevoke.QwErTyUiOp')!).key).toBe('secret-revoke-key')
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('QwErTyUiOp', 'secret-revoke-key'))
    await waitFor(() => expect(localStorage.getItem('tmi.shareRevoke.QwErTyUiOp')).toBeNull())
  })

  it('offers no Stop sharing when the revoke key could not be stored', async () => {
    const share = remoteShare()
    share.share = vi.fn(async () => ({ code: 'QwErTyUiOp', url: 'https://ivories.test/s/QwErTyUiOp', shortUrl: null, revokeKey: 'secret-revoke-key' }))
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    try {
      renderSection({ auth: fakeAuth(), storage: remoteStorage(), share, content: [] })
      fireEvent.click(screen.getByRole('button', { name: 'Copy share link (look)' }))
      await screen.findByLabelText('Share link')
      expect(screen.queryByRole('button', { name: 'Stop sharing' })).toBeNull()
    } finally {
      setItem.mockRestore()
    }
  })

  it('keeps older stored revoke keys (no age expiry), and prunes the key when the link is already gone', async () => {
    localStorage.setItem('tmi.shareRevoke.OldOldOld1', JSON.stringify({ key: 'old', at: Date.now() - 365 * 24 * 60 * 60 * 1000 }))
    localStorage.setItem('tmi.shareRevoke.Recent0001', JSON.stringify({ key: 'recent', at: Date.now() - 24 * 60 * 60 * 1000 }))
    const share = remoteShare()
    share.share = vi.fn(async () => ({ code: 'QwErTyUiOp', url: 'https://ivories.test/s/QwErTyUiOp', shortUrl: null, revokeKey: 'k' }))
    share.revoke = vi.fn(async () => { throw new PlatformError('not_found', 'gone') })
    renderSection({ auth: fakeAuth(), storage: remoteStorage(), share, content: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link (look)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stop sharing' }))
    expect(localStorage.getItem('tmi.shareRevoke.OldOldOld1')).not.toBeNull()
    expect(localStorage.getItem('tmi.shareRevoke.Recent0001')).not.toBeNull()
    await waitFor(() => expect(localStorage.getItem('tmi.shareRevoke.QwErTyUiOp')).toBeNull())
    expect(await screen.findByText('That link was already gone.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop sharing' })).toBeNull()
  })

  it('signed in: the copy-link panel offers Stop sharing for an owned link and revokes it as the owner', async () => {
    const share = remoteShare()
    share.share = vi.fn(async () => ({ code: 'OwNeDcOdE1', url: 'https://ivories.test/s/OwNeDcOdE1', shortUrl: null }))
    renderSection({ auth: await signedIn(), storage: remoteStorage(), share, content: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link (look)' }))
    const panel = document.querySelector('.share-panel') as HTMLElement
    fireEvent.click(await within(panel).findByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('OwNeDcOdE1', undefined))
  })
})
