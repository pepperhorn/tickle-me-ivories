import type { Page } from './fixtures'

interface FakeMidi { noteOn(midi: number, velocity?: number): void; noteOff(midi: number): void; bound(): boolean }
declare global { interface Window { __fakeMidi?: FakeMidi } }

/**
 * Replaces Web MIDI before any page script runs: one input, "Fake Keys",
 * driven from the test. Matches what MidiInput reads (inputs.forEach,
 * onstatechange, port.onmidimessage with data + timeStamp).
 */
export async function installFakeMidi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Handler = (e: { data: Uint8Array; timeStamp: number }) => void
    const port = { id: 'fake-keys', name: 'Fake Keys', type: 'input', state: 'connected', onmidimessage: null as Handler | null }
    const access = { inputs: new Map([[port.id, port]]), outputs: new Map(), onstatechange: null as unknown, sysexEnabled: false }
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) })
    const send = (bytes: number[]) => port.onmidimessage?.({ data: Uint8Array.from(bytes), timeStamp: performance.now() })
    window.__fakeMidi = {
      noteOn: (m, v = 100) => send([0x90, m, v]),
      noteOff: (m) => send([0x80, m, 0]),
      bound: () => port.onmidimessage !== null,
    }
  })
}

export const midiBound = (page: Page) => page.evaluate(() => window.__fakeMidi?.bound() ?? false)
export const noteOn = (page: Page, midi: number, velocity = 100) =>
  page.evaluate(([m, v]) => window.__fakeMidi!.noteOn(m, v), [midi, velocity] as const)
export const noteOff = (page: Page, midi: number) => page.evaluate((m) => window.__fakeMidi!.noteOff(m), midi)
