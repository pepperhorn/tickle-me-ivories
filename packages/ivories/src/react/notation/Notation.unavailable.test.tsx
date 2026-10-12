import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { Notation } from './Notation'
import { Keyboard } from '../views/Keyboard'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMusicXml } from '../../core/io/parseMusicXml'
import { fakeEngine } from '../testEngine.test-helpers'
import { resetPepperscoreCache } from './loadPepperscore'

// The real loader runs against a pepperscore module that throws on import.
vi.mock('pepperscore', () => { throw new Error('pepperscore is not installed') })

const xml = readFileSync(join(__dirname, '../../core/io/__fixtures__/clock-contract.musicxml'), 'utf8')

describe('Notation without pepperscore (spec §4.3, §8)', () => {
  beforeEach(() => resetPepperscoreCache())

  it('shows an error and reports notation-unavailable while sibling views keep running', async () => {
    const onError = vi.fn()
    const { container } = render(
      <IvoriesProvider score={parseMusicXml(xml, 'c.musicxml', { mode: 'scale', scale: 1 })} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}>
        <Notation />
        <Keyboard />
      </IvoriesProvider>,
    )
    expect((await screen.findByRole('alert')).textContent).toMatch(/pepperscore 0.2/)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'notation-unavailable' }))
    expect(container.querySelector('.ivories-keyboard')).not.toBeNull()
  })
})
