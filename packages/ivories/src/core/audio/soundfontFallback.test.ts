import { describe, it, expect, vi } from 'vitest'
import { Soundfont } from 'smplr'
import { resolveFallbackSoundfontBase, soundfontFileUrl, soundfontFallbackFactory } from './soundfontFallback'

const sf = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }))
vi.mock('smplr', async (orig) => ({
  ...(await orig<typeof import('smplr')>()),
  Soundfont: vi.fn((_ctx: unknown, o: Record<string, unknown>) => { sf.calls.push(o); return { ready: Promise.resolve(), dispose: vi.fn() } }),
}))
const BASE = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef'

describe('soundfontFallback', () => {
  it('resolves the base: trailing slash, whitespace and relative URLs', () => {
    expect(resolveFallbackSoundfontBase(BASE)).toBe(`${BASE}/`)
    expect(resolveFallbackSoundfontBase(` ${BASE}/ `)).toBe(`${BASE}/`)
    expect(resolveFallbackSoundfontBase('/sf', 'https://host.test/app/page')).toBe('https://host.test/sf/')
  })

  it('builds <base>MusyngKite/<name>-mp3.js', () => {
    expect(soundfontFileUrl(`${BASE}/`, 'violin')).toBe(`${BASE}/MusyngKite/violin-mp3.js`)
  })

  it('an unsafe instrument id stays on the base as the grand piano', () => {
    for (const id of ['../../x', 'Violin', 'https://evil.test/x', '']) {
      expect(soundfontFileUrl(`${BASE}/`, id)).toBe(`${BASE}/MusyngKite/acoustic_grand_piano-mp3.js`)
    }
  })

  it('the factory passes only instrumentUrl, destination and loader', async () => {
    sf.calls.length = 0
    const make = soundfontFallbackFactory(BASE)
    const dest = {} as AudioNode
    const L = {}
    await make({} as BaseAudioContext, 'acoustic_grand_piano', dest, L)
    await make({} as BaseAudioContext, 'violin', dest, L)
    expect(sf.calls).toContainEqual({ instrumentUrl: `${BASE}/MusyngKite/acoustic_grand_piano-mp3.js`, destination: dest, loader: L })
    expect(sf.calls).toContainEqual({ instrumentUrl: `${BASE}/MusyngKite/violin-mp3.js`, destination: dest, loader: L })
    for (const c of sf.calls) expect(Object.keys(c).sort()).toEqual(['destination', 'instrumentUrl', 'loader'])
  })

  it('a soundfont whose ready rejects rejects the factory', async () => {
    const rejected = Promise.reject(new Error('404'))
    rejected.catch(() => {})
    const dispose = vi.fn()
    vi.mocked(Soundfont).mockImplementationOnce((() => ({ ready: rejected, dispose })) as never)
    const make = soundfontFallbackFactory(BASE)
    await expect(make({} as BaseAudioContext, 'violin', {} as AudioNode, {})).rejects.toThrow('404')
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('isSafeSoundName stays internal: not exported from the core entry', async () => {
    expect('isSafeSoundName' in (await import('../index'))).toBe(false)
  })
})
