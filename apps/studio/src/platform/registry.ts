// The platform registry (spec §2 "Registry"). Holds the `Platform` the app
// actually uses -- the provider set read by UI code -- and the loader that
// turns `/tickle.config.json` into an installed plugin.
//
// getPlatform() returns a stable snapshot object, rebuilt only inside
// installPlugin (preflight F15): task 2.5's UI reads it through
// useSyncExternalStore, whose getSnapshot must return the same reference
// across calls when nothing changed, or React re-renders forever.
//
// The offline defaults (LocalStorageProvider, HashShareProvider, and an
// empty content list until task 3.4's OpenSongsContentProvider ships) stay
// reachable through getDefaults() even after a plugin replaces auth/storage/
// share (preflight F12): a plugin's ShareProvider only resolves the links its
// own backend minted, so a `#share=` link made by this app, or a save sitting
// in localStorage, must not become unreachable just because a plugin
// installed. Whoever resolves a link or lists saves (task 2.5) tries
// `getPlatform()` first and falls back to `getDefaults()`.

import type {
  ActivatePlugin, AuthProvider, ContentProvider, ShareProvider, StorageProvider, TickleHost, TicklePlugin,
} from 'ivories/core'
import { LocalStorageProvider } from 'ivories/core'
import { HashShareProvider } from 'ivories/core'

export interface Platform {
  auth: AuthProvider | null
  storage: StorageProvider
  share: ShareProvider
  content: ContentProvider[]
}

const FALLBACK_ORIGIN = 'http://localhost'

/** `location` is always defined under jsdom and in the browser; the fallback
    only matters for a non-DOM module evaluation (e.g. an SSR build step). */
function currentOrigin(): string {
  return typeof location !== 'undefined' && location.origin ? location.origin : FALLBACK_ORIGIN
}

function makeDefaults(origin: string): Platform {
  return {
    auth: null,
    storage: new LocalStorageProvider(),
    share: new HashShareProvider(origin),
    content: [], // OpenSongsContentProvider ships in task 3.4 (preflight F14b)
  }
}

const DEFAULTS: Platform = makeDefaults(currentOrigin())

let current: Platform = DEFAULTS
const listeners = new Set<() => void>()

/** A stable snapshot: the exact same object reference until installPlugin
    next rebuilds it (preflight F15). Safe to call as a useSyncExternalStore
    getSnapshot. */
export function getPlatform(): Platform {
  return current
}

/** The offline defaults, always reachable regardless of what is currently
    installed (preflight F12). Returns the same object every call. */
export function getDefaults(): Platform {
  return DEFAULTS
}

export function subscribePlatform(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function notify(): void {
  for (const listener of listeners) listener()
}

/**
 * Installs a plugin's providers into the current Platform and notifies every
 * subscriber. Per preflight F14c ("replace or extend" is unspecified beyond
 * this): `auth`, `storage` and `share` REPLACE the current value when the
 * plugin supplies one (and are left alone otherwise); `content` EXTENDS
 * (appends to) the current list. Always rebuilds and notifies, even for a
 * plugin that supplies none of the four -- installation itself is the event
 * subscribers care about.
 */
export function installPlugin(plugin: TicklePlugin): void {
  current = {
    auth: plugin.auth ?? current.auth,
    storage: plugin.storage ?? current.storage,
    share: plugin.share ?? current.share,
    content: plugin.content ? [...current.content, ...plugin.content] : current.content,
  }
  notify()
}

// ---- plugin config loading ----

interface TickleConfig { plugins: string[] }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function isTickleConfig(v: unknown): v is TickleConfig {
  return isObj(v) && Array.isArray(v.plugins) && v.plugins.every((p) => typeof p === 'string')
}

/** The subset of `fetch`'s response this loader needs, so a test double does
    not have to implement the full Response interface. */
export interface FetchLike {
  (url: string): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
}

/** Everything loadPluginsWith needs from the outside world, all injectable
    (preflight F14a): `fetch` and `import()` cannot be intercepted cleanly for
    the 404/network-error/cross-origin/throwing-plugin tests otherwise. */
export interface PluginLoaderDeps {
  fetchImpl: FetchLike
  importModule: (url: string) => Promise<unknown>
  origin: string
  configUrl: string
}

function isActivatePlugin(v: unknown): v is ActivatePlugin {
  return typeof v === 'function'
}

async function loadOnePlugin(host: TickleHost, deps: PluginLoaderDeps, rawUrl: string): Promise<void> {
  // preflight F14d: resolve relative to the app's own origin, then compare
  // `.origin` -- this also rejects a malformed URL (new URL throws).
  let url: URL
  try {
    url = new URL(rawUrl, deps.origin)
  } catch (e) {
    console.error(`[platform] plugin url is not a valid URL: ${rawUrl}`, e)
    return
  }
  if (url.origin !== deps.origin) {
    console.error(`[platform] refusing cross-origin plugin url: ${rawUrl}`)
    return
  }

  let mod: unknown
  try {
    mod = await deps.importModule(url.href)
  } catch (e) {
    console.error(`[platform] failed to load plugin module: ${rawUrl}`, e)
    return
  }

  const activate: unknown = isObj(mod) ? mod.default : undefined
  if (!isActivatePlugin(activate)) {
    console.error(`[platform] plugin module has no default export function: ${rawUrl}`)
    return
  }

  let plugin: TicklePlugin
  try {
    plugin = await activate(host)
  } catch (e) {
    console.error(`[platform] plugin threw while activating: ${rawUrl}`, e)
    return
  }

  installPlugin(plugin)
}

/**
 * The real loader, driven entirely through `deps` (preflight F14a). Fetches
 * `deps.configUrl`; a non-OK response (404 included) or a network error
 * (fetchImpl rejecting) logs and leaves the current Platform untouched --
 * the app never blocks on this. A same-origin entry that fails to load, or
 * whose ActivatePlugin throws, is skipped (logged) without affecting the
 * other entries or the defaults.
 */
export async function loadPluginsWith(host: TickleHost, deps: PluginLoaderDeps): Promise<void> {
  let res: { ok: boolean; status: number; json(): Promise<unknown> }
  try {
    res = await deps.fetchImpl(deps.configUrl)
  } catch (e) {
    console.error('[platform] failed to fetch the plugin config', e)
    return
  }
  if (!res.ok) {
    // Spec §2: "A 404 ... logs and leaves the defaults in place." A missing
    // config is the expected shape of the open repo (it ships none), so this
    // logs at `info`, not `error`, unlike every other failure here.
    if (res.status === 404) console.info('[platform] no plugin config found (404); using defaults')
    else console.error(`[platform] plugin config fetch failed with status ${res.status}`)
    return
  }

  let config: unknown
  try {
    config = await res.json()
  } catch (e) {
    console.error('[platform] plugin config is not valid JSON', e)
    return
  }
  if (!isTickleConfig(config)) {
    console.error('[platform] plugin config is malformed (expected { plugins: string[] })')
    return
  }

  // Sequential, not Promise.all: plugins install in config order, and a
  // later entry seeing an already-installed earlier one is part of the
  // "replace or extend" contract (preflight F14c).
  for (const rawUrl of config.plugins) {
    await loadOnePlugin(host, deps, rawUrl)
  }
}

/** Spec §2's signature: fetches `/tickle.config.json` (or
    VITE_TICKLE_CONFIG_URL), same-origin-checked against `host.origin`,
    importing each entry with a real dynamic import. Thin wrapper over
    loadPluginsWith with real deps. */
export async function loadConfiguredPlugins(host: TickleHost): Promise<void> {
  const configUrl: string = (import.meta.env.VITE_TICKLE_CONFIG_URL as string | undefined) ?? '/tickle.config.json'
  return loadPluginsWith(host, {
    fetchImpl: (url) => fetch(url),
    importModule: (url) => import(/* @vite-ignore */ url),
    origin: host.origin,
    configUrl,
  })
}
