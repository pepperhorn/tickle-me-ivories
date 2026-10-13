import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { AudioEngine } from '../core/audio/engine'
import type { SoundsOption } from '../core/audio/gmSounds'
import { AudioClock } from '../core/clock/AudioClock'
import { ManualClock } from '../core/clock/ManualClock'
import { DEFAULT_LIVE_BPM, clampBpm } from '../core/render/beats'
import { trailNoteOff, trailNoteOn, trailReseat } from '../core/midi/trail'
import type { TrailNote } from '../core/midi/trail'
import { MediaClock } from '../core/clock/MediaClock'
import { PlaybackDriver } from '../core/audio/playback'
import { claimPlayback, releasePlayback } from '../core/audio/claim'
import { sharedAudioContext } from '../core/audio/sharedContext'
import { FrameLoop } from '../core/render/frameLoop'
import { EMPTY_HELD, diffHeld, heldScoreNotes } from '../core/render/activeNotes'
import { SCALE_1, loadScoreSource } from '../core/io/loadScoreSource'
import { longestNoteSec } from '../core/model/score'
import { resolveSettings } from '../core/settings/resolve'
import { IvoriesError, isIvoriesError } from '../core/errors'
import { MidiInput } from '../core/midi/MidiInput'
import type { MidiNoteEvent } from '../core/midi/MidiInput'
import type { LiveNote } from '../core/midi/types'
import { IvoriesContext } from './context'
import { ValueStore } from './ValueStore'
import { useDisposable } from './useDisposable'
import { cancelPendingStart, startPlayback } from './startPlayback'
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
  /** The live BPM changed through setBpm / useLiveBpm / the Transport field. */
  onBpmChange?(bpm: number): void
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
  /** Piano samples from the pepperscore-sounds GM pack for the provider's own engine (R-G). Unset: smplr's grand piano. */
  sounds?: SoundsOption
  /** Schedule audio. Default true with the provider's own clock or an AudioClock; false for a
      ManualClock or MediaClock (the host carries the sound). */
  audio?: boolean
  /** The TempoSetting a controlled `score` is timed at (studio only; default scale 1).
      Describes the given score only: a provider never retimes a score it loads (R1). */
  tempo?: TempoSetting
  theme?: ThemeName
  look?: LookV1
  settings?: Partial<Settings>
  fallSeconds?: number
  /** Sound live notes through the engine. Default false (the studio turns it on). */
  liveAudio?: boolean
  /** The MIDI input to listen to; null or absent listens to every input. */
  midiDeviceId?: string | null
  /** Live mode (no score): beats per minute for the rising roll's speed and grid. Default 100 (20-300). */
  bpm?: number
  /** With no score and no host clock, run a free-running clock for live input. A <RisingKeys> without a score asks for one itself. */
  liveClock?: boolean
  /** The live clock starts at mount instead of on the first live note. */
  autoStart?: boolean
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

  // Every reported error also reaches the console, once per code+message for
  // this provider (rising-roll spec §2): a host without onError still sees why
  // audio or MIDI went quiet, and a repeating failure cannot flood the log.
  const [logged] = useState(() => new Set<string>())
  // audio-unavailable and midi-unavailable never become status.error: the score
  // still loads and plays (silently, or without live keys), spec §4.1.
  const report = useCallback((e: IvoriesError) => {
    const key = `${e.code}|${e.message}`
    if (!logged.has(key)) {
      logged.add(key)
      const msg = `[ivories] ${e.code}: ${e.message}`
      // No trailing `undefined` in the console when there is no cause.
      if (e.cause !== undefined) console.warn(msg, e.cause)
      else console.warn(msg)
    }
    if (e.code !== 'audio-unavailable' && e.code !== 'midi-unavailable') status.set({ loading: false, error: e })
    const onError = latest.current.onError
    if (onError) safeCall(onError, e)
  }, [status, logged])
  // Set once Web Audio has failed (no AudioContext): the own clock then runs on
  // the wall clock and the driver stops handing anything to the engine.
  const audioDead = useRef(false)
  const markAudioDead = useCallback((e: unknown) => {
    if (audioDead.current) return
    audioDead.current = true
    report(new IvoriesError('audio-unavailable', 'Web Audio is unavailable; playing silently.', e))
  }, [report])

  // ---- engine and clock: the host's, or our own ----
  // Built once; a change of the sounds option's CONTENT (hosts pass object
  // literals) reloads the instrument in place, so the context never goes null
  // and the children (MIDI, live clock, trail) stay mounted.
  const soundsKey = props.sounds ? JSON.stringify(props.sounds) : ''
  const soundsRef = useRef(props.sounds); soundsRef.current = props.sounds
  const ownEngine = useDisposable(
    () => (props.engine ? null : new AudioEngine({ makeContext: sharedAudioContext, sounds: soundsRef.current })),
    (e) => e.dispose(), [!props.engine],
  )
  useEffect(() => { void ownEngine?.setSounds(soundsRef.current) }, [ownEngine, soundsKey])
  const engine = props.engine ?? ownEngine
  // Always built (unused while a host clock is given): taking the host clock
  // away must never leave a render without a clock, which would unmount the views.
  const ownClock = useDisposable(
    () => (engine ? ownAudioClock(engine, markAudioDead) : null),
    (c) => c.dispose(), [engine],
  )

  // ---- live clock (R-L): no host clock, no score source, and someone wants it ----
  const [liveClockUsers, setLiveClockUsers] = useState(0)
  const requestLiveClock = useCallback(() => {
    setLiveClockUsers((n) => n + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setLiveClockUsers((n) => n - 1)
    }
  }, [])
  const hasScoreSource = props.score !== undefined
    ? props.score !== null
    : props.scoreUrl !== undefined || props.file !== undefined || props.musicXml !== undefined || props.midi !== undefined
  const wantsLiveClock = !props.clock && !hasScoreSource && (props.liveClock === true || liveClockUsers > 0)
  const liveClock = useDisposable(() => (wantsLiveClock ? new ManualClock() : null), (c) => c.dispose(), [wantsLiveClock])
  // An outgoing live clock (still held for one render) is never paired with a newly arrived score.
  const activeLiveClock = wantsLiveClock ? liveClock : null
  const clock = props.clock ?? activeLiveClock ?? ownClock
  const liveClockActive = activeLiveClock !== null && clock === activeLiveClock
  const liveClockRef = useRef(activeLiveClock); liveClockRef.current = activeLiveClock
  const autoStart = props.autoStart === true
  useEffect(() => { if (activeLiveClock && autoStart) activeLiveClock.play() }, [activeLiveClock, autoStart])

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
  const tempoIn = controlled ? (props.tempo ?? SCALE_1) : SCALE_1
  const tempoKey = tempoIn.mode === 'scale' ? `s${tempoIn.scale}` : `a${tempoIn.bpm}`
  const tempo = useMemo(() => tempoIn, [tempoKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- settings ----
  const [audioPatch, setAudioPatch] = useState<Partial<AudioSettings>>({})
  const settings = useMemo(() => {
    const s = resolveSettings({ settings: props.settings, look: props.look, theme: props.theme })
    return { ...s, audio: { ...s.audio, ...audioPatch } }
  }, [props.settings, props.look, props.theme, audioPatch])
  const fallSeconds = props.fallSeconds ?? props.look?.display.fallSeconds ?? 3
  const notes = score?.notes
  const maxNoteDur = useMemo(() => (score ? longestNoteSec(score) : 0), [notes]) // eslint-disable-line react-hooks/exhaustive-deps
  // Spec §3.1: only the provider's own clock or an AudioClock schedules audio by default.
  // The live clock never schedules (there is no score) and never claims the page (R-L).
  const audio = props.audio ?? (props.clock ? props.clock instanceof AudioClock : activeLiveClock === null)

  // ---- live BPM (R-P): the prop seeds and overrides; setBpm changes it in between ----
  const [bpm, setBpmState] = useState(() => clampBpm(props.bpm ?? DEFAULT_LIVE_BPM))
  const bpmProp = props.bpm
  useEffect(() => { if (bpmProp !== undefined) setBpmState(clampBpm(bpmProp)) }, [bpmProp])
  // Also written by setBpm itself, so two calls before a render compare correctly.
  const bpmRef = useRef(bpm); bpmRef.current = bpm
  const setBpm = useCallback((next: number) => {
    if (!Number.isFinite(next)) return
    const v = clampBpm(next)
    if (v === bpmRef.current) return
    bpmRef.current = v
    setBpmState(v)
    const cb = latest.current.onBpmChange
    if (cb) safeCall(cb, v)
  }, [])

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
      // Only a running engine is handed notes: while the context is suspended
      // (autoplay blocked) the cursors stay level with the playhead, so the
      // "enable sound" tap does not release every note since Play at once.
      audioEnabled: () => {
        if (!audioRef.current || audioDead.current) return false
        try { return engine.running !== false } catch (e) { markAudioDead(e); return false }
      },
      onAudioError: markAudioDead,
      // The media decides where it ends (it may run past the score).
      stopAtEnd: !(clock instanceof MediaClock),
    })
    d.setScore(scoreRef.current, tempoRef.current)
    d.start()
    driverRef.current = d
    return () => { d.dispose(); driverRef.current = null }
  }, [clock, engine, markAudioDead])
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
  // Created once and reading the clock through a ref: switching between the live
  // clock and a score clock must never null the context and unmount the views (R-L).
  const clockRef = useRef(clock); clockRef.current = clock
  const frames = useDisposable(() => new FrameLoop(() => clockRef.current?.now() ?? 0), (f) => f.dispose(), [])
  useEffect(() => {
    if (!frames) return
    let lastT = Number.NaN
    let lastNotes: readonly NoteEvent[] | undefined
    let lastTenth = Number.NaN
    let held: ReadonlyMap<number, NoteEvent> = EMPTY_HELD
    return frames.add((t) => {
      const s = scoreRef.current
      // A score that arrives (or is replaced) while paused must still light t.
      if (t === lastT && s?.notes === lastNotes) return
      lastT = t
      lastNotes = s?.notes
      const tenth = Math.round(t * 10)
      if (tenth !== lastTenth) { lastTenth = tenth; latest.current.onTimeUpdate?.(t) }
      const next = s ? heldScoreNotes(s, t, maxNoteDurRef.current) : EMPTY_HELD
      const d = diffHeld(held, next)
      if (!d) return
      held = next
      active.set({ ...active.get(), score: next })
      const ev = latest.current
      const { onNoteOn, onNoteOff } = ev
      if (onNoteOff) for (const n of d.off) safeCall(onNoteOff, { midi: n.pitch, velocity: 0, time: t, source: 'score' as const })
      if (onNoteOn) for (const n of d.on) safeCall(onNoteOn, { midi: n.pitch, velocity: n.velocity, time: n.startSec, source: 'score' as const })
    })
  }, [frames, active])

  // ---- live MIDI (spec §4.1): started while a view with input="midi" is mounted ----
  const [liveHeld] = useState(() => new ValueStore<ReadonlyMap<number, LiveNote>>(new Map()))
  // Live notes on THIS clock (R-T): a new clock makes them meaningless, a seek re-seats them.
  const [trail] = useState(() => new ValueStore<readonly TrailNote[]>([]))
  useEffect(() => {
    trail.set([])
    if (!clock) return
    return clock.subscribe((e) => { if (e.type === 'seek') trail.set(trailReseat(trail.get(), e.time)) })
  }, [clock, trail])
  const midiRef = useRef<MidiInput | null>(null)
  const liveUsers = useRef(0)
  const engineRef = useRef(engine); engineRef.current = engine

  const [liveListeners] = useState(() => new Set<(e: MidiNoteEvent) => void>())
  const onLive = useCallback((e: MidiNoteEvent) => {
    // The live clock starts on the first key (R-L); the trail is stamped in clock time (R-T).
    const lc = liveClockRef.current
    if (e.on && lc && !lc.playing) lc.play()
    const at = clockRef.current?.now() ?? 0
    trail.set(e.on ? trailNoteOn(trail.get(), e.midi, e.velocity, at) : trailNoteOff(trail.get(), e.midi, at))
    const next = new Map(liveHeld.get())
    if (e.on) next.set(e.midi, { midi: e.midi, velocity: e.velocity, time: e.time })
    else next.delete(e.midi)
    liveHeld.set(next)
    active.set({ ...active.get(), live: next })
    const ev = latest.current
    const eng = engineRef.current
    try {
      if (e.on && ev.liveAudio) {
        // MIDI is not a user gesture, but after any gesture on the page resume()
        // succeeds: the first key unlocks a suspended context (the live clock
        // never runs startPlayback, so nothing else would).
        if (eng && !eng.running) void eng.resume().catch(() => {})
        eng?.noteOn(e.midi, e.velocity)
      }
      // Always released: liveAudio may have been switched off while the key was down.
      else eng?.noteOff(e.midi)
    } catch { /* no Web Audio: the key still lights and reaches every listener */ }
    // One throwing subscriber must not keep the event from the rest.
    const out = { midi: e.midi, velocity: e.velocity, time: e.time, source: 'live' as const }
    const host = e.on ? ev.onNoteOn : ev.onNoteOff
    if (host) safeCall(host, out)
    for (const fn of [...liveListeners]) safeCall(fn, e)
  }, [liveHeld, active, liveListeners, trail])

  const enableLive = useCallback(() => {
    liveUsers.current++
    if (liveUsers.current === 1) {
      const m = new MidiInput({ deviceId: latest.current.midiDeviceId ?? null })
      midiRef.current = m
      m.subscribe(onLive)
      // A MIDI failure only reports; playback and the views carry on.
      // A MidiInput released meanwhile (StrictMode's discarded mount) stays quiet.
      m.start().catch((err) => {
        if (midiRef.current !== m) return
        report(isIvoriesError(err) ? err : new IvoriesError('midi-unavailable', 'MIDI input is unavailable.', err))
      })
      if (latest.current.liveAudio) void engineRef.current?.prepareLive().catch(() => {})
    }
    let released = false
    return () => {
      if (released) return
      released = true
      liveUsers.current--
      if (liveUsers.current > 0) return
      midiRef.current?.stop()
      midiRef.current = null
      liveHeld.set(new Map())
      active.set({ ...active.get(), live: new Map() })
    }
  }, [onLive, report, liveHeld, active])

  const midiDeviceId = props.midiDeviceId ?? null
  useEffect(() => { midiRef.current?.setDevice(midiDeviceId) }, [midiDeviceId])
  useEffect(() => { if (props.liveAudio && midiRef.current) void engine?.prepareLive().catch(() => {}) }, [props.liveAudio, engine])
  const liveHub = useMemo(() => ({
    held: liveHeld,
    trail,
    enable: enableLive,
    subscribe: (fn: (e: MidiNoteEvent) => void) => { liveListeners.add(fn); return () => { liveListeners.delete(fn) } },
  }), [liveHeld, trail, enableLive, liveListeners])

  useEffect(() => { if (score) latest.current.onReady?.({ score, duration: score.durationSec }) }, [score])

  // A Play still waiting on resume() never starts a clock this provider has let go of.
  useEffect(() => () => { if (clock) cancelPendingStart(clock) }, [clock])

  useImperativeHandle(props.ref, () => ({
    play: () => { if (clock && engine) startPlayback({ clock, engine, audio, reportError: report }) },
    pause: () => { if (clock) { cancelPendingStart(clock); clock.pause() } },
    seek: (t: number) => clock?.seek(t),
    setRate: (r: number) => clock?.setRate(r),
    get clock() { return clock as Clock },
  }), [clock, engine, audio, report])

  const setAudio = useCallback((p: Partial<AudioSettings>) => setAudioPatch((cur) => ({ ...cur, ...p })), [])
  const value = useMemo<IvoriesContextValue | null>(() => (clock && engine && frames
    ? { score, tempo, clock, engine, settings, fallSeconds, maxNoteDur, audio, frames, active, status, setAudio, reportError: report, live: liveHub, bpm, setBpm, requestLiveClock, liveClockActive }
    : null), [score, tempo, clock, engine, settings, fallSeconds, maxNoteDur, audio, frames, active, status, setAudio, report, liveHub, bpm, setBpm, requestLiveClock, liveClockActive])

  // Children render once the clock, engine and frame loop exist (after the
  // first effect; never on the server), so a view always finds a context.
  return <IvoriesContext.Provider value={value}>{value ? props.children : null}</IvoriesContext.Provider>
}

const loggedThrowers = new WeakSet<object>()

/**
 * Calls a host or subscriber callback; a throw is logged (once per callback,
 * so a note stream cannot flood the console), never rethrown into the provider.
 */
function safeCall<T>(fn: (arg: T) => void, arg: T): void {
  try {
    fn(arg)
  } catch (err) {
    if (loggedThrowers.has(fn)) return
    loggedThrowers.add(fn)
    console.error('ivories: a callback threw', err)
  }
}

/**
 * The provider's own AudioClock. Without Web Audio, reading the engine's time
 * throws (no AudioContext); that is reported once and the clock falls back to
 * the wall clock for good, so frames and playback keep running silently.
 */
function ownAudioClock(engine: AudioEngine, onDead: (e: unknown) => void): AudioClock {
  const wallNow = () => performance.now() / 1000
  let dead = false
  const fail = (e: unknown) => { if (!dead) { dead = true; onDead(e) } }
  const source = {
    get currentTime() {
      if (dead) return wallNow()
      try { return engine.currentTime } catch (e) { fail(e); return wallNow() }
    },
  }
  const isRunning = () => {
    if (dead) return false
    try { return engine.running } catch (e) { fail(e); return false }
  }
  return new AudioClock(source, { isRunning, wallNow })
}
