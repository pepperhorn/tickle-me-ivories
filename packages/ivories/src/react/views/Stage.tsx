import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref, RefObject } from 'react'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { RisingKeys } from './RisingKeys'
import { CameraSlot } from './CameraSlot'
import { Notation } from '../notation/Notation'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import { cx } from '../cx'
import { layoutReducer } from '../../core/layout/layoutReducer'
import { nearestCorner } from '../../core/layout/geometry'
import { SPLIT_RATIO_MAX, SPLIT_RATIO_MIN } from '../../core/layout/layout'
import type { LayoutAction } from '../../core/layout/layoutReducer'
import type { Aspect, Layout, SlotName, SlotSource } from '../../core/layout/types'
import type { StreamRegistry } from '../../core/camera/streams'
import type { KeyboardLayout } from '../../core/render/geometry'
import type { IvoriesErrorCode } from '../../core/errors'
import type { LabelsProp } from './labels'
import type { NoteBarLabels } from '../../core/render/barLabels'
import type { BarLabelStyleInput } from '../../core/template/types'

export interface StageHandle { swapSlots(): void }

export interface StageSlotViewProps {
  labels?: LabelsProp
  range?: 'full' | [number, number]
  lookahead?: number
  /** Rising slots: beats visible above the keys (default 8). */
  visibleBeats?: number
  input?: 'none' | 'midi'
  zoom?: number
  onLayout?(layout: KeyboardLayout): void
  /** Names on falling/rising note bars (default 'pitch'). */
  noteBarLabels?: NoteBarLabels
  /** Label format, accidentals and font on falling/rising note bars. */
  noteBarLabelStyle?: BarLabelStyleInput
}

export interface StageProps {
  layout: Layout
  aspect?: Aspect
  /** Controlled: every change (drag, keys, swap) comes back here. Absent: the Stage keeps its own copy. */
  onLayoutChange?(layout: Layout): void
  viewProps?: StageSlotViewProps
  /** Per-slot overrides, merged over `viewProps` for that slot only (e.g. `onLayout` for one keys slot). */
  slotViewProps?: Partial<Record<SlotName, StageSlotViewProps>>
  className?: string
  height?: number | string
  cameraRegistry?: StreamRegistry
  ref?: Ref<StageHandle>
}

interface SlotSpec { name: SlotName; source: SlotSource; style: CSSProperties; inset?: boolean }

const FULL: CSSProperties = { left: 0, top: 0, width: '100%', height: '100%' }
const DRAG_THRESHOLD_PX = 4

const sourceLabel = (s: SlotSource) => (s.kind === 'ivories' ? s.view : s.mode)
const errorCode = (s: SlotSource): IvoriesErrorCode =>
  s.kind === 'camera' ? 'camera-unavailable' : s.view === 'notation' || s.view === 'endless' ? 'notation-unavailable' : 'render-failed'

/** Keys follow the SOURCE, not the slot, so a swap moves mounted views and streams instead of remounting them. */
function slotKeys(slots: SlotSpec[]): string[] {
  const seen = new Set<string>()
  return slots.map((s) => {
    const base = s.source.kind === 'ivories' ? `v:${s.source.view}` : s.source.mode === 'webcam' ? `c:webcam:${s.source.deviceId ?? ''}` : `c:mask:${s.source.fill}`
    const key = seen.has(base) ? `${base}@${s.name}` : base
    seen.add(key)
    return key
  })
}

function insetStyle(l: Extract<Layout, { kind: 'pip' }>, drag: { dx: number; dy: number } | null): CSSProperties {
  const m = `calc(${l.margin} * 100cqw)`
  const s: CSSProperties = { width: `${l.size * 100}%`, height: `${l.size * 100}%` }
  if (l.corner === 'tl' || l.corner === 'bl') s.left = m
  else s.right = m
  if (l.corner === 'tl' || l.corner === 'tr') s.top = m
  else s.bottom = m
  if (drag) s.transform = `translate(${drag.dx}px, ${drag.dy}px)`
  return s
}

function SlotContent({ source, viewProps, registry }: { source: SlotSource; viewProps?: StageSlotViewProps; registry?: StreamRegistry }) {
  if (source.kind === 'camera') return <CameraSlot source={source} registry={registry} />
  const v = viewProps ?? {}
  switch (source.view) {
    case 'keyboard': return <Keyboard labels={v.labels} range={v.range} input={v.input} onLayout={v.onLayout} />
    case 'falling': return <FallingKeys labels={v.labels} range={v.range} lookahead={v.lookahead} input={v.input} onLayout={v.onLayout} orientation={source.orientation} noteBarLabels={v.noteBarLabels} noteBarLabelStyle={v.noteBarLabelStyle} />
    case 'rising': return <RisingKeys labels={v.labels} range={v.range} visibleBeats={v.visibleBeats} input={v.input} onLayout={v.onLayout} orientation={source.orientation} noteBarLabels={v.noteBarLabels} noteBarLabelStyle={v.noteBarLabelStyle} />
    case 'notation': return <Notation view="vertical" zoom={v.zoom} />
    case 'endless': return <Notation view="endless" zoom={v.zoom} />
  }
}

function SplitDivider({ ratio, boxRef, onRatio }: { ratio: number; boxRef: RefObject<HTMLDivElement | null>; onRatio(r: number): void }) {
  // The pointer driving the drag; null when idle. Only that pointer, with its primary button held, moves the divider.
  const dragging = useRef<number | null>(null)
  const stop = () => { dragging.current = null }
  const at = (clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect()
    return r && r.height > 0 ? (clientY - r.top) / r.height : null
  }
  return (
    <div
      role="separator" tabIndex={0} aria-orientation="horizontal" aria-label="Split position"
      aria-valuemin={Math.round(SPLIT_RATIO_MIN * 100)} aria-valuemax={Math.round(SPLIT_RATIO_MAX * 100)} aria-valuenow={Math.round(ratio * 100)}
      className="ivories-split-divider"
      style={{ top: `${ratio * 100}%` }}
      onPointerDown={(e) => {
        if (e.button !== 0 || dragging.current !== null) return
        dragging.current = e.pointerId
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (dragging.current === null || e.pointerId !== dragging.current) return
        if ((e.buttons & 1) === 0) { stop(); return }   // released somewhere we never heard about
        const r = at(e.clientY)
        if (r !== null) onRatio(r)
      }}
      onPointerUp={(e) => { if (e.pointerId === dragging.current) stop() }}
      onPointerCancel={(e) => { if (e.pointerId === dragging.current) stop() }}
      onLostPointerCapture={(e) => { if (e.pointerId === dragging.current) stop() }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.05
        const next = e.key === 'ArrowUp' ? ratio - step : e.key === 'ArrowDown' ? ratio + step
          : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null
        if (next === null) return
        e.preventDefault()
        onRatio(next)
      }}
    />
  )
}

function StageInner(props: StageProps) {
  const { aspect = 'free', viewProps, slotViewProps, className, height, cameraRegistry } = props
  const [inner, setInner] = useState(props.layout)
  // Keyed on the layout's content, not its identity: an inline literal re-created on every host render
  // must not wipe the Stage's own changes (drag, keys, swap) in uncontrolled mode.
  const layoutKey = JSON.stringify(props.layout)
  const latestProp = useRef(props.layout)
  latestProp.current = props.layout
  useEffect(() => { setInner(latestProp.current) }, [layoutKey])
  const layout = props.onLayoutChange ? props.layout : inner
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const onChange = useRef(props.onLayoutChange)
  onChange.current = props.onLayoutChange

  const dispatch = useCallback((a: LayoutAction) => {
    const next = layoutReducer(layoutRef.current, a)
    if (next === layoutRef.current) return
    layoutRef.current = next
    if (onChange.current) onChange.current(next)
    else setInner(next)
  }, [])
  useImperativeHandle(props.ref, () => ({ swapSlots: () => dispatch({ type: 'swap' }) }), [dispatch])

  const boxRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const start = useRef<{ id: number; x: number; y: number; captured: boolean } | null>(null)
  const resetDrag = useCallback(() => { start.current = null; setDrag(null) }, [])
  // Leaving pip mid-drag must not leave a stale press or translate behind for the next inset.
  useEffect(() => { if (layout.kind !== 'pip') resetDrag() }, [layout.kind, resetDrag])

  const slots: SlotSpec[] =
    layout.kind === 'single' ? [{ name: 'main', source: layout.main, style: FULL }]
    : layout.kind === 'split' ? [
      { name: 'top', source: layout.top, style: { left: 0, top: 0, width: '100%', height: `${layout.ratio * 100}%` } },
      { name: 'bottom', source: layout.bottom, style: { left: 0, top: `${layout.ratio * 100}%`, width: '100%', height: `${(1 - layout.ratio) * 100}%` } },
    ]
    : [
      { name: 'main', source: layout.main, style: FULL },
      { name: 'inset', source: layout.inset, style: insetStyle(layout, drag), inset: true },
    ]
  const keys = slotKeys(slots)

  const insetHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || start.current) return   // one pointer drags; a second touch is ignored
      start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, captured: false }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = start.current
      if (!s || e.pointerId !== s.id) return
      // No primary button: the press ended outside the inset (before capture), so this is a hover.
      if ((e.buttons & 1) === 0) { resetDrag(); return }
      const dx = e.clientX - s.x, dy = e.clientY - s.y
      // A small threshold keeps clicks (Retry, a note in the score) working.
      if (!s.captured && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      if (!s.captured) { s.captured = true; e.currentTarget.setPointerCapture?.(e.pointerId) }
      setDrag({ dx, dy })
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = start.current
      if (!s || e.pointerId !== s.id) return
      start.current = null
      if (!s.captured) { setDrag(null); return }
      const box = boxRef.current?.getBoundingClientRect()
      const r = e.currentTarget.getBoundingClientRect()
      setDrag(null)
      if (box && box.width > 0 && box.height > 0) {
        dispatch({ type: 'setCorner', corner: nearestCorner(r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top, box.width, box.height) })
      }
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => { if (e.pointerId === start.current?.id) resetDrag() },
    onLostPointerCapture: (e: ReactPointerEvent<HTMLDivElement>) => { if (e.pointerId === start.current?.id) resetDrag() },
  }

  return (
    <div
      className={cx('ivories', 'ivories-stage', className)}
      data-layout-kind={layout.kind}
      style={height !== undefined ? { height } : undefined}
    >
      <div ref={boxRef} className="ivories-stage-box" data-aspect={aspect}>
        {slots.map((s, i) => (
          <div
            key={keys[i]}
            className={cx('ivories-slot', `ivories-slot-${s.name}`, s.inset && 'ivories-slot-inset')}
            data-ivories-slot={s.name}
            data-source={sourceLabel(s.source)}
            data-corner={s.inset && layout.kind === 'pip' ? layout.corner : undefined}
            aria-label={s.inset ? 'Picture-in-picture inset' : undefined}
            style={s.style}
            {...(s.inset ? insetHandlers : {})}
          >
            <Guarded code={errorCode(s.source)}>
              <SlotContent source={s.source} viewProps={slotViewProps?.[s.name] ? { ...viewProps, ...slotViewProps[s.name] } : viewProps} registry={cameraRegistry} />
            </Guarded>
          </div>
        ))}
        {layout.kind === 'split' && (
          <SplitDivider ratio={layout.ratio} boxRef={boxRef} onRatio={(ratio) => dispatch({ type: 'setRatio', ratio })} />
        )}
      </div>
    </div>
  )
}

/** Layout container of slots (spec §5.2): single, split or picture-in-picture. */
export const Stage = withProvider(StageInner, 'Stage')
