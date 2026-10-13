// What changes once a plugin can install AFTER the first render (Task 15):
// a /s/<code> link must still resolve, provider errors must reach the user,
// and saves go to the browser until the user signs in (Review Focus 1, 5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { buildProfile, DEFAULT_SETTINGS, PlatformError, sceneFromState } from 'ivories/core'
import type { AuthProvider, AuthState, Layout, ResolvedShare, ShareProvider, StorageProvider } from 'ivories/core'
import type { ScenesHost } from './useScenes'

const SHA = 'a'.repeat(64)
const CODE = 'AbCdEfGhJk'
const cam: Layout = {
  kind: 'split', ratio: 0.6,
  top: { kind: 'ivories', view: 'falling' },
  bottom: { kind: 'camera', mode: 'webcam', deviceId: 'cam-1', mirror: true, fit: 'cover' },
}
const sceneWithCam = () => sceneFromState({
  song: { kind: 'local', sha256: SHA, name: 'song.mid', format: 'midi', title: 'Song' },
  profile: buildProfile({ song: { id: SHA, name: 'song.mid', format: 'midi' }, voices: [], tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 3, settings: DEFAULT_SETTINGS }),
  layout: cam,
})

/** Fresh registry + hook per test: the registry holds module-level state. */
async function fresh() {
  vi.resetModules()
  const registry = await import('../platform/registry')
  const { useScenes } = await import('./useScenes')
  return { registry, useScenes }
}

function host(over: Partial<ScenesHost> = {}): ScenesHost {
  return {
    scoreId: () => SHA,
    applyScene: vi.fn(),
    applyLook: vi.fn(),
    replaceSong: vi.fn(async (_f: File, onLoaded: () => void) => { onLoaded(); return true }),
    currentAudio: () => DEFAULT_SETTINGS.audio,
    ...over,
  }
}

/** A remote ShareProvider that hands back a payload still carrying camera ids, as a careless provider might. */
function remoteShare(over: Partial<ShareProvider> = {}): ShareProvider {
  return {
    id: 'remote',
    supports: { anonymous: true, owned: true, revoke: true, fork: true },
    share: vi.fn(),
    match: (loc) => /^\/s\/([A-Za-z0-9]{10})\/?$/.exec(loc.pathname)?.[1] ?? null,
    resolve: vi.fn(async (code: string) => ({
      code, kind: 'scene' as const, payload: sceneWithCam(), owner: { handle: 'ana' }, visibility: 'link_view' as const,
      isOwner: false, canEdit: false, canFork: true,
    })),
    ...over,
  }
}

function fakeAuth(status: 'signed-in' | 'signed-out'): AuthProvider {
  const state: AuthState = status === 'signed-in' ? { status, user: { id: 'u', handle: 'ana', displayName: null } } : { status }
  return {
    id: 'fake', codeLength: 8, getState: () => state, subscribe: () => () => {},
    requestCode: vi.fn(), verifyCode: vi.fn(), signOut: vi.fn(),
  }
}

function remoteStorage(): StorageProvider {
  return {
    id: 'remote', remote: true,
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async (i: { kind: 'scene' | 'look'; name: string }) => ({ id: 'r1', kind: i.kind, name: i.name, updatedAt: '2026-10-13T00:00:00.000Z', visibility: 'private' as const })),
    remove: vi.fn(async () => {}),
  } as unknown as StorageProvider
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { history.replaceState(null, '', '/') })

describe('useScenes with a late plugin', () => {
  it('resolves a /s/<code> link once the plugin installs after first render, decoded as shared (Review Focus 1)', async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const h = host()
    const { result } = renderHook(() => useScenes(h))
    await act(async () => {})
    expect(result.current.preview).toBeNull()
    expect(result.current.shareError).toBeNull()

    act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share: remoteShare() }))
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    expect(result.current.preview).toMatchObject({ kind: 'scene', title: 'Song', owner: 'ana' })

    act(() => result.current.applyPreview())
    await waitFor(() => expect(h.applyScene).toHaveBeenCalled())
    const [applied, shared] = (h.applyScene as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(shared).toBe(true)
    expect(JSON.stringify(applied)).not.toContain('cam-1')
    expect(location.pathname).toBe('/')
  })

  it("shows the provider's own error (offline, rate limited)", async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const { result } = renderHook(() => useScenes(host()))
    act(() => registry.installPlugin({
      id: 'p', name: 'P', version: '1',
      share: remoteShare({ resolve: vi.fn(async () => { throw new PlatformError('network', 'Could not reach the server. Check your connection.') }) }),
    }))
    await waitFor(() => expect(result.current.shareError).toBe('Could not reach the server. Check your connection.'))
  })

  it('says a removed share was removed', async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const { result } = renderHook(() => useScenes(host()))
    act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share: remoteShare({ resolve: vi.fn(async () => null) }) }))
    await waitFor(() => expect(result.current.shareError).toBe('This share was removed, or its owner made it private.'))
  })

  it('Dismiss clears /s/<code>, and a later plugin change does not bring the banner back', async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const share = remoteShare()
    const { result } = renderHook(() => useScenes(host()))
    act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share }))
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    act(() => result.current.dismissPreview())
    expect(location.pathname).toBe('/')
    act(() => registry.installPlugin({ id: 'q', name: 'Q', version: '1' }))
    await act(async () => {})
    expect(result.current.preview).toBeNull()
    expect(share.resolve).toHaveBeenCalledTimes(1)
  })
})

describe('Save a copy goes where saves live now (Review Focus 5)', () => {
  it('to the browser while signed out, to the account while signed in', async () => {
    for (const status of ['signed-out', 'signed-in'] as const) {
      const { registry, useScenes } = await fresh()
      localStorage.clear()
      history.replaceState(null, '', `/s/${CODE}`)
      const storage = remoteStorage()
      const { result } = renderHook(() => useScenes(host()))
      act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', auth: fakeAuth(status), storage, share: remoteShare() }))
      await waitFor(() => expect(result.current.preview).not.toBeNull())
      await act(() => result.current.saveCopy())
      const local = await registry.getDefaults().storage.list('scene')
      if (status === 'signed-out') {
        expect(storage.save).not.toHaveBeenCalled()
        expect(local).toHaveLength(1)
      } else {
        expect(storage.save).toHaveBeenCalledTimes(1)
        expect(local).toHaveLength(0)
      }
    }
  })
})

describe('share resolve robustness (Task 15 review carry)', () => {
  it('ignores a stale resolve that finishes after a newer one (run counter)', async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    let releaseSlow: () => void = () => {}
    const slow = remoteShare({
      resolve: vi.fn(() => new Promise<ResolvedShare | null>((res) => {
        releaseSlow = () => res({
          code: CODE, kind: 'scene' as const, payload: sceneWithCam(), owner: { handle: 'stale' }, visibility: 'link_view' as const,
          isOwner: false, canEdit: false, canFork: true,
        })
      })),
    })
    const { result } = renderHook(() => useScenes(host()))
    act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share: slow }))
    await waitFor(() => expect(slow.resolve).toHaveBeenCalled())
    act(() => registry.installPlugin({ id: 'q', name: 'Q', version: '1', share: remoteShare() }))
    await waitFor(() => expect(result.current.preview?.owner).toBe('ana'))
    await act(async () => { releaseSlow() })
    await act(async () => {})
    expect(result.current.preview?.owner).toBe('ana')
  })

  it('a non-PlatformError from resolve shows a neutral message and is logged', async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = renderHook(() => useScenes(host()))
    act(() => registry.installPlugin({
      id: 'p', name: 'P', version: '1',
      share: remoteShare({ resolve: vi.fn(async () => { throw new TypeError('boom') }) }),
    }))
    await waitFor(() => expect(result.current.shareError).toBe("This link couldn't be opened."))
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('a /s/<code> path with no provider shows a hint after a short wait, and a late provider still resolves', async () => {
    vi.useFakeTimers()
    try {
      const { registry, useScenes } = await fresh()
      history.replaceState(null, '', `/s/${CODE}`)
      const { result } = renderHook(() => useScenes(host()))
      await act(async () => {})
      expect(result.current.shareError).toBeNull()
      await act(async () => { vi.advanceTimersByTime(4000) })
      expect(result.current.shareError).toBe("Sharing isn't available right now.")
      act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share: remoteShare() }))
      await act(async () => {})
      await act(async () => {})
      expect(result.current.preview).not.toBeNull()
      expect(result.current.shareError).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('no hint when the provider matched in time', async () => {
    vi.useFakeTimers()
    try {
      const { registry, useScenes } = await fresh()
      history.replaceState(null, '', `/s/${CODE}`)
      const { result } = renderHook(() => useScenes(host()))
      act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share: remoteShare() }))
      await act(async () => {})
      await act(async () => {})
      await act(async () => { vi.advanceTimersByTime(5000) })
      expect(result.current.preview).not.toBeNull()
      expect(result.current.shareError).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
