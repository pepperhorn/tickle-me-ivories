import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { buildProfile, DEFAULT_SETTINGS, lookFromSettings, sceneFromState } from 'ivories/core'
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
    fireEvent.click(screen.getByRole('button', { name: 'This browser' }))
    expect(await screen.findByText('Local scene')).toBeTruthy()
    expect(screen.queryByText('Cloud scene')).toBeNull()
  })

  it('shares a saved scene with a chosen visibility, shows the short link, and stops sharing', async () => {
    const auth = fakeAuth()
    await auth.requestCode('ana@example.test')
    await auth.verifyCode('ana@example.test', '12345678')
    const share = remoteShare()
    renderSection({ auth, storage: remoteStorage(), share, content: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Share Cloud scene' }))
    const row = document.querySelector('.scene-row-share') as HTMLElement
    fireEvent.change(within(row).getByLabelText('Who can open the link'), { target: { value: 'public' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Get link' }))
    await waitFor(() => expect((within(row).getByLabelText('Share link') as HTMLInputElement).value).toBe('https://phrn.link/Xy12345'))
    expect(share.shareSaved).toHaveBeenCalledWith('scene', 'r1', 'public')
    fireEvent.click(within(row).getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('AbCdEfGhJk'))
    expect(await screen.findByText(/Sharing stopped for “Cloud scene”/)).toBeTruthy()
  })

  it('tells the owner that sharing a saved scene drops its camera choice', async () => {
    const auth = fakeAuth()
    await auth.requestCode('ana@example.test')
    await auth.verifyCode('ana@example.test', '12345678')
    renderSection({ auth, storage: remoteStorage(), share: remoteShare(), content: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Share Cloud scene' }))
    const row = document.querySelector('.scene-row-share') as HTMLElement
    expect(within(row).getByText(/pick your camera again/)).toBeTruthy()
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
    expect(localStorage.getItem('tmi.shareRevoke.QwErTyUiOp')).toBe('secret-revoke-key')
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('QwErTyUiOp', 'secret-revoke-key'))
    await waitFor(() => expect(localStorage.getItem('tmi.shareRevoke.QwErTyUiOp')).toBeNull())
  })
})
