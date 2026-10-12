import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { applyLook, buildProfile, lookFromSettings, sceneApplyPlan, sceneFromState } from 'ivories/core'
import type { LookV1, SceneV2, SongRefWithTitle } from 'ivories/core'
import { getPlatform, subscribePlatform } from '../platform/registry'
import { useScenes } from '../ui/useScenes'
import { useTransport } from '../transport/useTransport'
import { useStudioStage } from './stageStore'
import { currentSettings, useSettings } from '../settings/useSettings'
import type { ProfileParts } from './useProfileActions'
import type { useSongLoader } from './useSongLoader'

// ---- scenes, looks and shares (task 2.5) ----

export function useSceneActions(o: {
  applyProfileParts(p: ProfileParts): { partial: boolean; message: string } | null
  loadFile: ReturnType<typeof useSongLoader>['loadFile']
  loadAnother(): void
}) {
  const { applyProfileParts, loadFile, loadAnother } = o

  // Read through useSyncExternalStore (preflight F15): getPlatform returns the
  // same object until a plugin installs, so this never loops. The draw loop
  // never reads it.
  const platform = useSyncExternalStore(subscribePlatform, getPlatform)

  /** The loaded song as a scene (spec §8.1). Phase 2's only song source is a
      dropped file, so the ref is always `local`. Throws with nothing loaded. */
  const buildScene = useCallback((): SceneV2 => {
    const tr = useTransport.getState()
    if (!tr.score) throw new Error('Load a song first.')
    const song: SongRefWithTitle = {
      kind: 'local', sha256: tr.score.id, name: tr.score.name, format: tr.score.sourceFormat,
      title: tr.score.name.replace(/\.[^.]+$/, '') || tr.score.name,
    }
    const profile = buildProfile({
      song: { id: tr.score.id, name: tr.score.name, format: tr.score.sourceFormat },
      voices: tr.score.voices, tempo: tr.tempo, mode: tr.mode,
      fallSeconds: tr.fallSeconds, settings: currentSettings(),
    })
    // sceneFromState asserts profile.song.id === songKey(song) (preflight F10a).
    const stage = useStudioStage.getState()
    return sceneFromState({ song, profile, layout: stage.layout, aspect: stage.aspect })
  }, [])

  const buildLook = useCallback((): LookV1 => {
    const tr = useTransport.getState()
    return lookFromSettings(currentSettings(), tr.mode, tr.fallSeconds)
  }, [])

  // Applies a scene to the loaded score through the same apply half as a
  // profile import (same refusal and partial-apply handling). A shared
  // scene's plan never carries audio (sceneApplyPlan, spec §8.1). The 400ms
  // autosave then records the result under tmi.profile.<id> as usual.
  const applySceneToScore = useCallback((scene: SceneV2, shared: boolean) => {
    if (!useTransport.getState().score) throw new Error('Load the scene’s song first.')
    const plan = sceneApplyPlan(scene, { shared })
    const r = applyProfileParts({
      ...plan.settings, audio: plan.audio,
      voices: plan.voices, tempo: plan.tempo, mode: plan.mode, fallSeconds: plan.fallSeconds,
    })
    if (r?.partial) throw new Error(`The scene was only partly applied: ${r.message}`)
    if (r) throw new Error(`Could not apply the scene: ${r.message}`)
    // Only after the profile half applied, so a refused scene leaves the stage alone.
    useStudioStage.getState().replace(plan.layout, plan.aspect)
  }, [applyProfileParts])

  // A look needs no song. keyOverride is song-specific, so the current one stays.
  const applyLookSettings = useCallback((look: LookV1) => {
    const a = applyLook(look)
    const cur = currentSettings()
    useSettings.getState().replaceAll({
      ...cur, theme: a.theme, display: a.display, velocity: a.velocity,
      text: { ...a.text, keyOverride: cur.text.keyOverride },
    })
    useTransport.getState().setMode(a.mode)
    useTransport.getState().setFallSeconds(a.fallSeconds)
  }, [])

  // Swapping songs for a scene goes through "Load another" first, so playback
  // stops and the outgoing song's pending autosave is flushed -- but only once
  // the new file has parsed, so a bad file leaves the current song alone.
  // Resolves true right after onLoaded (not after audio); false if the file
  // was refused or loadFile threw. Never rejects, so the prompt's busy state
  // always clears.
  const replaceSong = useCallback((file: File, onLoaded: () => void) => new Promise<boolean>((resolve) => {
    loadFile(file, {
      beforeLoad: () => { if (useTransport.getState().score) loadAnother() },
      onLoaded: () => { try { onLoaded() } finally { resolve(true) } },
    }).then((ok) => { if (!ok) resolve(false) }, () => resolve(false))
  }), [loadAnother, loadFile])

  const scenes = useScenes({
    scoreId: () => useTransport.getState().score?.id ?? null,
    applyScene: applySceneToScore,
    applyLook: applyLookSettings,
    replaceSong,
    currentAudio: () => currentSettings().audio,
  })

  return useMemo(() => ({ platform, scenes, buildScene, buildLook }), [platform, scenes, buildScene, buildLook])
}
