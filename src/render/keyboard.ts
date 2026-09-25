import { noteColor } from './colors'
import { roundRect } from './shapes'
import type { NoteEvent } from '../model/types'
import type { RenderState } from './pianoRoll'

const MIDDLE_C = 60
// Below this whiteW the "C4" label would render as illegible mush -- skip it
// entirely rather than draw noise at phone scale.
const MIN_WHITE_W_FOR_LABEL = 14

export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  held: Map<number, NoteEvent>,
): void {
  const { layout, voices, theme } = state
  const { hitY, keyboardH, blackH } = layout

  for (const k of layout.keys) {
    if (k.black) continue
    const h = held.get(k.pitch)
    const v = h ? voices.get(h.voiceId) : undefined
    ctx.fillStyle = h && v ? noteColor(v.hue, h.velocity, state.velocity) : theme.keyWhite
    roundRect(ctx, k.x, hitY, Math.max(1, k.w - theme.keyGap), keyboardH, theme.keyRadius)

    // Middle C carries a dark border and a "C4" label so orientation
    // survives phone scale, where 88 keys means ~16px per white key.
    if (k.pitch === MIDDLE_C && state.showMiddleC) {
      ctx.fillStyle = theme.middleCMark
      ctx.fillRect(k.x, hitY, 1.5, keyboardH)
      ctx.fillRect(k.x + k.w - 2.5, hitY, 1.5, keyboardH)

      if (layout.whiteW >= MIN_WHITE_W_FOR_LABEL) {
        ctx.save()
        ctx.fillStyle = theme.middleCMark
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
    ctx.fillStyle = h && v ? noteColor(v.hue, h.velocity, state.velocity) : theme.keyBlack
    roundRect(ctx, k.x, hitY, k.w, blackH, theme.keyRadius)
    if (h) {
      ctx.fillStyle = theme.blackKeyTop
      ctx.fillRect(k.x, hitY, k.w, 2)
    }
  }

  ctx.fillStyle = theme.keyBorder
  ctx.fillRect(0, hitY, layout.stageW, theme.keyBorderWidth)
}
