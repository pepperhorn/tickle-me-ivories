import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { StageText, labelText, samePitches, textCss } from './StageText'
import { computeLayout } from '../render/geometry'
import { DEFAULT_SETTINGS } from '../settings/types'
import { DEFAULT_KEY } from '../music/spell'
import type { TextSettings } from '../settings/types'

const layout = computeLayout(1220, 700)
const text = (patch: Partial<TextSettings> = {}): TextSettings => ({ ...DEFAULT_SETTINGS.text, ...patch })

describe('labelText', () => {
  it('renders the pitch name, spelled for the key', () => {
    expect(labelText(63, 'pitch', DEFAULT_KEY)).toBe('D#4')
    expect(labelText(63, 'pitch', { tonic: 'Ab', scale: 'major' })).toBe('Eb4')
  })

  it('renders the MIDI number', () => {
    expect(labelText(60, 'midi', DEFAULT_KEY)).toBe('60')
  })

  it('renders both, separated', () => {
    expect(labelText(60, 'both', DEFAULT_KEY)).toBe('C4 · 60')
  })

  it('renders nothing when labels are off', () => {
    expect(labelText(60, 'off', DEFAULT_KEY)).toBe('')
  })
})

describe('samePitches', () => {
  const held = (...p: number[]) => new Map(p.map((x) => [x, null]))

  it('is true for the same set in any order', () => {
    expect(samePitches(held(60, 64), [64, 60])).toBe(true)
    expect(samePitches(held(), [])).toBe(true)
  })

  it('is false when a pitch is added, removed or swapped', () => {
    expect(samePitches(held(60, 64, 67), [60, 64])).toBe(false)
    expect(samePitches(held(60), [60, 64])).toBe(false)
    expect(samePitches(held(60, 65), [60, 64])).toBe(false)
  })
})

describe('textCss', () => {
  it('scales the font size with white-key width, not with the viewport', () => {
    const a = textCss(DEFAULT_SETTINGS.text.style, 20)
    const b = textCss(DEFAULT_SETTINGS.text.style, 40)
    expect(Number.parseFloat(String(b.fontSize))).toBeCloseTo(Number.parseFloat(String(a.fontSize)) * 2, 6)
  })

  it('applies the dark stroke under the fill, per the house note-text style', () => {
    const css = textCss(DEFAULT_SETTINGS.text.style, 20) as Record<string, string>
    expect(css.WebkitTextStroke).toBe('3px rgba(0,0,0,0.35)')
    expect(css.paintOrder).toBe('stroke fill')
  })

  it('omits the stroke entirely at width 0, for a known flat background', () => {
    const css = textCss({ ...DEFAULT_SETTINGS.text.style, strokeWidth: 0 }, 20) as Record<string, string>
    expect(css.WebkitTextStroke).toBeUndefined()
  })
})

describe('StageText', () => {
  it('renders one labelled span per sounding pitch, with per-pitch ids', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[60, 63]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelectorAll('.note-label')).toHaveLength(2)
    const c4 = container.querySelector('#note-label-60')!
    expect(c4.getAttribute('data-pitch')).toBe('C4')
    expect(c4.getAttribute('data-midi')).toBe('60')
    expect(c4.textContent).toBe('C4')
  })

  it('marks black and white keys with different modifier classes', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[60, 61]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelector('#note-label-60')!.className).toContain('note-label--white')
    expect(container.querySelector('#note-label-61')!.className).toContain('note-label--black')
  })

  it('renders nothing at all when labels are off', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[60]} text={text({ labels: 'off' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelectorAll('.note-label')).toHaveLength(0)
  })

  it('skips a pitch that is not on the current (zoomed) keyboard', () => {
    const narrow = computeLayout(1220, 700, { firstPitch: 60, lastPitch: 71 })
    const { container } = render(
      <StageText layout={narrow} pitches={[48, 60]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelectorAll('.note-label')).toHaveLength(1)
  })

  it('centres each label over its key', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[61]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    const k = layout.byPitch.get(61)!
    const el = container.querySelector('#note-label-61') as HTMLElement
    expect(Number.parseFloat(el.style.left)).toBeCloseTo(k.x + k.w / 2, 6)
  })

  it('puts "above" labels in the stage and "below" labels over the key face', () => {
    const at = (placement: 'above' | 'below') => {
      const { container, unmount } = render(
        <StageText layout={layout} pitches={[60]} text={text({ labels: 'pitch', labelPlacement: placement })} keyContext={DEFAULT_KEY} />,
      )
      const top = Number.parseFloat((container.querySelector('#note-label-60') as HTMLElement).style.top)
      unmount() // ids are document-unique; a second mount would shadow this one
      return top
    }
    expect(at('above')).toBeLessThan(layout.hitY)
    const below = at('below')
    expect(below).toBeGreaterThan(layout.hitY)
    expect(below).toBeLessThan(layout.hitY + layout.keyboardH)
  })

  it('does not swallow clicks aimed at the canvas beneath it', () => {
    const { container } = render(
      <StageText layout={layout} pitches={[60]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect((container.querySelector('.stage-text') as HTMLElement).style.pointerEvents).toBe('none')
  })

  it('renders nothing rather than throwing before the first layout exists', () => {
    const { container } = render(
      <StageText layout={null} pitches={[60]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />,
    )
    expect(container.querySelectorAll('.note-label')).toHaveLength(0)
  })
})

// F37: a CDN request for a font nobody sees breaks offline use; Poppins is
// already self-hosted.
describe('StageText font loading', () => {
  const links = () => document.head.querySelectorAll('link[data-google-font]')
  const inter = { ...DEFAULT_SETTINGS.text.style, family: 'Inter' }
  beforeEach(() => { document.head.innerHTML = '' })

  it('requests the chosen family when labels are on', () => {
    render(<StageText layout={layout} pitches={[]} text={text({ labels: 'pitch', style: inter })} keyContext={DEFAULT_KEY} />)
    expect(links()).toHaveLength(1)
  })

  it('requests nothing when labels and chord are both off', () => {
    render(<StageText layout={layout} pitches={[]} text={text({ labels: 'off', chord: 'off', style: inter })} keyContext={DEFAULT_KEY} />)
    expect(links()).toHaveLength(0)
  })

  it('still requests the family when only the chord readout is on', () => {
    render(<StageText layout={layout} pitches={[]} text={text({ labels: 'off', chord: 'symbol', style: inter })} keyContext={DEFAULT_KEY} />)
    expect(links()).toHaveLength(1)
  })

  it('never fetches Poppins from the CDN -- it is self-hosted', () => {
    render(<StageText layout={layout} pitches={[]} text={text({ labels: 'pitch' })} keyContext={DEFAULT_KEY} />)
    expect(links()).toHaveLength(0)
  })
})
