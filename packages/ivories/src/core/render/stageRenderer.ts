import { computeLayout, ensureFullBlackKeyGroups, fitRange, FIRST_PITCH, LAST_PITCH } from './geometry'
import { drawStage } from './pianoRoll'
import type { KeyboardLayout } from './geometry'
import type { RenderState } from './pianoRoll'
import type { Theme } from './theme'
import type { NoteEvent, ScoreDocument, Voice } from '../model/types'
import type { Settings, ThemeName, ZoomMode } from '../settings/types'

export interface StageInput {
  score: ScoreDocument | null
  settings: Settings
  fallSeconds: number
  maxNoteDur: number
  showRoll: boolean
  /** Explicit crop (the `range` prop); null follows settings.display.zoom. */
  range: [number, number] | null
}

export interface StageFrame { layout: KeyboardLayout; held: Map<number, NoteEvent> }

/** The `range` prop: 'full', or a [low, high] widened to whole black-key groups (R5). */
export function rangeFromProp(range: 'full' | [number, number] | undefined): [number, number] | null {
  if (range === undefined) return null
  if (range === 'full') return [FIRST_PITCH, LAST_PITCH]
  return ensureFullBlackKeyGroups(Math.min(range[0], range[1]), Math.max(range[0], range[1]))
}

/**
 * The draw path that used to live in App.tsx: identity-keyed caches around the
 * pure drawStage. Nothing here allocates per frame unless an input changed.
 */
export class StageRenderer {
  private voices: { score: ScoreDocument | null; map: Map<string, Voice> } = { score: null, map: new Map() }
  private layoutCache: { w: number; h: number; first: number; last: number; layout: KeyboardLayout } | null = null
  private rangeCache: { score: ScoreDocument | null; zoom: ZoomMode; range: [number, number] } = {
    score: null, zoom: 'full', range: [FIRST_PITCH, LAST_PITCH],
  }
  private themeCache: { key: string; layout: KeyboardLayout | null; theme: Theme | null } = { key: '', layout: null, theme: null }
  private readonly readThemeFrom: () => Theme

  constructor(readThemeFrom: () => Theme) { this.readThemeFrom = readThemeFrom }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, input: StageInput): StageFrame {
    const st = input.settings
    const [first, last] = input.range ?? this.rangeFor(input.score, st.display.zoom)
    // A hidden container reports 0x0; clamp so geometry never divides by zero.
    const layout = this.layoutFor(Math.max(1, w), Math.max(1, h), first, last)
    const rs: RenderState = {
      notes: input.score?.notes ?? [],
      voices: this.voicesFor(input.score),
      layout,
      velocity: st.velocity,
      fallSeconds: input.fallSeconds,
      maxNoteDur: input.maxNoteDur,
      showRoll: input.showRoll,
      showGrid: input.showRoll && st.display.showGrid,
      showFlash: st.display.showFlash,
      flashScale: st.display.flashScale,
      showMiddleC: st.display.showMiddleC,
      theme: this.themeFor(st.theme.name, st.theme.stageBgOverride, layout),
    }
    const dur = input.score?.durationSec ?? 0
    const held = drawStage(ctx, rs, t, dur > 0 ? t / dur : 0)
    return { layout, held }
  }

  // Cached by score identity so the draw loop does not allocate a fresh Map
  // 60x/sec for data that only changes when the score is replaced.
  voicesFor(score: ScoreDocument | null): Map<string, Voice> {
    if (this.voices.score !== score) {
      this.voices = { score, map: new Map((score?.voices ?? []).map((v) => [v.id, v])) }
    }
    return this.voices.map
  }

  // Cached by (w, h, first, last): 88 KeyRects and a Map only on resize or zoom.
  layoutFor(w: number, h: number, first: number, last: number): KeyboardLayout {
    const c = this.layoutCache
    if (!c || c.w !== w || c.h !== h || c.first !== first || c.last !== last) {
      const layout = computeLayout(w, h, { firstPitch: first, lastPitch: last })
      this.layoutCache = { w, h, first, last, layout }
      return layout
    }
    return c.layout
  }

  // fitRange scans every note; the range only changes on load or a zoom switch.
  rangeFor(score: ScoreDocument | null, zoom: ZoomMode): [number, number] {
    const c = this.rangeCache
    if (c.score === score && c.zoom === zoom) return c.range
    const range: [number, number] = zoom === 'fit' && score ? fitRange(score.notes) : [FIRST_PITCH, LAST_PITCH]
    this.rangeCache = { score, zoom, range }
    return range
  }

  // getComputedStyle forces a style recalculation and must never run per frame:
  // keyed on the theme name, the stage-background override and the layout.
  private themeFor(name: ThemeName, override: string | null, layout: KeyboardLayout): Theme {
    const key = `${name}|${override ?? ''}`
    const c = this.themeCache
    if (c.key !== key || c.layout !== layout || !c.theme) {
      this.themeCache = { key, layout, theme: this.readThemeFrom() }
    }
    return this.themeCache.theme!
  }
}
