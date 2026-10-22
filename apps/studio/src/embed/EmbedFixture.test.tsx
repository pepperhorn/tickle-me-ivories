import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EmbedFixture } from './EmbedFixture'

describe('embed fixture (spec §9)', () => {
  it('embeds every <Ivories view> preset', () => {
    const { container } = render(<EmbedFixture />)
    const shown = [...container.querySelectorAll<HTMLElement>('section.fixture-preset')].map((s) => s.dataset.preset)
    expect(shown).toEqual(['falling', 'keyboard', 'keyboard+notation', 'endless+falling', 'endless+keyboard'])
  })

  it('embeds the rising and horizontal cases after the presets', () => {
    const { container } = render(<EmbedFixture search="?rising" />)
    const cases = [...container.querySelectorAll<HTMLElement>('section.fixture-case')].map((s) => s.dataset.case)
    expect(cases).toEqual(['rising-live', 'rising-score', 'rising-horizontal'])
    expect(container.querySelector('section.fixture-case')!.previousElementSibling).toHaveProperty('dataset.preset', 'endless+keyboard')
  })

  it('keeps the default page to the presets; ?gm adds only the GM live case', () => {
    expect(render(<EmbedFixture search="" />).container.querySelectorAll('section.fixture-case')).toHaveLength(0)
    const gm = render(<EmbedFixture search="?gm" />).container
    expect([...gm.querySelectorAll<HTMLElement>('section.fixture-case')].map((s) => s.dataset.case)).toEqual(['gm-live'])
  })

  it('?only=<preset> renders just that preset', () => {
    const { container } = render(<EmbedFixture search="?only=keyboard%2Bnotation" />)
    expect([...container.querySelectorAll<HTMLElement>('section.fixture-preset')].map((s) => s.dataset.preset)).toEqual(['keyboard+notation'])
  })

  it('?sound-hosts renders only the sound-hosts case, no presets', () => {
    const { container } = render(<EmbedFixture search="?sound-hosts" />)
    expect(container.querySelectorAll('section.fixture-preset')).toHaveLength(0)
    expect([...container.querySelectorAll<HTMLElement>('section.fixture-case')].map((s) => s.dataset.case)).toEqual(['sound-hosts'])
  })
})
