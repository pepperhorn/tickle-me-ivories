import { noteColor, parseRgb, rgbOf } from './colors'
import type { RenderState } from './pianoRoll'
import { isTransparent, type Theme } from './theme'

/** The colour of a note bar or lit key. Pitch mode is a palette lookup by pitch
    class (flat, whatever the velocity); otherwise exactly today's noteColor. */
export function noteFill(state: RenderState, hue: number, pitch: number, velocity: number): string {
  const t = state.template
  if (t && t.colour.mode === 'pitch') return t.colour.palette[((pitch % 12) + 12) % 12]
  return noteColor(hue, velocity, state.velocity)
}

/** True when a bar keeps the two-stop velocity gradient; false means one solid noteFill. */
export function barGradient(state: RenderState): boolean {
  const t = state.template
  return !t || (t.colour.mode === 'hand' && t.bars.shading === 'velocity')
}

type FlashRgb = { core: string; warm: string }
const pitchFlashCache = new WeakMap<object, FlashRgb[]>()

/** Per-pitch-class flash colours, built once per resolved template. */
function pitchFlash(t: NonNullable<RenderState['template']>): FlashRgb[] {
  let a = pitchFlashCache.get(t)
  if (!a) {
    a = t.colour.paletteRgb.map((warm, i) => ({ core: t.colour.paletteCoreRgb[i], warm }))
    pitchFlashCache.set(t, a)
  }
  return a
}
const themeFlash = new WeakMap<Theme, FlashRgb>()

/** The hit flash's two rgb triples. White tint (or no template) is the theme's own. */
export function flashRgb(state: RenderState, hue: number, pitch: number, velocity: number): FlashRgb {
  const t = state.template
  if (!t || t.flash.tint !== 'note') {
    let w = themeFlash.get(state.theme)
    if (!w) { w = { core: state.theme.flashCoreRgb, warm: state.theme.flashWarmRgb }; themeFlash.set(state.theme, w) }
    return w
  }
  if (t.colour.mode === 'pitch') {
    const i = ((pitch % 12) + 12) % 12
    return pitchFlash(t)[i]
  }
  const [r, g, b] = rgbOf(noteFill(state, hue, pitch, velocity))
  return {
    warm: `${r}, ${g}, ${b}`,
    core: `${Math.round((r + 255) / 2)}, ${Math.round((g + 255) / 2)}, ${Math.round((b + 255) / 2)}`,
  }
}

const lightStageCache = new WeakMap<Theme, boolean>()

/** True when the theme's stage is opaque and light (luma above half). Cached per theme. */
function lightStage(theme: Theme): boolean {
  let v = lightStageCache.get(theme)
  if (v === undefined) {
    if (isTransparent(theme.stageBg)) v = false
    else {
      // An unparseable colour (named, oklch...) counts as dark: keep 'lighter'.
      const c = parseRgb(theme.stageBg)
      v = c !== null && (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 > 0.5
    }
    lightStageCache.set(theme, v)
  }
  return v
}

/**
 * The hit flash's composite op. 'lighter' (additive) is today's look and only
 * reads on a dark stage: on a light one (chord-cards' #fbf8f1 paper) any flash,
 * however faint, adds past 255 and clamps to pure white, so the flash's beam
 * rectangle showed as a hard-edged white box above the keys. Under a template
 * on a light stage the flash paints 'source-over' instead, so its tint and
 * alpha fade over the paper. No template (and the classic template, which never
 * reaches here) keeps 'lighter' whatever the stage, so the default look is
 * pixel-identical; a transparent stage keeps 'lighter' too (OBS compositing).
 */
export function flashComposite(state: RenderState): GlobalCompositeOperation {
  return state.template && lightStage(state.theme) ? 'source-over' : 'lighter'
}
