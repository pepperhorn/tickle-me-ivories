import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildProfile, DEFAULT_SETTINGS, sceneFromState } from 'ivories/core'
import type { Layout } from 'ivories/core'
import { makeTickleHost, startPlatform } from './boot'

const SHA = 'a'.repeat(64)
const cam: Layout = {
  kind: 'split', ratio: 0.6,
  top: { kind: 'ivories', view: 'falling' },
  bottom: { kind: 'camera', mode: 'webcam', deviceId: 'cam-1', mirror: true, fit: 'cover' },
}
const scene = () => sceneFromState({
  song: { kind: 'local', sha256: SHA, name: 'song.mid', format: 'midi', title: 'Song' },
  profile: buildProfile({ song: { id: SHA, name: 'song.mid', format: 'midi' }, voices: [], tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 3, settings: DEFAULT_SETTINGS }),
  layout: cam,
})

afterEach(() => { vi.restoreAllMocks() })

describe('makeTickleHost', () => {
  it('decodes a shared scene without camera deviceIds, and an own scene with them', () => {
    const host = makeTickleHost('https://ivories.test')
    expect(JSON.stringify(host.decodeScene(scene(), { shared: true }))).not.toContain('cam-1')
    expect(JSON.stringify(host.decodeScene(scene()))).toContain('cam-1')
  })

  it('hands over sceneForShare, the origin and a version', () => {
    const host = makeTickleHost('https://ivories.test')
    expect(JSON.stringify(host.sceneForShare(scene()))).not.toContain('cam-1')
    expect(host.origin).toBe('https://ivories.test')
    expect(host.appVersion).toMatch(/\S/)
  })
})

describe('startPlatform', () => {
  it('loads plugins on app routes, the share route included', async () => {
    const load = vi.fn(async () => {})
    await startPlatform('/s/AbCdEfGhJk', load, makeTickleHost('https://x.test'))
    await startPlatform('/', load, makeTickleHost('https://x.test'))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('skips /debug and /embed-fixture', () => {
    const load = vi.fn(async () => {})
    expect(startPlatform('/debug/', load)).toBeNull()
    expect(startPlatform('/embed-fixture', load)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('never rejects: the app does not block on plugins', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(startPlatform('/', async () => { throw new Error('boom') }, makeTickleHost('https://x.test'))).resolves.toBeUndefined()
  })

  it('is actually called by main.tsx (runbook §3.3: loadConfiguredPlugins was never called)', () => {
    const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'main.tsx'), 'utf8')
    expect(main).toMatch(/startPlatform\(\s*window\.location\.pathname\s*\)/)
  })
})
