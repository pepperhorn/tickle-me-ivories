import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AudioClock, AudioEngine, PlaybackDriver } from 'ivories/core'
import { computeLayout, fitRange, FIRST_PITCH, LAST_PITCH } from 'ivories/core'
import { drawStage } from 'ivories/core'
import { DEFAULT_THEME, readTheme } from 'ivories/core'
import { useCanvasStage } from './render/useCanvasStage'
import { effectiveBpmAt } from 'ivories/core'
import { NO_LEAD_IN, leadInFor } from 'ivories/core'
import { keyOfScore } from 'ivories/core'
import { ChordFeed } from 'ivories/core'
import { displayChordSymbol } from 'ivories/core'
import { toRomanNumeral } from 'ivories/core'
import { bindTransportClock, playheadAt, useTransport } from './transport/useTransport'
import { useSettings } from './settings/useSettings'
import { ChordReadout, StageText, samePitches } from 'ivories'
import { CountIn } from './ui/CountIn'
import { FileDropZone } from './ui/FileDropZone'
import { TransportBar } from './ui/TransportBar'
import { SharedPreviewBanner } from './ui/SharedPreviewBanner'
import { SceneFilePrompt } from './ui/SceneFilePrompt'
import { useTransparentPage } from './studio/useTransparentPage'
import { useAutosave } from './studio/useAutosave'
import { useSongLoader } from './studio/useSongLoader'
import { useStartGate } from './studio/useStartGate'
import { usePlaybackActions } from './studio/usePlaybackActions'
import { useProfileActions } from './studio/useProfileActions'
import { useSceneActions } from './studio/useSceneActions'
import { ScenesSection } from './studio/ScenesSection'
import { StudioSettings } from './studio/StudioSettings'
import type { RenderState } from 'ivories/core'
import type { KeyboardLayout } from 'ivories/core'
import type { Theme } from 'ivories/core'
import type { ChordReading } from 'ivories/core'
import type { KeyContext } from 'ivories/core'
import type { ChordDisplayValue } from 'ivories'
import type { ScoreDocument, Voice } from 'ivories/core'
import type { ThemeName, ZoomMode } from 'ivories/core'

/** Shared by identity so the labels-off overlay state never allocates. */
const NO_PITCHES: number[] = []

export default function App() {
  const t = useTransport()
  const settings = useSettings()
  const engineRef = useRef<AudioEngine | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The "Scenes & looks" card on the empty stage (no song loaded, so no
  // TransportBar and no Settings panel to host it).
  const [emptyScenesOpen, setEmptyScenesOpen] = useState(false)
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
  const clockRef = useRef<AudioClock | null>(null)
  if (!clockRef.current) clockRef.current = new AudioClock(engine)
  const clock = clockRef.current
  // Bound in an effect, not during render: StrictMode renders twice.
  useEffect(() => bindTransportClock(clock), [clock])
  // The scheduler and metronome tick (ivories PlaybackDriver). It silences and
  // re-seats on the clock's own seek/rate/pause events, so the callers below
  // only drive the store.
  const driverRef = useRef<PlaybackDriver | null>(null)
  useEffect(() => {
    const d = new PlaybackDriver({
      clock, engine,
      getScore: () => useTransport.getState().score,
      getAudio: () => useSettings.getState().audio,
      audioEnabled: () => true,
    })
    driverRef.current = d
    const s = useTransport.getState()
    d.setScore(s.score, s.tempo)
    d.start()
    return () => { d.dispose(); driverRef.current = null }
  }, [clock, engine])
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

  // Rebuild the cursors whenever the note array is REPLACED (load or retime).
  // Keyed on score.notes, not score: updateVoice replaces the score object while
  // keeping the same notes, and rebuilding there would sound notes twice.
  const notes = t.score?.notes
  useEffect(() => {
    const s = useTransport.getState()
    driverRef.current?.setScore(notes ? s.score : null, s.tempo)
  }, [notes])

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

  useTransparentPage(settings.theme)
  const autosave = useAutosave(engine)
  const loader = useSongLoader({ engine, onScoreReplaced: () => chordFeed.reset() })
  const gate = useStartGate({ engine, voicesReady: loader.voicesReady })
  const actions = usePlaybackActions({ engine, onSeek: () => chordFeed.reset() })

  const { flush: flushAutosave } = autosave
  const { cancelStart } = gate
  const { clearSong } = loader
  const loadAnother = useCallback(() => {
    // Stop and pause before clearing the model, or the previous file keeps
    // sounding after the drop zone reappears.
    const state = useTransport.getState()
    if (state.playing) state.pause(engine.currentTime)
    driverRef.current?.silence()
    // The debounced autosave is keyed on this score; flush it before
    // clearScore() or an edit made in the last 400ms is lost.
    flushAutosave()
    cancelStart()
    clearSong()
  }, [engine, flushAutosave, cancelStart, clearSong])

  const profile = useProfileActions({ engine, changeTempo: actions.changeTempo })
  const sceneApi = useSceneActions({ applyProfileParts: profile.applyProfileParts, loadFile: loader.loadFile, loadAnother })
  const { platform, scenes, buildScene, buildLook } = sceneApi

  // Memoised: keyOfScore builds a fresh object, and StageText would otherwise
  // receive a new keyContext on every App render.
  const keyContext = useMemo(
    () => keyOfScore(t.score, settings.text.keyOverride),
    [t.score, settings.text.keyOverride],
  )

  const effectiveBpm = t.score ? effectiveBpmAt(t.score.tempoMap, playhead, t.tempo) : 120

  // The lead-in for the overlay. Keyed on what it reads, not the score object
  // (updateVoice replaces that), so CountIn's loop is not restarted by a
  // colour change.
  const tempoMap = t.score?.tempoMap
  const timeSignatures = t.score?.timeSignatures
  const lead = useMemo(() => {
    const s = useTransport.getState().score
    return s && tempoMap && timeSignatures ? leadInFor(s, t.tempo) : NO_LEAD_IN
  }, [tempoMap, timeSignatures, t.tempo])

  // One instance of the panel pair, hosted by the Settings panel with a song
  // loaded and by the empty-stage card without one.
  const scenesSection = (
    <ScenesSection
      platform={platform}
      scenes={scenes}
      canSave={t.score !== null}
      defaultName={t.score?.name.replace(/\.[^.]+$/, '') || 'Untitled'}
      buildScene={buildScene}
      buildLook={buildLook}
    />
  )

  return (
    <div className="app-shell flex h-full flex-col bg-[var(--ground)]">
      {/* No Tailwind background here: the canvas paints the stage itself, and a
          background behind a transparent canvas would defeat spec §13.1. */}
      <div
        ref={stageWrapRef}
        className={`stage-wrap ivories ivories-theme-${settings.theme.name} relative min-h-0 flex-1`}
        // Any stage interaction unlocks audio (pointerup, not only pointerdown:
        // on touch screens only the former counts as user activation).
        onPointerDown={loader.unlockAudio}
        onPointerUp={loader.unlockAudio}
        style={settings.theme.stageBgOverride
          ? ({ '--ivories-stage-bg': settings.theme.stageBgOverride } as CSSProperties)
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
        {t.score && (
          <CountIn
            active={t.playing}
            enabled={settings.audio.countIn !== false}
            lead={lead}
            head={actions.liveHead}
            gate={gate.startGate}
            onTapToStart={gate.requestStart}
            keyboardH={stageText.layout?.keyboardH ?? 0}
          />
        )}
        {!t.score && (
          <div className="stage-empty absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto p-4">
            {/* While a scene waits for its song (§8.3), a file dropped here is
                checked against the scene's hash rather than loaded blind. */}
            <FileDropZone
              onFile={scenes.pending ? scenes.provideFile : (f) => void loader.loadFile(f)}
              onPick={loader.unlockAudio}
            />
            <button
              type="button"
              aria-expanded={emptyScenesOpen}
              className="btn-open-scenes rounded-md border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink-dim)]"
              onClick={() => setEmptyScenesOpen((v) => !v)}
            >
              Scenes &amp; looks
            </button>
            {emptyScenesOpen && (
              <div
                role="region"
                aria-label="Scenes and looks"
                className="scenes-empty-card flex w-80 max-w-full flex-col gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4"
              >
                {scenesSection}
              </div>
            )}
          </div>
        )}
        {scenes.pending ? (
          <SceneFilePrompt
            songName={scenes.pendingSongName}
            mismatch={scenes.pending.mismatch?.name ?? null}
            busy={scenes.busy}
            onFile={scenes.provideFile}
            onPick={loader.unlockAudio}
            onUseAnyway={scenes.acceptMismatch}
            onCancel={scenes.cancelPending}
          />
        ) : (
          <SharedPreviewBanner
            preview={scenes.preview}
            error={scenes.shareError}
            busy={scenes.busy}
            onApply={scenes.applyPreview}
            onSaveCopy={() => void scenes.saveCopy()}
            onDismiss={scenes.dismissPreview}
          />
        )}
        {scenes.message && (
          <p
            role="alert"
            className="scenes-message absolute bottom-4 left-1/2 z-20 flex max-w-[90%] -translate-x-1/2 items-center gap-2 rounded bg-black/70 px-3 py-2 text-sm text-[#ff6b6b]"
          >
            <span className="scenes-message-text">{scenes.message}</span>
            <button
              type="button"
              aria-label="Dismiss message"
              className="btn-dismiss-scenes-message text-xs text-[var(--ink-dim)]"
              onClick={scenes.clearMessage}
            >
              ×
            </button>
          </p>
        )}
        {loader.error && (
          <p className="stage-error absolute left-4 top-4 rounded bg-black/70 px-3 py-2 text-sm text-[#ff6b6b]">
            {loader.error}
          </p>
        )}
      </div>

      {t.score && (
        <TransportBar
          playing={t.playing}
          playhead={Math.max(0, playhead)}
          duration={t.score.durationSec}
          mode={t.mode}
          name={t.score.name}
          effectiveBpm={effectiveBpm}
          onToggle={gate.toggle}
          onSeek={actions.seek}
          onMode={t.setMode}
          onLoadAnother={loadAnother}
          settings={
            <StudioSettings
              open={settingsOpen}
              onToggle={() => setSettingsOpen((v) => !v)}
              onClose={() => setSettingsOpen(false)}
              effectiveBpm={effectiveBpm}
              actions={actions}
              profile={profile}
              scenesSection={scenesSection}
            />
          }
        />
      )}
    </div>
  )
}