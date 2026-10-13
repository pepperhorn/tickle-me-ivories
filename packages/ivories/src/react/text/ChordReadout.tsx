import type { CSSProperties } from 'react'
import { textCss } from './StageText'
import type { KeyboardLayout } from '../../core/render/geometry'
import type { ChordDisplay, TextSettings as TextSettingsType } from '../../core/settings/types'
import type { Orientation } from '../../core/layout/types'

export interface ChordDisplayValue {
  symbol: string
  numeral: string | null
  alternates: string[]
}

/** The numeral can legitimately be null -- tonal cannot name every chord against
    every key -- so every mode degrades to the symbol rather than to nothing. */
export function chordDisplayText(v: ChordDisplayValue, mode: ChordDisplay): string {
  switch (mode) {
    case 'symbol': return v.symbol
    case 'numeral': return v.numeral ?? v.symbol
    case 'both': return v.numeral ? `${v.symbol}  ${v.numeral}` : v.symbol
    default: return ''
  }
}

export function chordPosition(
  placement: TextSettingsType['chordPlacement'], layout: KeyboardLayout, size: number,
  orientation?: Orientation,
): CSSProperties {
  if (orientation === 'horizontal') {
    // The keyboard occupies the left keyboardH pixels: keep the readout on the stage.
    const left = `${layout.keyboardH + size * 0.6}px`
    switch (placement) {
      case 'stage-centre':
        return { left: `calc(${layout.keyboardH}px + (100% - ${layout.keyboardH}px) / 2)`, top: `${size * 0.6}px`, transform: 'translateX(-50%)' }
      case 'above-keys':
        return { left, top: '50%', transform: 'translateY(-50%)' }
      default:
        return { left, top: `${size * 0.6}px` }
    }
  }
  switch (placement) {
    case 'stage-centre':
      return { left: '50%', top: `${size * 0.6}px`, transform: 'translateX(-50%)' }
    case 'above-keys': {
      // No room above the keys (keyboard-only view filling its stage): sit at
      // the top of the stage rather than off it.
      const top = layout.hitY - size * 2.6
      return { left: '50%', top: `${top >= 0 ? top : size * 0.6}px`, transform: 'translateX(-50%)' }
    }
    default:
      return { left: `${size * 0.6}px`, top: `${size * 0.6}px` }
  }
}

export function ChordReadout(props: {
  layout: KeyboardLayout | null
  value: ChordDisplayValue | null
  text: TextSettingsType
  orientation?: Orientation
}) {
  const { layout, value, text, orientation } = props
  if (!layout || !value || text.chord === 'off') return null

  const body = chordDisplayText(value, text.chord)
  if (!body) return null

  const size = text.style.sizeRatio * layout.whiteW * 1.8
  const css = textCss(text.style, layout.whiteW * 1.8)

  return (
    <div
      className={`ivories-chord-readout ivories-chord-readout--${text.chordPlacement}`}
      data-symbol={value.symbol}
      data-numeral={value.numeral ?? ''}
      style={{
        ...css,
        position: 'absolute',
        pointerEvents: 'none', // F42: the overlay never intercepts the stage (§15)
        whiteSpace: 'pre', // keeps the two-space separator, and never wraps
        lineHeight: 1.1,
        ...chordPosition(text.chordPlacement, layout, size, orientation),
      }}
    >
      {body}
      {text.chordAlternates && value.alternates.length > 0 && (
        <div className="ivories-chord-alternates" style={{ fontSize: '0.5em', opacity: 0.7 }}>
          {value.alternates.join('  ·  ')}
        </div>
      )}
    </div>
  )
}
