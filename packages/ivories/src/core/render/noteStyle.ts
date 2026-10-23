import { noteColor, rgbOf } from './colors'
import type { RenderState } from './pianoRoll'
import type { Theme } from './theme'

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
