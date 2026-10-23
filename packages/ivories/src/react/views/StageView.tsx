import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useIvories } from '../hooks'
import { cx } from '../cx'
import { applyLabels } from './labels'
import { StageText, samePitches } from '../text/StageText'
import { ChordReadout } from '../text/ChordReadout'
import { StageRenderer, rangeFromProp } from '../../core/render/stageRenderer'
import { resolveTemplate, resolveBarLabels } from '../../core/template/resolve'
import type { BarLabelStyleInput, TemplateRef } from '../../core/template/types'
import { useCanvasFont } from '../text/useCanvasFont'
import { readTheme } from '../../core/render/theme'
import { viewOrientation } from '../../core/render/orientation'
import { ChordFeed } from '../../core/music/chordFeed'
import { KeyContextCache } from '../../core/music/keyOf'
import { displayChordSymbol } from '../../core/music/chords'
import { toRomanNumeral } from '../../core/music/romanNumerals'
import type { LabelsProp } from './labels'
import type { ChordDisplayValue } from '../text/ChordReadout'
import type { KeyboardLayout } from '../../core/render/geometry'
import type { ChordReading } from '../../core/music/chords'
import type { KeyContext } from '../../core/music/spell'
import type { ThemeName } from '../../core/settings/types'
import { IvoriesError } from '../../core/errors'
import type { Orientation } from '../../core/layout/types'
import { DEFAULT_BEATS_PER_BAR, DEFAULT_VISIBLE_BEATS } from '../../core/render/beats'
import { NoteBarLabelCache } from '../../core/render/barLabels'
import type { BarLabelPaint, NoteBarLabels } from '../../core/render/barLabels'
import { countInLabelAt } from '../../core/model/countIn'
import type { NoteEvent } from '../../core/model/types'

export interface StageViewProps {
  /** 'full' (88 keys) or [lowMidi, highMidi]; absent follows settings.display.zoom. */
  range?: 'full' | [number, number]
  labels?: LabelsProp
  height?: number | string
  className?: string
  theme?: ThemeName
  /** A style template (built-in id or inline). Beats `theme` and the template of a look. */
  template?: TemplateRef
  /** Called when the keyboard geometry changes (resize, zoom), never per frame. */
  onLayout?(layout: KeyboardLayout): void
  children?: ReactNode
  /** Names on the falling/rising note bars: 'pitch' (default: "C", "F♯", "B♭" as spelled
      in the score, else by key signature), 'pitch-octave' ("F♯4"), or 'none'. */
  noteBarLabels?: NoteBarLabels
  /** Label format, accidentals and font (family, weight, scale, colours, case); beats the template's labels. */
  noteBarLabelStyle?: BarLabelStyleInput
}

/**
 * The count-in over the stage: "1 2 3 4" while the playhead is in the lead-in,
 * a pure function of t like everything else drawn. React hears only when the
 * number changes (N times per start); the pop is a CSS animation keyed on it.
 */
function CountInOverlay({ keyboardPx, horizontal }: { keyboardPx: number; horizontal: boolean }) {
  const iv = useIvories()
  const [n, setN] = useState(0)
  const ref = useRef({ lead: iv.lead, perBar: iv.countInPerBar, parked: iv.parked })
  ref.current = { lead: iv.lead, perBar: iv.countInPerBar, parked: iv.parked }
  useEffect(() => {
    let last = -1
    return iv.frames.add((t) => {
      // Idle at the start of the lead-in (before Play) shows no count.
      const b = ref.current.parked() ? 0 : countInLabelAt(t, ref.current.lead, ref.current.perBar)
      if (b !== last) { last = b; setN(b) }
    })
  }, [iv.frames])
  const style: CSSProperties = {
    ...(horizontal ? { left: keyboardPx } : { bottom: keyboardPx }),
    ['--ivories-count-in-beat' as string]: `${iv.lead.beatSec || 0.5}s`,
  }
  // The big numbers are visual only; one polite "Count-in" per count-in, from one view per provider.
  const announcer = useCountInAnnouncer(iv.frames)
  return (
    <>
      <div className="ivories-count-in-overlay" style={style} aria-hidden="true" data-count={n || undefined}>
        {n > 0 && <span key={n} className="ivories-count-in-number">{n}</span>}
      </div>
      {announcer && <span className="ivories-count-in-status" role="status">{n > 0 ? 'Count-in' : ''}</span>}
    </>
  )
}

/** Per provider (keyed on its frame loop): the mounted count-in overlays, the first of which announces. */
const announcers = new WeakMap<object, { order: symbol[]; listeners: Set<() => void> }>()
function announcerRegistry(key: object) {
  let r = announcers.get(key)
  if (!r) { r = { order: [], listeners: new Set() }; announcers.set(key, r) }
  return r
}

/** True for exactly one mounted CountInOverlay per provider; the next one takes over when it unmounts. */
function useCountInAnnouncer(key: object): boolean {
  const [me] = useState(() => Symbol('count-in'))
  const subscribe = useCallback((fn: () => void) => {
    const r = announcerRegistry(key)
    r.listeners.add(fn)
    return () => { r.listeners.delete(fn) }
  }, [key])
  useEffect(() => {
    const r = announcerRegistry(key)
    r.order.push(me)
    r.listeners.forEach((fn) => fn())
    return () => {
      r.order = r.order.filter((x) => x !== me)
      r.listeners.forEach((fn) => fn())
    }
  }, [key, me])
  return useSyncExternalStore(subscribe, () => announcers.get(key)?.order[0] === me, () => false)
}

/** Shared by the labels-off overlay state so it never allocates. */
const NO_PITCHES: number[] = []

export interface StageViewKindProps {
  kind: 'keyboard' | 'falling' | 'rising'
  lookahead?: number
  input?: 'none' | 'midi'
  orientation?: Orientation
  visibleBeats?: number
  beatsPerBar?: number
  beatGrid?: boolean
}

export function StageView(p: StageViewProps & StageViewKindProps) {
  const iv = useIvories()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderer = useMemo(() => new StageRenderer(() => readTheme(rootRef.current)), [])
  const [chordFeed] = useState(() => new ChordFeed())
  const [keys] = useState(() => new KeyContextCache())
  const status = useSyncExternalStore(iv.status.subscribe, iv.status.get, iv.status.get)

  const text = useMemo(() => applyLabels(iv.settings.text, p.labels), [iv.settings.text, p.labels])
  const [overlay, setOverlay] = useState<{ layout: KeyboardLayout | null; pitches: number[] }>({ layout: null, pitches: [] })
  const [chord, setChord] = useState<ChordDisplayValue | null>(null)
  const [failed, setFailed] = useState(false)
  const [labelCache] = useState(() => new NoteBarLabelCache())

  // Everything the frame callback reads, without re-subscribing per change.
  // An explicit per-view theme without a template shows that preset, even over a look's template.
  const ref = p.template ?? (p.theme ? undefined : iv.settings.theme.template)
  const tpl = useMemo(() => resolveTemplate(ref), [ref])
  // The label cache resets on the identity of `labels`, and the renderer re-reads `paint` by
  // identity: both are memoised on primitives (the style input is keyed by its JSON, so an
  // inline literal prop does not rebuild them every render).
  const styleKey = p.noteBarLabelStyle === undefined ? undefined : JSON.stringify(p.noteBarLabelStyle)
  const styleInput = useRef(p.noteBarLabelStyle); styleInput.current = p.noteBarLabelStyle
  const labels = useMemo(
    () => resolveBarLabels(tpl.labels, p.noteBarLabels, styleInput.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tpl.labels, p.noteBarLabels, styleKey],
  )
  const fontFamily = useCanvasFont(labels.font.family, labels.font.weight)
  const { weight, scale, color, strokeColor, strokeWidth } = labels.font
  const paint = useMemo<BarLabelPaint>(
    () => ({ family: fontFamily, weight, scale, color, strokeColor, strokeWidth }),
    [fontFamily, weight, scale, color, strokeColor, strokeWidth],
  )
  const labelCtx = useRef({ key: keys.get(iv.score, text.keyOverride), mode: labels })
  labelCtx.current = { key: keys.get(iv.score, text.keyOverride), mode: labels }
  const barLabel = useCallback((n: NoteEvent) => labelCache.get(n, labelCtx.current.key, labelCtx.current.mode), [labelCache])
  const barLabelRef = useRef(barLabel); barLabelRef.current = barLabel
  const live = useRef({ iv, p, text, tpl, paint })
  live.current = { iv, p, text, tpl, paint }
  const overlayRef = useRef(overlay)
  const lastReadingRef = useRef<ChordReading | null | undefined>(undefined)
  const lastKeyRef = useRef<KeyContext | null>(null)

  // Live input is ref-counted by the provider: MIDI runs while any view asks.
  const wantsMidi = p.input === 'midi'
  useEffect(() => (wantsMidi ? iv.live.enable() : undefined), [wantsMidi, iv.live])

  // A rising view with no score runs on the provider's live clock (R-L).
  const risingView = p.kind === 'rising'
  useEffect(() => (risingView ? iv.requestLiveClock() : undefined), [risingView, iv.requestLiveClock])

  // A seek or a new score makes the held chord stale (App's old seek did this).
  useEffect(() => iv.clock.subscribe((e) => { if (e.type === 'seek') chordFeed.reset() }), [iv.clock, chordFeed])
  const scoreNotes = iv.score?.notes
  useEffect(() => { chordFeed.reset() }, [scoreNotes, chordFeed])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d') ?? null
    if (!canvas || !ctx) return
    let w = 1, h = 1
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, r.width)
      h = Math.max(1, r.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)

    const step = (t: number) => {
      const { iv: c, p: props, text: tx, tpl: template, paint: barLabelPaint } = live.current
      // A per-view theme goes into the renderer's settings so its theme cache
      // (keyed on the theme name) re-reads the tokens for this view's class.
      const settings = props.theme && props.theme !== c.settings.theme.name
        ? { ...c.settings, theme: { ...c.settings.theme, name: props.theme } }
        : c.settings
      const liveMap = c.live.held.get()
      const frame = renderer.draw(ctx, w, h, t, {
        score: c.score,
        settings,
        fallSeconds: props.kind === 'falling' ? (props.lookahead ?? c.fallSeconds) : c.fallSeconds,
        maxNoteDur: c.maxNoteDur,
        showRoll: props.kind !== 'keyboard',
        range: rangeFromProp(props.range),
        live: liveMap,
        orientation: viewOrientation(props.kind, props.orientation),
        rising: props.kind === 'rising'
          ? {
              bpm: c.bpm,
              beatsPerBar: props.beatsPerBar ?? DEFAULT_BEATS_PER_BAR,
              tempo: c.tempo,
              visibleBeats: props.visibleBeats ?? DEFAULT_VISIBLE_BEATS,
              trail: c.live.trail.get(),
              grid: props.beatGrid ?? true,
            }
          : null,
        barLabel: labelCtx.current.mode.show ? barLabelRef.current : undefined,
        barLabelPaint,
        template,
      })
      // The last drawn time, for hosts and e2e sync checks (never read back here).
      const root = rootRef.current
      if (root) root.dataset.t = String(t)
      const held = frame.held
      // Labels name live keys as well as the score's sounding ones.
      const lit = liveMap.size ? new Map<number, unknown>([...held, ...liveMap]) : held

      // The overlay is DOM: push only when the sounding set or the layout
      // changes. While labels are off the pitches are emptied once and left.
      const shown = overlayRef.current
      const labelsOn = tx.labels !== 'off'
      const stale = labelsOn ? !samePitches(lit, shown.pitches) : shown.pitches !== NO_PITCHES
      if (frame.layout !== shown.layout || stale) {
        if (frame.layout !== shown.layout) props.onLayout?.(frame.layout)
        const next = { layout: frame.layout, pitches: labelsOn ? [...lit.keys()].sort((a, b) => a - b) : NO_PITCHES }
        overlayRef.current = next
        setOverlay(next)
      }

      // Chord readout (F41): the feed runs every frame while it is on; React
      // hears only when the committed reading or its key changes.
      if (tx.chord === 'off') {
        if (lastReadingRef.current !== undefined) {
          lastReadingRef.current = undefined
          chordFeed.reset()
          setChord(null)
        }
        return
      }
      const key = keys.get(c.score, tx.keyOverride)
      const reading = chordFeed.update(c.score?.notes ?? [], t, tx.chordWindowMs / 1000, c.maxNoteDur, key, performance.now(),
        liveMap.size ? [...liveMap.keys()] : undefined)
      if (reading !== lastReadingRef.current || key !== lastKeyRef.current) {
        lastReadingRef.current = reading
        lastKeyRef.current = key
        setChord(reading
          ? {
              symbol: displayChordSymbol(reading.symbol),
              alternates: reading.alternates.map(displayChordSymbol),
              numeral: toRomanNumeral(reading.symbol, key),
            }
          : null)
      }
    }

    // A throw here happens inside requestAnimationFrame, where no React error
    // boundary can see it: stop drawing, report once (R11), show it inline.
    let dead = false
    const off = iv.frames.add((t) => {
      if (dead) return
      try {
        step(t)
      } catch (cause) {
        dead = true
        off()
        live.current.iv.reportError(new IvoriesError('render-failed', 'This view stopped working.', cause))
        setFailed(true)
      }
    })
    return () => { off(); ro?.disconnect() }
  }, [iv.frames, renderer, chordFeed, keys])

  const orientation = viewOrientation(p.kind, p.orientation)
  const themeName = p.theme ?? iv.settings.theme.name
  const override = iv.settings.theme.stageBgOverride
  const style: CSSProperties = {
    ...(p.height !== undefined ? { height: p.height } : {}),
    ...(ref ? (tpl.tokens as CSSProperties) : {}),
    ...(override ? ({ '--ivories-stage-bg': override } as CSSProperties) : {}),
  }
  const keyContext = keys.get(iv.score, text.keyOverride)
  const error = status.error && (status.error.code === 'score-load' || status.error.code === 'score-parse') ? status.error : null

  return (
    <div
      ref={rootRef}
      className={cx('ivories', 'ivories-view', `ivories-${p.kind}`, `ivories-theme-${ref ? tpl.cssTheme : themeName}`, p.className)}
      data-ivories-view={p.kind}
      data-ivories-template={ref ? tpl.id : undefined}
      data-orientation={orientation ?? 'vertical'}
      data-bpm={p.kind === 'rising' ? iv.bpm : undefined}
      style={style}
    >
      <canvas ref={canvasRef} className="ivories-canvas" />
      <StageText layout={overlay.layout} pitches={overlay.pitches} text={text} keyContext={keyContext} orientation={orientation} />
      <ChordReadout layout={overlay.layout} value={chord} text={text} orientation={orientation} />
      {iv.score && iv.showCountIn && iv.lead.beats > 0 && (
        <CountInOverlay keyboardPx={overlay.layout?.keyboardH ?? 0} horizontal={orientation === 'horizontal'} />
      )}
      {failed && <p className="ivories-message" role="alert">This view stopped working.</p>}
      {!failed && error && <p className="ivories-message" role="alert">{error.message}</p>}
      {status.loading && !iv.score && <p className="ivories-message" role="status">Loading score…</p>}
      {p.children}
    </div>
  )
}
