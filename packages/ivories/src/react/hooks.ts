import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { IvoriesContext } from './context'
import type { ActiveNotes, IvoriesContextValue } from './context'
import type { Clock } from '../core/clock/types'

export function useIvoriesOptional(): IvoriesContextValue | null {
  return useContext(IvoriesContext)
}

/** Score, clock, engine and settings of the nearest provider. */
export function useIvories(): IvoriesContextValue {
  const v = useContext(IvoriesContext)
  if (!v) throw new Error('useIvories() must be used inside <IvoriesProvider> or an ivories component.')
  return v
}

/** Re-renders on clock events (play/pause/seek/rate), never per frame. */
export function useClock(): { clock: Clock; playing: boolean; rate: number } {
  const { clock } = useIvories()
  const subscribe = useCallback((cb: () => void) => clock.subscribe(cb), [clock])
  const key = useSyncExternalStore(subscribe, () => `${clock.playing ? 1 : 0}|${clock.rate}`, () => '0|1')
  const [p, r] = key.split('|')
  return { clock, playing: p === '1', rate: Number(r) }
}

/** The clock time for UI, throttled to `hz` updates per score-second. */
export function useClockTime(hz = 10): number {
  const { clock, frames } = useIvories()
  const [t, setT] = useState(() => clock.now())
  useEffect(() => {
    let last = Number.NaN
    return frames.add((now) => {
      const q = Math.round(now * hz)
      if (q !== last) { last = q; setT(now) }
    })
  }, [frames, hz])
  return t
}

/** Score and live notes sounding now; changes only when a set changes. */
export function useActiveNotes(): ActiveNotes {
  const { active } = useIvories()
  return useSyncExternalStore(active.subscribe, active.get, active.get)
}
