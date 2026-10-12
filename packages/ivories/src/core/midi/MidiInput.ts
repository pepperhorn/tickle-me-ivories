import { IvoriesError } from '../errors'
import type { LiveNote } from './types'

export type MidiMessage =
  | { type: 'on'; note: number; velocity: number }
  | { type: 'off'; note: number }
  | { type: 'sustain'; down: boolean }

/** Note on/off on any channel (velocity 0 = off) and CC64 (sustain). */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiMessage | null {
  if (!data || data.length < 3) return null
  const status = data[0] & 0xf0
  if (status === 0x90) return data[2] > 0 ? { type: 'on', note: data[1], velocity: data[2] } : { type: 'off', note: data[1] }
  if (status === 0x80) return { type: 'off', note: data[1] }
  if (status === 0xb0 && data[1] === 64) return { type: 'sustain', down: data[2] >= 64 }
  return null
}

export interface MidiNoteEvent extends LiveNote { on: boolean }

export interface MidiPortLike {
  id: string
  name?: string | null
  state?: string
  onmidimessage: ((e: { data: Uint8Array | null; timeStamp?: number }) => void) | null
}

export interface MidiAccessLike {
  inputs: { forEach(cb: (port: MidiPortLike) => void): void }
  onstatechange: ((e: { port: { id: string; type?: string; state?: string } }) => void) | null
}

export interface MidiInputOptions {
  deviceId?: string | null
  requestAccess?: () => Promise<MidiAccessLike>
  /** Seconds; used when a message has no timeStamp. Default performance.now() / 1000. */
  now?: () => number
}

interface Held { velocity: number; time: number; input: string }

type NavigatorWithMidi = Navigator & { requestMIDIAccess?: () => Promise<unknown> }

/**
 * Live keys from Web MIDI (spec §4.1): all inputs or one device. Keys released
 * while the sustain pedal is down stay held (for display) until it lifts. An
 * unplugged device releases its notes, so nothing stays stuck.
 */
export class MidiInput {
  private access: MidiAccessLike | null = null
  private deviceId: string | null
  private gen = 0
  private readonly opts: MidiInputOptions
  private readonly listeners = new Set<(e: MidiNoteEvent) => void>()
  private readonly bound = new Set<MidiPortLike>()
  private readonly down = new Map<number, Held>()
  private readonly sustained = new Map<number, Held>()
  private pedalInput: string | null = null

  constructor(opts: MidiInputOptions = {}) {
    this.opts = opts
    this.deviceId = opts.deviceId ?? null
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && typeof (navigator as NavigatorWithMidi).requestMIDIAccess === 'function'
  }

  async start(): Promise<void> {
    if (this.access) return
    const request = this.opts.requestAccess
      ?? (MidiInput.supported() ? () => (navigator as NavigatorWithMidi).requestMIDIAccess!() as unknown as Promise<MidiAccessLike> : null)
    if (!request) throw new IvoriesError('midi-unavailable', 'This browser has no Web MIDI.')
    const gen = ++this.gen
    let access: MidiAccessLike
    try {
      access = await request()
    } catch (e) {
      throw new IvoriesError('midi-unavailable', 'MIDI access was denied or failed.', e)
    }
    if (gen !== this.gen) return // stop() (or a newer start()) ran while access was pending
    this.access = access
    this.bindInputs()
    access.onstatechange = (e) => this.onState(e)
  }

  stop(): void {
    this.gen++
    for (const p of this.bound) p.onmidimessage = null
    this.bound.clear()
    if (this.access) this.access.onstatechange = null
    this.access = null
    this.pedalInput = null
    this.releaseWhere(() => true)
  }

  devices(): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = []
    this.access?.inputs.forEach((p) => { if (p.state !== 'disconnected') out.push({ id: p.id, name: p.name || p.id }) })
    return out
  }

  setDevice(id: string | null): void {
    this.deviceId = id
    this.pedalInput = null
    this.releaseWhere(() => true)
    this.bindInputs()
  }

  held(): ReadonlyMap<number, LiveNote> {
    const out = new Map<number, LiveNote>()
    for (const [midi, h] of this.sustained) out.set(midi, { midi, velocity: h.velocity, time: h.time })
    for (const [midi, h] of this.down) out.set(midi, { midi, velocity: h.velocity, time: h.time })
    return out
  }

  subscribe(fn: (e: MidiNoteEvent) => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private now(): number { return (this.opts.now ?? (() => performance.now() / 1000))() }

  private emit(e: MidiNoteEvent): void {
    for (const fn of [...this.listeners]) {
      try { fn(e) } catch (err) { console.error('ivories: MIDI subscriber threw', err) }
    }
  }

  private bindInputs(): void {
    for (const p of this.bound) p.onmidimessage = null
    this.bound.clear()
    this.access?.inputs.forEach((port) => {
      if (port.state === 'disconnected') return
      if (this.deviceId && port.id !== this.deviceId) return
      port.onmidimessage = (e) => this.onMessage(port.id, e)
      this.bound.add(port)
    })
  }

  private onMessage(input: string, e: { data: Uint8Array | null; timeStamp?: number }): void {
    const m = parseMidiMessage(e.data)
    if (!m) return
    const time = e.timeStamp && e.timeStamp > 0 ? e.timeStamp / 1000 : this.now()
    if (m.type === 'on') {
      if (this.down.has(m.note) || this.sustained.has(m.note)) {
        this.down.delete(m.note)
        this.sustained.delete(m.note)
        this.emit({ midi: m.note, velocity: 0, time, on: false })
      }
      this.down.set(m.note, { velocity: m.velocity, time, input })
      this.emit({ midi: m.note, velocity: m.velocity, time, on: true })
    } else if (m.type === 'off') {
      const h = this.down.get(m.note)
      if (!h) return
      this.down.delete(m.note)
      if (this.pedalInput !== null) this.sustained.set(m.note, h)
      else this.emit({ midi: m.note, velocity: 0, time, on: false })
    } else if (m.down) {
      this.pedalInput = input
    } else {
      this.pedalInput = null
      this.releaseSustained()
    }
  }

  private onState(e: { port: { id: string; type?: string; state?: string } }): void {
    if (e.port.type && e.port.type !== 'input') return
    if (e.port.state === 'disconnected') {
      if (this.pedalInput === e.port.id) this.pedalInput = null
      this.releaseWhere((h) => h.input === e.port.id)
      // Without a pedal, keys sustained by it are released too.
      if (this.pedalInput === null) this.releaseSustained()
    }
    this.bindInputs()
  }

  private releaseWhere(pred: (h: Held) => boolean): void {
    const time = this.now()
    for (const map of [this.down, this.sustained]) {
      for (const [note, h] of [...map]) {
        if (!pred(h)) continue
        map.delete(note)
        this.emit({ midi: note, velocity: 0, time, on: false })
      }
    }
  }

  private releaseSustained(): void {
    const time = this.now()
    for (const [note] of [...this.sustained]) this.emit({ midi: note, velocity: 0, time, on: false })
    this.sustained.clear()
  }
}

/** The connected MIDI inputs, for a device picker. Empty when Web MIDI is unavailable. */
export async function listMidiDevices(requestAccess?: () => Promise<MidiAccessLike>): Promise<{ id: string; name: string }[]> {
  const request = requestAccess
    ?? (MidiInput.supported() ? () => (navigator as NavigatorWithMidi).requestMIDIAccess!() as unknown as Promise<MidiAccessLike> : null)
  if (!request) return []
  try {
    const access = await request()
    const out: { id: string; name: string }[] = []
    access.inputs.forEach((p) => { if (p.state !== 'disconnected') out.push({ id: p.id, name: p.name || p.id }) })
    return out
  } catch {
    return []
  }
}
