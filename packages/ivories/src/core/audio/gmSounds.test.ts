import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SOUNDS_VERSION, defaultSoundsBase, gmInstrumentFactory, gmInstrumentName, packIndexUrl,
  resetGmSoundCaches, resolveSoundsBase, sampleUrl,
} from './gmSounds'
import type { FetchJson, SoundsOption } from './gmSounds'

const CORE = 'https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/'
const PIANO_URL = `${CORE}soundfonts/fluidr3/acoustic_grand_piano.json`
const INDEX = { pack: 'core', fluidr3: ['acoustic_grand_piano', 'electric_piano_1'] }
const PIANO = { name: 'acoustic_grand_piano', samples: { 36: btoa('a'), 41: btoa('bb') } }
const dest = {} as AudioNode

type Route = unknown | Error | number
function fakeFetch(routes: Record<string, Route>) {
  return vi.fn(async (url: string) => {
    const r = routes[url]
    if (r instanceof Error) throw r
    if (r === undefined) return { ok: false, status: 404, json: async () => ({}) }
    if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => r }
  })
}
/** decodeAudioData rejects buffers whose byte length is in `bad`. */
function fakeCtx(bad: number[] = []) {
  return {
    decodeAudioData: vi.fn(async (b: ArrayBuffer) => {
      if (bad.includes(b.byteLength)) throw new Error('undecodable')
      return { length: b.byteLength } as unknown as AudioBuffer
    }),
  }
}
function harness(routes: Record<string, Route>, o: SoundsOption = {}) {
  const fallback = vi.fn(async (_c: BaseAudioContext, id: string) => ({ fallback: id }) as never)
  const made: { buffers: Record<number, AudioBuffer>; destination: AudioNode }[] = []
  const makeSampler = vi.fn((_c: BaseAudioContext, s: { buffers: Record<number, AudioBuffer>; destination: AudioNode }) => {
    made.push(s)
    return { sampler: true, ready: Promise.resolve() } as never
  })
  const fetch = fakeFetch(routes)
  const make = gmInstrumentFactory(o, fallback, { fetch: fetch as unknown as FetchJson, makeSampler })
  return { fallback, made, makeSampler, fetch, make }
}

beforeEach(() => { resetGmSoundCaches() })

describe('GM sound URLs (rising-roll spec §2 GM sounds, R-G)', () => {
  it('defaults to the core pack on jsDelivr, pinned like pepperscore', () => {
    expect(SOUNDS_VERSION).toBe('0.1.0')
    expect(defaultSoundsBase()).toBe(CORE)
    expect(resolveSoundsBase({})).toBe(CORE)
    expect(resolveSoundsBase({ pack: 'complete' })).toBe('https://cdn.jsdelivr.net/npm/pepperscore-sounds-complete@0.1.0/')
  })

  it('an assetBaseUrl wins, is trimmed, gains a trailing slash and resolves against the page', () => {
    expect(resolveSoundsBase({ assetBaseUrl: ' https://x.test/sounds ' })).toBe('https://x.test/sounds/')
    expect(resolveSoundsBase({ assetBaseUrl: '/sounds' }, 'https://host.test/app/page')).toBe('https://host.test/sounds/')
  })

  it('index and sample file URLs', () => {
    expect(packIndexUrl(CORE)).toBe(`${CORE}pack.json`)
    expect(sampleUrl(CORE, 'acoustic_grand_piano')).toBe(PIANO_URL)
  })

  it('the piano voice maps to sounds.instrument; other instruments keep their id', () => {
    expect(gmInstrumentName('acoustic_grand_piano', {})).toBe('acoustic_grand_piano')
    expect(gmInstrumentName('acoustic_grand_piano', { instrument: 'bright_acoustic_piano' })).toBe('bright_acoustic_piano')
    expect(gmInstrumentName('electric_piano_1', { instrument: 'bright_acoustic_piano' })).toBe('electric_piano_1')
  })
})

describe('gmInstrumentFactory (R-G)', () => {
  it('loads the JSON pack, decodes every sample and builds a Sampler keyed by MIDI number', async () => {
    const h = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: PIANO })
    const ctx = fakeCtx()
    const inst = await h.make(ctx as unknown as BaseAudioContext, 'acoustic_grand_piano', dest, null)
    expect(inst).toMatchObject({ sampler: true })
    expect(Object.keys(h.made[0].buffers)).toEqual(['36', '41'])
    expect(h.made[0].destination).toBe(dest)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2)
    expect(h.fallback).not.toHaveBeenCalled()
  })

  it('decodes a pack once per AudioContext: a second voice on it reuses the buffers', async () => {
    const h = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: PIANO })
    const ctx = fakeCtx() as unknown as BaseAudioContext
    await h.make(ctx, 'acoustic_grand_piano', dest, null)
    await h.make(ctx, 'acoustic_grand_piano', dest, null)
    expect(h.fetch.mock.calls.filter(([u]) => u === PIANO_URL)).toHaveLength(1)
    expect(h.made[1].buffers).toBe(h.made[0].buffers)
  })

  it('an instrument missing from a reachable index takes the fallback path', async () => {
    const h = harness({ [`${CORE}pack.json`]: INDEX })
    expect(await h.make(fakeCtx() as never, 'violin', dest, null)).toEqual({ fallback: 'violin' })
    expect(h.fetch.mock.calls.map(([u]) => u)).toEqual([`${CORE}pack.json`])
  })

  it('falls back when the pack is unreachable and retries on the next load (Review Focus 4)', async () => {
    const h = harness({ [`${CORE}pack.json`]: new Error('offline'), [PIANO_URL]: 503 })
    const ctx = fakeCtx() as never
    expect(await h.make(ctx, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
    expect(await h.make(ctx, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
    expect(h.fetch.mock.calls.filter(([u]) => u === PIANO_URL)).toHaveLength(2)
    expect(h.fetch.mock.calls.filter(([u]) => u === `${CORE}pack.json`)).toHaveLength(2)
  })

  it('skips one undecodable sample; a pack with none playable falls back (Review Focus 4)', async () => {
    const one = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: PIANO })
    await one.make(fakeCtx([2]) as never, 'acoustic_grand_piano', dest, null)
    expect(Object.keys(one.made[0].buffers)).toEqual(['36'])
    resetGmSoundCaches()
    const none = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: PIANO })
    expect(await none.make(fakeCtx([1, 2]) as never, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
  })

  it('corrupt JSON (no samples object) falls back', async () => {
    const h = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: { name: 'x', samples: ['nope'] } })
    expect(await h.make(fakeCtx() as never, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
  })

  it('refuses an unsafe instrument name without fetching anything', async () => {
    const h = harness({}, { instrument: '../../evil' })
    expect(await h.make(fakeCtx() as never, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('a self-hosted assetBaseUrl drives both URLs; sounds.instrument picks the file', async () => {
    const base = 'https://cdn.example.test/gm/'
    const h = harness({
      [`${base}pack.json`]: { pack: 'complete', fluidr3: ['bright_acoustic_piano'] },
      [`${base}soundfonts/fluidr3/bright_acoustic_piano.json`]: PIANO,
    }, { assetBaseUrl: 'https://cdn.example.test/gm', instrument: 'bright_acoustic_piano' })
    await h.make(fakeCtx() as never, 'acoustic_grand_piano', dest, null)
    expect(h.makeSampler).toHaveBeenCalledTimes(1)
  })
})
