import { clampMargin, clampRatio, clampSize } from './layout'
import type { Aspect, CameraFit, Corner, IvoriesView, Layout, SlotSource } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const VIEWS: readonly IvoriesView[] = ['keyboard', 'falling', 'rising', 'notation', 'endless']
const CORNERS: readonly Corner[] = ['tl', 'tr', 'bl', 'br']
const ASPECTS: readonly Aspect[] = ['free', '16:9', '9:16']
const FILL_RE = /^(transparent|#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]{1,60}\))$/i
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A mask fill reaches a style attribute: only plain colour syntax gets through. */
export function validFill(u: unknown): string | null {
  return typeof u === 'string' && u.length <= 80 && FILL_RE.test(u.trim()) ? u : null
}

export function validSource(u: unknown, o: { keepDeviceId: boolean }): SlotSource | null {
  if (!isObj(u)) return null
  if (u.kind === 'ivories') {
    if (!VIEWS.includes(u.view as IvoriesView)) return null
    const view = u.view as IvoriesView
    const out: Extract<SlotSource, { kind: 'ivories' }> = { kind: 'ivories', view }
    // Only the roll views have an orientation; anything else is dropped, the slot kept (R-V).
    if ((view === 'falling' || view === 'rising') && (u.orientation === 'vertical' || u.orientation === 'horizontal')) {
      out.orientation = u.orientation
    }
    return out
  }
  if (u.kind !== 'camera') return null
  if (u.mode === 'mask') {
    const fill = validFill(u.fill)
    return fill ? { kind: 'camera', mode: 'mask', fill } : null
  }
  if (u.mode !== 'webcam' || typeof u.mirror !== 'boolean' || (u.fit !== 'cover' && u.fit !== 'contain')) return null
  const out: Extract<SlotSource, { mode: 'webcam' }> = {
    kind: 'camera', mode: 'webcam', mirror: u.mirror as boolean, fit: u.fit as CameraFit,
  }
  if (o.keepDeviceId && typeof u.deviceId === 'string' && u.deviceId.length > 0 && u.deviceId.length <= 256) out.deviceId = u.deviceId
  return out
}

/** Decodes an untrusted layout; ratios/sizes/margins are clamped, anything malformed is refused. */
export function validLayout(u: unknown, o: { keepDeviceId: boolean } = { keepDeviceId: true }): Layout | null {
  if (!isObj(u)) return null
  if (u.kind === 'single') {
    const main = validSource(u.main, o)
    return main ? { kind: 'single', main } : null
  }
  if (u.kind === 'split') {
    const top = validSource(u.top, o), bottom = validSource(u.bottom, o), ratio = num(u.ratio)
    return top && bottom && ratio !== null ? { kind: 'split', top, bottom, ratio: clampRatio(ratio) } : null
  }
  if (u.kind === 'pip') {
    const main = validSource(u.main, o), inset = validSource(u.inset, o)
    const size = num(u.size), margin = num(u.margin)
    const corner = CORNERS.includes(u.corner as Corner) ? (u.corner as Corner) : null
    return main && inset && size !== null && margin !== null && corner
      ? { kind: 'pip', main, inset, corner, size: clampSize(size), margin: clampMargin(margin) }
      : null
  }
  return null
}

export function validAspect(u: unknown): Aspect | null {
  return ASPECTS.includes(u as Aspect) ? (u as Aspect) : null
}
