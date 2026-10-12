import { useEffect, useRef, useState } from 'react'
import { countInBeatAt } from '../model/countIn'
import type { LeadIn } from '../model/countIn'

/** Why playback is waiting at the top of the count-in, if it is. */
export type StartGate = 'sound' | 'loading' | null

/**
 * The one-bar count-in over the stage (user request 2026-09-26): "1 2 3 4"
 * popping in on each lead-in beat, plus the start gate -- "Tap to start sound"
 * while the AudioContext is still suspended, "Loading sounds" while the
 * instruments load -- so the lead-in never runs silent.
 *
 * It runs its own rAF loop rather than riding the canvas draw loop: the loop
 * does one countInBeatAt() per frame (arithmetic only, no allocation), tells
 * React only when the count changes (N times per start), and stops itself as
 * soon as the playhead reaches 0. The pop is a CSS animation, restarted by
 * keying the number on the beat.
 */
export function CountIn(props: {
  /** The transport is playing. */
  active: boolean
  /** The Count-in setting. The lead-in bar plays either way; this is the numbers. */
  enabled: boolean
  lead: LeadIn
  /** The live playhead (negative during the lead-in). Must be a stable function. */
  head: () => number
  gate: StartGate
  onTapToStart: () => void
  /** Height of the keyboard strip; the count centres over the falling notes above it. */
  keyboardH?: number
}) {
  const { active, enabled, lead, head, gate, onTapToStart, keyboardH = 0 } = props
  const [beat, setBeat] = useState(0)
  const tapRef = useRef<HTMLButtonElement | null>(null)

  // The gate is the only thing to do next, so keyboard and screen-reader
  // users land on it.
  useEffect(() => { if (gate === 'sound') tapRef.current?.focus() }, [gate])

  useEffect(() => {
    if (!active || !enabled || lead.beats === 0) return
    let raf = 0
    let last = -1
    const frame = () => {
      const h = head()
      const b = countInBeatAt(h, lead)
      if (b !== last) { last = b; setBeat(b) }
      if (h < 0) raf = requestAnimationFrame(frame)
    }
    frame()
    return () => { cancelAnimationFrame(raf); setBeat(0) }
  }, [active, enabled, lead, head])

  const shown = active && enabled ? beat : 0

  return (
    <div
      className="count-in-layer pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center"
      style={{ bottom: keyboardH }}
    >
      <p aria-live="polite" className="count-in-live m-0 flex items-center justify-center">
        {shown > 0 && (
          <span
            key={shown}
            className="count-in-number block select-none text-[min(28vw,28vh)] leading-none"
            style={{ animationDuration: `${lead.beatSec}s` }}
          >
            {shown}
          </span>
        )}
      </p>
      {gate === 'sound' && (
        <button
          ref={tapRef}
          type="button"
          className="btn-tap-to-start pointer-events-auto absolute rounded-full bg-[var(--accent)] px-6 py-3 text-base font-semibold text-black shadow-2xl"
          onClick={onTapToStart}
        >
          Tap to start sound
        </button>
      )}
      {gate === 'loading' && (
        <p role="status" className="count-in-loading absolute m-0 rounded bg-black/70 px-4 py-2 text-sm text-[var(--ink)]">
          Loading sounds…
        </p>
      )}
    </div>
  )
}
