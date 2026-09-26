import { describe, expect, it } from 'vitest'
import { HashShareProvider, MAX_SHARE_ENCODED_BYTES } from './HashShareProvider'
import { isPlatformError } from '../errors'
import { buildProfile } from '../../settings/profile'
import { DEFAULT_SETTINGS } from '../../settings/types'
import type { SceneV1, SongRefWithTitle } from '../scene'
import { sceneFromState } from '../scene'
import { lookFromSettings } from '../look'
import type { LookV1 } from '../look'
import type { Voice } from '../../model/types'

const SHA = 'b'.repeat(64)
const voice = (id: string, label: string): Voice => ({
  id, label, hue: 200, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1,
})
const song = (): SongRefWithTitle => ({ kind: 'local', sha256: SHA, name: 'demo.mid', format: 'midi', title: 'Demo' })
const scene = (voices: Voice[] = [voice('l', 'Bass')]): SceneV1 => sceneFromState({
  song: song(),
  profile: buildProfile({
    song: { id: SHA, name: 'demo.mid', format: 'midi' }, voices,
    tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 4, settings: DEFAULT_SETTINGS,
  }),
})
const look = (): LookV1 => lookFromSettings(DEFAULT_SETTINGS, 'keyboard', 3)
const midiSong = (): SceneV1 => sceneFromState({
  song: { kind: 'midi', sha256: SHA, name: 'up.mid', dataB64: 'AAAA', title: 'Uploaded' },
  profile: buildProfile({
    song: { id: SHA, name: 'up.mid', format: 'midi' }, voices: [voice('l', 'Bass')],
    tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 4, settings: DEFAULT_SETTINGS,
  }),
})

// A random hex string per voice, so the JSON is not compressible away -- used
// to reliably exceed MAX_SHARE_ENCODED_BYTES after deflate.
const randomHex = (bytes: number) => {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}
const hugeScene = (): SceneV1 => scene(
  Array.from({ length: 300 }, (_, i) => voice(`v${i}`, randomHex(60))),
)

describe('HashShareProvider', () => {
  it('describes itself as anonymous-only', () => {
    const p = new HashShareProvider('https://example.com')
    expect(p.id).toBeTruthy()
    expect(p.supports).toEqual({ anonymous: true, owned: false, revoke: false, fork: false })
  })

  describe('share / match / resolve round trip', () => {
    it('round-trips a scene through a #share= URL', async () => {
      const p = new HashShareProvider('https://example.com')
      const result = await p.share({ kind: 'scene', payload: scene() })
      expect(result.url.startsWith('https://example.com/#share=')).toBe(true)
      expect(result.shortUrl).toBeNull()

      const hash = result.url.slice(result.url.indexOf('#'))
      const code = p.match({ pathname: '/', hash })
      expect(code).toBe(result.code)

      const resolved = await p.resolve(code!)
      expect(resolved).not.toBeNull()
      expect(resolved!.kind).toBe('scene')
      expect(resolved!.payload).toEqual(scene())
      expect(resolved!.owner).toBeNull()
      expect(resolved!.isOwner).toBe(false)
      expect(resolved!.canEdit).toBe(false)
      expect(resolved!.canFork).toBe(false)
    })

    it('round-trips a look', async () => {
      const p = new HashShareProvider('https://example.com')
      const result = await p.share({ kind: 'look', payload: look() })
      const code = p.match({ pathname: '/', hash: result.url.slice(result.url.indexOf('#')) })
      const resolved = await p.resolve(code!)
      expect(resolved!.kind).toBe('look')
      expect(resolved!.payload).toEqual(look())
    })
  })

  describe('match', () => {
    it('returns null for a location with no #share= hash', () => {
      const p = new HashShareProvider('https://example.com')
      expect(p.match({ pathname: '/', hash: '' })).toBeNull()
      expect(p.match({ pathname: '/s/abc', hash: '' })).toBeNull()
      expect(p.match({ pathname: '/', hash: '#other=x' })).toBeNull()
    })
  })

  describe('refusals', () => {
    it('refuses song.kind === "midi" with too_large, before ever compressing', async () => {
      const p = new HashShareProvider('https://example.com')
      const attempt = p.share({ kind: 'scene', payload: midiSong() })
      await expect(attempt).rejects.toSatisfy((e: unknown) => isPlatformError(e) && e.code === 'too_large')
    })

    it('refuses an encoded blob over 8 KiB', async () => {
      const p = new HashShareProvider('https://example.com')
      const attempt = p.share({ kind: 'scene', payload: hugeScene() })
      await expect(attempt).rejects.toSatisfy((e: unknown) => isPlatformError(e) && e.code === 'too_large')
    })

    it('MAX_SHARE_ENCODED_BYTES is 8 KiB', () => {
      expect(MAX_SHARE_ENCODED_BYTES).toBe(8 * 1024)
    })
  })

  describe('resolve: bad input never throws', () => {
    it('returns null for a code that is not valid base64url', async () => {
      const p = new HashShareProvider('https://example.com')
      expect(await p.resolve('not valid base64url!!')).toBeNull()
    })

    it('returns null for base64url that does not decompress', async () => {
      const p = new HashShareProvider('https://example.com')
      expect(await p.resolve('AAAAAAAAAAAAAAAA')).toBeNull()
    })

    it('returns null for a decompressed payload that is not JSON, or not scene/look shaped', async () => {
      const p = new HashShareProvider('https://example.com')
      const notJson = await deflateAndEncode('not json {')
      expect(await p.resolve(notJson)).toBeNull()
      const wrongShape = await deflateAndEncode(JSON.stringify({ kind: 'nonsense' }))
      expect(await p.resolve(wrongShape)).toBeNull()
    })

    it('stops inflating past 256 KiB rather than exhausting memory (F18b)', async () => {
      // Highly compressible: a 1 MiB run of the same character deflates to a
      // tiny blob, so this tests the inflation cap independently of share()'s
      // 8 KiB *encoded* cap.
      const bigButCompressible = 'a'.repeat(1024 * 1024)
      const code = await deflateAndEncode(bigButCompressible)
      const p = new HashShareProvider('https://example.com')
      expect(await p.resolve(code)).toBeNull()
    })
  })
})

// Test-only helper mirroring the provider's own encode step, so the
// resolve()-only tests above don't have to go through share()'s caps.
async function deflateAndEncode(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes); controller.close() },
  }).pipeThrough(new CompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  let bin = ''
  for (const b of out) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
