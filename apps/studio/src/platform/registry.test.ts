import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TickleHost, TicklePlugin } from './types'

// The registry holds module-level state (`current`), so every test starts
// from a clean module instance (preflight F15 needs "no install happened in
// between" to be meaningful, and F12's "defaults survive an install" needs a
// known starting point). vi.resetModules() plus a fresh dynamic import gives
// each test its own registry.
async function freshRegistry() {
  vi.resetModules()
  return import('./registry')
}

const host: TickleHost = {
  appVersion: '0.0.0-test',
  origin: 'http://app.example',
  decodeScene: (u) => u as never,
  decodeLook: (u) => u as never,
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

describe('getPlatform / getDefaults', () => {
  it('returns the defaults before any plugin installs', async () => {
    const { getPlatform, getDefaults } = await freshRegistry()
    const p = getPlatform()
    expect(p.auth).toBeNull()
    expect(p.storage.id).toBe('local')
    expect(p.share.id).toBe('hash')
    expect(p.content).toEqual([])
    expect(getPlatform()).toBe(getDefaults())
  })

  it('is a stable snapshot: two calls return the same object when nothing installed (F15)', async () => {
    const { getPlatform } = await freshRegistry()
    expect(getPlatform()).toBe(getPlatform())
  })
})

describe('installPlugin', () => {
  it('replaces a provider and fires subscribePlatform listeners', async () => {
    const { getPlatform, installPlugin, subscribePlatform } = await freshRegistry()
    const before = getPlatform()
    const listener = vi.fn()
    const unsubscribe = subscribePlatform(listener)

    const customStorage: TicklePlugin['storage'] = {
      id: 'plugin-storage',
      remote: true,
      list: async () => [],
      load: (async () => null) as never,
      save: async (input) => ({
        id: 'x', kind: input.kind, name: input.name, updatedAt: new Date().toISOString(), visibility: 'private',
      }),
      remove: async () => {},
    }
    installPlugin({ id: 'p', name: 'Plugin', version: '1.0.0', storage: customStorage })

    expect(listener).toHaveBeenCalledTimes(1)
    const after = getPlatform()
    expect(after).not.toBe(before)
    expect(after.storage).toBe(customStorage)
    // Untouched providers carry over unchanged.
    expect(after.share).toBe(before.share)
    expect(after.auth).toBeNull()

    unsubscribe()
    installPlugin({ id: 'p2', name: 'Plugin 2', version: '1.0.0' })
    expect(listener).toHaveBeenCalledTimes(1) // not called again after unsubscribe
  })

  it('extends (appends to) content rather than replacing it', async () => {
    const { getPlatform, installPlugin } = await freshRegistry()
    const providerA: TicklePlugin['content'] = [{
      id: 'a', label: 'A', handles: () => false,
      list: async () => ({ items: [], next: null }),
      load: async () => { throw new Error('unused') },
    }]
    const providerB: TicklePlugin['content'] = [{
      id: 'b', label: 'B', handles: () => false,
      list: async () => ({ items: [], next: null }),
      load: async () => { throw new Error('unused') },
    }]
    installPlugin({ id: 'p1', name: 'P1', version: '1', content: providerA })
    installPlugin({ id: 'p2', name: 'P2', version: '1', content: providerB })
    expect(getPlatform().content.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('keeps the defaults reachable through getDefaults() after storage/share are replaced (F12)', async () => {
    const { getPlatform, getDefaults, installPlugin } = await freshRegistry()
    const pluginShare: TicklePlugin['share'] = {
      id: 'plugin-share',
      supports: { anonymous: false, owned: true, revoke: true, fork: true },
      share: async () => ({ code: 'x', url: 'http://app.example/s/x', shortUrl: null }),
      match: () => null,
      resolve: async () => null,
    }
    installPlugin({
      id: 'p', name: 'Plugin', version: '1.0.0',
      storage: { id: 'plugin-storage', remote: true, list: async () => [], load: (async () => null) as never, save: async () => { throw new Error('unused') }, remove: async () => {} },
      share: pluginShare,
    })

    expect(getPlatform().storage.id).toBe('plugin-storage')
    expect(getPlatform().share).toBe(pluginShare)
    // The defaults are untouched and still the local/hash providers.
    const defaults = getDefaults()
    expect(defaults.storage.id).toBe('local')
    expect(defaults.share.id).toBe('hash')
  })
})

describe('loadPluginsWith (the injectable core of loadConfiguredPlugins, preflight F14a)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => { errorSpy.mockRestore(); infoSpy.mockRestore() })

  it('a 404 config leaves the defaults in place and logs', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const before = getPlatform()
    const fetchImpl = vi.fn(async () => jsonResponse(404, null))
    const importModule = vi.fn(async () => { throw new Error('should not be called') })

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(getPlatform()).toBe(before)
    expect(importModule).not.toHaveBeenCalled()
    expect(infoSpy).toHaveBeenCalled()
  })

  it('a network error (fetch rejects) leaves the defaults in place and logs', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const before = getPlatform()
    const fetchImpl = vi.fn(async () => { throw new Error('network down') })
    const importModule = vi.fn()

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(getPlatform()).toBe(before)
    expect(importModule).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('refuses a cross-origin plugin url and leaves the defaults in place', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const before = getPlatform()
    const fetchImpl = vi.fn(async () => jsonResponse(200, { plugins: ['http://evil.example/plugin.js'] }))
    const importModule = vi.fn()

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(importModule).not.toHaveBeenCalled()
    expect(getPlatform()).toBe(before)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('accepts a same-origin absolute url and a same-origin relative url', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const activate = vi.fn(async (_h: TickleHost) => ({
      id: 'p', name: 'P', version: '1', storage: undefined,
    } as TicklePlugin))
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      plugins: ['http://app.example/plugins/a.js', '/plugins/b.js'],
    }))
    const importModule = vi.fn(async () => ({ default: activate }))

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(importModule).toHaveBeenCalledTimes(2)
    expect(importModule).toHaveBeenNthCalledWith(1, 'http://app.example/plugins/a.js')
    expect(importModule).toHaveBeenNthCalledWith(2, 'http://app.example/plugins/b.js')
    expect(activate).toHaveBeenCalledTimes(2)
    void getPlatform()
  })

  it('a plugin whose ActivatePlugin throws leaves the defaults in place and logs', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const before = getPlatform()
    const activate = vi.fn(async () => { throw new Error('boom') })
    const fetchImpl = vi.fn(async () => jsonResponse(200, { plugins: ['/plugins/a.js'] }))
    const importModule = vi.fn(async () => ({ default: activate }))

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(activate).toHaveBeenCalledTimes(1)
    expect(getPlatform()).toBe(before)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('a plugin module rejecting on import leaves the defaults in place and logs', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const before = getPlatform()
    const fetchImpl = vi.fn(async () => jsonResponse(200, { plugins: ['/plugins/a.js'] }))
    const importModule = vi.fn(async () => { throw new Error('404 module not found') })

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(getPlatform()).toBe(before)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('a module with no default export function is skipped and logs', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const before = getPlatform()
    const fetchImpl = vi.fn(async () => jsonResponse(200, { plugins: ['/plugins/a.js'] }))
    const importModule = vi.fn(async () => ({ default: { not: 'a function' } }))

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(getPlatform()).toBe(before)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('a malformed config (not { plugins: string[] }) leaves the defaults in place and logs', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const before = getPlatform()
    const fetchImpl = vi.fn(async () => jsonResponse(200, { nope: true }))
    const importModule = vi.fn()

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(importModule).not.toHaveBeenCalled()
    expect(getPlatform()).toBe(before)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('a working plugin installs and its providers replace the defaults', async () => {
    const { getPlatform, loadPluginsWith } = await freshRegistry()
    const pluginStorage: TicklePlugin['storage'] = {
      id: 'plugin-storage', remote: true,
      list: async () => [], load: (async () => null) as never,
      save: async () => { throw new Error('unused') }, remove: async () => {},
    }
    const activate = vi.fn(async (h: TickleHost) => {
      expect(h).toBe(host)
      return { id: 'p', name: 'P', version: '1', storage: pluginStorage } satisfies TicklePlugin
    })
    const fetchImpl = vi.fn(async () => jsonResponse(200, { plugins: ['/plugins/a.js'] }))
    const importModule = vi.fn(async () => ({ default: activate }))

    await loadPluginsWith(host, { fetchImpl, importModule, origin: host.origin, configUrl: '/tickle.config.json' })

    expect(getPlatform().storage).toBe(pluginStorage)
  })
})

describe('loadConfiguredPlugins (spec §2 signature, real fetch)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('a 404 (no config file, the open repo case) leaves the defaults in place', async () => {
    const { getPlatform, loadConfiguredPlugins } = await freshRegistry()
    const before = getPlatform()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, null)))
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    await loadConfiguredPlugins(host)

    expect(getPlatform()).toBe(before)
    infoSpy.mockRestore()
  })
})
