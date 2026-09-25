import { describe, it, expect, beforeEach } from 'vitest'
import { ensureGoogleFont } from './googleFont'

const links = () => [...document.head.querySelectorAll('link[data-google-font]')]

describe('ensureGoogleFont', () => {
  beforeEach(() => { document.head.innerHTML = '' })

  it('injects one stylesheet link for a family', () => {
    ensureGoogleFont('Inter')
    expect(links()).toHaveLength(1)
    expect(links()[0].getAttribute('href')).toContain('family=Inter')
  })

  it('is idempotent -- asking twice does not duplicate the link', () => {
    ensureGoogleFont('Inter')
    ensureGoogleFont('Inter')
    expect(links()).toHaveLength(1)
  })

  it('adds a second link for a different family', () => {
    ensureGoogleFont('Inter')
    ensureGoogleFont('Space Grotesk')
    expect(links()).toHaveLength(2)
  })

  it('URL-encodes a multi-word family name', () => {
    ensureGoogleFont('Space Grotesk')
    expect(links()[0].getAttribute('href')).toContain('family=Space+Grotesk')
  })

  it('requests the weights it is given', () => {
    ensureGoogleFont('Inter', [300, 700])
    expect(links()[0].getAttribute('href')).toContain('wght@300;700')
  })

  it('ignores an empty family rather than requesting a broken URL', () => {
    ensureGoogleFont('   ')
    expect(links()).toHaveLength(0)
  })

  // F36: the id is keyed on family AND weights, or a weight change never loads.
  it('loads a new weight of a family it already requested', () => {
    ensureGoogleFont('Inter', [400])
    ensureGoogleFont('Inter', [800])
    expect(links()).toHaveLength(2)
    expect(links()[1].getAttribute('href')).toContain('wght@800')
  })

  // F36: Google answers an unavailable weight with an error, not a fallback.
  it('retries once without the weight axis when the stylesheet fails to load', () => {
    ensureGoogleFont('Bebas Neue', [900])
    const link = links()[0] as HTMLLinkElement
    link.dispatchEvent(new Event('error'))
    const href = link.getAttribute('href')!
    expect(href).toContain('family=Bebas+Neue')
    expect(href).not.toContain(':wght@')
    link.dispatchEvent(new Event('error'))
    expect(link.getAttribute('href')).toBe(href)
    expect(links()).toHaveLength(1)
  })
})
