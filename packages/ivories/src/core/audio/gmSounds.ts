import { Sampler } from 'smplr'
import type { Instrument, InstrumentFactoryFn } from './engine'

export type SoundPackName = 'core' | 'complete'

/** Piano samples from the pepperscore-sounds GM packs (rising-roll spec §2 GM sounds, R-G). */
export interface SoundsOption {
  /** 'core' (default: 19 instruments) or 'complete' (all 128 GM). */
  pack?: SoundPackName
  /** A self-hosted copy of a pack; a relative URL resolves against the page. */
  assetBaseUrl?: string
  /** The GM sound the piano voice and live keys load. Default 'acoustic_grand_piano'. */
  instrument?: string
}

export type FetchJson = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface GmSoundDeps {
  fetch?: FetchJson
  makeSampler?: (ctx: BaseAudioContext, o: { buffers: Record<number, AudioBuffer>; destination: AudioNode }) => Instrument
  /** Base for a relative assetBaseUrl. Default document.baseURI. */
  pageBase?: string
}

/** Pinned exactly like pepperscore's SOUNDS_VERSION: a pack release never changes a deployed page. */
export const SOUNDS_VERSION = '0.1.0'
export const GM_PIANO = 'acoustic_grand_piano'
const SAFE_NAME = /^[a-z0-9_]+$/

export function defaultSoundsBase(pack: SoundPackName = 'core'): string {
  return `https://cdn.jsdelivr.net/npm/pepperscore-sounds-${pack}@${SOUNDS_VERSION}/`
}

/** Absolute pack base with a trailing slash. */
export function resolveSoundsBase(o: SoundsOption, pageBase?: string): string {
  const raw = o.assetBaseUrl?.trim() || defaultSoundsBase(o.pack ?? 'core')
  const withSlash = raw.endsWith('/') ? raw : `${raw}/`
  const page = pageBase ?? (typeof document !== 'undefined' ? document.baseURI : undefined)
  try { return new URL(withSlash, page).href } catch { return withSlash }
}

export const packIndexUrl = (base: string): string => new URL('pack.json', base).href
export const sampleUrl = (base: string, name: string): string => new URL(`soundfonts/fluidr3/${name}.json`, base).href

/** The piano voice (and the live bus) load sounds.instrument; every other voice its own id. */
export function gmInstrumentName(id: string, o: SoundsOption): string {
  return id === GM_PIANO ? (o.instrument ?? GM_PIANO) : id
}

/** pack.json -> the FluidR3 instrument names it ships. */
export function parsePackIndex(u: unknown): Set<string> {
  const list = (u as { fluidr3?: unknown } | null)?.fluidr3
  return new Set(Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [])
}

/** `samples` entries keyed by a MIDI number 0-127 with a non-empty string; anything else is ignored. */
export function parseSamplePack(u: unknown): [number, string][] {
  const samples = (u as { samples?: unknown } | null)?.samples
  if (typeof samples !== 'object' || samples === null || Array.isArray(samples)) return []
  const out: [number, string][] = []
  for (const [k, v] of Object.entries(samples as Record<string, unknown>)) {
    const midi = Number(k)
    if (Number.isInteger(midi) && midi >= 0 && midi <= 127 && typeof v === 'string' && v.length > 0) out.push([midi, v])
  }
  return out
}

/** Bare (or data:-prefixed) base64 -> bytes for decodeAudioData. */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/^data:[^,]*,/, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

let indexCache = new Map<string, Promise<Set<string>>>()
let bufferCache = new WeakMap<BaseAudioContext, Map<string, Promise<Record<number, AudioBuffer>>>>()

/** @internal Test seam: forget every cached index and decoded pack. */
export function resetGmSoundCaches(): void {
  indexCache = new Map()
  bufferCache = new WeakMap()
}

/** The pack's instrument list. An unreachable index resolves empty and is not cached. */
export function loadPackIndex(base: string, fetchJson: FetchJson): Promise<Set<string>> {
  const hit = indexCache.get(base)
  if (hit) return hit
  const cache = indexCache
  const safe: Promise<Set<string>> = (async () => {
    const res = await fetchJson(packIndexUrl(base))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parsePackIndex(await res.json())
  })().catch(() => {
    if (cache.get(base) === safe) cache.delete(base)
    return new Set<string>()
  })
  cache.set(base, safe)
  return safe
}

/**
 * One pack file decoded on one AudioContext, cached (N voices = one fetch and
 * one decode). A failure is not cached, so a later load retries. One sample
 * that will not decode is skipped -- smplr spreads its neighbours over the gap.
 */
export function loadGmBuffers(ctx: BaseAudioContext, url: string, fetchJson: FetchJson): Promise<Record<number, AudioBuffer>> {
  let perCtx = bufferCache.get(ctx)
  if (!perCtx) { perCtx = new Map(); bufferCache.set(ctx, perCtx) }
  const cache = perCtx
  const hit = cache.get(url)
  if (hit) return hit
  const p = (async () => {
    const res = await fetchJson(url)
    if (!res.ok) throw new Error(`GM sample pack ${url}: HTTP ${res.status}`)
    const entries = parseSamplePack(await res.json())
    const out: Record<number, AudioBuffer> = {}
    await Promise.all(entries.map(async ([midi, b64]) => {
      try { out[midi] = await ctx.decodeAudioData(base64ToArrayBuffer(b64)) } catch { /* skipped, see above */ }
    }))
    if (Object.keys(out).length === 0) throw new Error(`GM sample pack ${url}: no playable samples`)
    return out
  })()
  cache.set(url, p)
  p.catch(() => { if (cache.get(url) === p) cache.delete(url) })
  return p
}

/**
 * An engine instrument factory that loads from the GM pack (R-G). pepperscore's
 * packs are JSON with bare base64 mp3 per MIDI note -- not MIDI.js, so smplr's
 * Soundfont cannot read them -- so they are decoded here and handed to smplr's
 * Sampler as AudioBuffers. Anything that goes wrong uses `fallback` (today's
 * SplendidGrandPiano / Soundfont path); nothing throws past this function.
 */
export function gmInstrumentFactory(o: SoundsOption, fallback: InstrumentFactoryFn, deps: GmSoundDeps = {}): InstrumentFactoryFn {
  return async (ctx, id, destination, loader) => {
    const name = gmInstrumentName(id, o)
    if (!SAFE_NAME.test(name)) return fallback(ctx, id, destination, loader)
    const fetchJson: FetchJson = deps.fetch ?? ((url) => fetch(url))
    const makeSampler = deps.makeSampler
      ?? ((c, s) => Sampler(c, { buffers: s.buffers, destination: s.destination } as never) as unknown as Instrument)
    try {
      const base = resolveSoundsBase(o, deps.pageBase)
      const index = await loadPackIndex(base, fetchJson)
      // A reachable index without this instrument: today's path. An unreachable one: try the file anyway.
      if (index.size > 0 && !index.has(name)) return fallback(ctx, id, destination, loader)
      const buffers = await loadGmBuffers(ctx, sampleUrl(base, name), fetchJson)
      const inst = makeSampler(ctx, { buffers, destination })
      await inst.ready
      return inst
    } catch {
      return fallback(ctx, id, destination, loader)
    }
  }
}
