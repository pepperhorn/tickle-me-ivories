import { useCallback, useMemo, useState } from 'react'
import { buildProfile, decodeProfile, encodeProfile, mergeVoices } from 'ivories/core'
import type {
  AudioEngine, AudioSettings, DisplayMode, DisplaySettings, SavedVoice, Settings, TempoSetting,
  TextSettings, ThemeSettings, VelocityScheme, Voice,
} from 'ivories/core'
import { useTransport } from '../transport/useTransport'
import { currentSettings, useSettings } from '../settings/useSettings'

/** What a profile import or a scene applies (see applyProfileParts). */
export interface ProfileParts {
  theme: ThemeSettings
  text: TextSettings
  display?: DisplaySettings
  velocity?: VelocityScheme
  audio?: AudioSettings | null
  voices: SavedVoice[]
  tempo: TempoSetting
  mode: DisplayMode
  fallSeconds: number
}

export function useProfileActions(o: { engine: AudioEngine; changeTempo(s: TempoSetting): void }) {
  const { engine, changeTempo } = o
  const [profileError, setProfileError] = useState<string | null>(null)

  const exportProfile = useCallback(() => {
    const tr = useTransport.getState()
    if (!tr.score) return
    const p = buildProfile({
      song: { id: tr.score.id, name: tr.score.name, format: tr.score.sourceFormat },
      voices: tr.score.voices, tempo: tr.tempo, mode: tr.mode,
      fallSeconds: tr.fallSeconds, settings: currentSettings(),
    })
    const url = URL.createObjectURL(new Blob([encodeProfile(p)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${tr.score.name.replace(/\.[^.]+$/, '')}.tmi.json`
    a.className = 'profile-download hidden'
    // Safari and Firefox can cancel a download from a detached anchor, or one
    // whose URL is revoked in the same task as the click.
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [])

  // The apply half shared by a profile import and a scene. Everything derived
  // is computed before the first mutation, so a refusal leaves the app as it
  // was ({ partial: false }); a failure mid-apply reports { partial: true }.
  // Voices, tempo, mode and fall time need a loaded score; with none, only
  // the settings apply. `velocity`/`audio` apply only when given.
  const applyProfileParts = useCallback((p: ProfileParts): { partial: boolean; message: string } | null => {
    const tr = useTransport.getState()
    let next: Settings, voices: Voice[] | null
    try {
      next = {
        ...currentSettings(), theme: p.theme, text: p.text,
        ...(p.display ? { display: p.display } : {}),
        ...(p.velocity ? { velocity: p.velocity } : {}),
        // Merged over the current audio: a save made before a setting existed
        // (Count-in) must not switch it back to its default.
        ...(p.audio ? { audio: { ...currentSettings().audio, ...p.audio } } : {}),
      }
      voices = tr.score ? mergeVoices(tr.score.voices, p.voices) : null
    } catch (e) {
      return { partial: false, message: (e as Error).message }
    }
    try {
      useSettings.getState().replaceAll(next)
      if (p.audio) engine.setMasterVolume(p.audio.masterVolume)
      if (tr.score && voices) {
        useTransport.setState({ score: { ...tr.score, voices } })
        for (const v of voices) { engine.setVoiceVolume(v.id, v.volume); void engine.loadVoice(v) }
        changeTempo(p.tempo)
        tr.setMode(p.mode)
        tr.setFallSeconds(p.fallSeconds)
      }
      return null
    } catch (e) {
      return { partial: true, message: (e as Error).message }
    }
  }, [engine, changeTempo])

  const importProfile = useCallback(async (file: File, applyGlobals: boolean) => {
    let p
    try {
      p = decodeProfile(await file.text())
    } catch (e) {
      // Refused outright -- current settings are untouched.
      setProfileError((e as Error).message)
      return
    }
    const r = applyProfileParts({
      theme: p.theme, text: p.text, display: p.display.settings,
      ...(applyGlobals ? { velocity: p.global.velocity, audio: p.global.audio } : {}),
      voices: p.voices, tempo: p.tempo, mode: p.display.mode, fallSeconds: p.display.fallSeconds,
    })
    if (!r) setProfileError(null)
    else if (r.partial) setProfileError(`Profile was only partly applied: ${r.message}`)
    else setProfileError(`Could not import profile: ${r.message}`)
  }, [applyProfileParts])

  return useMemo(
    () => ({ profileError, exportProfile, importProfile, applyProfileParts }),
    [profileError, exportProfile, importProfile, applyProfileParts],
  )
}
