import { useCallback, useMemo, useRef, useState } from 'react'
import { LOOKAHEAD_SEC, leadInFor } from 'ivories/core'
import type { AudioEngine } from 'ivories/core'
import type { StartGate } from '../ui/CountIn'
import { useTransport } from '../transport/useTransport'
import type { VoicesReady } from './useSongLoader'

/** How long a start waits for resume() to settle before showing "Tap to start sound". */
const START_GATE_GRACE_MS = 150

export function useStartGate(o: { engine: AudioEngine; voicesReady(): VoicesReady }) {
  const { engine, voicesReady } = o
  // Playback start (count-in task). A start waits for audio to be running and
  // for the current file's instruments; startGate says which, on stage.
  // startTokenRef supersedes a waiting start (a second press, a new file).
  const [startGate, setStartGate] = useState<StartGate>(null)
  const startTokenRef = useRef(0)

  /** Starts the transport now. From the top that is one bar early (the lead-in). */
  const beginPlayback = useCallback(() => {
    const state = useTransport.getState()
    if (!state.score || state.playing) return
    const now = engine.currentTime
    const lead = state.pausedAtSec <= 0 ? leadInFor(state.score, state.tempo).sec : 0
    // From the top, the bar begins one scheduler lookahead from now, so the
    // first click is handed to Web Audio ahead of its time (not clamped late
    // by up to a tick), and the "1", which shows when the playhead reaches
    // -lead, appears as it sounds.
    const pad = lead > 0 ? LOOKAHEAD_SEC : 0
    // The driver re-seats its cursors at the exact start on the play event.
    state.play(now, lead + pad)
  }, [engine])

  /**
   * A start never plays silent notes: it waits at the top of the count-in until
   * the AudioContext is running ("Tap to start sound" -- a dropped file is no
   * user activation, so nothing may have unlocked audio yet) and until this
   * file's instruments have loaded ("Loading sounds"). resume() is CALLED
   * synchronously, inside whatever gesture got us here.
   */
  const requestStart = useCallback(() => {
    const token = ++startTokenRef.current
    const resumed = engine.resume()
    resumed.catch(() => { /* handled below: the gate stays up */ })
    void (async () => {
      if (!engine.running) {
        // A resume() inside a real gesture settles within a few ms; give it a
        // short grace before asking for a tap, so the gate never flashes up
        // on a press that has just unlocked audio.
        let grace: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          resumed.catch(() => {}),
          new Promise<void>((r) => { grace = setTimeout(r, START_GATE_GRACE_MS) }),
        ])
        clearTimeout(grace)
        if (token !== startTokenRef.current) return
        if (!engine.running) {
          setStartGate('sound')
          try { await resumed } catch { /* still suspended: the gate stays up */ }
          if (token !== startTokenRef.current) return
          if (!engine.running) return   // a tap on the gate (or Play) calls requestStart again
        }
      }
      const voices = voicesReady()
      if (!voices.done) {
        setStartGate('loading')
        await voices.promise
        if (token !== startTokenRef.current) return
      }
      setStartGate(null)
      beginPlayback()
    })()
  }, [engine, beginPlayback, voicesReady])

  const cancelStart = useCallback(() => {
    startTokenRef.current++
    setStartGate(null)
  }, [])

  const toggle = useCallback(() => {
    const state = useTransport.getState()
    if (state.playing) {
      state.pause(engine.currentTime)
    } else if (startGate === 'loading') {
      cancelStart()   // Play pressed again while the sounds load: stop waiting
    } else {
      // Includes the 'sound' gate: this press is a real gesture, so it is the tap.
      requestStart()
    }
  }, [engine, startGate, cancelStart, requestStart])

  return useMemo(
    () => ({ startGate, requestStart, cancelStart, toggle }),
    [startGate, requestStart, cancelStart, toggle],
  )
}
