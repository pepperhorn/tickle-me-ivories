// Resolves a TemplateRef to a frozen ResolvedTemplate: decode (objects),
// walk the built-in extends chain, deep-merge over the classic defaults, and
// map the stage/key/bar-radius values to inline --ivories-* tokens. Runs once
// per template change (cached), never per frame.

import type {
  BarLabelStyle, BarLabelStyleInput, BarShading, BuiltinTemplateId, ColourMode, FlashTint, IvoriesTemplateV1,
  TemplateKeyPlate, TemplateRaisedKeys, TemplateRef,
} from './types'
import type { ThemeName } from '../settings/types'
import type { NoteBarLabels } from '../render/barLabels'
import { BUILTIN_TEMPLATES, isBuiltinTemplateId } from './builtins'
import { CSS_THEME_OF } from './cssTheme'
import { decodeTemplate, validBarLabelStyle } from './decode'
import { CRF_PITCH_PALETTE } from './palette'
import { hexToRgb } from '../render/colors'

export interface ResolvedTemplate {
  id: string
  name: string
  cssTheme: ThemeName
  tokens: Readonly<Record<string, string>>
  keys: { whiteRadius: number | null; blackRadius: number | null; raised: TemplateRaisedKeys; plate: TemplateKeyPlate }
  bars: { outlineColor: string; outlineWidth: number; shadowColor: string; shadowDepth: number; shading: BarShading }
  colour: { mode: ColourMode; palette: readonly string[]; paletteRgb: readonly string[]; paletteCoreRgb: readonly string[] }
  flash: { tint: FlashTint }
  labels: BarLabelStyle
}

export const DEFAULT_BAR_LABEL_STYLE: BarLabelStyle = Object.freeze({
  show: true,
  format: 'pitch',
  accidentals: 'glyph',
  font: Object.freeze({
    family: 'Poppins', weight: 600, scale: 1, color: '#ffffff',
    strokeColor: 'rgba(0, 0, 0, 0.35)', strokeWidth: 3, case: 'upper',
  }),
}) as BarLabelStyle

const CC = BUILTIN_TEMPLATES['chord-cards'].keys!
const DEFAULT_RAISED: TemplateRaisedKeys = { ...(CC.raised as TemplateRaisedKeys), enabled: false }
const DEFAULT_PLATE: TemplateKeyPlate = { ...(CC.plate as TemplateKeyPlate), enabled: false }

const STAGE_TOKENS: Record<string, string> = {
  bg: '--ivories-stage-bg', gridLine: '--ivories-grid-line', gridLineC4: '--ivories-grid-line-c4',
  beatLine: '--ivories-beat-line', barLine: '--ivories-bar-line', middleCMark: '--ivories-middle-c-mark',
  progressTrack: '--ivories-progress-track', progressFill: '--ivories-progress-fill',
}
const KEY_TOKENS: Record<string, string> = {
  white: '--ivories-key-white', black: '--ivories-key-black', border: '--ivories-key-border',
  borderWidth: '--ivories-key-border-width', gap: '--ivories-key-gap', outline: '--ivories-key-outline',
}
const PX_KEYS = new Set(['borderWidth', 'gap'])

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

const rgbOf = (hex: string) => hexToRgb(hex).join(', ')
const coreRgbOf = (hex: string) => hexToRgb(hex).map((c) => Math.round((c + 255) / 2)).join(', ')

/** The extends chain, base first, ending with the template itself. */
function chainOf(t: IvoriesTemplateV1): IvoriesTemplateV1[] {
  const out: IvoriesTemplateV1[] = [t]
  let cur: IvoriesTemplateV1 = t
  for (let i = 0; i < 2 && cur.extends; i++) {
    cur = BUILTIN_TEMPLATES[cur.extends]
    out.unshift(cur)
  }
  return out
}

function build(t: IvoriesTemplateV1): ResolvedTemplate {
  const chain = chainOf(t)
  // The root of the chain decides the CSS class (a built-in id, or the object's own extends).
  const rootId: BuiltinTemplateId = t.extends ?? (isBuiltinTemplateId(t.id) && BUILTIN_TEMPLATES[t.id] === t ? t.id : 'classic')
  const cssTheme = CSS_THEME_OF[rootId]
  const tokens: Record<string, string> = {}
  let whiteRadius: number | null = null
  let blackRadius: number | null = null
  const raised = { ...DEFAULT_RAISED }
  const plate = { ...DEFAULT_PLATE }
  const bars = { outlineColor: 'transparent', outlineWidth: 0, shadowColor: 'transparent', shadowDepth: 0, shading: 'velocity' as BarShading }
  let mode: ColourMode = 'hand'
  let palette: readonly string[] = CRF_PITCH_PALETTE
  let tint: FlashTint = 'white'
  let labels: BarLabelStyle = DEFAULT_BAR_LABEL_STYLE

  for (const l of chain) {
    if (l.stage) {
      for (const [k, v] of Object.entries(l.stage)) if (STAGE_TOKENS[k] && v !== undefined) tokens[STAGE_TOKENS[k]] = v
    }
    if (l.keys) {
      for (const [k, v] of Object.entries(l.keys)) {
        if (KEY_TOKENS[k] && v !== undefined) tokens[KEY_TOKENS[k]] = PX_KEYS.has(k) ? `${v}px` : String(v)
      }
      if (l.keys.whiteRadius !== undefined) whiteRadius = l.keys.whiteRadius
      if (l.keys.blackRadius !== undefined) blackRadius = l.keys.blackRadius
      if (l.keys.raised) Object.assign(raised, l.keys.raised)
      if (l.keys.plate) Object.assign(plate, l.keys.plate)
    }
    if (l.bars) {
      if (l.bars.radius !== undefined) tokens['--ivories-bar-radius'] = `${l.bars.radius}px`
      for (const k of ['outlineColor', 'outlineWidth', 'shadowColor', 'shadowDepth', 'shading'] as const) {
        if (l.bars[k] !== undefined) (bars as Record<string, unknown>)[k] = l.bars[k]
      }
    }
    if (l.colour?.mode) mode = l.colour.mode
    if (l.colour?.palette && l.colour.palette.length > 0) palette = l.colour.palette
    if (l.flash?.tint) tint = l.flash.tint
    if (l.labels) labels = resolveBarLabels(labels, undefined, l.labels)
  }

  return deepFreeze({
    id: t.id,
    name: t.name,
    cssTheme,
    tokens,
    keys: { whiteRadius, blackRadius, raised, plate },
    bars,
    colour: { mode, palette: [...palette], paletteRgb: palette.map(rgbOf), paletteCoreRgb: palette.map(coreRgbOf) },
    flash: { tint },
    labels: labels === DEFAULT_BAR_LABEL_STYLE ? labels : { ...labels, font: { ...labels.font } },
  })
}

const builtinCache = new Map<string, ResolvedTemplate>()
const objectCache = new WeakMap<object, ResolvedTemplate>()

function classic(): ResolvedTemplate {
  let c = builtinCache.get('classic')
  if (!c) { c = build(BUILTIN_TEMPLATES.classic); builtinCache.set('classic', c) }
  return c
}

export function resolveTemplate(ref?: TemplateRef | null): ResolvedTemplate {
  if (ref === undefined || ref === null) return classic()
  if (typeof ref === 'string') {
    if (!isBuiltinTemplateId(ref)) return classic()
    let r = builtinCache.get(ref)
    if (!r) { r = build(BUILTIN_TEMPLATES[ref]); builtinCache.set(ref, r) }
    return r
  }
  if (typeof ref !== 'object') return classic()
  const hit = objectCache.get(ref)
  if (hit) return hit
  let r: ResolvedTemplate
  try { r = build(decodeTemplate(ref)) } catch { r = classic() }
  objectCache.set(ref, r)
  return r
}

export function isClassicLook(t: ResolvedTemplate): boolean {
  return t.keys.whiteRadius === null && t.keys.blackRadius === null && !t.keys.raised.enabled && !t.keys.plate.enabled &&
    t.bars.outlineWidth === 0 && t.bars.shadowDepth === 0 && t.bars.shading === 'velocity' &&
    t.colour.mode === 'hand' && t.flash.tint === 'white'
}

export function resolveBarLabels(base: BarLabelStyle, shorthand?: NoteBarLabels, style?: BarLabelStyleInput): BarLabelStyle {
  if (shorthand === undefined && style === undefined) return base
  let out: BarLabelStyle = base
  if (shorthand === 'none') out = { ...out, show: false }
  else if (shorthand === 'pitch' || shorthand === 'pitch-octave') out = { ...out, show: true, format: shorthand }
  if (style !== undefined) {
    const v = validBarLabelStyle(style)
    out = { ...out, ...v, font: { ...out.font, ...v.font } } as BarLabelStyle
  }
  return out
}
