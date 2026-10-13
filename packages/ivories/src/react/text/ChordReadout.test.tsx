import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ChordReadout, chordDisplayText, chordPosition } from './ChordReadout'
import { computeLayout } from '../../core/render/geometry'
import { DEFAULT_SETTINGS } from '../../core/settings/types'

const layout = computeLayout(1220, 700)
const text = (patch = {}) => ({ ...DEFAULT_SETTINGS.text, ...patch })
const value = { symbol: 'Cmaj7', numeral: 'Imaj7', alternates: ['Em7/C'] }

describe('chordDisplayText', () => {
  it('shows the symbol alone', () => {
    expect(chordDisplayText(value, 'symbol')).toBe('Cmaj7')
  })

  it('shows the numeral alone', () => {
    expect(chordDisplayText(value, 'numeral')).toBe('Imaj7')
  })

  it('shows both, symbol first', () => {
    expect(chordDisplayText(value, 'both')).toBe('Cmaj7  Imaj7')
  })

  it('falls back to the symbol when no numeral could be derived', () => {
    expect(chordDisplayText({ ...value, numeral: null }, 'numeral')).toBe('Cmaj7')
    expect(chordDisplayText({ ...value, numeral: null }, 'both')).toBe('Cmaj7')
  })

  it('shows nothing when the readout is off', () => {
    expect(chordDisplayText(value, 'off')).toBe('')
  })
})

describe('ChordReadout', () => {
  it('renders the spec’s markup, with the symbol as a data attribute', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol' })} />,
    )
    const el = container.querySelector('.ivories-chord-readout')!
    expect(el.className).toContain('ivories-chord-readout')
    expect(el.getAttribute('data-symbol')).toBe('Cmaj7')
    expect(el.textContent).toContain('Cmaj7')
  })

  it('never swallows pointer events (F42)', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol' })} />,
    )
    expect((container.querySelector('.ivories-chord-readout') as HTMLElement).style.pointerEvents).toBe('none')
  })

  it('renders nothing when the readout is off', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'off' })} />,
    )
    expect(container.querySelector('.ivories-chord-readout')).toBeNull()
  })

  it('renders nothing before a chord has been identified', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={null} text={text({ chord: 'symbol' })} />,
    )
    expect(container.querySelector('.ivories-chord-readout')).toBeNull()
  })

  it('shows alternates only when they are switched on', () => {
    const off = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol' })} />,
    )
    expect(off.container.querySelector('.ivories-chord-alternates')).toBeNull()

    const on = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol', chordAlternates: true })} />,
    )
    expect(on.container.querySelector('.ivories-chord-alternates')!.textContent).toContain('Em7/C')
  })

  it('carries a placement modifier class so a stylesheet can move it', () => {
    const { container } = render(
      <ChordReadout layout={layout} value={value} text={text({ chord: 'symbol', chordPlacement: 'above-keys' })} />,
    )
    expect(container.querySelector('.ivories-chord-readout')!.className).toContain('ivories-chord-readout--above-keys')
  })
})

describe('chordPosition (R-H)', () => {
  const layout = computeLayout(400, 1000)

  it('vertical above-keys is unchanged', () => {
    expect(chordPosition('above-keys', layout, 20)).toEqual({ left: '50%', top: `${layout.hitY - 52}px`, transform: 'translateX(-50%)' })
  })

  it('horizontal keeps the readout off the keyboard on the left', () => {
    expect(chordPosition('above-keys', layout, 20, 'horizontal')).toEqual({
      left: `${layout.keyboardH + 12}px`, top: '50%', transform: 'translateY(-50%)',
    })
    expect(chordPosition('stage-left', layout, 20, 'horizontal')).toEqual({ left: `${layout.keyboardH + 12}px`, top: '12px' })
  })
})
