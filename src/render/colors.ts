export interface ColorOpts { lMax: number; lMin: number; sat: number }

export const DEFAULT_COLORS: ColorOpts = { lMax: 78, lMin: 38, sat: 85 }

/** Left hand, right hand -- taken from the SheetMusicBoss reference frame. */
export const VOICE_HUES = [207, 28]

export const FLASH_MS = 220
export const INTENSITY_FLOOR = 0.45

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Soft notes light, hard notes dark. Monotonic by construction. */
export function velocityLightness(velocity: number, o: ColorOpts = DEFAULT_COLORS): number {
  const t = clamp(velocity, 0, 127) / 127
  return o.lMax + (o.lMin - o.lMax) * t
}

export function noteColor(hue: number, velocity: number, o: ColorOpts = DEFAULT_COLORS): string {
  return `hsl(${hue} ${o.sat}% ${velocityLightness(velocity, o).toFixed(1)}%)`
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
