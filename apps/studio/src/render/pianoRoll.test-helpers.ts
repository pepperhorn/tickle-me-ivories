import { computeLayout } from './geometry'
import { DEFAULT_SCHEME } from './colors'
import { DEFAULT_THEME } from './theme'
import type { NoteEvent, Voice } from '../model/types'
import type { RenderState } from './pianoRoll'

/**
 * Records calls so we can assert what was drawn without a real canvas.
 * Extended (F45) to capture the pieces earlier tests could not see:
 * `fillStyle` assignments, `addColorStop` args on any gradient created here,
 * and the text drawn by `fillText` -- a stub that records only call NAMES is
 * exactly what let a wrong fill colour or missing label slip through.
 */
export function stubCtx() {
  const calls: string[] = []
  const fillStyles: string[] = []
  const gradientStops: string[] = []
  const texts: string[] = []

  const rec = (name: string) => (...args: unknown[]) => {
    calls.push(`${name}(${args.length})`)
    if (name === 'fillText' && typeof args[0] === 'string') texts.push(args[0])
  }

  const makeGradient = () => ({
    addColorStop(_offset: number, color: string) { gradientStops.push(color) },
  })

  return {
    calls,
    fillStyles,
    gradientStops,
    texts,
    ctx: new Proxy({} as CanvasRenderingContext2D, {
      get(_t, prop: string) {
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => makeGradient()
        }
        if (prop === 'canvas') return { width: 1000, height: 600 }
        if (typeof prop === 'string' && prop.startsWith('global')) return 'source-over'
        return rec(prop)
      },
      set(_t, prop: string, value) {
        // The original Proxy's set() discarded every assignment, including
        // fillStyle -- so no test could ever see what colour something was
        // actually filled with (F45). Only string assignments are recorded;
        // a CanvasGradient object is asserted on via `gradientStops` instead.
        if (prop === 'fillStyle' && typeof value === 'string') fillStyles.push(value)
        return true
      },
    }),
  }
}

/** One voice (hue 207), full 88-key layout, default theme and scheme. */
export const state = (notes: NoteEvent[]): RenderState => ({
  notes,
  voices: new Map<string, Voice>([['v', {
    id: 'v', label: 'V', hue: 207, instrument: 'acoustic_grand_piano',
    visible: true, audible: true, volume: 1,
  }]]),
  layout: computeLayout(1000, 600),
  velocity: DEFAULT_SCHEME,
  fallSeconds: 3,
  maxNoteDur: 3,
  showRoll: true,
  showGrid: true,
  showFlash: true,
  flashScale: 1,
  showMiddleC: true,
  theme: DEFAULT_THEME,
})
