import { describe, it, expect, expectTypeOf } from 'vitest'
import type { AuthProvider, PlatformDevice, TickleHost } from './types'
import { decodeScene, sceneForShare } from './scene'
import { decodeLook } from './look'

// The plugin contract (spec §2, runbook §3.2). A plugin imports these types
// only; the host hands it the real codecs, so the shared-decode option and
// sceneForShare must be part of TickleHost itself.
describe('TickleHost', () => {
  it('is satisfied by the real codecs, including the shared-decode option', () => {
    const host: TickleHost = { appVersion: 't', origin: 'https://x.test', decodeScene, decodeLook, sceneForShare }
    expectTypeOf(host.decodeScene).parameter(1).toEqualTypeOf<{ shared?: boolean } | undefined>()
    expectTypeOf(host.sceneForShare).returns.toEqualTypeOf<ReturnType<typeof sceneForShare>>()
    expect(typeof host.sceneForShare).toBe('function')
  })
})

describe('AuthProvider device management', () => {
  it('is optional, so a provider without it still type-checks', () => {
    expectTypeOf<AuthProvider['devices']>().toEqualTypeOf<(() => Promise<PlatformDevice[]>) | undefined>()
    expectTypeOf<AuthProvider['revokeDevice']>().toEqualTypeOf<((id: string) => Promise<void>) | undefined>()
    expectTypeOf<AuthProvider['signOutEverywhere']>().toEqualTypeOf<(() => Promise<void>) | undefined>()
  })
})
