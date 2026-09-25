import { DEFAULT_LIGHTNESS } from '../settings/types'
import type { GradientStop, VelocityScheme } from '../settings/types'

export interface ColorOpts { lMax: number; lMin: number; sat: number }

/** Reuses the single canonical literal (F12) rather than re-declaring it here. */
export const DEFAULT_COLORS: ColorOpts = DEFAULT_LIGHTNESS

/** The lightness-scheme default, built from the same canonical literal (F12). */
export const DEFAULT_SCHEME: VelocityScheme = { kind: 'lightness', ...DEFAULT_LIGHTNESS }

/** Left hand, right hand -- taken from the SheetMusicBoss reference frame. */
export const VOICE_HUES = [207, 28]

export const FLASH_MS = 220
export const INTENSITY_FLOOR = 0.45

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Soft notes light, hard notes dark. Monotonic by construction. */
export function velocityLightness(
  velocity: number, o: { lMax: number; lMin: number } = DEFAULT_COLORS,
): number {
  const t = clamp(velocity, 0, 127) / 127
  return o.lMax + (o.lMin - o.lMax) * t
}

/** #rgb and #rrggbb. Junk returns mid grey rather than NaN, which would poison
    every downstream arithmetic op and paint nothing at all. */
export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) {
    return [
      parseInt(s[0] + s[0], 16),
      parseInt(s[1] + s[1], 16),
      parseInt(s[2] + s[2], 16),
    ]
  }
  if (/^[0-9a-f]{6}$/i.test(s)) {
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ]
  }
  return [128, 128, 128]
}

interface ParsedStop { at: number; rgb: [number, number, number] }

/**
 * Sorting + hex-parsing is the same work on every call for the same `stops`
 * array, and `gradientColor` runs per visible note and per held key, every
 * frame -- so it is cached here, keyed by the array's identity. The settings
 * store always REPLACES `scheme.stops` wholesale on any edit (never mutates
 * in place -- see `VelocityEditor`/`setVelocity`), so identity is exactly
 * "has this gradient changed" and a stale cache entry can never be read.
 */
const parsedStopsCache = new WeakMap<GradientStop[], ParsedStop[]>()

function parsedStops(stops: GradientStop[]): ParsedStop[] {
  const cached = parsedStopsCache.get(stops)
  if (cached) return cached
  const sorted = [...stops]
    .sort((a, b) => a.at - b.at)
    .map((s): ParsedStop => ({ at: s.at, rgb: hexToRgb(s.color) }))
  parsedStopsCache.set(stops, sorted)
  return sorted
}

/** Velocity -> a colour on the multi-stop gradient. Stops are sorted defensively;
    the editor lets a user drag one past another. */
export function gradientColor(velocity: number, stops: GradientStop[]): string {
  const sorted = parsedStops(stops)
  if (sorted.length === 0) return 'rgb(128, 128, 128)'
  const t = clamp(velocity, 0, 127) / 127

  let lo = sorted[0]
  let hi = sorted[sorted.length - 1]
  if (t <= lo.at) hi = lo
  else if (t >= hi.at) lo = hi
  else {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t >= sorted[i].at && t <= sorted[i + 1].at) { lo = sorted[i]; hi = sorted[i + 1]; break }
    }
  }

  const span = hi.at - lo.at
  const f = span <= 0 ? 0 : (t - lo.at) / span
  const r = Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * f)
  const g = Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * f)
  const b = Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * f)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * In lightness mode the voice hue carries voice identity and velocity drives
 * lightness. In gradient mode the gradient IS the colour language and hue is
 * deliberately ignored -- blending the two produces muddy, unreadable colour.
 */
export function noteColor(
  hue: number, velocity: number, scheme: VelocityScheme = DEFAULT_SCHEME,
): string {
  if (scheme.kind === 'gradient') return gradientColor(velocity, scheme.stops)
  return `hsl(${hue} ${scheme.sat}% ${velocityLightness(velocity, scheme).toFixed(1)}%)`
}

/**
 * Impact flash intensity. A PURE FUNCTION OF AGE -- nothing is spawned, stored
 * or ticked, so scrubbing backwards, pausing mid-flash and changing tempo all
 * produce exactly the right state with no particle pool to reset.
 */
export function flashIntensity(
  ageSec: number, velocity: number,
  flashMs: number = FLASH_MS, floor: number = INTENSITY_FLOOR,
): number {
  if (ageSec < 0) return 0
  const a = 1 - ageSec / (flashMs / 1000)
  if (a <= 0) return 0
  return a * a * (floor + (1 - floor) * (clamp(velocity, 0, 127) / 127))
}

/** First two voices take the reference hues; the rest spread around the wheel. */
export function hueForVoiceIndex(i: number, total: number): number {
  if (i < VOICE_HUES.length) return VOICE_HUES[i]
  return Math.round((207 + (i * 360) / Math.max(total, 1)) % 360)
}
