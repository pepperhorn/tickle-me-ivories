import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useIvories } from '../hooks'
import { cx } from '../cx'
import { applyLabels } from './labels'
import { StageText, samePitches } from '../text/StageText'
import { ChordReadout } from '../text/ChordReadout'
import { StageRenderer, rangeFromProp } from '../../core/render/stageRenderer'
import { readTheme } from '../../core/render/theme'
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

export interface StageViewProps {
  /** 'full' (88 keys) or [lowMidi, highMidi]; absent follows settings.display.zoom. */
  range?: 'full' | [number, number]
  labels?: LabelsProp
  height?: number | string
  className?: string
  theme?: ThemeName
  /** Called when the keyboard geometry changes (resize, zoom), never per frame. */
  onLayout?(layout: KeyboardLayout): void
  children?: ReactNode
}

/** Shared by the labels-off overlay state so it never allocates. */
const NO_PITCHES: number[] = []

export function StageView(p: StageViewProps & { kind: 'keyboard' | 'falling'; lookahead?: number }) {
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

  // Everything the frame callback reads, without re-subscribing per change.
  const live = useRef({ iv, p, text })
  live.current = { iv, p, text }
  const overlayRef = useRef(overlay)
  const lastReadingRef = useRef<ChordReading | null | undefined>(undefined)
  const lastKeyRef = useRef<KeyContext | null>(null)

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
      const { iv: c, p: props, text: tx } = live.current
      // A per-view theme goes into the renderer's settings so its theme cache
      // (keyed on the theme name) re-reads the tokens for this view's class.
      const settings = props.theme && props.theme !== c.settings.theme.name
        ? { ...c.settings, theme: { ...c.settings.theme, name: props.theme } }
        : c.settings
      const frame = renderer.draw(ctx, w, h, t, {
        score: c.score,
        settings,
        fallSeconds: props.kind === 'falling' ? (props.lookahead ?? c.fallSeconds) : c.fallSeconds,
        maxNoteDur: c.maxNoteDur,
        showRoll: props.kind === 'falling',
        range: rangeFromProp(props.range),
      })
      const held = frame.held

      // The overlay is DOM: push only when the sounding set or the layout
      // changes. While labels are off the pitches are emptied once and left.
      const shown = overlayRef.current
      const labelsOn = tx.labels !== 'off'
      const stale = labelsOn ? !samePitches(held, shown.pitches) : shown.pitches !== NO_PITCHES
      if (frame.layout !== shown.layout || stale) {
        if (frame.layout !== shown.layout) props.onLayout?.(frame.layout)
        const next = { layout: frame.layout, pitches: labelsOn ? [...held.keys()].sort((a, b) => a - b) : NO_PITCHES }
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
      const reading = chordFeed.update(c.score?.notes ?? [], t, tx.chordWindowMs / 1000, c.maxNoteDur, key, performance.now())
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

  const themeName = p.theme ?? iv.settings.theme.name
  const override = iv.settings.theme.stageBgOverride
  const style: CSSProperties = {
    ...(p.height !== undefined ? { height: p.height } : {}),
    ...(override ? ({ '--ivories-stage-bg': override } as CSSProperties) : {}),
  }
  const keyContext = keys.get(iv.score, text.keyOverride)
  const error = status.error && (status.error.code === 'score-load' || status.error.code === 'score-parse') ? status.error : null

  return (
    <div
      ref={rootRef}
      className={cx('ivories', 'ivories-view', `ivories-${p.kind}`, `ivories-theme-${themeName}`, p.className)}
      data-ivories-view={p.kind}
      style={style}
    >
      <canvas ref={canvasRef} className="ivories-canvas" />
      <StageText layout={overlay.layout} pitches={overlay.pitches} text={text} keyContext={keyContext} />
      <ChordReadout layout={overlay.layout} value={chord} text={text} />
      {failed && <p className="ivories-message" role="alert">This view stopped working.</p>}
      {!failed && error && <p className="ivories-message" role="alert">{error.message}</p>}
      {status.loading && !iv.score && <p className="ivories-message" role="status">Loading score…</p>}
      {p.children}
    </div>
  )
}
