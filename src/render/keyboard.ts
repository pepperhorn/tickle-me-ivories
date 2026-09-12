import { noteColor } from './colors'
import type { KeyboardLayout } from './geometry'
import type { NoteEvent, Voice } from '../model/types'

const WHITE_FILL = '#f6f2e4'
const BLACK_FILL = '#0c0c10'
const MIDDLE_C = 60
// Below this whiteW the "C4" label would render as illegible mush -- skip it
// entirely rather than draw noise at phone scale.
const MIN_WHITE_W_FOR_LABEL = 14

export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  voices: Map<string, Voice>,
  held: Map<number, NoteEvent>,
): void {
  const { hitY, keyboardH, blackH } = layout

  for (const k of layout.keys) {
    if (k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    ctx.fillStyle = h && v ? noteColor(v.hue, h.velocity) : WHITE_FILL
    ctx.fillRect(k.x, hitY, k.w - 1, keyboardH)

    // Middle C carries a dark border and a "C4" label so orientation
    // survives phone scale, where 88 keys means ~16px per white key.
    if (k.pitch === MIDDLE_C) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(k.x, hitY, 1.5, keyboardH)
      ctx.fillRect(k.x + k.w - 2.5, hitY, 1.5, keyboardH)

      if (layout.whiteW >= MIN_WHITE_W_FOR_LABEL) {
        ctx.save()
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.font = `600 ${Math.round(layout.whiteW * 0.42)}px Poppins, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText('C4', k.x + k.w / 2, hitY + keyboardH - layout.whiteW * 0.3)
        ctx.restore()
      }
    }
  }

  for (const k of layout.keys) {
    if (!k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    ctx.fillStyle = h && v ? noteColor(v.hue, h.velocity) : BLACK_FILL
    ctx.fillRect(k.x, hitY, k.w, blackH)
    if (h) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillRect(k.x, hitY, k.w, 2)
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.16)'
  ctx.fillRect(0, hitY, layout.whiteW * 52, 1)
}
