import { Note } from 'tonal'
import { pitchClassName } from '../music/spell'
import type { KeyContext } from '../music/spell'
import type { NoteEvent } from '../model/types'
import type { Orientation } from '../layout/types'
import type { BarLabelStyle } from '../template/types'

/**
 * What a falling/rising note bar says (user ruling 2026-10-22): its pitch name
 * ("C", "F♯", "B♭") by default, the name with its octave, or nothing. Never a
 * MIDI number.
 */
export type NoteBarLabels = 'pitch' | 'pitch-octave' | 'none'

export const DEFAULT_NOTE_BAR_LABELS: NoteBarLabels = 'pitch'

export function noteBarLabelsOf(v: unknown): NoteBarLabels {
  return v === 'pitch' || v === 'pitch-octave' || v === 'none' ? v : DEFAULT_NOTE_BAR_LABELS
}

/** tonal's ASCII accidentals as music glyphs: "F#" -> "F♯", "Bb" -> "B♭", "C##" -> "C𝄪". */
export function displayAccidentals(name: string): string {
  if (name.length < 2) return name
  return name[0] + name.slice(1).replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/bb/g, '𝄫').replace(/b/g, '♭')
}

export const SOLFEGE: Record<string, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' }

/**
 * A note's bar label: the spelling written in the score when the MusicXML gave
 * one, else the key's spelling (sharps in a sharp or natural key, flats in a
 * flat key), else sharps. The octave belongs to the letter (Cb4 is MIDI 59).
 * Order: spelling, letter (solfege or not), accidentals, case (letter part
 * only), octave.
 */
export function noteBarLabel(n: Pick<NoteEvent, 'pitch' | 'spelling'>, key: KeyContext, mode: NoteBarLabels | BarLabelStyle): string | null {
  const style = typeof mode === 'string' ? null : mode
  if (style ? !style.show : mode === 'none') return null
  const format = style ? style.format : (mode as NoteBarLabels)
  const name = n.spelling && Note.chroma(n.spelling) === ((n.pitch % 12) + 12) % 12 ? n.spelling : pitchClassName(n.pitch, key)
  const solfege = format === 'solfege' || format === 'solfege-octave'
  const withOctave = format === 'pitch-octave' || format === 'solfege-octave'
  let letter = solfege ? SOLFEGE[name[0]] ?? name[0] : name[0]
  if (style?.font.case === 'lower') letter = letter.toLowerCase()
  const acc = name.slice(1)
  let text = letter + (style?.accidentals === 'ascii' ? acc : displayAccidentals(name).slice(1))
  if (withOctave) {
    const base = Math.floor(n.pitch / 12) - 1
    let oct = base
    for (const o of [base, base + 1, base - 1]) {
      if (Note.midi(`${name}${o}`) === n.pitch) { oct = o; break }
    }
    text += oct
  }
  return text
}

/**
 * Labels by note object for one (key, mode): a score's notes are stable
 * objects, so after the first frame a label costs a WeakMap read, not a tonal
 * call and a string per bar per frame.
 */
export class NoteBarLabelCache {
  private key: KeyContext | null = null
  private mode: NoteBarLabels | BarLabelStyle = 'none'
  private map = new WeakMap<object, string | null>()

  get(n: NoteEvent, key: KeyContext, mode: NoteBarLabels | BarLabelStyle): string | null {
    if (mode === 'none') return null
    if (key !== this.key || mode !== this.mode) {
      this.key = key
      this.mode = mode
      this.map = new WeakMap()
    }
    let v = this.map.get(n)
    if (v === undefined) {
      v = noteBarLabel(n, key, mode)
      this.map.set(n, v)
    }
    return v
  }
}

/** Below this the text is not legible, so the label is left off. */
export const MIN_LABEL_PX = 7
export const MAX_LABEL_PX = 20
/** Rough Poppins 600 advance per character, in em (measureText per frame is avoidable). */
const CHAR_EM = 0.62

/**
 * The font size for a label on a bar, or 0 when it would not fit legibly.
 * `across` is the bar's width across the key, `along` its visible length.
 * Vertical: the text runs across the bar; horizontal (screen-upright text on a
 * bar lying along x): it runs along it, and the bar's thickness caps its height.
 */
export function barLabelPx(text: string, across: number, along: number, orientation: Orientation | undefined, scale = 1): number {
  const px = Math.min(MAX_LABEL_PX, across * 0.7) * scale
  if (px < MIN_LABEL_PX) return 0
  const width = [...text].length * CHAR_EM * px
  const run = orientation === 'horizontal' ? along : across * 1.15
  const room = orientation === 'horizontal' ? across : along
  if (width > run - 2 || px > room - 2) return 0
  return px
}

/** How a label is painted. The default is the house note-text style. */
export interface BarLabelPaint {
  family: string // CSS font-family list
  weight: number
  scale: number
  color: string
  strokeColor: string
  strokeWidth: number
}

export const DEFAULT_BAR_LABEL_PAINT: BarLabelPaint = {
  family: 'Poppins, sans-serif', weight: 600, scale: 1, color: '#ffffff', strokeColor: 'rgba(0, 0, 0, 0.35)', strokeWidth: 3,
}

/**
 * Draws one label centred at canonical (cx, cy), upright on screen in either
 * orientation, in the house note-text style: white Poppins 600 over a dark
 * translucent outline, outline painted first (canvas has no paint-order).
 */
export function drawBarLabel(
  ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, orientation: Orientation | undefined,
  paint: BarLabelPaint = DEFAULT_BAR_LABEL_PAINT,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  // The horizontal map is a reflection, its own inverse: undoing it locally keeps text upright.
  if (orientation === 'horizontal') ctx.transform(0, -1, -1, 0, 0, 0)
  ctx.font = `${paint.weight} ${px.toFixed(1)}px ${paint.family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  if (paint.strokeWidth !== 0) {
    ctx.lineWidth = Math.min(paint.strokeWidth, px / 4)
    ctx.strokeStyle = paint.strokeColor
    ctx.strokeText(text, 0, 0)
  }
  ctx.fillStyle = paint.color
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
