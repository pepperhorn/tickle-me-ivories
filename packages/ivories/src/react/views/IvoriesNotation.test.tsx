import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, waitFor } from '@testing-library/react'
import { Ivories } from './Ivories'
import { fakeEngine } from '../testEngine.test-helpers'

vi.mock('pepperscore', () => ({ PepperScore: (p: { view?: string }) => <div data-testid="pepperscore" data-view={p.view} /> }))

const xml = readFileSync(join(__dirname, '../../core/io/__fixtures__/clock-contract.musicxml'), 'utf8')

describe('notation presets (spec §4)', () => {
  it.each([
    ['keyboard+notation', 'vertical', '.ivories-keyboard'],
    ['endless+falling', 'endless', '.ivories-falling'],
    ['endless+keyboard', 'endless', '.ivories-keyboard'],
  ] as const)('%s: pepperscore (%s) above the keys', async (view, pepView, keys) => {
    const { container, getByTestId } = render(<Ivories view={view} musicXml={xml} engine={fakeEngine()} />)
    await waitFor(() => expect(getByTestId('pepperscore').dataset.view).toBe(pepView))
    expect(container.querySelector(`.ivories-preset-main ${keys}`)).not.toBeNull()
    expect(container.querySelector('.ivories-preset-notation .ivories-notation')).not.toBeNull()
  })
})

describe('notationTheme (0.1.1)', () => {
  it('defaults to the paper card', async () => {
    const { container, getByTestId } = render(<Ivories view="keyboard+notation" musicXml={xml} engine={fakeEngine()} />)
    await waitFor(() => getByTestId('pepperscore'))
    const n = container.querySelector<HTMLElement>('.ivories-preset-notation .ivories-notation')!
    expect(n.classList.contains('ivories-notation-paper')).toBe(true)
    expect(n.dataset.notationTheme).toBe('paper')
  })

  it('forwards ink-on-dark from the preset to <Notation>', async () => {
    const { container, getByTestId } = render(<Ivories view="endless+keyboard" notationTheme="ink-on-dark" musicXml={xml} engine={fakeEngine()} />)
    await waitFor(() => getByTestId('pepperscore'))
    const n = container.querySelector<HTMLElement>('.ivories-notation')!
    expect(n.classList.contains('ivories-notation-ink-on-dark')).toBe(true)
    expect(n.classList.contains('ivories-notation-paper')).toBe(false)
    expect(n.dataset.notationTheme).toBe('ink-on-dark')
  })
})
