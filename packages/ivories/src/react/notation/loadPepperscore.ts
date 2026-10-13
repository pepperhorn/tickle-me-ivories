import type { ComponentType, Ref } from 'react'
import type { ExternalClock } from './externalClock'

/** The part of pepperscore 0.2's PepperScoreHandle that <Notation> exposes. */
export interface PepperScoreClockHandle {
  /** With a clock: reports `seconds` through onSeek (the provider clock seeks). */
  seek(seconds: number): void
  /** `clock.now()`: own-tempo score seconds. */
  currentTime(): number
}

/** The pepperscore 0.2 props <Notation> uses (spec §4.3; pepperscore's PepperScoreProps). */
export interface PepperScoreClockProps {
  musicXml?: string
  chrome?: 'full' | 'minimal' | 'none'
  view?: 'vertical' | 'endless'
  /** `"fill"` fills the parent's height; any CSS length fixes it. */
  height?: string
  className?: string
  settings?: { zoom?: number | null }
  audio?: boolean
  clock?: ExternalClock
  onSeek?(seconds: number): void
  onTimeUpdate?(seconds: number): void
  onError?(error: Error): void
  ref?: Ref<PepperScoreClockHandle>
}

export type PepperScoreComponent = ComponentType<PepperScoreClockProps>

let cached: Promise<PepperScoreComponent> | null = null

/** The only place pepperscore is imported (R9): dynamically, so hosts that never
    render notation never need it. A failure is not cached, so a retry can work. */
export function loadPepperscore(): Promise<PepperScoreComponent> {
  // `as string` keeps TypeScript from resolving the optional peer (no ambient
  // types to ship) while the emitted JS stays a literal import('pepperscore')
  // that host bundlers can see.
  if (cached) return cached
  const p = import('pepperscore' as string).then((m: unknown) => {
    const mod = m as { PepperScore?: unknown; default?: unknown }
    const C = mod.PepperScore ?? mod.default
    if (typeof C !== 'function' && (typeof C !== 'object' || C === null)) throw new Error('pepperscore has no PepperScore export')
    return C as PepperScoreComponent
  })
  cached = p
  p.catch(() => { if (cached === p) cached = null })
  return p
}

/** Forget the loaded (or loading) module; for tests. */
export function resetPepperscoreCache(): void { cached = null }
