import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from './audio/engine'
import { Scheduler, TICK_MS } from './audio/scheduler'
import { parseMidi } from './io/parseMidi'
import { hashFile } from './io/hashFile'
import { computeLayout } from './render/geometry'
import { drawStage } from './render/pianoRoll'
import { useCanvasStage } from './render/useCanvasStage'
import { effectiveBpmAt } from './model/tempoMap'
import { playheadAt, useTransport } from './transport/useTransport'
import { useSettings } from './settings/useSettings'
import { FileDropZone } from './ui/FileDropZone'
import { SettingsPanel, SettingsSection } from './ui/SettingsPanel'
import { TempoControl } from './ui/TempoControl'
import { TransportBar } from './ui/TransportBar'
import { VelocityEditor } from './ui/VelocityEditor'
import { VoicePanel } from './ui/VoicePanel'
import type { RenderState } from './render/pianoRoll'
import type { KeyboardLayout } from './render/geometry'
import type { ScoreDocument, TempoSetting, Voice } from './model/types'

export default function App() {
  const t = useTransport()
  const settings = useSettings()
  const engineRef = useRef<AudioEngine | null>(null)
  const schedulerRef = useRef<Scheduler | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const lastTenthRef = useRef(-1)
  const voicesRef = useRef<{ score: ScoreDocument | null; map: Map<string, Voice> }>({
    score: null, map: new Map(),
  })
  const layoutRef = useRef<{ w: number; h: number; layout: KeyboardLayout } | null>(null)
  // Bumped on every loadFile/loadAnother so a slow, now-superseded load can't
  // prune the CURRENT score's voice buses out from under it once it finally
  // resolves (voice ids like 'hand-left'/'hand-right' repeat across files).
  const loadTokenRef = useRef(0)

  if (!engineRef.current) engineRef.current = new AudioEngine()
  const engine = engineRef.current

  // Cached by score identity so the draw loop does not allocate a fresh Map
  // 60x/sec for data that only changes when the score is replaced.
  function voicesFor(score: ScoreDocument | null): Map<string, Voice> {
    if (voicesRef.current.score !== score) {
      voicesRef.current = { score, map: new Map((score?.voices ?? []).map((v) => [v.id, v])) }
    }
    return voicesRef.current.map
  }

  // Cached by (w, h) so the draw loop does not allocate 88 KeyRects, an
  // array, and an 88-entry Map 60x/sec for a layout that only changes on
  // resize -- the same rule that keeps voicesFor() out of this hot path.
  function layoutFor(w: number, h: number): KeyboardLayout {
    const cached = layoutRef.current
    if (!cached || cached.w !== w || cached.h !== h) {
      const layout = computeLayout(w, h)
      layoutRef.current = { w, h, layout }
      return layout
    }
    return cached.layout
  }

  // Rebuild the scheduler whenever the note array is REPLACED (load or retime).
  // Keyed on score.notes, not score: updateVoice replaces the score object while
  // keeping the same notes, and rebuilding there would re-seat the cursor behind
  // notes already handed to smplr and sound them twice.
  const notes = t.score?.notes
  useEffect(() => {
    if (!notes) { schedulerRef.current = null; return }
    const s = new Scheduler(notes)
    s.seek(playheadAt(useTransport.getState(), engine.currentTime))
    schedulerRef.current = s
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
        return
      }

      for (const sched of s.collect(head)) {
        const voice = state.score.voices.find((v) => v.id === sched.note.voiceId)
        if (voice) engine.play(sched, voice, state.originSec)
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

      const layout = layoutFor(w, h)
      const st = useSettings.getState()
      const rs: RenderState = {
        notes: state.score?.notes ?? [],
        voices: voicesFor(state.score),
        layout,
        velocity: st.velocity,
        fallSeconds: state.fallSeconds,
        maxNoteDur: state.maxNoteDur,
        showRoll: state.mode === 'roll',
        showGrid: state.mode === 'roll',
        showFlash: true,
      }
      drawStage(ctx, rs, head, state.score ? head / state.score.durationSec : 0)
    }, [engine]),
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
    useTransport.getState().loadScore(score)

    try {
      await engine.resume()
      await Promise.all(score.voices.map((v) => engine.loadVoice(v)))
      if (loadTokenRef.current === token) engine.retainVoices(score.voices.map((v) => v.id))
    } catch (e) {
      // The score is loaded and visible; only sound is affected.
      setError(`${file.name} is loaded, but audio could not start: ${(e as Error).message}`)
    }
  }, [engine])

  const toggle = useCallback(async () => {
    await engine.resume()
    const state = useTransport.getState()
    const now = engine.currentTime
    if (state.playing) { state.pause(now); engine.stopAll() }
    else {
      state.play(now)
      schedulerRef.current?.seek(playheadAt(useTransport.getState(), now))
    }
  }, [engine])

  const seek = useCallback((sec: number) => {
    const now = engine.currentTime
    useTransport.getState().seek(sec, now)
    schedulerRef.current?.seek(playheadAt(useTransport.getState(), now))
    engine.stopAll()
  }, [engine])

  // setTempo replaces score.notes, so the score-identity effect above rebuilds
  // and re-seats the scheduler on its own. What it CANNOT undo is the notes
  // already handed to smplr at their old times -- those keep sounding across
  // the change unless we cancel them here, exactly as seek and pause do.
  const changeTempo = useCallback((setting: TempoSetting) => {
    const now = engine.currentTime
    useTransport.getState().setTempo(setting, now)
    engine.stopAll()
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
    state.clearScore()
    loadTokenRef.current++ // invalidate any in-flight loadFile's retainVoices
    engine.retainVoices([])
  }, [engine])

  const effectiveBpm = t.score ? effectiveBpmAt(t.score.tempoMap, playhead, t.tempo) : 120

  return (
    <div className="app-shell flex h-full flex-col bg-[var(--ground)]">
      <div className="stage-wrap relative min-h-0 flex-1 bg-[var(--stage)]">
        <canvas ref={canvasRef} className="stage-canvas block h-full w-full" />
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
              </SettingsPanel>
            </>
          }
        />
      )}
    </div>
  )
}
