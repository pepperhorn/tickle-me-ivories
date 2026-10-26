import { describe, it, expect } from 'vitest'
import { decodeScene, defaultLayoutFor, viewForMode, sceneApplyPlan, sceneForShare, sceneFromState } from './scene'
import { buildProfile } from '../settings/profile'
import { DEFAULT_SETTINGS } from '../settings/types'
import { isPayloadVersionError } from './codec'
import { isPlatformError } from './errors'
import type { Layout } from '../layout/types'

const ID = 'a'.repeat(64)
const profile = (mode: 'roll' | 'keyboard' = 'roll') => buildProfile({
  song: { id: ID, name: 'song.mid', format: 'midi' }, voices: [], tempo: { mode: 'scale', scale: 1 },
  mode, fallSeconds: 3, settings: DEFAULT_SETTINGS,
})
const song = { kind: 'local' as const, sha256: ID, name: 'song.mid', format: 'midi' as const, title: 'song' }
const webcamSplit: Layout = {
  kind: 'split', ratio: 0.6,
  top: { kind: 'ivories', view: 'falling' },
  bottom: { kind: 'camera', mode: 'webcam', deviceId: 'cam-1', mirror: true, fit: 'cover' },
}

describe('SceneV2 (spec §5.4)', () => {
  it('a scene built from state is v2 and defaults to single + free from the display mode', () => {
    const s = sceneFromState({ song, profile: profile('keyboard') })
    expect(s).toMatchObject({ v: 2, layout: { kind: 'single', main: { kind: 'ivories', view: 'keyboard' } }, aspect: 'free' })
  })

  it('round-trips a v2 scene, keeping deviceIds for local saves', () => {
    const s = sceneFromState({ song, profile: profile(), layout: webcamSplit, aspect: '16:9' })
    expect(decodeScene(JSON.stringify(s))).toEqual(s)
  })

  it('upgrades a V1 scene: single slot from the V1 display mode, aspect free', () => {
    const v1 = { v: 1, kind: 'scene', song, profile: profile('roll') }
    expect(decodeScene(v1)).toMatchObject({ v: 2, layout: { kind: 'single', main: { kind: 'ivories', view: 'falling' } }, aspect: 'free' })
    const k1 = { v: 1, kind: 'scene', song, profile: profile('keyboard') }
    expect(decodeScene(k1).layout).toEqual(defaultLayoutFor('keyboard'))
  })

  it('refuses a crafted layout and a newer version (Review Focus 4)', () => {
    const base = sceneFromState({ song, profile: profile() })
    expect(() => decodeScene({ ...base, layout: { kind: 'single', main: { kind: 'camera', mode: 'mask', fill: 'red;background:url(x)' } } })).toThrow(/layout/)
    expect(() => decodeScene({ ...base, aspect: '4:3' })).toThrow(/aspect/)
    try { decodeScene({ ...base, v: 3 }); throw new Error('accepted') } catch (e) { expect(isPayloadVersionError(e)).toBe(true) }
  })

  it('shares never carry deviceIds, and a shared plan drops any that slipped in', () => {
    const s = sceneFromState({ song, profile: profile(), layout: webcamSplit })
    const shared = sceneForShare(s)
    expect(JSON.stringify(shared)).not.toContain('cam-1')
    expect(JSON.stringify(sceneApplyPlan(s, { shared: true }).layout)).not.toContain('cam-1')
    expect(sceneApplyPlan(s, { shared: false }).layout).toEqual(webcamSplit)
  })

  it('round-trips a rising, horizontal slot, shared or not, and stays v2 (R-V)', () => {
    const layout: Layout = {
      kind: 'split', ratio: 0.5,
      top: { kind: 'ivories', view: 'rising', orientation: 'horizontal' },
      bottom: { kind: 'ivories', view: 'keyboard' },
    }
    const s = sceneFromState({ song, profile: profile(), layout })
    const back = decodeScene(JSON.stringify(s))
    expect(back.v).toBe(2)
    expect(back.layout).toEqual(layout)
    expect(decodeScene(JSON.stringify(s), { shared: true }).layout).toEqual(layout)
  })
})

describe('SceneV2 decode of crafted shares (Review Focus 4)', () => {
  const base = () => JSON.parse(JSON.stringify(sceneFromState({ song, profile: profile() })))
  const refused = (u: unknown, shared: boolean) => {
    try { decodeScene(u, { shared }) } catch (e) { return isPlatformError(e) && e.code === 'invalid' }
    return false
  }

  it('refuses a CSS-injection fill, an unknown slot kind, a NaN-ish ratio, missing layout or aspect', () => {
    const bad: unknown[] = [
      { kind: 'single', main: { kind: 'camera', mode: 'mask', fill: 'red;background:url(x)' } },
      { kind: 'single', main: { kind: 'iframe', src: 'https://evil' } },
      { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: 'NaN' },
      { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: null },
      { kind: 'grid' },
      null,
    ]
    for (const layout of bad) for (const shared of [true, false]) expect(refused({ ...base(), layout }, shared)).toBe(true)
    const noLayout = base(); delete noLayout.layout
    expect(refused(noLayout, true)).toBe(true)
    const noAspect = base(); delete noAspect.aspect
    expect(refused(noAspect, true)).toBe(true)
  })

  it('a NaN ratio (serialized as null) is refused, never applied', () => {
    const s = { ...base(), layout: { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: NaN } }
    expect(refused(s, true)).toBe(true)
  })

  it('clamps an out-of-range ratio instead of applying it verbatim', () => {
    const s = { ...base(), layout: { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: 5 } }
    const d = decodeScene(s, { shared: true })
    expect(d.layout).toMatchObject({ kind: 'split', ratio: 0.85 })
  })

  it('drops a foreign deviceId when decoding a share, keeps it for a local save', () => {
    const s = { ...base(), layout: webcamSplit }
    expect(JSON.stringify(decodeScene(s, { shared: true }))).not.toContain('cam-1')
    expect(decodeScene(s).layout).toEqual(webcamSplit)
    expect(decodeScene(s, { shared: false }).layout).toEqual(webcamSplit)
  })

  it('sceneFromState refuses an invalid layout or aspect', () => {
    expect(() => sceneFromState({ song, profile: profile(), layout: { kind: 'grid' } as unknown as Layout })).toThrow(/layout/)
    expect(() => sceneFromState({ song, profile: profile(), aspect: '4:3' as never })).toThrow(/aspect/)
  })
})

describe('viewForMode (R7)', () => {
  it('maps the display mode to its keys view', () => {
    expect(viewForMode('roll')).toBe('falling')
    expect(viewForMode('keyboard')).toBe('keyboard')
    expect(defaultLayoutFor('roll')).toEqual({ kind: 'single', main: { kind: 'ivories', view: viewForMode('roll') } })
  })
})

 it('round-trips all fretboard options through local and shared scenes', () => {
   const layout: Layout = { kind: 'single', main: { kind: 'ivories', view: 'fretboard',
     fretboard: { instrument: 'bass5', headstock: 'violin', noteLabels: 'fret', appearance: 'light', frets: 24 } } }
   const scene = sceneFromState({ song, profile: profile(), layout })
   expect(decodeScene(JSON.stringify(scene)).layout).toEqual(layout)
   expect(decodeScene(JSON.stringify(sceneForShare(scene)), { shared: true }).layout).toEqual(layout)
   for (const patch of [{ instrument: 'piano' }, { headstock: 'logo' }, { noteLabels: 'html' }, { appearance: 'url(x)' }, { frets: 10000 }]) {
     expect(() => decodeScene({ ...scene, layout: { kind: 'single', main: { kind: 'ivories', view: 'fretboard', fretboard: patch } } })).toThrow(/layout/)
   }
 })
