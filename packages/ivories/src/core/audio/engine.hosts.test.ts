import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Voice } from '../model/types'

const smplr = vi.hoisted(() => ({
  soundfontCalls: [] as Record<string, unknown>[],
  /** instrumentUrl -> true: that Soundfont's `ready` rejects. `'*'` fails every one. */
  failing: new Set<string>(),
}))

vi.mock('smplr', async (importOriginal) => {
  const real = await importOriginal<typeof import('smplr')>()
  const fake = (o: Record<string, unknown>, fail: boolean) => ({
    ready: fail ? Promise.reject(new Error('sample load failed')) : Promise.resolve(),
    start: vi.fn(() => () => {}), stop: vi.fn(), dispose: vi.fn(), opts: o,
  })
  return {
    ...real,
    Soundfont: vi.fn((_c: unknown, o: Record<string, unknown>) => {
      smplr.soundfontCalls.push(o)
      return fake(o, smplr.failing.has('*') || smplr.failing.has(o.instrumentUrl as string))
    }),
    SplendidGrandPiano: vi.fn((_c: unknown, o: Record<string, unknown>) => fake(o, false)),
  }
})

import { Soundfont, SplendidGrandPiano } from 'smplr'
import { AudioEngine } from './engine'
import type { FetchJson, SoundsOption } from './gmSounds'
import { resetGmSoundCaches } from './gmSounds'

const PACK = 'https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/'
const SF = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef'
const sfUrl = (name: string) => `${SF}/MusyngKite/${name}-mp3.js`
const INDEX_URL = `${PACK}pack.json`
const PIANO_URL = `${PACK}soundfonts/fluidr3/acoustic_grand_piano.json`
const PIANO = { name: 'acoustic_grand_piano', samples: { 36: btoa('a'), 41: btoa('bb') } }
const PIANO_ONLY = { pack: 'core', fluidr3: ['acoustic_grand_piano'] }
const PACK_DOWN = { [INDEX_URL]: new Error('offline'), [PIANO_URL]: 503 }

const voice = (id: string, patch: Partial<Voice> = {}): Voice => ({
  id, label: id, hue: 200, instrument: 'acoustic_grand_piano',
  visible: true, audible: true, volume: 1, ...patch,
})

type Route = unknown | Error | number
let fetchJson: ReturnType<typeof makeFetch>
function makeFetch(routes: Record<string, Route>) {
  return vi.fn(async (url: string) => {
    const r = routes[url]
    if (r instanceof Error) throw r
    if (r === undefined) return { ok: false, status: 404, json: async () => ({}) }
    if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => r }
  })
}

function fakeContext() {
  return {
    currentTime: 10,
    state: 'running' as AudioContextState,
    destination: { id: 'dest' },
    createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
    decodeAudioData: vi.fn(async (b: ArrayBuffer) => ({ length: b.byteLength }) as unknown as AudioBuffer),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }
}

function engineWith(routes: Record<string, Route>, sounds?: SoundsOption) {
  fetchJson = makeFetch(routes)
  const makeSampler = vi.fn(() => ({ ready: Promise.resolve(), start: vi.fn(() => () => {}), stop: vi.fn(), dispose: vi.fn() }) as never)
  return new AudioEngine({
    makeContext: () => fakeContext() as unknown as AudioContext,
    sounds,
    soundsDeps: { fetch: fetchJson as unknown as FetchJson, makeSampler },
  })
}

const soundfontUrls = () => smplr.soundfontCalls.map((c) => c.instrumentUrl)
/** Every URL ivories fetched or handed to smplr. */
const requested = () => [...fetchJson.mock.calls.map(([u]) => u as string), ...smplr.soundfontCalls.map((o) => o.instrumentUrl as string)]
const expectOnlyConfiguredHosts = () => {
  expect(requested().length).toBeGreaterThan(0)
  for (const u of requested()) expect(u.startsWith(PACK) || u.startsWith(`${SF}/`), u).toBe(true)
  expect(SplendidGrandPiano).not.toHaveBeenCalled()
  for (const o of smplr.soundfontCalls) expect(o).not.toHaveProperty('instrument')
}

beforeEach(() => {
  resetGmSoundCaches()
  smplr.soundfontCalls.length = 0
  smplr.failing.clear()
  vi.mocked(Soundfont).mockClear()
  vi.mocked(SplendidGrandPiano).mockClear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('sounds.fallbackSoundfontUrl keeps every sample request on the configured hosts', () => {
  const withSf: SoundsOption = { pack: 'core', fallbackSoundfontUrl: SF }

  it("pack down: the piano voice and live keys use the soundfont's acoustic_grand_piano", async () => {
    const engine = engineWith(PACK_DOWN, withSf)
    await engine.loadVoice(voice('v1'))
    await engine.prepareLive()
    expect(soundfontUrls()).toContain(sfUrl('acoustic_grand_piano'))
    expectOnlyConfiguredHosts()
  })

  it('an instrument not in the pack loads from the configured soundfont', async () => {
    const engine = engineWith({ [INDEX_URL]: PIANO_ONLY }, withSf)
    await engine.loadVoice(voice('v1', { instrument: 'violin' }))
    expect(soundfontUrls()).toEqual([sfUrl('violin')])
    expectOnlyConfiguredHosts()
  })

  it('sounds.instrument missing from the pack falls back to the soundfont piano', async () => {
    const engine = engineWith({ [INDEX_URL]: PIANO_ONLY }, { ...withSf, instrument: 'harpsichord' })
    await engine.loadVoice(voice('v1'))
    expect(soundfontUrls()).toEqual([sfUrl('acoustic_grand_piano')])
    expectOnlyConfiguredHosts()
  })

  it('a failing soundfont instrument retries, then takes the pack piano, still on the two hosts', async () => {
    smplr.failing.add(sfUrl('violin'))
    const engine = engineWith({ [INDEX_URL]: PIANO_ONLY, [PIANO_URL]: PIANO }, withSf)
    await engine.loadVoice(voice('v1', { instrument: 'violin' }))
    expect(engine.ready).toBe(true)
    expect(soundfontUrls().filter((u) => u === sfUrl('violin')).length).toBeGreaterThan(1)
    expectOnlyConfiguredHosts()
  })

  it('pack and soundfont both down: silent voice, no throw, no other host', async () => {
    smplr.failing.add('*')
    const engine = engineWith(PACK_DOWN, withSf)
    await expect(engine.loadVoice(voice('v1'))).resolves.toBeUndefined()
    expect(engine.ready).toBe(false)
    const note = { id: 1, pitch: 60, startTicks: 0, durTicks: 480, startSec: 11, endSec: 12, velocity: 100, voiceId: 'v1' }
    expect(() => engine.play({ atSec: 11, note }, voice('v1'), 0)).not.toThrow()
    expectOnlyConfiguredHosts()
  })

  it('a blank fallbackSoundfontUrl is unset: the pack-failure piano is SplendidGrandPiano as before', async () => {
    const engine = engineWith(PACK_DOWN, { pack: 'core', fallbackSoundfontUrl: '  ' })
    await engine.loadVoice(voice('v1'))
    expect(SplendidGrandPiano).toHaveBeenCalledTimes(1)
    expect(Soundfont).not.toHaveBeenCalled()
  })

  describe("unset keeps today's paths", () => {
    it('pack down calls SplendidGrandPiano', async () => {
      const engine = engineWith(PACK_DOWN, { pack: 'core' })
      await engine.loadVoice(voice('v1'))
      expect(SplendidGrandPiano).toHaveBeenCalledTimes(1)
    })

    it('an instrument missing from the index uses Soundfont({ instrument })', async () => {
      const engine = engineWith({ [INDEX_URL]: PIANO_ONLY }, { pack: 'core' })
      await engine.loadVoice(voice('v1', { instrument: 'violin' }))
      expect(Soundfont).toHaveBeenCalledTimes(1)
      const o = smplr.soundfontCalls[0]
      expect(o).toMatchObject({ instrument: 'violin' })
      expect(o).not.toHaveProperty('instrumentUrl')
    })

    it('no sounds at all uses defaultMakeInstrument and never fetches', async () => {
      const engine = engineWith({})
      await engine.loadVoice(voice('v1', { instrument: 'violin' }))
      expect(smplr.soundfontCalls[0]).toMatchObject({ instrument: 'violin' })
      expect(fetchJson).not.toHaveBeenCalled()
    })
  })

  it('setSounds adds and removes the fallback in place', async () => {
    const engine = engineWith(PACK_DOWN, { pack: 'core' })
    await engine.loadVoice(voice('v1'))
    expect(SplendidGrandPiano).toHaveBeenCalledTimes(1)
    await engine.setSounds(withSf)
    expect(soundfontUrls()).toContain(sfUrl('acoustic_grand_piano'))
    await engine.setSounds({ pack: 'core' })
    expect(SplendidGrandPiano).toHaveBeenCalledTimes(2)
  })
})
