import { useCallback, useMemo, useRef, useState } from 'react'
import { hashFile, loadProfile, mergeVoices, parseScoreFile } from 'ivories/core'
import type { AudioEngine, ScoreDocument, TempoSetting, Voice } from 'ivories/core'
import { useTransport } from '../transport/useTransport'
import { currentSettings, useSettings } from '../settings/useSettings'

/** The tempo a song with no saved profile starts at: the file's own tempi. */
const DEFAULT_TEMPO: TempoSetting = { mode: 'scale', scale: 1 }

export interface VoicesReady { promise: Promise<void>; done: boolean }

export function useSongLoader(o: { engine: AudioEngine; onScoreReplaced(): void }) {
  const { engine } = o
  const onScoreReplaced = useRef(o.onScoreReplaced)
  onScoreReplaced.current = o.onScoreReplaced
  const [error, setError] = useState<string | null>(null)
  // Bumped on every loadFile/loadAnother so a slow, now-superseded load can't
  // prune the CURRENT score's voice buses out from under it once it finally
  // resolves (voice ids like 'hand-left'/'hand-right' repeat across files).
  const loadTokenRef = useRef(0)
  const voicesReadyRef = useRef<VoicesReady>({ promise: Promise.resolve(), done: true })

  // The audio half shared by loadFile and loadDocument. NOT awaited by the
  // caller before the score shows (count-in task): outside a user gesture
  // resume() can stay pending until one arrives, and the instruments used to
  // wait behind it -- so they only started loading when Play was pressed, and
  // the first seconds played silent. Sample fetch and decode work on a
  // suspended context; the gesture that unlocks audio is the file picker's
  // click (unlockAudio) or, failing that, Play / "Tap to start sound".
  // Failures go to setError; the promise resolves once voices are loaded. The retain is skipped once a newer load has taken the token.
  const startAudio = async (token: number, fileVoices: Voice[], label: string): Promise<void> => {
    engine.resume().catch((e: unknown) => {
      // The score is loaded and visible; only sound is affected.
      if (loadTokenRef.current === token) {
        setError(`${label} is loaded, but audio could not start: ${(e as Error).message}`)
      }
    })
    const ready = (async () => {
      engine.setMasterVolume(useSettings.getState().audio.masterVolume)
      // Load the voices as they are NOW, not this function's parsed copy: a
      // scene applied in onLoaded must not have its instruments and gains
      // overwritten by the file's defaults.
      const voices = loadTokenRef.current === token
        ? useTransport.getState().score?.voices ?? fileVoices
        : fileVoices
      await Promise.all(voices.map((v) => engine.loadVoice(v)))
      if (loadTokenRef.current === token) engine.retainVoices(voices.map((v) => v.id))
    })()
    const entry = { promise: ready.catch(() => {}), done: false }
    void entry.promise.then(() => { entry.done = true })
    voicesReadyRef.current = entry
    try {
      await ready
    } catch (e) {
      if (loadTokenRef.current === token) {
        setError(`${label} is loaded, but audio could not start: ${(e as Error).message}`)
      }
    }
  }

  // Resolves false if the file was refused. Two optional hooks serve the
  // scene file prompt (§8.3):
  // - `beforeLoad` runs once the file has parsed, before anything changes,
  //   so a caller can unload the current song only for a file that is good;
  // - `onLoaded` runs synchronously as soon as the file is the loaded score,
  //   BEFORE the audio half: engine.resume() can wait indefinitely for a user
  //   gesture (autoplay policy), and a scene applied in onLoaded must be what
  //   the audio half then loads.
  const loadFile = useCallback(async (
    file: File,
    hooks: { beforeLoad?: () => void; onLoaded?: () => void } = {},
  ): Promise<boolean> => {
    let score
    try {
      const bytes = await file.arrayBuffer()
      score = parseScoreFile(bytes, file.name, useTransport.getState().tempo)
      score.id = await hashFile(bytes)
      if (score.notes.length === 0) { setError(`${file.name} contains no notes.`); return false }
    } catch (e) {
      setError(`Could not read ${file.name}: ${(e as Error).message}`)
      return false
    }
    hooks.beforeLoad?.()

    // Claim this load's slot before the first await below. If a newer
    // loadFile or loadAnother runs before this one's instruments finish
    // loading, the token no longer matches and this call's retainVoices is
    // skipped -- otherwise a slow file A resolving after file B is already
    // current would prune B's voices right back out.
    const token = ++loadTokenRef.current

    setError(null)

    // Restore this piece's autosaved profile, matched by content hash.
    const saved = loadProfile(score.id)
    if (saved) {
      score.voices = mergeVoices(score.voices, saved.voices)
      // Set tempo BEFORE loadScore: loadScore retimes the incoming score to the
      // live tempo setting, so the setting has to be right first.
      useTransport.setState({ tempo: saved.tempo })
      useSettings.getState().replaceAll({
        ...currentSettings(), theme: saved.theme, text: saved.text,
        ...(saved.display.settings ? { display: saved.display.settings } : {}),
      })
    } else {
      // Tempo is song-scoped (§10): a song with no profile starts at its own
      // tempo, not the previous song's -- which, in absolute mode, would
      // flatten this file's tempo map and then be autosaved as its profile.
      useTransport.setState({ tempo: DEFAULT_TEMPO })
    }

    useTransport.getState().loadScore(score)
    onScoreReplaced.current()
    if (saved) {
      useTransport.getState().setMode(saved.display.mode)
      useTransport.getState().setFallSeconds(saved.display.fallSeconds)
    }
    hooks.onLoaded?.()

    await startAudio(token, score.voices, file.name)
    return true
  }, [engine])

  /** Loads an in-memory score (a recording): same model and audio halves as loadFile, no profile. */
  const loadDocument = useCallback((score: ScoreDocument) => {
    const token = ++loadTokenRef.current
    setError(null)
    useTransport.setState({ tempo: DEFAULT_TEMPO })
    useTransport.getState().loadScore(score)
    onScoreReplaced.current()
    void startAudio(token, score.voices, 'The recording')
  }, [engine])

  // Any tap or click on the stage, and the file pickers' own clicks, unlock
  // audio in the gesture itself. Cheap when already running (resume is a no-op).
  const unlockAudio = useCallback(() => {
    engine.resume().catch(() => { /* reported by loadFile / the start gate */ })
  }, [engine])

  /** The model half of "Load another file". Callers stop audio first. */
  const clearSong = useCallback(() => {
    useTransport.getState().clearScore()
    // Silence holds the last chord, so a cleared score would keep showing it.
    onScoreReplaced.current()
    loadTokenRef.current++ // invalidate any in-flight loadFile's retainVoices
    engine.retainVoices([])
  }, [engine])

  const voicesReady = useCallback(() => voicesReadyRef.current, [])

  return useMemo(
    () => ({ error, setError, loadFile, loadDocument, unlockAudio, clearSong, voicesReady }),
    [error, loadFile, loadDocument, unlockAudio, clearSong, voicesReady],
  )
}
