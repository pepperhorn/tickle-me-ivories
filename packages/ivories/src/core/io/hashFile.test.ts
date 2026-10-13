import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Midi } from '@tonejs/midi'
import { hashFile, sha256Hex } from './hashFile'

const enc = (s: string) => new TextEncoder().encode(s)

// NIST/well-known SHA-256 test vectors.
const EMPTY_SHA256 = createHash('sha256').update('').digest('hex')
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

/** A one-track MIDI file built in memory, used as a realistic (non-text) vector. */
function midiBytes(): ArrayBuffer {
  const midi = new Midi()
  midi.header.setTempo(120)
  const track = midi.addTrack()
  track.name = 'Piano'
  track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 })
  return midi.toArray().buffer as ArrayBuffer
}

describe('sha256Hex: known vectors (native crypto.subtle path)', () => {
  it('hashes the empty string', async () => {
    expect(await sha256Hex(enc(''))).toBe(EMPTY_SHA256)
  })

  it('hashes "abc"', async () => {
    expect(await sha256Hex(enc('abc'))).toBe(ABC_SHA256)
  })

  it('hashes a MIDI fixture, matching an independent oracle (node:crypto)', async () => {
    const bytes = midiBytes()
    const expected = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
    expect(await sha256Hex(bytes)).toBe(expected)
  })

  it('hashFile delegates to sha256Hex', async () => {
    const bytes = enc('abc').buffer
    expect(await hashFile(bytes as ArrayBuffer)).toBe(ABC_SHA256)
  })
})

describe('sha256Hex: pure-JS fallback (crypto.subtle undefined, e.g. insecure origin)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('produces byte-identical hex to the subtle path for the empty string, "abc" and a MIDI fixture', async () => {
    const cases: (Uint8Array | ArrayBuffer)[] = [enc(''), enc('abc'), midiBytes()]
    const expectedHexes = await Promise.all(cases.map((b) => sha256Hex(b)))

    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    expect(globalThis.crypto.subtle).toBeUndefined()

    const fallbackHexes = await Promise.all(cases.map((b) => sha256Hex(b)))
    expect(fallbackHexes).toEqual(expectedHexes)
    expect(fallbackHexes[0]).toBe(EMPTY_SHA256)
    expect(fallbackHexes[1]).toBe(ABC_SHA256)
  })
})

// A real user file (spec: gitignored under local-fixtures/, not committed).
// Skips cleanly in CI/other checkouts where the file is absent.
const FIXTURE = join(__dirname, '../../../../../local-fixtures/11_Oclock_Tick_Tock_U2.mid')

describe.skipIf(!existsSync(FIXTURE))('sha256Hex: real MIDI fixture on disk', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('parses cleanly and hashes identically via crypto.subtle and the pure-JS fallback', async () => {
    const bytes = readFileSync(FIXTURE)
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

    const midi = new Midi(bytes)
    // eslint-disable-next-line no-console
    console.log(
      `fixture: ${midi.tracks.length} track(s), ` +
      `${midi.tracks.reduce((n, t) => n + t.notes.length, 0)} note(s) total`,
    )
    expect(midi.tracks.length).toBeGreaterThan(0)

    const subtleHex = await sha256Hex(arrayBuffer)
    const nodeHex = createHash('sha256').update(bytes).digest('hex')
    expect(subtleHex).toBe(nodeHex)
    // eslint-disable-next-line no-console
    console.log(`fixture sha256: ${subtleHex}`)

    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    expect(globalThis.crypto.subtle).toBeUndefined()
    const fallbackHex = await sha256Hex(arrayBuffer)
    expect(fallbackHex).toBe(subtleHex)
  })
})
