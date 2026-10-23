import { computeLayout, DEFAULT_GEOMETRY, ensureFullBlackKeyGroups, fitRange, FIRST_PITCH, LAST_PITCH } from './geometry'
import { isClassicLook } from '../template/resolve'
import type { ResolvedTemplate } from '../template/resolve'
import { drawStage } from './pianoRoll'
import type { KeyboardLayout } from './geometry'
import type { RenderState } from './pianoRoll'
import type { Theme } from './theme'
import type { NoteEvent, ScoreDocument, TempoSetting, Voice } from '../model/types'
import type { Settings, ThemeName, ZoomMode } from '../settings/types'
import type { LiveNote } from '../midi/types'
import { applyOrientation, canonicalSize } from './orientation'
import type { Orientation } from '../layout/types'
import { drawRisingStage } from './rising'
import { clampVisibleBeats, liveBeatClock, scoreBeatClock } from './beats'
import type { BeatClock } from './beats'
import { sameTempo } from '../model/tempoMap'
import type { TrailNote } from '../midi/trail'

/** What the rising roll needs beyond the falling inputs (R-B, R-T). */
export interface RisingInput {
  /** Live BPM (used only without a score). */
  bpm: number
  /** Live bar length in beats (used only without a score). */
  beatsPerBar: number
  /** The provider's TempoSetting, so a retimed score's beats line up. */
  tempo: TempoSetting
  visibleBeats: number
  trail: readonly TrailNote[]
  grid: boolean
}

export interface StageInput {
  score: ScoreDocument | null
  settings: Settings
  fallSeconds: number
  maxNoteDur: number
  showRoll: boolean
  /** Explicit crop (the `range` prop); null follows settings.display.zoom. */
  range: [number, number] | null
  /** Keys held on a live MIDI input (spec §4.1). */
  live?: ReadonlyMap<number, LiveNote>
  /** 'horizontal' draws the keyboard up the left edge (R-H). Default vertical. */
  orientation?: Orientation
  /** Draw the rising roll instead of the falling one. */
  rising?: RisingInput | null
  /** The note-name label for a roll bar (null: none). Absent: no labels. */
  barLabel?: (n: NoteEvent) => string | null
  /** The resolved style template; absent or the classic look draws exactly as before. */
  template?: ResolvedTemplate
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
  private layoutCache: { w: number; h: number; first: number; last: number; frac: number; layout: KeyboardLayout } | null = null
  private rangeCache: { score: ScoreDocument | null; zoom: ZoomMode; range: [number, number] } = {
    score: null, zoom: 'full', range: [FIRST_PITCH, LAST_PITCH],
  }
  private themeCache: { key: string; layout: KeyboardLayout | null; template: ResolvedTemplate | undefined; theme: Theme | null } = { key: '', layout: null, template: undefined, theme: null }
  private beatCache: { score: ScoreDocument | null; tempo: TempoSetting | null; bpm: number; bpb: number; clock: BeatClock } | null = null
  private readonly readThemeFrom: () => Theme

  constructor(readThemeFrom: () => Theme) { this.readThemeFrom = readThemeFrom }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, input: StageInput): StageFrame {
    const st = input.settings
    const [first, last] = input.range ?? this.rangeFor(input.score, st.display.zoom)
    // A hidden container reports 0x0; clamp so geometry never divides by zero.
    // Horizontal views compute the canonical geometry on the swapped box (R-H).
    const [cw, ch] = canonicalSize(input.orientation, Math.max(1, w), Math.max(1, h))
    // Keyboard-only (roll hidden) lets the keys use the whole stage height.
    const layout = this.layoutFor(cw, ch, first, last, input.showRoll ? DEFAULT_GEOMETRY.maxKeyboardFraction : 1)
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
      theme: this.themeFor(st.theme.name, st.theme.stageBgOverride, layout, input.template),
      live: input.live,
      orientation: input.orientation,
      barLabel: input.barLabel,
      ...(input.template && !isClassicLook(input.template) ? { template: input.template } : {}),
    }
    const dur = input.score?.durationSec ?? 0
    const progress = dur > 0 ? t / dur : 0
    ctx.save()
    try {
      applyOrientation(ctx, input.orientation, layout)
      const r = input.rising
      const held = r
        ? drawRisingStage(ctx, {
            ...rs,
            beats: this.beatClockFor(input.score, r),
            visibleBeats: clampVisibleBeats(r.visibleBeats),
            trail: r.trail,
            showBeatGrid: r.grid,
          }, t, progress)
        : drawStage(ctx, rs, t, progress)
      return { layout, held }
    } finally {
      ctx.restore()
    }
  }

  // Cached by score identity so the draw loop does not allocate a fresh Map
  // 60x/sec for data that only changes when the score is replaced.
  voicesFor(score: ScoreDocument | null): Map<string, Voice> {
    if (this.voices.score !== score) {
      this.voices = { score, map: new Map((score?.voices ?? []).map((v) => [v.id, v])) }
    }
    return this.voices.map
  }

  // Cached by (w, h, first, last, frac): 88 KeyRects and a Map only on resize or zoom.
  layoutFor(w: number, h: number, first: number, last: number,
    frac: number = DEFAULT_GEOMETRY.maxKeyboardFraction): KeyboardLayout {
    const c = this.layoutCache
    if (!c || c.w !== w || c.h !== h || c.first !== first || c.last !== last || c.frac !== frac) {
      const layout = computeLayout(w, h, { firstPitch: first, lastPitch: last, maxKeyboardFraction: frac })
      this.layoutCache = { w, h, first, last, frac, layout }
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

  /** The beat clock: the score's tempo map and metre, or the live BPM (R-B). Cached by identity/value. */
  beatClockFor(score: ScoreDocument | null, r: RisingInput): BeatClock {
    const c = this.beatCache
    if (score) {
      if (c && c.score === score && c.tempo && sameTempo(c.tempo, r.tempo)) return c.clock
      const clock = scoreBeatClock(score, r.tempo)
      this.beatCache = { score, tempo: r.tempo, bpm: 0, bpb: 0, clock }
      return clock
    }
    if (c && c.score === null && c.bpm === r.bpm && c.bpb === r.beatsPerBar) return c.clock
    const clock = liveBeatClock(r.bpm, r.beatsPerBar)
    this.beatCache = { score: null, tempo: null, bpm: r.bpm, bpb: r.beatsPerBar, clock }
    return clock
  }

  // getComputedStyle forces a style recalculation and must never run per frame:
  // keyed on the theme name, the stage-background override, the layout and the template.
  private themeFor(name: ThemeName, override: string | null, layout: KeyboardLayout, template: ResolvedTemplate | undefined): Theme {
    const key = `${name}|${override ?? ''}`
    const c = this.themeCache
    if (c.key !== key || c.layout !== layout || c.template !== template || !c.theme) {
      this.themeCache = { key, layout, template, theme: this.readThemeFrom() }
    }
    return this.themeCache.theme!
  }
}
