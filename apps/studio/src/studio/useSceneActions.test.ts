import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSceneActions } from './useSceneActions'
import { useStudioStage } from './stageStore'
import { useTransport } from '../transport/useTransport'
import { buildProfile, DEFAULT_SETTINGS, sceneFromState, singleLayout } from 'ivories/core'
import type { Layout, SceneV2 } from 'ivories/core'
import type { TransportState } from '../transport/useTransport'

const SHA = 'b'.repeat(64)
const split: Layout = {
  kind: 'split', top: { kind: 'ivories', view: 'keyboard' },
  bottom: { kind: 'camera', mode: 'webcam', deviceId: 'cam-1', mirror: true, fit: 'cover' }, ratio: 0.4,
}

function sceneWith(layout: Layout, aspect: '16:9' | '9:16' | 'free'): SceneV2 {
  return sceneFromState({
    song: { kind: 'local', sha256: SHA, name: 'song.mid', format: 'midi', title: 'song' },
    profile: buildProfile({
      song: { id: SHA, name: 'song.mid', format: 'midi' }, voices: [],
      tempo: { mode: 'scale', scale: 1 }, mode: 'keyboard', fallSeconds: 4, settings: DEFAULT_SETTINGS,
    }),
    layout, aspect,
  })
}

function setup(applyProfileParts = vi.fn(() => null as { partial: boolean; message: string } | null)) {
  const { result } = renderHook(() => useSceneActions({ applyProfileParts, loadFile: vi.fn(async () => true), loadAnother: vi.fn() }))
  return { result, applyProfileParts }
}

beforeEach(() => {
  useStudioStage.setState({ layout: singleLayout('falling'), aspect: 'free' })
  useTransport.setState({ score: { id: SHA, name: 'song.mid', sourceFormat: 'midi', voices: [] } as unknown as TransportState['score'] })
})

describe('useSceneActions: scenes carry the stage layout (spec §8.1)', () => {
  it('builds a scene with the studio stage layout and aspect', () => {
    useStudioStage.getState().replace(split, '9:16')
    const { result } = setup()
    const scene = result.current.buildScene()
    expect(scene.layout).toEqual(split)
    expect(scene.aspect).toBe('9:16')
  })

  it('applying a scene replaces the stage layout and aspect', async () => {
    const { result } = setup()
    await act(async () => { await result.current.scenes.openScene(sceneWith(split, '16:9'), false) })
    expect(useStudioStage.getState().layout).toEqual(split)
    expect(useStudioStage.getState().aspect).toBe('16:9')
  })

  it('a shared scene applies its layout without the sender\'s device ids', async () => {
    const { result } = setup()
    await act(async () => { await result.current.scenes.openScene(sceneWith(split, '16:9'), true) })
    expect(useStudioStage.getState().layout).toEqual({ ...split, bottom: { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' } })
  })

  it('a scene with the current mode but a different primary view ends consistent', async () => {
    useTransport.getState().setMode('keyboard')
    useStudioStage.setState({ layout: singleLayout('keyboard') })
    const { result } = setup()
    // The scene's profile says keyboard (same as now) but its primary slot shows falling keys.
    const fallingSplit: Layout = { ...split, top: { kind: 'ivories', view: 'falling' } }
    await act(async () => { await result.current.scenes.openScene(sceneWith(fallingSplit, 'free'), false) })
    expect(useStudioStage.getState().layout).toEqual(fallingSplit)
    expect(useTransport.getState().mode).toBe('roll')
  })

  it('a refused scene leaves the stage alone', async () => {
    const { result } = setup(vi.fn(() => ({ partial: false, message: 'nope' })))
    await act(async () => { await result.current.scenes.openScene(sceneWith(split, '16:9'), false) })
    expect(result.current.scenes.message).toMatch(/nope/)
    expect(useStudioStage.getState().layout).toEqual(singleLayout('falling'))
    expect(useStudioStage.getState().aspect).toBe('free')
  })
})
