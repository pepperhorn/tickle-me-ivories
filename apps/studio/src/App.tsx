import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AudioClock, AudioEngine } from 'ivories/core'
import { effectiveBpmAt } from 'ivories/core'
import { singleLayout } from 'ivories/core'
import { NO_LEAD_IN, leadInFor } from 'ivories/core'
import { sceneForShare } from 'ivories/core'
import { bindTransportClock, useTransport } from './transport/useTransport'
import { useSettings } from './settings/useSettings'
import { IvoriesProvider, Stage } from 'ivories'
import { AccountMenu } from './ui/AccountMenu'
import type { KeyboardLayout, StageSlotViewProps } from 'ivories'
import type { SlotName } from 'ivories/core'
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
import { useLiveMidi } from './studio/liveMidi'
import { RecordControl } from './studio/RecordControl'
import { useStudioStage } from './studio/stageStore'
import { primaryOrientation, primarySlot, withPrimaryMode } from './studio/modeSync'
import { LayoutToolbar } from './studio/LayoutToolbar'
import { LiveSessionBar } from './studio/LiveSessionBar'

export default function App() {
  const t = useTransport()
  const settings = useSettings()
  const engineRef = useRef<AudioEngine | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The "Scenes & looks" card on the empty stage (no song loaded, so no
  // TransportBar and no Settings panel to host it).
  const [emptyScenesOpen, setEmptyScenesOpen] = useState(false)
  // The keyboard geometry the stage view reports (resize, zoom), for CountIn.
  const [kbLayout, setKbLayout] = useState<KeyboardLayout | null>(null)

  if (!engineRef.current) engineRef.current = new AudioEngine()
  const engine = engineRef.current
  const clockRef = useRef<AudioClock | null>(null)
  if (!clockRef.current) clockRef.current = new AudioClock(engine)
  const clock = clockRef.current
  // Bound in an effect, not during render: StrictMode renders twice.
  useEffect(() => bindTransportClock(clock), [clock])

  useTransparentPage(settings.theme)
  const autosave = useAutosave(engine)
  const liveMidi = useLiveMidi()
  const setLiveMidi = liveMidi.set
  // "Play live" (R-S): no score; the stage shows live input on the provider's live clock.
  const liveSession = !t.score && liveMidi.session
  const setLiveBpm = useCallback((bpm: number) => setLiveMidi({ bpm }), [setLiveMidi])
  // A score arriving (a recorded take, a scene) ends the session, so a later
  // "Load another file" shows the drop zone, not the live view again.
  useEffect(() => { if (t.score && liveMidi.session) setLiveMidi({ session: false }) }, [t.score, liveMidi.session, setLiveMidi])
  const loader = useSongLoader({ engine, onScoreReplaced: () => {} })   // the stage view resets its chord on a new score
  const gate = useStartGate({ engine, voicesReady: loader.voicesReady })
  const actions = usePlaybackActions({ engine, onSeek: () => {} })      // ... and on the clock's seek event
  // Exactly the settings the stage views read, memoised so the provider's
  // resolved settings (and the views' label/theme caches) keep their identity.
  const providerSettings = useMemo(
    () => ({ theme: settings.theme, display: settings.display, velocity: settings.velocity, text: settings.text, audio: settings.audio }),
    [settings.theme, settings.display, settings.velocity, settings.text, settings.audio],
  )

  const midiInput = liveMidi.enabled ? 'midi' : 'none'
  const stage = useStudioStage()
  // Keep the primary keys slot in step with the display mode, whatever changed
  // it: the TransportBar toggle, a profile, a look or a scene (R7).
  useEffect(() => {
    const s = useStudioStage.getState()
    const next = withPrimaryMode(s.layout, t.mode)
    if (next !== s.layout) s.setLayout(next)
  }, [t.mode])
  const viewProps = useMemo<StageSlotViewProps>(() => ({ input: midiInput }), [midiInput])
  // Only the primary keys slot reports geometry to CountIn; with none, it has none.
  const primary = primarySlot(stage.layout)
  const orientation = primaryOrientation(stage.layout)
  const slotViewProps = useMemo<Partial<Record<SlotName, StageSlotViewProps>>>(
    () => (primary ? { [primary]: { onLayout: setKbLayout } } : {}),
    [primary],
  )
  useEffect(() => { if (!primary) setKbLayout(null) }, [primary])
  // The count-in belongs over the keys it counts into: it renders inside the
  // primary keys slot, so a split or PIP layout keeps it in that slot's box.
  const stageWrapRef = useRef<HTMLDivElement | null>(null)
  const [countInHost, setCountInHost] = useState<HTMLElement | null>(null)
  const hasScore = t.score !== null
  useLayoutEffect(() => {
    const el = primary && hasScore ? stageWrapRef.current?.querySelector<HTMLElement>(`.ivories-slot-${primary}`) ?? null : null
    setCountInHost(el)
  }, [primary, stage.layout, hasScore])
  const onProviderError = useCallback((e: { code: string; message: string }) => {
    if (e.code !== 'midi-unavailable') return
    setLiveMidi({ error: 'MIDI unavailable in this browser' })
  }, [setLiveMidi])

  const { flush: flushAutosave } = autosave
  const { cancelStart } = gate
  const { clearSong, unlockAudio } = loader
  const loadAnother = useCallback(() => {
    // Stop and pause before clearing the model, or the previous file keeps
    // sounding after the drop zone reappears.
    const state = useTransport.getState()
    if (state.playing) state.pause(engine.currentTime)
    // The provider's driver silences on the pause event; this also cuts
    // anything already handed to the instruments while paused.
    engine.stopAll()
    // The debounced autosave is keyed on this score; flush it before
    // clearScore() or an edit made in the last 400ms is lost.
    flushAutosave()
    cancelStart()
    clearSong()
  }, [engine, flushAutosave, cancelStart, clearSong])

  const startLive = useCallback(() => {
    unlockAudio()   // this click is the gesture that lets live keys sound
    setLiveMidi({ enabled: true, session: true, error: null })
    useStudioStage.getState().setLayout(singleLayout('rising'))
  }, [unlockAudio, setLiveMidi])

  const profile = useProfileActions({ engine, changeTempo: actions.changeTempo })
  const sceneApi = useSceneActions({ applyProfileParts: profile.applyProfileParts, loadFile: loader.loadFile, loadAnother })
  const { platform, scenes, buildScene, buildLook } = sceneApi

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
      buildShareScene={() => sceneForShare(buildScene())}
      buildLook={buildLook}
    />
  )

  const countIn = t.score && (
    <CountIn
      active={t.playing}
      enabled={settings.audio.countIn !== false}
      lead={lead}
      head={actions.liveHead}
      gate={gate.startGate}
      onTapToStart={gate.requestStart}
      keyboardH={kbLayout?.keyboardH ?? 0}
      orientation={orientation}
    />
  )

  return (
    <div className="app-shell flex h-full flex-col bg-[var(--ground)]">
      {/* No Tailwind background here: the stage view paints the stage itself
          (theme class and stage-bg override included), and a background behind
          it would defeat spec §13.1. */}
      <div
        ref={stageWrapRef}
        className="stage-wrap relative min-h-0 flex-1"
        // Any stage interaction unlocks audio (pointerup, not only pointerdown:
        // on touch screens only the former counts as user activation).
        onPointerDown={loader.unlockAudio}
        onPointerUp={loader.unlockAudio}
      >
        <IvoriesProvider
          score={t.score}
          // The studio's AudioClock drives the provider only while a score is
          // loaded; with none, the provider's live clock runs (R-S, R-L).
          clock={t.score ? clock : undefined}
          liveClock={liveSession}
          bpm={liveMidi.bpm}
          onBpmChange={setLiveBpm}
          engine={engine}
          tempo={t.tempo}
          settings={providerSettings}
          fallSeconds={t.fallSeconds}
          onTimeUpdate={setPlayhead}
          liveAudio={liveMidi.audio}
          midiDeviceId={liveMidi.deviceId}
          onError={onProviderError}
        >
          <Stage
            className="studio-stage"
            layout={stage.layout}
            aspect={stage.aspect}
            onLayoutChange={stage.setLayout}
            viewProps={viewProps}
            slotViewProps={slotViewProps}
          />
          {liveMidi.enabled && <RecordControl onRecorded={(s) => { loadAnother(); loader.loadDocument(s) }} />}
        </IvoriesProvider>
        <AccountMenu auth={platform.auth} />
        {countInHost && countIn ? createPortal(countIn, countInHost) : countIn}
        {!t.score && !liveSession && (
          <div className="stage-empty absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto p-4">
            {/* While a scene waits for its song (§8.3), a file dropped here is
                checked against the scene's hash rather than loaded blind. */}
            <FileDropZone
              onFile={scenes.pending ? scenes.provideFile : (f) => void loader.loadFile(f)}
              onPick={loader.unlockAudio}
            />
            <button
              type="button"
              className="btn-play-live rounded-md border border-[var(--accent)] px-3 py-1 text-xs text-[var(--ink)]"
              onClick={startLive}
            >
              Play live
            </button>
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

      {(t.score || liveSession) && <LayoutToolbar />}
      {liveSession && <LiveSessionBar onLoadScore={() => setLiveMidi({ session: false })} />}
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