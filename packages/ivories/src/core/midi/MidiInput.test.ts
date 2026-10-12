import { describe, it, expect } from 'vitest'
import { MidiInput, listMidiDevices, parseMidiMessage } from './MidiInput'
import type { MidiAccessLike, MidiNoteEvent, MidiPortLike } from './MidiInput'

function fakeAccess(ids = ['a', 'b']) {
  const ports: MidiPortLike[] = ids.map((id) => ({ id, name: `Port ${id}`, state: 'connected', onmidimessage: null }))
  const access: MidiAccessLike = { inputs: { forEach: (cb) => ports.forEach((p) => cb(p)) }, onstatechange: null }
  const send = (id: string, ...bytes: number[]) =>
    ports.find((p) => p.id === id)!.onmidimessage?.({ data: Uint8Array.from(bytes), timeStamp: 1000 })
  return { access, ports, send }
}

async function started(ids?: string[], deviceId: string | null = null) {
  const f = fakeAccess(ids)
  const input = new MidiInput({ deviceId, requestAccess: async () => f.access })
  const events: MidiNoteEvent[] = []
  input.subscribe((e) => events.push(e))
  await input.start()
  return { ...f, input, events }
}

describe('parseMidiMessage', () => {
  it('reads note on, note off, velocity-0 off and the sustain pedal', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'on', note: 60, velocity: 100 })
    expect(parseMidiMessage([0x93, 60, 0])).toEqual({ type: 'off', note: 60 })
    expect(parseMidiMessage([0x80, 60, 40])).toEqual({ type: 'off', note: 60 })
    expect(parseMidiMessage([0xb0, 64, 127])).toEqual({ type: 'sustain', down: true })
    expect(parseMidiMessage([0xb0, 64, 10])).toEqual({ type: 'sustain', down: false })
    expect(parseMidiMessage([0xb0, 7, 100])).toBeNull()
    expect(parseMidiMessage([0xf8])).toBeNull()
  })
})

describe('MidiInput (spec §4.1)', () => {
  it('emits on/off with velocity and seconds, and tracks held keys', async () => {
    const r = await started()
    r.send('a', 0x90, 60, 100)
    expect(r.events[0]).toEqual({ midi: 60, velocity: 100, time: 1, on: true })
    expect([...r.input.held().keys()]).toEqual([60])
    r.send('a', 0x90, 60, 0)
    expect(r.events[1]).toMatchObject({ midi: 60, on: false })
    expect(r.input.held().size).toBe(0)
  })

  it('the sustain pedal holds released keys until it lifts', async () => {
    const r = await started()
    r.send('a', 0xb0, 64, 127)
    r.send('a', 0x90, 62, 80)
    r.send('a', 0x80, 62, 0)
    expect(r.events.filter((e) => !e.on)).toHaveLength(0)
    expect(r.input.held().has(62)).toBe(true)
    r.send('a', 0xb0, 64, 0)
    expect(r.events.at(-1)).toMatchObject({ midi: 62, on: false })
    expect(r.input.held().size).toBe(0)
  })

  it('listens to one chosen device only', async () => {
    const r = await started(['a', 'b'], 'b')
    r.send('a', 0x90, 60, 100)
    expect(r.events).toHaveLength(0)
    r.send('b', 0x90, 61, 100)
    expect(r.events).toHaveLength(1)
  })

  it('statechange disconnected releases that input\'s notes', async () => {
    const r = await started(['a', 'b'])
    r.send('a', 0xb0, 64, 127)
    r.send('a', 0x90, 60, 100)
    r.send('a', 0x90, 64, 100)
    r.send('a', 0x80, 64, 0)       // sustained
    r.send('b', 0x90, 72, 100)
    r.ports[0].state = 'disconnected'
    r.access.onstatechange?.({ port: { id: 'a', type: 'input', state: 'disconnected' } })
    expect(r.events.filter((e) => !e.on).map((e) => e.midi).sort()).toEqual([60, 64])
    expect([...r.input.held().keys()]).toEqual([72])
    r.send('b', 0x80, 72, 0)       // the pedal went with device a
    expect(r.input.held().size).toBe(0)
  })

  it('reports midi-unavailable when Web MIDI is missing or denied', async () => {
    await expect(new MidiInput({ requestAccess: async () => { throw new Error('SecurityError') } }).start())
      .rejects.toMatchObject({ code: 'midi-unavailable' })
    await expect(new MidiInput().start()).rejects.toMatchObject({ code: 'midi-unavailable' }) // jsdom has no requestMIDIAccess
  })

  it('stop() during a pending start() never binds ports (StrictMode)', async () => {
    const f = fakeAccess()
    let resolve!: (a: MidiAccessLike) => void
    const input = new MidiInput({ requestAccess: () => new Promise<MidiAccessLike>((r) => { resolve = r }) })
    const pending = input.start()
    input.stop()
    resolve(f.access)
    await pending
    expect(f.ports.every((p) => p.onmidimessage === null)).toBe(true)
    expect(f.access.onstatechange).toBeNull()
    expect(input.devices()).toEqual([])
  })

  it('a failure that lands after stop() resolves quietly (StrictMode, no spurious midi-unavailable)', async () => {
    let reject!: (e: unknown) => void
    const input = new MidiInput({ requestAccess: () => new Promise<MidiAccessLike>((_r, j) => { reject = j }) })
    const pending = input.start()
    input.stop()
    reject(new Error('SecurityError'))
    await expect(pending).resolves.toBeUndefined()
  })

  it('lists devices without binding any port', async () => {
    const f = fakeAccess(['x'])
    expect(await listMidiDevices(async () => f.access)).toEqual([{ id: 'x', name: 'Port x' }])
    expect(f.ports[0].onmidimessage).toBeNull()
    expect(f.access.onstatechange).toBeNull()
    expect(await listMidiDevices(async () => { throw new Error('no') })).toEqual([])
  })
})
