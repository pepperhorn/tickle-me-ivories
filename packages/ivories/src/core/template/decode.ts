// The template codec. Pure: no DOM, no storage. An untrusted template (a
// prop, a look, a profile) enters through decodeTemplate, which builds every
// block key by key (never spread) so unknown keys cannot ride along, drops
// any colour that is not a colour or font that is not safe, and clamps every
// number to its range. A bad field is dropped so resolution falls back to the
// base; only the envelope and id are fatal.

import type {
  BarLabelFont, BarLabelFormat, BarLabelStyleInput, BarShading, ColourMode, FlashTint, IvoriesTemplateV1,
  TemplateBars, TemplateColour, TemplateKeyPlate, TemplateKeys, TemplateRaisedKeys, TemplateRef, TemplateStage,
} from './types'
import { invalidPayload, isObj, readEnvelope } from '../platform/codec'
import { isCssColor, isSafeFontFamily } from '../settings/safeValues'
import { isBuiltinTemplateId } from './builtins'

type Obj = Record<string, unknown>

/** A template serializes to at most 16 KiB. */
export const MAX_TEMPLATE_BYTES = 16 * 1024

/** The clamp table. Key radii and raised/plate depths are in chordl units. */
export const TEMPLATE_RANGES = {
  keys: { borderWidth: [0, 4], gap: [0, 4], whiteRadius: [0, 8], blackRadius: [0, 8] },
  raised: { shadowDepth: [0, 6], lipDepth: [0, 12] },
  plate: { borderWidth: [0, 6], shadowDepth: [0, 12], padding: [0, 16] },
  bars: { radius: [0, 12], outlineWidth: [0, 4], shadowDepth: [0, 8] },
  labels: { weight: [100, 900], scale: [0.5, 1.5], strokeWidth: [0, 8] },
} as const

type Range = readonly [number, number]

const ID_RE = /^[a-z0-9-]{1,48}$/
const PALETTE_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const MAX_NAME_CHARS = 64
const MAX_CHROME_KEYS = 32
const PALETTE_SIZE = 12

const SHADINGS: readonly BarShading[] = ['velocity', 'flat']
const COLOUR_MODES: readonly ColourMode[] = ['hand', 'pitch']
const TINTS: readonly FlashTint[] = ['white', 'note']
const FORMATS: readonly BarLabelFormat[] = ['pitch', 'pitch-octave', 'solfege', 'solfege-octave']
const ACCIDENTALS: readonly ('glyph' | 'ascii')[] = ['glyph', 'ascii']
const CASES: readonly ('upper' | 'lower')[] = ['upper', 'lower']

const colour = (v: unknown): string | undefined => (typeof v === 'string' && isCssColor(v) ? v : undefined)
const num = (v: unknown, [lo, hi]: Range): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
function oneOf<T extends string>(v: unknown, set: readonly T[]): T | undefined {
  return typeof v === 'string' && (set as readonly string[]).includes(v) ? (v as T) : undefined
}
/** Assigns only defined values, so a dropped field leaves no key behind. */
function put<T extends object, K extends keyof T>(o: T, k: K, v: T[K] | undefined): void {
  if (v !== undefined) o[k] = v as T[K]
}

function decodeStage(u: unknown): TemplateStage | undefined {
  if (!isObj(u)) return undefined
  const s: TemplateStage = {}
  put(s, 'bg', colour(u.bg))
  put(s, 'gridLine', colour(u.gridLine))
  put(s, 'gridLineC4', colour(u.gridLineC4))
  put(s, 'beatLine', colour(u.beatLine))
  put(s, 'barLine', colour(u.barLine))
  put(s, 'middleCMark', colour(u.middleCMark))
  put(s, 'progressTrack', colour(u.progressTrack))
  put(s, 'progressFill', colour(u.progressFill))
  put(s, 'countInInk', colour(u.countInInk))
  return s
}

function decodeRaised(u: unknown): Partial<TemplateRaisedKeys> | undefined {
  if (!isObj(u)) return undefined
  const r: Partial<TemplateRaisedKeys> = {}
  put(r, 'enabled', bool(u.enabled))
  put(r, 'shadowColor', colour(u.shadowColor))
  put(r, 'shadowDepth', num(u.shadowDepth, TEMPLATE_RANGES.raised.shadowDepth))
  put(r, 'lipColor', colour(u.lipColor))
  put(r, 'lipDepth', num(u.lipDepth, TEMPLATE_RANGES.raised.lipDepth))
  return r
}

function decodePlate(u: unknown): Partial<TemplateKeyPlate> | undefined {
  if (!isObj(u)) return undefined
  const p: Partial<TemplateKeyPlate> = {}
  put(p, 'enabled', bool(u.enabled))
  put(p, 'fill', colour(u.fill))
  put(p, 'borderColor', colour(u.borderColor))
  put(p, 'borderWidth', num(u.borderWidth, TEMPLATE_RANGES.plate.borderWidth))
  put(p, 'shadowColor', colour(u.shadowColor))
  put(p, 'shadowDepth', num(u.shadowDepth, TEMPLATE_RANGES.plate.shadowDepth))
  put(p, 'padding', num(u.padding, TEMPLATE_RANGES.plate.padding))
  return p
}

function decodeKeys(u: unknown): TemplateKeys | undefined {
  if (!isObj(u)) return undefined
  const k: TemplateKeys = {}
  put(k, 'white', colour(u.white))
  put(k, 'black', colour(u.black))
  put(k, 'border', colour(u.border))
  put(k, 'borderWidth', num(u.borderWidth, TEMPLATE_RANGES.keys.borderWidth))
  put(k, 'gap', num(u.gap, TEMPLATE_RANGES.keys.gap))
  put(k, 'whiteRadius', num(u.whiteRadius, TEMPLATE_RANGES.keys.whiteRadius))
  put(k, 'blackRadius', num(u.blackRadius, TEMPLATE_RANGES.keys.blackRadius))
  put(k, 'outline', colour(u.outline))
  put(k, 'raised', decodeRaised(u.raised))
  put(k, 'plate', decodePlate(u.plate))
  return k
}

function decodeBars(u: unknown): TemplateBars | undefined {
  if (!isObj(u)) return undefined
  const b: TemplateBars = {}
  put(b, 'radius', num(u.radius, TEMPLATE_RANGES.bars.radius))
  put(b, 'outlineColor', colour(u.outlineColor))
  put(b, 'outlineWidth', num(u.outlineWidth, TEMPLATE_RANGES.bars.outlineWidth))
  put(b, 'shadowColor', colour(u.shadowColor))
  put(b, 'shadowDepth', num(u.shadowDepth, TEMPLATE_RANGES.bars.shadowDepth))
  put(b, 'shading', oneOf(u.shading, SHADINGS))
  return b
}

function decodeColour(u: unknown): TemplateColour | undefined {
  if (!isObj(u)) return undefined
  const c: TemplateColour = {}
  put(c, 'mode', oneOf(u.mode, COLOUR_MODES))
  const p = u.palette
  if (Array.isArray(p) && p.length === PALETTE_SIZE && p.every((x) => typeof x === 'string' && PALETTE_COLOR_RE.test(x))) {
    c.palette = [...(p as string[])]
  }
  return c
}

/** Never throws: a bad field is dropped, anything that is not an object gives {}. */
export function validBarLabelStyle(u: unknown): BarLabelStyleInput {
  const out: BarLabelStyleInput = {}
  if (!isObj(u)) return out
  put(out, 'show', bool(u.show))
  put(out, 'format', oneOf(u.format, FORMATS))
  put(out, 'accidentals', oneOf(u.accidentals, ACCIDENTALS))
  if (isObj(u.font)) {
    const f = u.font
    const font: Partial<BarLabelFont> = {}
    if (typeof f.family === 'string' && isSafeFontFamily(f.family)) font.family = f.family
    const w = num(f.weight, TEMPLATE_RANGES.labels.weight)
    if (w !== undefined) font.weight = Math.round(w / 100) * 100
    put(font, 'scale', num(f.scale, TEMPLATE_RANGES.labels.scale))
    put(font, 'color', colour(f.color))
    put(font, 'strokeColor', colour(f.strokeColor))
    put(font, 'strokeWidth', num(f.strokeWidth, TEMPLATE_RANGES.labels.strokeWidth))
    put(font, 'case', oneOf(f.case, CASES))
    out.font = font
  }
  return out
}

function decodeChrome(u: unknown): Record<string, string> | undefined {
  if (!isObj(u)) return undefined
  const out: Record<string, string> = {}
  let n = 0
  for (const [k, v] of Object.entries(u)) {
    if (n >= MAX_CHROME_KEYS) break
    const c = colour(v)
    if (c === undefined) continue
    out[k] = c
    n++
  }
  return out
}

/**
 * Decodes an untrusted template (a parsed value or its JSON string). Throws a
 * PlatformError -- see platform/codec.ts for the contract.
 */
export function decodeTemplate(u: unknown): IvoriesTemplateV1 {
  const o: Obj = readEnvelope(u, 'ivories-template', MAX_TEMPLATE_BYTES)
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) throw invalidPayload('ivories-template', 'invalid id')
  const id = o.id
  const name = typeof o.name === 'string' ? o.name.slice(0, MAX_NAME_CHARS) : id
  const t: IvoriesTemplateV1 = { v: 1, kind: 'ivories-template', id, name }
  put(t, 'extends', isBuiltinTemplateId(o.extends) ? o.extends : undefined)
  put(t, 'stage', decodeStage(o.stage))
  put(t, 'keys', decodeKeys(o.keys))
  put(t, 'bars', decodeBars(o.bars))
  put(t, 'colour', decodeColour(o.colour))
  if (isObj(o.flash)) {
    const flash: { tint?: FlashTint } = {}
    put(flash, 'tint', oneOf(o.flash.tint, TINTS))
    t.flash = flash
  }
  if (isObj(o.labels)) t.labels = validBarLabelStyle(o.labels)
  put(t, 'chrome', decodeChrome(o.chrome))
  return t
}

/** A built-in id passes; an object goes through decodeTemplate; anything else, or a throw, is undefined. */
export function validTemplateRef(u: unknown): TemplateRef | undefined {
  if (isBuiltinTemplateId(u)) return u
  if (!isObj(u)) return undefined
  try { return decodeTemplate(u) } catch { return undefined }
}
