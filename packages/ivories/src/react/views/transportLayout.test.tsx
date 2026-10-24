import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Transport } from './Transport'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'

const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 4, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

const css = readFileSync(resolve(import.meta.dirname, '../../style.css'), 'utf8')
/** The declarations of the first rule whose selector is exactly `sel`. */
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`)
  expect(i, sel).toBeGreaterThan(-1)
  return css.slice(i, css.indexOf('}', i))
}

describe('Transport row layout (design review 2026-10-22)', () => {
  it('every field reads label first, the metronome switch included', async () => {
    render(<IvoriesProvider score={doc()} clock={new AudioClock({ currentTime: 0 })} engine={fakeEngine()}><Transport /></IvoriesProvider>)
    const sw = await screen.findByRole('switch', { name: 'Metronome' })
    const field = sw.closest('.ivories-transport-field')!
    expect(field.firstElementChild!.classList.contains('ivories-transport-label')).toBe(true)
    expect(field.lastElementChild).toBe(sw)
    const select = screen.getByLabelText('Count-in')
    expect(select.previousElementSibling!.classList.contains('ivories-transport-label')).toBe(true)
  })

  it('the metronome is a styled switch and the count-in a styled select, never the native controls', () => {
    expect(rule('.ivories .ivories-transport-switch')).toMatch(/appearance: none/)
    expect(rule('.ivories .ivories-transport-select')).toMatch(/appearance: none/)
  })

  it('controls share one height token; touch pointers get 40px', () => {
    for (const sel of ['.ivories .ivories-btn', '.ivories .ivories-transport-field', '.ivories .ivories-transport-range']) {
      expect(rule(sel)).toMatch(/var\(--ivories-transport-control-h, 2rem\)/)
    }
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.ivories\.ivories-transport \{ --ivories-transport-control-h: 2\.5rem;/)
  })
})
