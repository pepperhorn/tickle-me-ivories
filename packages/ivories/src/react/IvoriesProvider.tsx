import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { AudioEngine } from '../core/audio/engine'
import { AudioClock } from '../core/clock/AudioClock'
import { PlaybackDriver } from '../core/audio/playback'
import { claimPlayback, releasePlayback } from '../core/audio/claim'
import { sharedAudioContext } from '../core/audio/sharedContext'
import { FrameLoop } from '../core/render/frameLoop'
import { EMPTY_HELD, diffHeld, heldScoreNotes } from '../core/render/activeNotes'
import { SCALE_1, loadScoreSource } from '../core/io/loadScoreSource'
import { longestNoteSec } from '../core/model/score'
import { resolveSettings } from '../core/settings/resolve'
import { IvoriesError, isIvoriesError } from '../core/errors'
import { IvoriesContext } from './context'
import { ValueStore } from './ValueStore'
import { useDisposable } from './useDisposable'
import { startPlayback } from './startPlayback'
import type { Clock } from '../core/clock/types'
import type { ScoreSource } from '../core/io/loadScoreSource'
import type { NoteEvent, ScoreDocument, TempoSetting } from '../core/model/types'
import type { AudioSettings, Settings, ThemeName } from '../core/settings/types'
import type { LookV1 } from '../core/platform/types'
import type { ActiveNotes, IvoriesContextValue, IvoriesNoteEvent, ProviderStatus } from './context'

export interface IvoriesEvents {
  onReady?(info: { score: ScoreDocument; duration: number }): void
  onNoteOn?(e: IvoriesNoteEvent): void
  onNoteOff?(e: IvoriesNoteEvent): void
  /** Throttled to ~10 Hz of score time. */
  onTimeUpdate?(t: number): void
  onError?(e: IvoriesError): void
}

export interface IvoriesHandle {
  play(): void
  pause(): void
  seek(t: number): void
  setRate(r: number): void
  readonly clock: Clock
}

export interface IvoriesProviderProps extends ScoreSource, IvoriesEvents {
  /** An already-parsed score. Passing this (even null) makes the provider controlled. */
  score?: ScoreDocument | null
  clock?: Clock
  /** Advanced/test seam; the provider builds one on the page-wide AudioContext otherwise. */
  engine?: AudioEngine
  /** Schedule audio. Default true (false by default for a MediaClock, Task 15). */
  audio?: boolean
  /** The TempoSetting a controlled `score` is timed at (studio only; default scale 1).
      Describes the given score only: a provider never retimes a score it loads (R1). */
  tempo?: TempoSetting
  theme?: ThemeName
  look?: LookV1
  settings?: Partial<Settings>
  fallSeconds?: number
  children?: ReactNode
  ref?: Ref<IvoriesHandle>
}

const NO_ACTIVE: ActiveNotes = { score: EMPTY_HELD, live: new Map() }

/** One score, one clock, one audio engine, one animation-frame loop (spec §3.2). */
export function IvoriesProvider(props: IvoriesProviderProps) {
  const latest = useRef(props)
  latest.current = props
  const [status] = useState(() => new ValueStore<ProviderStatus>({ loading: false, error: null }))
  const [active] = useState(() => new ValueStore<ActiveNotes>(NO_ACTIVE))

  const report = useCallback((e: IvoriesError) => {
    status.set({ loading: false, error: e })
    latest.current.onError?.(e)
  }, [status])

  // ---- engine and clock: the host's, or our own ----
  const ownEngine = useDisposable(
    () => (props.engine ? null : new AudioEngine({ makeContext: sharedAudioContext })),
    (e) => e.dispose(), [!props.engine],
  )
  const engine = props.engine ?? ownEngine
  const ownClock = useDisposable(
    () => (props.clock || !engine ? null : new AudioClock(engine, { isRunning: () => engine.running })),
    (c) => c.dispose(), [!props.clock, engine],
  )
  const clock = props.clock ?? ownClock

  // ---- score: controlled, or loaded from a source prop (always at its own tempo, R1) ----
  const controlled = props.score !== undefined
  const { scoreUrl, file, musicXml, midi } = props
  const [loaded, setLoaded] = useState<ScoreDocument | null>(null)
  useEffect(() => {
    if (controlled) return
    if (scoreUrl === undefined && file === undefined && musicXml === undefined && midi === undefined) {
      setLoaded(null)
      return
    }
    let live = true
    status.set({ loading: true, error: null })
    loadScoreSource({ scoreUrl, file, musicXml, midi }, SCALE_1).then(
      (s) => { if (live) { status.set({ loading: false, error: null }); setLoaded(s) } },
      (e) => {
        if (!live) return
        setLoaded(null)
        report(isIvoriesError(e) ? e : new IvoriesError('score-load', String(e), e))
      },
    )
    return () => { live = false }
  }, [controlled, scoreUrl, file, musicXml, midi, status, report])
  const score = controlled ? (props.score ?? null) : loaded
  const tempo = controlled ? (props.tempo ?? SCALE_1) : SCALE_1

  // ---- settings ----
  const [audioPatch, setAudioPatch] = useState<Partial<AudioSettings>>({})
  const settings = useMemo(() => {
    const s = resolveSettings({ settings: props.settings, look: props.look, theme: props.theme })
    return { ...s, audio: { ...s.audio, ...audioPatch } }
  }, [props.settings, props.look, props.theme, audioPatch])
  const fallSeconds = props.fallSeconds ?? props.look?.display.fallSeconds ?? 3
  const notes = score?.notes
  const maxNoteDur = useMemo(() => (score ? longestNoteSec(score) : 0), [notes]) // eslint-disable-line react-hooks/exhaustive-deps
  const audio = props.audio ?? true

  // Read by the driver and the frame loop without re-subscribing.
  const scoreRef = useRef(score); scoreRef.current = score
  const settingsRef = useRef(settings); settingsRef.current = settings
  const audioRef = useRef(audio); audioRef.current = audio
  const tempoRef = useRef(tempo); tempoRef.current = tempo
  const maxNoteDurRef = useRef(maxNoteDur); maxNoteDurRef.current = maxNoteDur

  // ---- scheduler ----
  const driverRef = useRef<PlaybackDriver | null>(null)
  useEffect(() => {
    if (!clock || !engine) return
    const d = new PlaybackDriver({
      clock, engine,
      getScore: () => scoreRef.current,
      getAudio: () => settingsRef.current.audio,
      audioEnabled: () => audioRef.current,
    })
    d.setScore(scoreRef.current, tempoRef.current)
    d.start()
    driverRef.current = d
    return () => { d.dispose(); driverRef.current = null }
  }, [clock, engine])
  // Rebuilt only when the note array is replaced (a voice edit keeps it).
  useEffect(() => { driverRef.current?.setScore(scoreRef.current, tempoRef.current) }, [notes])

  // ---- our own engine loads its instruments ----
  const voices = score?.voices
  useEffect(() => {
    if (!ownEngine || !voices) return
    let live = true
    Promise.all(voices.map((v) => ownEngine.loadVoice(v))).then(
      () => { if (live) ownEngine.retainVoices(voices.map((v) => v.id)) },
      (e) => { if (live) report(new IvoriesError('audio-unavailable', 'The instruments could not load; playing silently.', e)) },
    )
    return () => { live = false }
  }, [ownEngine, voices, report])
  useEffect(() => { ownEngine?.setMasterVolume(settings.audio.masterVolume) }, [ownEngine, settings.audio.masterVolume])

  // ---- only one provider on the page sounds at a time ----
  useEffect(() => {
    if (!clock || !audio) return
    const owner = { pause: () => clock.pause() }
    const off = clock.subscribe((e) => { if (e.type === 'play') claimPlayback(owner) })
    return () => { off(); releasePlayback(owner) }
  }, [clock, audio])

  // ---- the shared frame loop: time updates and score note on/off ----
  const frames = useDisposable(() => (clock ? new FrameLoop(() => clock.now()) : null), (f) => f.dispose(), [clock])
  useEffect(() => {
    if (!frames) return
    let lastT = Number.NaN
    let lastTenth = Number.NaN
    let held: ReadonlyMap<number, NoteEvent> = EMPTY_HELD
    return frames.add((t) => {
      if (t === lastT) return
      lastT = t
      const tenth = Math.round(t * 10)
      if (tenth !== lastTenth) { lastTenth = tenth; latest.current.onTimeUpdate?.(t) }
      const s = scoreRef.current
      const next = s ? heldScoreNotes(s, t, maxNoteDurRef.current) : EMPTY_HELD
      const d = diffHeld(held, next)
      if (!d) return
      held = next
      active.set({ ...active.get(), score: next })
      const ev = latest.current
      for (const n of d.off) ev.onNoteOff?.({ midi: n.pitch, velocity: 0, time: t, source: 'score' })
      for (const n of d.on) ev.onNoteOn?.({ midi: n.pitch, velocity: n.velocity, time: n.startSec, source: 'score' })
    })
  }, [frames, active])

  useEffect(() => { if (score) latest.current.onReady?.({ score, duration: score.durationSec }) }, [score])

  useImperativeHandle(props.ref, () => ({
    play: () => { if (clock && engine) startPlayback({ clock, engine, audio, reportError: report }) },
    pause: () => clock?.pause(),
    seek: (t: number) => clock?.seek(t),
    setRate: (r: number) => clock?.setRate(r),
    get clock() { return clock as Clock },
  }), [clock, engine, audio, report])

  const setAudio = useCallback((p: Partial<AudioSettings>) => setAudioPatch((cur) => ({ ...cur, ...p })), [])
  const value = useMemo<IvoriesContextValue | null>(() => (clock && engine && frames
    ? { score, clock, engine, settings, fallSeconds, maxNoteDur, audio, frames, active, status, setAudio, reportError: report }
    : null), [score, clock, engine, settings, fallSeconds, maxNoteDur, audio, frames, active, status, setAudio, report])

  // Children render once the clock, engine and frame loop exist (after the
  // first effect; never on the server), so a view always finds a context.
  return <IvoriesContext.Provider value={value}>{value ? props.children : null}</IvoriesContext.Provider>
}
