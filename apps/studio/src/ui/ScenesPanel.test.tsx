import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ScenesPanel } from './ScenesPanel'
import { LocalStorageProvider } from 'ivories/core'
import { sceneFromState } from 'ivories/core'
import { lookFromSettings } from 'ivories/core'
import { buildProfile, storageSet } from 'ivories/core'
import { DEFAULT_SETTINGS } from 'ivories/core'
import type { LookV1, SceneV2 } from 'ivories/core'

const SHA = 'c'.repeat(64)
const scene = (): SceneV2 => sceneFromState({
  song: { kind: 'local', sha256: SHA, name: 'demo.mid', format: 'midi', title: 'Demo' },
  profile: buildProfile({
    song: { id: SHA, name: 'demo.mid', format: 'midi' }, voices: [],
    tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 4, settings: DEFAULT_SETTINGS,
  }),
})
const look = (): LookV1 => lookFromSettings(DEFAULT_SETTINGS, 'keyboard', 3)

function setup(over: Partial<Parameters<typeof ScenesPanel>[0]> = {}) {
  const props = {
    storage: new LocalStorageProvider(),
    canSaveScene: true,
    defaultName: 'Demo',
    buildScene: vi.fn(scene),
    buildLook: vi.fn(look),
    onOpenScene: vi.fn(),
    onApplyLook: vi.fn(),
    ...over,
  }
  render(<ScenesPanel {...props} />)
  return props
}

beforeEach(() => { localStorage.clear() })

describe('ScenesPanel', () => {
  it('saves the current scene and look, lists them, and names them', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Save name'), { target: { value: 'Evening' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save scene' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save look' })) })

    await waitFor(() => expect(document.querySelectorAll('.scene-row')).toHaveLength(2))
    expect(document.querySelector('.scene-row--scene')?.textContent).toMatch(/Evening/)
    expect(document.querySelector('.scene-row--scene')?.textContent).toMatch(/Demo/) // song title
    expect(document.querySelector('.scene-row--look')?.textContent).toMatch(/Demo/) // default name
  })

  it('loads a saved scene and look through the callbacks, decoded', async () => {
    const p = setup()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save scene' })) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save look' })) })
    const loads = await screen.findAllByRole('button', { name: 'Load Demo' })
    await act(async () => { fireEvent.click(loads[0]) })
    await act(async () => { fireEvent.click(loads[1]) })
    expect(p.onOpenScene).toHaveBeenCalledWith(scene())
    expect(p.onApplyLook).toHaveBeenCalledWith(look())
  })

  it('deletes a save', async () => {
    setup()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save look' })) })
    const del = await screen.findByRole('button', { name: 'Delete Demo' })
    await act(async () => { fireEvent.click(del) })
    await waitFor(() => expect(document.querySelectorAll('.scene-row')).toHaveLength(0))
  })

  it('shows a refused save (too large) instead of swallowing it', async () => {
    const big = scene()
    big.profile.voices = Array.from({ length: 65 }, (_, i) => ({ id: `v${i}` }))
    setup({ buildScene: () => big })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save scene' })) })
    expect(screen.getByRole('alert').textContent).toMatch(/more than 64 voices/)
    expect(document.querySelectorAll('.scene-row')).toHaveLength(0)
  })

  it('shows the "made with a newer version" message for a save from a newer app', async () => {
    const storage = new LocalStorageProvider()
    const s = await storage.save({ kind: 'look', name: 'Future', payload: look() })
    storageSet(`tmi.saves.look.${s.id}`, JSON.stringify({ ...look(), v: 2 }))
    const p = setup({ storage })
    const btn = await screen.findByRole('button', { name: 'Load Future' })
    await act(async () => { fireEvent.click(btn) })
    expect((await screen.findByRole('alert')).textContent).toMatch(/made with a newer version/)
    expect(p.onApplyLook).not.toHaveBeenCalled()
  })

  it('disables Save scene with no song loaded', () => {
    setup({ canSaveScene: false })
    expect((screen.getByRole('button', { name: 'Save scene' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
