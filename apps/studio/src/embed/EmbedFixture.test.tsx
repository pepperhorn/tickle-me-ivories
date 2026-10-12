import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EmbedFixture } from './EmbedFixture'

describe('embed fixture (spec §9)', () => {
  it('embeds every <Ivories view> preset', () => {
    const { container } = render(<EmbedFixture />)
    const shown = [...container.querySelectorAll<HTMLElement>('section.fixture-preset')].map((s) => s.dataset.preset)
    expect(shown).toEqual(['falling', 'keyboard', 'keyboard+notation', 'endless+falling', 'endless+keyboard'])
  })
})
