import { useCallback, useEffect, useMemo, useRef } from 'react'
import { buildProfile, loadGlobals, saveGlobals, saveProfile } from 'ivories/core'
import type { AudioEngine } from 'ivories/core'
import { useTransport } from '../transport/useTransport'
import { currentSettings, useSettings } from '../settings/useSettings'

export function useAutosave(engine: AudioEngine): { flush(): void } {
  const t = useTransport()
  const settings = useSettings()
  // Autosave, debounced so a slider drag writes once rather than sixty times.
  // The pending save is also stashed in a ref so it can be flushed on demand:
  // "Load another file" (before the score it describes is cleared) and
  // pagehide (before the tab actually closes) both fire well inside the
  // 400ms window and must not lose the last edit.
  const pendingAutosaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null)

  const flush = useCallback(() => {
    const pending = pendingAutosaveRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingAutosaveRef.current = null
    pending.run()
  }, [])

  // Globals follow the user, not the song: restore them once at startup.
  useEffect(() => {
    const g = loadGlobals()
    if (!g) return
    useSettings.getState().setVelocity(g.velocity)
    useSettings.getState().setAudio(g.audio)
    engine.setMasterVolume(g.audio.masterVolume)
  }, [engine])

  useEffect(() => {
    const run = () => {
      pendingAutosaveRef.current = null
      const st = useSettings.getState()
      saveGlobals({ velocity: st.velocity, audio: st.audio })
      const tr = useTransport.getState()
      if (!tr.score?.id) return
      saveProfile(buildProfile({
        song: { id: tr.score.id, name: tr.score.name, format: tr.score.sourceFormat },
        voices: tr.score.voices,
        tempo: tr.tempo,
        mode: tr.mode,
        fallSeconds: tr.fallSeconds,
        settings: currentSettings(),
      }))
    }
    const timer = setTimeout(run, 400)
    pendingAutosaveRef.current = { timer, run }
    return () => clearTimeout(timer)
  }, [t.score, t.tempo, t.mode, t.fallSeconds, settings])

  // A tab close (or refresh) can land inside the 400ms debounce window;
  // pagehide fires reliably before that, unlike beforeunload/unload.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [flush])

  return useMemo(() => ({ flush }), [flush])
}
