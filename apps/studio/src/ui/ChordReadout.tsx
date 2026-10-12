import type { CSSProperties } from 'react'
import { textCss } from './StageText'
import type { KeyboardLayout } from '../render/geometry'
import type { ChordDisplay, TextSettings as TextSettingsType } from '../settings/types'

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

function position(
  placement: TextSettingsType['chordPlacement'], layout: KeyboardLayout, size: number,
): CSSProperties {
  switch (placement) {
    case 'stage-centre':
      return { left: '50%', top: `${size * 0.6}px`, transform: 'translateX(-50%)' }
    case 'above-keys':
      return { left: '50%', top: `${layout.hitY - size * 2.6}px`, transform: 'translateX(-50%)' }
    default:
      return { left: `${size * 0.6}px`, top: `${size * 0.6}px` }
  }
}

export function ChordReadout(props: {
  layout: KeyboardLayout | null
  value: ChordDisplayValue | null
  text: TextSettingsType
}) {
  const { layout, value, text } = props
  if (!layout || !value || text.chord === 'off') return null

  const body = chordDisplayText(value, text.chord)
  if (!body) return null

  const size = text.style.sizeRatio * layout.whiteW * 1.8
  const css = textCss(text.style, layout.whiteW * 1.8)

  return (
    <div
      id="chord-readout"
      className={`chord-readout chord-readout--${text.chordPlacement}`}
      data-symbol={value.symbol}
      data-numeral={value.numeral ?? ''}
      style={{
        ...css,
        position: 'absolute',
        pointerEvents: 'none', // F42: the overlay never intercepts the stage (§15)
        whiteSpace: 'pre', // keeps the two-space separator, and never wraps
        lineHeight: 1.1,
        ...position(text.chordPlacement, layout, size),
      }}
    >
      {body}
      {text.chordAlternates && value.alternates.length > 0 && (
        <div className="chord-alternates" style={{ fontSize: '0.5em', opacity: 0.7 }}>
          {value.alternates.join('  ·  ')}
        </div>
      )}
    </div>
  )
}
