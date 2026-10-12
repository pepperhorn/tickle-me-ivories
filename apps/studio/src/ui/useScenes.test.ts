// Unit tests for two phase-2-review findings in useScenes.ts (findings 4 and
// 5) that App.test.tsx's higher-level share-link tests don't reach: what
// happens on Cancel after Apply led to the §8.3 file prompt, and whether
// saveCopy is covered by the same busyRef guard every other busy action uses.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useScenes } from './useScenes'
import type { ScenesHost } from './useScenes'
import { getPlatform } from '../platform/registry'
import { HashShareProvider } from 'ivories/core'
import { sceneFromState } from 'ivories/core'
import { lookFromSettings } from 'ivories/core'
import { buildProfile } from 'ivories/core'
import { DEFAULT_SETTINGS } from 'ivories/core'
import type { SceneV1, LookV1 } from 'ivories/core'

const SHA = 'a'.repeat(64)

const scene = (): SceneV1 => sceneFromState({
  song: { kind: 'local', sha256: SHA, name: 'song.mid', format: 'midi', title: 'Song' },
  profile: buildProfile({
    song: { id: SHA, name: 'song.mid', format: 'midi' }, voices: [],
    tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 4, settings: DEFAULT_SETTINGS,
  }),
})
const look = (): LookV1 => lookFromSettings(DEFAULT_SETTINGS, 'keyboard', 3)

function makeHost(over: Partial<ScenesHost> = {}): ScenesHost {
  return {
    scoreId: () => null,
    applyScene: vi.fn(),
    applyLook: vi.fn(),
    replaceSong: vi.fn(async (_file: File, onLoaded: () => void) => { onLoaded(); return true }),
    currentAudio: () => DEFAULT_SETTINGS.audio,
    ...over,
  }
}

/** Mirrors App.test.tsx's shareHash helper: encodes a payload the same way
    HashShareProvider.share does, independent of the origin captured by the
    module-level Platform default. */
async function shareHash(kind: 'scene' | 'look', payload: unknown): Promise<string> {
  const p = new HashShareProvider(location.origin)
  const res = await p.share({ kind, payload } as Parameters<HashShareProvider['share']>[0])
  return new URL(res.url).hash
}

async function mountWithHash(hash: string, host: ScenesHost) {
  history.replaceState(null, '', `/${hash}`)
  const r = renderHook(() => useScenes(host))
  await waitFor(() => expect(r.result.current.preview).not.toBeNull())
  return r
}

describe('useScenes', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { history.replaceState(null, '', '/') })

  // Finding 4: applyPreview clears the banner and the #share= hash before it
  // knows the scene needs the §8.3 file prompt. Cancelling that prompt used
  // to strand the share -- nothing left to open it from.
  it('Cancel on the file prompt after Apply re-offers the banner, and applies nothing', async () => {
    const host = makeHost()
    const { result } = await mountWithHash(await shareHash('scene', scene()), host)
    const originalPreview = result.current.preview

    act(() => { result.current.applyPreview() })
    await waitFor(() => expect(result.current.pending).not.toBeNull())
    expect(result.current.preview).toBeNull() // the banner is gone while the prompt shows

    act(() => { result.current.cancelPending() })
    expect(result.current.pending).toBeNull()
    expect(result.current.preview).toEqual(originalPreview)
    expect(host.applyScene).not.toHaveBeenCalled()

    // The restored banner really works: Apply can be retried and completed
    // (a file that does not match the scene's hash still applies via "use
    // anyway", proving the retry reaches a real, working flow).
    act(() => { result.current.applyPreview() })
    await waitFor(() => expect(result.current.pending).not.toBeNull())
    act(() => { result.current.provideFile(new File([new Uint8Array(1)], 'other.mid')) })
    await waitFor(() => expect(result.current.pending?.mismatch).not.toBeNull())
    act(() => { result.current.acceptMismatch() })
    await waitFor(() => expect(host.applyScene).toHaveBeenCalledTimes(1))
  })

  // A share applied and opened directly (no file prompt, e.g. the loaded
  // score already matches) needs no restore -- cancelPending is a no-op with
  // nothing pending.
  it('cancelPending is a no-op when nothing is pending', async () => {
    const host = makeHost()
    const { result } = await mountWithHash(await shareHash('look', look()), host)
    act(() => { result.current.cancelPending() })
    expect(result.current.pending).toBeNull()
    expect(result.current.preview).not.toBeNull()
  })

  // Finding 5: saveCopy used to set `busy` state directly without the
  // busyRef guard every other busy action (runBusy) relies on, so a second
  // call while the first was still in flight was not blocked.
  it('saveCopy is guarded by busyRef: a second call while one is in flight is a no-op', async () => {
    const host = makeHost()
    const { result } = await mountWithHash(await shareHash('look', look()), host)

    const summary = { id: 's1', kind: 'look' as const, name: 'Shared look', updatedAt: '', visibility: 'private' as const }
    let resolveSave: (() => void) | null = null
    const saveSpy = vi.spyOn(getPlatform().storage, 'save').mockImplementation(
      () => new Promise((res) => { resolveSave = () => res(summary) }),
    )
    try {
      act(() => { void result.current.saveCopy() })
      await waitFor(() => expect(result.current.busy).toBe(true))
      expect(saveSpy).toHaveBeenCalledTimes(1)

      act(() => { void result.current.saveCopy() }) // fired again while the first is still in flight
      expect(saveSpy).toHaveBeenCalledTimes(1) // the guard made the second call a no-op

      act(() => { resolveSave?.() })
      await waitFor(() => expect(result.current.busy).toBe(false))
      expect(saveSpy).toHaveBeenCalledTimes(1)
    } finally {
      saveSpy.mockRestore()
    }
  })
})
