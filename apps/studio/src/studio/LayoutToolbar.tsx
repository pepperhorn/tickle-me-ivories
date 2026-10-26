import { useEffect, useState } from 'react'
import { useCameraStream } from 'ivories'
import { headstockFor, listVideoInputs, slotsOf, sourceAt } from 'ivories/core'
import type { Aspect, CameraFit, Corner, FretboardOptions, IvoriesView, LayoutAction, LayoutKind, Orientation, SlotName, SlotSource } from 'ivories/core'
import { useStudioStage } from './stageStore'
import { useTransport } from '../transport/useTransport'
import { LiveBpmField } from './LiveBpmField'

type Webcam = Extract<SlotSource, { mode: 'webcam' }>
type CameraInfo = { deviceId: string; label: string }

const SLOT_LABEL: Record<SlotName, string> = { main: 'Main', top: 'Top', bottom: 'Bottom', inset: 'Inset' }
// Only transparent or hex fills: validFill refuses named colours.
const MASKS: Record<string, string> = { 'mask-transparent': 'transparent', 'mask-green': '#00b140', 'mask-blue': '#0047bb' }
const SOURCE_OPTIONS: [string, string][] = [
  ['falling', 'Falling keys'], ['rising', 'Rising notes'], ['keyboard', 'Keyboard'], ['fretboard', 'Fretboard'], ['notation', 'Notation'], ['endless', 'Endless notation'],
  ['webcam', 'Webcam'], ['mask-transparent', 'Mask (transparent)'], ['mask-green', 'Mask (green)'], ['mask-blue', 'Mask (blue)'],
]
const SELECT = 'rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--ink)]'

function valueOf(s: SlotSource): string {
  if (s.kind === 'ivories') return s.view
  if (s.mode === 'webcam') return 'webcam'
  return Object.entries(MASKS).find(([, fill]) => fill === s.fill)?.[0] ?? 'mask-transparent'
}

function sourceFor(value: string, current: SlotSource): SlotSource {
  if (value === 'webcam') {
    return current.kind === 'camera' && current.mode === 'webcam' ? current : { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' }
  }
  if (value in MASKS) return { kind: 'camera', mode: 'mask', fill: MASKS[value] }
  const view = value as IvoriesView
  // Switching between the two rolls keeps the slot's orientation (R-M).
  const orientation = current.kind === 'ivories' ? current.orientation : undefined
  return orientation && (view === 'falling' || view === 'rising') ? { kind: 'ivories', view, orientation } : { kind: 'ivories', view }
}

/** The video inputs, re-listed once a stream is granted (labels appear) and on devicechange. */
function useCameraList(granted: boolean): CameraInfo[] {
  const [cameras, setCameras] = useState<CameraInfo[]>([])
  useEffect(() => {
    let live = true
    const refresh = () => { void listVideoInputs().then((c) => { if (live) setCameras(c) }) }
    refresh()
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
    md?.addEventListener?.('devicechange', refresh)
    return () => { live = false; md?.removeEventListener?.('devicechange', refresh) }
  }, [granted])
  return cameras
}

/** Device, mirror and fit for one webcam slot. Shares the slot's stream (same registry key) to learn when it is granted. */
function WebcamControls({ slot, label, source, dispatch }: {
  slot: SlotName; label: string; source: Webcam; dispatch(a: LayoutAction): void
}) {
  const { stream } = useCameraStream(source.deviceId)
  const cameras = useCameraList(stream !== null)
  const set = (patch: Partial<Webcam>) => dispatch({ type: 'setSource', slot, source: { ...source, ...patch } })
  return (
    <>
      <select aria-label={`${label} camera`} className={`slot-device-select ${SELECT}`} value={source.deviceId ?? ''}
        onChange={(e) => set({ deviceId: e.target.value || undefined })}>
        <option className="slot-device-option" value="">Default camera</option>
        {cameras.map((c) => <option key={c.deviceId} className="slot-device-option" value={c.deviceId}>{c.label}</option>)}
      </select>
      <label className="slot-mirror flex items-center gap-1">
        <input type="checkbox" aria-label={`${label} mirror`} className="slot-mirror-toggle accent-[var(--accent)]"
          checked={source.mirror} onChange={(e) => set({ mirror: e.target.checked })} />
        <span className="slot-mirror-label">Mirror</span>
      </label>
      <select aria-label={`${label} fit`} className={`slot-fit-select ${SELECT}`} value={source.fit}
        onChange={(e) => set({ fit: e.target.value as CameraFit })}>
        <option className="slot-fit-option" value="cover">Fill</option>
        <option className="slot-fit-option" value="contain">Fit</option>
      </select>
    </>
  )
}

/** Layout kind, swap, PIP corner, aspect and per-slot sources (spec §6). */
export function LayoutToolbar() {
  const { layout, aspect, dispatch, setAspect } = useStudioStage()
  // Live BPM matters only for a rising view running on the live clock: no score (R-S).
  const score = useTransport((s) => s.score)
  const showBpm = !score && slotsOf(layout).some((slot) => {
    const s = sourceAt(layout, slot)
    return s?.kind === 'ivories' && s.view === 'rising'
  })

  // The store re-syncs the display mode from the primary keys slot (R7).
  const setSource = (slot: SlotName, value: string) =>
    dispatch({ type: 'setSource', slot, source: sourceFor(value, sourceAt(layout, slot)!) })

  return (
    <div className="layout-toolbar flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink-dim)]">
      <label className="layout-kind flex items-center gap-1">
        <span className="layout-kind-label">Layout</span>
        <select aria-label="Layout" className={`layout-kind-select ${SELECT}`} value={layout.kind}
          onChange={(e) => dispatch({ type: 'setKind', kind: e.target.value as LayoutKind })}>
          <option className="layout-kind-option" value="single">Single</option>
          <option className="layout-kind-option" value="split">Split</option>
          <option className="layout-kind-option" value="pip">Picture in picture</option>
        </select>
      </label>
      {layout.kind !== 'single' && (
        <button type="button" aria-label="Swap slots" className="btn-layout-swap rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--ink)]"
          onClick={() => dispatch({ type: 'swap' })}>
          Swap
        </button>
      )}
      {layout.kind === 'pip' && (
        <select aria-label="Inset corner" className={`layout-corner-select ${SELECT}`} value={layout.corner}
          onChange={(e) => dispatch({ type: 'setCorner', corner: e.target.value as Corner })}>
          <option className="layout-corner-option" value="tl">Top left</option>
          <option className="layout-corner-option" value="tr">Top right</option>
          <option className="layout-corner-option" value="bl">Bottom left</option>
          <option className="layout-corner-option" value="br">Bottom right</option>
        </select>
      )}
      <select aria-label="Aspect" className={`layout-aspect-select ${SELECT}`} value={aspect}
        onChange={(e) => setAspect(e.target.value as Aspect)}>
        <option className="layout-aspect-option" value="free">Free</option>
        <option className="layout-aspect-option" value="16:9">16:9</option>
        <option className="layout-aspect-option" value="9:16">9:16</option>
      </select>
      {showBpm && <LiveBpmField className="layout-bpm" />}
      {slotsOf(layout).map((slot) => {
        const s = sourceAt(layout, slot)!
        const label = SLOT_LABEL[slot]
        return (
          <span key={slot} className="slot-source-group flex flex-wrap items-center gap-1">
            <select aria-label={`${label} source`} className={`slot-source-select ${SELECT}`} value={valueOf(s)}
              onChange={(e) => setSource(slot, e.target.value)}>
              {SOURCE_OPTIONS.map(([v, text]) => <option key={v} className="slot-source-option" value={v}>{text}</option>)}
            </select>
            {s.kind === 'ivories' && s.view === 'fretboard' && (
              <FretboardControls label={label} value={s.fretboard ?? {}} onChange={(fretboard) => dispatch({ type: 'setSource', slot, source: { ...s, fretboard } })} />
            )}
            {/* Falling is vertical only (horizontal is deprecated): the horizontal roll is rising's. */}
            {s.kind === 'ivories' && s.view === 'rising' && (
              <select aria-label={`${label} orientation`} className={`slot-orientation-select ${SELECT}`} value={s.orientation ?? 'vertical'}
                onChange={(e) => dispatch({ type: 'setSource', slot, source: { ...s, orientation: e.target.value as Orientation } })}>
                <option className="slot-orientation-option" value="vertical">Vertical</option>
                <option className="slot-orientation-option" value="horizontal">Horizontal</option>
              </select>
            )}
            {s.kind === 'camera' && s.mode === 'webcam' && (
              <WebcamControls slot={slot} label={label} source={s} dispatch={dispatch} />
            )}
          </span>
        )
      })}
    </div>
  )
}

function FretboardControls({ label, value, onChange }: { label: string; value: FretboardOptions; onChange(value: FretboardOptions): void }) {
  const instrument = value.instrument ?? 'guitar'
  const guitar = instrument === 'guitar'
  return <>
    <select className={`slot-instrument-select ${SELECT}`} aria-label={`${label} instrument`} value={instrument}
      onChange={(e) => onChange({ ...value, instrument: e.target.value as FretboardOptions['instrument'], headstock: e.target.value === 'guitar' ? 'strat' : 'precision' })}>
      <option className="slot-instrument-option" value="guitar">Guitar · E A D G B E</option>
      <option className="slot-instrument-option" value="bass4">Bass · E A D G</option>
      <option className="slot-instrument-option" value="bass5">Bass 5 · B E A D G</option>
    </select>
    <select className={`slot-headstock-select ${SELECT}`} aria-label={`${label} headstock`} value={headstockFor(instrument, value.headstock)}
      onChange={(e) => onChange({ ...value, headstock: e.target.value as FretboardOptions['headstock'] })}>
      {guitar ? <><option className="slot-headstock-option" value="strat">Strat-inspired</option><option className="slot-headstock-option" value="tele">Tele-inspired</option></>
        : <><option className="slot-headstock-option" value="precision">P-Bass-inspired</option><option className="slot-headstock-option" value="violin">Beatle / violin-inspired</option></>}
    </select>
    <select className={`slot-note-labels-select ${SELECT}`} aria-label={`${label} note labels`} value={value.noteLabels ?? 'note'}
      onChange={(e) => onChange({ ...value, noteLabels: e.target.value as FretboardOptions['noteLabels'] })}>
      <option className="slot-note-labels-option" value="note">Note letters</option><option className="slot-note-labels-option" value="fret">Fret numbers</option>
    </select>
    <select className={`slot-appearance-select ${SELECT}`} aria-label={`${label} fretboard appearance`} value={value.appearance ?? 'dark'}
      onChange={(e) => onChange({ ...value, appearance: e.target.value as FretboardOptions['appearance'] })}>
      <option className="slot-appearance-option" value="dark">Dark · rosewood</option><option className="slot-appearance-option" value="light">Light · maple</option>
    </select>
    <select className={`slot-frets-select ${SELECT}`} aria-label={`${label} frets`} value={value.frets ?? 12}
      onChange={(e) => onChange({ ...value, frets: Number(e.target.value) as 12 | 24 })}>
      <option className="slot-frets-option" value="12">12 frets</option><option className="slot-frets-option" value="24">24 frets</option>
    </select>
  </>
}
