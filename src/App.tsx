import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from './audio/engine'
import { Scheduler, TICK_MS } from './audio/scheduler'
import { parseMidi } from './io/parseMidi'
import { hashFile } from './io/hashFile'
import { computeLayout } from './render/geometry'
import { drawStage } from './render/pianoRoll'
import { useCanvasStage } from './render/useCanvasStage'
import { playheadAt, useTransport } from './transport/useTransport'
import { FileDropZone } from './ui/FileDropZone'
import { TransportBar } from './ui/TransportBar'
import type { RenderState } from './render/pianoRoll'

export default function App() {
  const t = useTransport()
  const engineRef = useRef<AudioEngine | null>(null)
  const schedulerRef = useRef<Scheduler | null>(null)
  const [playhead, setPlayhead] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const lastTenthRef = useRef(-1)

  if (!engineRef.current) engineRef.current = new AudioEngine()
  const engine = engineRef.current

  // Rebuild the scheduler whenever the note array is replaced (load or retime).
  useEffect(() => {
    if (!t.score) { schedulerRef.current = null; return }
    const s = new Scheduler(t.score.notes)
    s.seek(playheadAt(useTransport.getState(), engine.currentTime))
    schedulerRef.current = s
  }, [t.score, engine])

  // The scheduler tick. Runs on a plain interval; audio timing comes from the
  // exact `time` passed to smplr, not from when this fires.
  useEffect(() => {
    const id = setInterval(() => {
      const state = useTransport.getState()
      const s = schedulerRef.current
      if (!state.playing || !s || !state.score) return
      const now = engine.currentTime
      const head = playheadAt(state, now)
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

      const layout = computeLayout(w, h)
      const rs: RenderState = {
        notes: state.score?.notes ?? [],
        voices: new Map((state.score?.voices ?? []).map((v) => [v.id, v])),
        layout,
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
    try {
      const bytes = await file.arrayBuffer()
      const score = parseMidi(bytes, file.name, useTransport.getState().tempo)
      score.id = await hashFile(bytes)
      if (score.notes.length === 0) { setError(`${file.name} contains no notes.`); return }
      setError(null)
      useTransport.getState().loadScore(score)
      await engine.resume()
      await Promise.all([...new Set(score.voices.map((v) => v.instrument))]
        .map((i) => engine.loadInstrument(i)))
    } catch (e) {
      setError(`Could not read ${file.name}: ${(e as Error).message}`)
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
    schedulerRef.current?.seek(sec)
    engine.stopAll()
  }, [engine])

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
          onToggle={toggle}
          onSeek={seek}
          onMode={t.setMode}
        />
      )}
    </div>
  )
}
