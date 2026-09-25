import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AudioEngine } from './audio/engine'
import { BeatCursor, MetronomeVoice, beatTimes } from './audio/metronome'
import { Scheduler, TICK_MS } from './audio/scheduler'
import { parseMidi } from './io/parseMidi'
import { hashFile } from './io/hashFile'
import { computeLayout, fitRange, FIRST_PITCH, LAST_PITCH } from './render/geometry'
import { drawStage } from './render/pianoRoll'
import { DEFAULT_THEME, readTheme } from './render/theme'
import { useCanvasStage } from './render/useCanvasStage'
import { effectiveBpmAt, sameTempo } from './model/tempoMap'
import { keyOfScore } from './music/keyOf'
import { ChordFeed } from './music/chordFeed'
import { displayChordSymbol } from './music/chords'
import { toRomanNumeral } from './music/romanNumerals'
import { playheadAt, useTransport } from './transport/useTransport'
import { currentSettings, useSettings } from './settings/useSettings'
import {
  buildProfile, decodeProfile, encodeProfile, loadGlobals, loadProfile, mergeVoices,
  saveGlobals, saveProfile,
} from './settings/profile'
import { DEFAULT_SETTINGS } from './settings/types'
import { ChordReadout } from './ui/ChordReadout'
import { DisplaySettings } from './ui/DisplaySettings'
import { FileDropZone } from './ui/FileDropZone'
import { StageText, samePitches } from './ui/StageText'
import { TextSettings } from './ui/TextSettings'
import { ProfileSettings } from './ui/ProfileSettings'
import { SettingsPanel, SettingsRow, SettingsSection } from './ui/SettingsPanel'
import { TempoControl } from './ui/TempoControl'
import { ThemeSettings } from './ui/ThemeSettings'
import { TransportBar } from './ui/TransportBar'
import { VelocityEditor } from './ui/VelocityEditor'
import { VoicePanel } from './ui/VoicePanel'
import type { RenderState } from './render/pianoRoll'
import type { KeyboardLayout } from './render/geometry'
import type { Theme } from './render/theme'
import type { ChordReading } from './music/chords'
import type { KeyContext } from './music/spell'
import type { ChordDisplayValue } from './ui/ChordReadout'
import type { ScoreDocument, TempoSetting, Voice } from './model/types'
import type { ThemeName, ZoomMode } from './settings/types'

/** Shared by identity so the labels-off overlay state never allocates. */
const NO_PITCHES: number[] = []

export default function App() {
  const t = useTransport()
  const settings = useSettings()
  const engineRef = useRef<AudioEngine | null>(null)
  const schedulerRef = useRef<Scheduler | null>(null)
  const beatsRef = useRef<BeatCursor | null>(null)
  const metronomeRef = useRef<MetronomeVoice | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const lastTenthRef = useRef(-1)
  // What the DOM text overlay is showing. The ref is the draw loop's copy, so
  // it can compare against the last push without reading React state.
  const [stageText, setStageText] = useState<{ layout: KeyboardLayout | null; pitches: number[] }>({
    layout: null, pitches: [],
  })
  const stageTextRef = useRef(stageText)
  const voicesRef = useRef<{ score: ScoreDocument | null; map: Map<string, Voice> }>({
    score: null, map: new Map(),
  })
  const layoutRef = useRef<{ w: number; h: number; first: number; last: number; layout: KeyboardLayout } | null>(null)
  const rangeRef = useRef<{ score: ScoreDocument | null; zoom: ZoomMode; range: [number, number] }>({
    score: null, zoom: 'full', range: [FIRST_PITCH, LAST_PITCH],
  })
  const stageWrapRef = useRef<HTMLDivElement | null>(null)
  const themeRef = useRef<{ key: string; layout: KeyboardLayout | null; theme: Theme }>({
    key: '', layout: null, theme: DEFAULT_THEME,
  })
  // Bumped on every loadFile/loadAnother so a slow, now-superseded load can't
  // prune the CURRENT score's voice buses out from under it once it finally
  // resolves (voice ids like 'hand-left'/'hand-right' repeat across files).
  const loadTokenRef = useRef(0)
  // The chord readout (spec §15.2). The feed is the draw loop's stateful chord
  // step; lastReadingRef is the last reading pushed to React, compared by
  // identity so a steady chord costs no re-render. `undefined` means "nothing
  // pushed" (readout off), so switching it back on always pushes once.
  const chordFeedRef = useRef<ChordFeed | null>(null)
  const lastReadingRef = useRef<ChordReading | null | undefined>(undefined)
  const lastReadingKeyRef = useRef<KeyContext | null>(null)
  const [chord, setChord] = useState<ChordDisplayValue | null>(null)
  const keyRef = useRef<{ sig: ScoreDocument['keySignature'] | null; override: string | null; key: KeyContext } | null>(null)

  if (!engineRef.current) engineRef.current = new AudioEngine()
  const engine = engineRef.current
  if (!chordFeedRef.current) chordFeedRef.current = new ChordFeed()
  const chordFeed = chordFeedRef.current

  // Cached by score identity so the draw loop does not allocate a fresh Map
  // 60x/sec for data that only changes when the score is replaced.
  function voicesFor(score: ScoreDocument | null): Map<string, Voice> {
    if (voicesRef.current.score !== score) {
      voicesRef.current = { score, map: new Map((score?.voices ?? []).map((v) => [v.id, v])) }
    }
    return voicesRef.current.map
  }

  // Cached by (w, h, first, last) so the draw loop does not allocate 88
  // KeyRects, an array, and an 88-entry Map 60x/sec for a layout that only
  // changes on resize or a zoom switch -- the same rule that keeps voicesFor()
  // out of this hot path.
  function layoutFor(w: number, h: number, first: number, last: number): KeyboardLayout {
    const cached = layoutRef.current
    if (!cached || cached.w !== w || cached.h !== h || cached.first !== first || cached.last !== last) {
      const layout = computeLayout(w, h, { firstPitch: first, lastPitch: last })
      layoutRef.current = { w, h, first, last, layout }
      return layout
    }
    return cached.layout
  }

  // Cached for the same reason voicesFor and layoutFor are: fitRange scans every
  // note in the score, and the range only changes on load or on a zoom switch.
  function rangeFor(score: ScoreDocument | null, zoom: ZoomMode): [number, number] {
    const c = rangeRef.current
    if (c.score === score && c.zoom === zoom) return c.range
    const range: [number, number] =
      zoom === 'fit' && score ? fitRange(score.notes) : [FIRST_PITCH, LAST_PITCH]
    rangeRef.current = { score, zoom, range }
    return range
  }

  // The third cache in the draw path, for the same reason as the other two:
  // getComputedStyle forces a style recalculation and must never run per frame.
  // Keyed on the theme class and the stage-background override -- the only two
  // settings that change what the tokens resolve to -- plus the layout identity
  // (F31), so a resize or zoom switch also re-reads, picking up any token edited
  // in devtools. React commits the class to the DOM before the next rAF, so the
  // first frame after a switch is correct.
  function themeFor(name: ThemeName, override: string | null, layout: KeyboardLayout): Theme {
    const key = `${name}|${override ?? ''}`
    const c = themeRef.current
    if (c.key !== key || c.layout !== layout) {
      themeRef.current = { key, layout, theme: readTheme(stageWrapRef.current) }
    }
    return themeRef.current.theme
  }

  // keyOfScore parses a key string into a fresh object; cache it by the key
  // signature and override so the draw loop neither allocates it per frame nor
  // hands the chord feed a new key identity (which would force a tonal re-detect
  // every frame). Keyed on keySignature, not score: updateVoice replaces the
  // score object but carries the same signature across.
  function keyFor(score: ScoreDocument | null, override: string | null): KeyContext {
    const sig = score?.keySignature ?? null
    const c = keyRef.current
    if (c && c.sig === sig && c.override === override) return c.key
    const key = keyOfScore(score, override)
    keyRef.current = { sig, override, key }
    return key
  }

  // Rebuild the scheduler whenever the note array is REPLACED (load or retime).
  // Keyed on score.notes, not score: updateVoice replaces the score object while
  // keeping the same notes, and rebuilding there would re-seat the cursor behind
  // notes already handed to smplr and sound them twice.
  const notes = t.score?.notes
  useEffect(() => {
    if (!notes) { schedulerRef.current = null; beatsRef.current = null; return }
    const head = playheadAt(useTransport.getState(), engine.currentTime)
    const s = new Scheduler(notes)
    s.seek(head)
    schedulerRef.current = s
    const score = useTransport.getState().score!
    const b = new BeatCursor(beatTimes(score, useTransport.getState().tempo))
    b.seek(head)
    beatsRef.current = b
  }, [notes, engine])

  // The scheduler tick. Runs on a plain interval; audio timing comes from the
  // exact `time` passed to smplr, not from when this fires.
  useEffect(() => {
    const id = setInterval(() => {
      const state = useTransport.getState()
      const s = schedulerRef.current
      if (!state.playing || !s || !state.score) return
      const now = engine.currentTime
      const head = playheadAt(state, now)

      // Playback stop lives here, not in the draw callback -- the render path
      // stays a pure function of t with no side effects beyond its existing
      // throttled setState.
      if (head >= state.score.durationSec) {
        state.pause(state.originSec + state.score.durationSec)
        engine.stopAll()
        metronomeRef.current?.stop()
        return
      }

      for (const sched of s.collect(head)) {
        const voice = state.score.voices.find((v) => v.id === sched.note.voiceId)
        if (voice) engine.play(sched, voice, state.originSec)
      }

      const audio = useSettings.getState().audio
      if (audio.metronome && beatsRef.current) {
        if (!metronomeRef.current) {
          metronomeRef.current = new MetronomeVoice(engine.audioContext, engine.masterNode)
        }
        for (const beat of beatsRef.current.collect(head)) {
          metronomeRef.current.click(state.originSec + beat.sec, beat.accent, audio.metronomeVolume)
        }
      } else {
        // Keep the cursor level with the playhead while the click is off, so
        // switching it on mid-piece does not fire every beat since the start.
        beatsRef.current?.seek(head)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [engine])

  const canvasRef = useCanvasStage(
    useCallback((ctx, w, h) => {
      const state = useTransport.getState()
      const now = engine.currentTime
      const head = playheadAt(state, now)

      // Throttle the React playhead to 10Hz. The canvas reads the clock every
      // frame regardless; only the transport bar's readout updates less often.
      // Calling setState 60x/sec re-renders the tree against a canvas that is
      // already animating itself, for a mm:ss display nobody can read that fast.
      const tenth = Math.round(head * 10)
      if (tenth !== lastTenthRef.current) { lastTenthRef.current = tenth; setPlayhead(head) }

      const st = useSettings.getState()
      const [first, last] = rangeFor(state.score, st.display.zoom)
      const layout = layoutFor(w, h, first, last)
      const rs: RenderState = {
        notes: state.score?.notes ?? [],
        voices: voicesFor(state.score),
        layout,
        velocity: st.velocity,
        fallSeconds: state.fallSeconds,
        maxNoteDur: state.maxNoteDur,
        showRoll: state.mode === 'roll',
        showGrid: state.mode === 'roll' && st.display.showGrid,
        showFlash: st.display.showFlash,
        flashScale: st.display.flashScale,
        showMiddleC: st.display.showMiddleC,
        theme: themeFor(st.theme.name, st.theme.stageBgOverride, layout),
      }
      const held = drawStage(ctx, rs, head, state.score ? head / state.score.durationSec : 0)

      // The overlay is DOM, so it must not re-render per frame. Push only when
      // the sounding set or the layout actually changes -- the same discipline
      // as the 10Hz playhead readout. samePitches allocates nothing; the new
      // array is built only on an actual change (F38). While labels are off the
      // held set is not tracked (nothing shows it): the pitches are emptied once
      // and then left alone, so a note change costs no App re-render. The layout
      // is still tracked, because the chord readout places itself from it.
      // Switching labels back on finds the empty set differs and pushes once.
      const shown = stageTextRef.current
      const labelsOn = st.text.labels !== 'off'
      const pitchesStale = labelsOn ? !samePitches(held, shown.pitches) : shown.pitches !== NO_PITCHES
      if (layout !== shown.layout || pitchesStale) {
        const next = {
          layout,
          pitches: labelsOn ? [...held.keys()].sort((a, b) => a - b) : NO_PITCHES,
        }
        stageTextRef.current = next
        setStageText(next)
      }

      // Chord readout (F41): the feed runs every frame while the readout is on,
      // so a held block chord gets the frames its hysteresis needs to confirm.
      // React hears about it only when the committed reading (or the key its
      // numeral is relative to) changes. Nothing runs, and no state is pushed,
      // while the readout is off.
      if (st.text.chord === 'off') {
        if (lastReadingRef.current !== undefined) {
          lastReadingRef.current = undefined
          chordFeed.reset()
          setChord(null)
        }
      } else {
        const key = keyFor(state.score, st.text.keyOverride)
        const reading = chordFeed.update(
          state.score?.notes ?? [], head, st.text.chordWindowMs / 1000, state.maxNoteDur,
          key, performance.now(),
        )
        if (reading !== lastReadingRef.current || key !== lastReadingKeyRef.current) {
          lastReadingRef.current = reading
          lastReadingKeyRef.current = key
          setChord(reading
            ? {
                // Display spelling for the readout; the numeral needs tonal's raw symbol.
                symbol: displayChordSymbol(reading.symbol),
                alternates: reading.alternates.map(displayChordSymbol),
                numeral: toRomanNumeral(reading.symbol, key),
              }
            : null)
        }
      }
    }, [engine, chordFeed]),
  )

  const loadFile = useCallback(async (file: File) => {
    let score
    try {
      const bytes = await file.arrayBuffer()
      score = parseMidi(bytes, file.name, useTransport.getState().tempo)
      score.id = await hashFile(bytes)
      if (score.notes.length === 0) { setError(`${file.name} contains no notes.`); return }
    } catch (e) {
      setError(`Could not read ${file.name}: ${(e as Error).message}`)
      return
    }

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
    }

    useTransport.getState().loadScore(score)
    chordFeed.reset()
    if (saved) {
      useTransport.getState().setMode(saved.display.mode)
      useTransport.getState().setFallSeconds(saved.display.fallSeconds)
    }

    try {
      await engine.resume()
      engine.setMasterVolume(useSettings.getState().audio.masterVolume)
      await Promise.all(score.voices.map((v) => engine.loadVoice(v)))
      if (loadTokenRef.current === token) engine.retainVoices(score.voices.map((v) => v.id))
    } catch (e) {
      // The score is loaded and visible; only sound is affected.
      setError(`${file.name} is loaded, but audio could not start: ${(e as Error).message}`)
    }
  }, [engine, chordFeed])

  const toggle = useCallback(async () => {
    await engine.resume()
    const state = useTransport.getState()
    const now = engine.currentTime
    if (state.playing) { state.pause(now); engine.stopAll(); metronomeRef.current?.stop() }
    else {
      state.play(now)
      schedulerRef.current?.seek(playheadAt(useTransport.getState(), now))
      beatsRef.current?.seek(playheadAt(useTransport.getState(), now))
    }
  }, [engine])

  const seek = useCallback((sec: number) => {
    const now = engine.currentTime
    useTransport.getState().seek(sec, now)
    schedulerRef.current?.seek(playheadAt(useTransport.getState(), now))
    beatsRef.current?.seek(playheadAt(useTransport.getState(), now))
    engine.stopAll()
    metronomeRef.current?.stop()
    chordFeed.reset()
  }, [engine, chordFeed])

  // setTempo replaces score.notes, so the score-identity effect above rebuilds
  // and re-seats the scheduler on its own. What it CANNOT undo is the notes
  // already handed to smplr at their old times -- those keep sounding across
  // the change unless we cancel them here, exactly as seek and pause do.
  // A setting equal to the current one is a no-op: retiming to it would change
  // nothing but still cut every sustained note.
  const changeTempo = useCallback((setting: TempoSetting) => {
    if (sameTempo(setting, useTransport.getState().tempo)) return
    const now = engine.currentTime
    useTransport.getState().setTempo(setting, now)
    engine.stopAll()
    metronomeRef.current?.stop()
  }, [engine])

  // Volume and instrument have audio-side effects; colour, label and visibility
  // are model-only and the draw loop picks them up on the next frame.
  const changeVoice = useCallback((id: string, patch: Partial<Voice>) => {
    useTransport.getState().updateVoice(id, patch)
    if (patch.volume !== undefined) engine.setVoiceVolume(id, patch.volume)
    if (patch.instrument !== undefined) {
      const v = useTransport.getState().score?.voices.find((x) => x.id === id)
      if (v) void engine.loadVoice(v)
    }
  }, [engine])

  const loadAnother = useCallback(() => {
    // Stop and pause before clearing the model, or the previous file keeps
    // sounding after the drop zone reappears.
    const state = useTransport.getState()
    if (state.playing) state.pause(engine.currentTime)
    engine.stopAll()
    metronomeRef.current?.stop()
    state.clearScore()
    // Silence holds the last chord, so a cleared score would keep showing it.
    chordFeed.reset()
    loadTokenRef.current++ // invalidate any in-flight loadFile's retainVoices
    engine.retainVoices([])
  }, [engine, chordFeed])

  // The canvas has alpha, but the page behind it does not. Without this the host
  // page paints its own ground and an OBS browser source composites only black.
  useEffect(() => {
    const transparent = settings.theme.name === 'transparent' && settings.theme.stageBgOverride === null
    document.documentElement.classList.toggle('tmi-transparent', transparent)
    return () => document.documentElement.classList.remove('tmi-transparent')
  }, [settings.theme.name, settings.theme.stageBgOverride])

  // Globals follow the user, not the song: restore them once at startup.
  useEffect(() => {
    const g = loadGlobals()
    if (!g) return
    useSettings.getState().setVelocity(g.velocity)
    useSettings.getState().setAudio(g.audio)
    engine.setMasterVolume(g.audio.masterVolume)
  }, [engine])

  // Autosave, debounced so a slider drag writes once rather than sixty times.
  useEffect(() => {
    const id = setTimeout(() => {
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
    }, 400)
    return () => clearTimeout(id)
  }, [t.score, t.tempo, t.mode, t.fallSeconds, settings])

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
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const importProfile = useCallback(async (file: File, applyGlobals: boolean) => {
    let p
    try {
      p = decodeProfile(await file.text())
    } catch (e) {
      // Refused outright -- current settings are untouched.
      setProfileError((e as Error).message)
      return
    }
    // Compute everything derived from the file BEFORE the first mutation, so a
    // failure here leaves the app exactly as it was.
    const tr = useTransport.getState()
    let next, voices
    try {
      next = {
        ...currentSettings(), theme: p.theme, text: p.text,
        ...(p.display.settings ? { display: p.display.settings } : {}),
        ...(applyGlobals ? { velocity: p.global.velocity, audio: p.global.audio } : {}),
      }
      voices = tr.score ? mergeVoices(tr.score.voices, p.voices) : null
    } catch (e) {
      setProfileError(`Could not import profile: ${(e as Error).message}`)
      return
    }
    try {
      useSettings.getState().replaceAll(next)
      if (applyGlobals) engine.setMasterVolume(p.global.audio.masterVolume)
      if (tr.score && voices) {
        useTransport.setState({ score: { ...tr.score, voices } })
        for (const v of voices) { engine.setVoiceVolume(v.id, v.volume); void engine.loadVoice(v) }
        changeTempo(p.tempo)
        tr.setMode(p.display.mode)
        tr.setFallSeconds(p.display.fallSeconds)
      }
      setProfileError(null)
    } catch (e) {
      setProfileError(`Profile was only partly applied: ${(e as Error).message}`)
    }
  }, [engine, changeTempo])

  // Reset reaches the engine too, or the master gain stays at the old level.
  const resetSettings = useCallback(() => {
    useSettings.getState().reset()
    engine.setMasterVolume(DEFAULT_SETTINGS.audio.masterVolume)
  }, [engine])

  // Memoised: keyOfScore builds a fresh object, and StageText would otherwise
  // receive a new keyContext on every App render.
  const keyContext = useMemo(
    () => keyOfScore(t.score, settings.text.keyOverride),
    [t.score, settings.text.keyOverride],
  )

  const effectiveBpm = t.score ? effectiveBpmAt(t.score.tempoMap, playhead, t.tempo) : 120

  // Master volume has an audio-side effect (the engine's gain node) as well as
  // a persisted setting, so it goes through its own callback rather than a
  // direct settings.setAudio call, mirroring changeVoice's split above.
  const changeMasterVolume = useCallback((v: number) => {
    useSettings.getState().setAudio({ masterVolume: v })
    engine.setMasterVolume(v)
  }, [engine])

  return (
    <div className="app-shell flex h-full flex-col bg-[var(--ground)]">
      {/* No Tailwind background here: the canvas paints the stage itself, and a
          background behind a transparent canvas would defeat spec §13.1. */}
      <div
        ref={stageWrapRef}
        className={`stage-wrap theme-${settings.theme.name} relative min-h-0 flex-1`}
        style={settings.theme.stageBgOverride
          ? ({ '--tmi-stage-bg': settings.theme.stageBgOverride } as CSSProperties)
          : undefined}
      >
        <canvas ref={canvasRef} className="stage-canvas block h-full w-full" />
        <StageText
          layout={stageText.layout}
          pitches={stageText.pitches}
          text={settings.text}
          keyContext={keyContext}
        />
        <ChordReadout layout={stageText.layout} value={chord} text={settings.text} />
        {!t.score && (
          <div className="stage-empty absolute inset-0 flex items-center justify-center p-4">
            <FileDropZone onFile={loadFile} />
          </div>
        )}
        {error && (
          <p className="stage-error absolute left-4 top-4 rounded bg-black/70 px-3 py-2 text-sm text-[#ff6b6b]">
            {error}
          </p>
        )}
      </div>

      {t.score && (
        <TransportBar
          playing={t.playing}
          playhead={playhead}
          duration={t.score.durationSec}
          mode={t.mode}
          name={t.score.name}
          effectiveBpm={effectiveBpm}
          onToggle={toggle}
          onSeek={seek}
          onMode={t.setMode}
          onLoadAnother={loadAnother}
          settings={
            <>
              <button
                type="button"
                aria-label="Settings"
                aria-expanded={settingsOpen}
                className="btn-settings rounded-md border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink-dim)]"
                onClick={() => setSettingsOpen((v) => !v)}
              >
                Settings
              </button>
              <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <SettingsSection id="tempo" title="Tempo" defaultOpen>
                  <TempoControl tempo={t.tempo} effectiveBpm={effectiveBpm} onChange={changeTempo} />
                </SettingsSection>
                <SettingsSection id="voices" title="Voices">
                  <VoicePanel voices={t.score?.voices ?? []} onChange={changeVoice} />
                </SettingsSection>
                <SettingsSection id="velocity" title="Velocity colour">
                  <VelocityEditor scheme={settings.velocity} onChange={settings.setVelocity} />
                </SettingsSection>
                <SettingsSection id="display" title="Display">
                  <DisplaySettings
                    display={settings.display}
                    fallSeconds={t.fallSeconds}
                    onDisplay={settings.setDisplay}
                    onFallSeconds={t.setFallSeconds}
                  />
                </SettingsSection>
                <SettingsSection id="theme" title="Theme &amp; compositing">
                  <ThemeSettings theme={settings.theme} onChange={settings.setTheme} />
                </SettingsSection>
                <SettingsSection id="text" title="On-stage text">
                  <TextSettings
                    text={settings.text}
                    onChange={settings.setText}
                    onStyle={settings.setTextStyle}
                  />
                </SettingsSection>
                <SettingsSection id="audio" title="Audio">
                  <SettingsRow label="Master volume" htmlFor="master-volume">
                    <input
                      id="master-volume" type="range" aria-label="Master volume"
                      className="master-volume-slider h-1 w-32 accent-[var(--accent)]"
                      min={0} max={1} step={0.01} value={settings.audio.masterVolume}
                      onChange={(e) => changeMasterVolume(Number(e.target.value))}
                    />
                  </SettingsRow>
                  <SettingsRow label="Metronome">
                    <input
                      type="checkbox" aria-label="Metronome"
                      className="metronome-toggle accent-[var(--accent)]"
                      checked={settings.audio.metronome}
                      onChange={(e) => settings.setAudio({ metronome: e.target.checked })}
                    />
                  </SettingsRow>
                  <SettingsRow label="Metronome volume" htmlFor="metronome-volume">
                    <input
                      id="metronome-volume" type="range" aria-label="Metronome volume"
                      className="metronome-volume-slider h-1 w-32 accent-[var(--accent)]"
                      min={0} max={1} step={0.01} value={settings.audio.metronomeVolume}
                      disabled={!settings.audio.metronome}
                      onChange={(e) => settings.setAudio({ metronomeVolume: Number(e.target.value) })}
                    />
                  </SettingsRow>
                </SettingsSection>
                <SettingsSection id="profile" title="Profile">
                  <ProfileSettings
                    onExport={exportProfile}
                    onImport={(f, g) => void importProfile(f, g)}
                    onReset={resetSettings}
                    error={profileError}
                  />
                </SettingsSection>
              </SettingsPanel>
            </>
          }
        />
      )}
    </div>
  )
}
