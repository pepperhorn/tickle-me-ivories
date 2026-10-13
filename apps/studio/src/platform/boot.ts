// Boot-time platform wiring (spec §2; runbook §3.3: loadConfiguredPlugins was
// never called). The TickleHost is what a plugin gets from the app: the app's
// own codecs, so a plugin that imports tickle's types only can still decode
// shares as shared and strip camera ids before anything leaves the browser.
import { decodeLook, decodeScene, sceneForShare } from 'ivories/core'
import type { TickleHost } from 'ivories/core'
import { loadConfiguredPlugins } from './registry'

/** Set at build time (Dockerfile ARG APP_VERSION -> VITE_APP_VERSION). */
export const APP_VERSION: string = (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.0.0-dev'

export function makeTickleHost(origin: string = location.origin): TickleHost {
  return {
    appVersion: APP_VERSION,
    origin,
    decodeScene: (u, o) => decodeScene(u, o),
    decodeLook: (u) => decodeLook(u),
    sceneForShare: (s) => sceneForShare(s),
  }
}

const NO_PLUGIN_PATHS = new Set(['/debug', '/embed-fixture'])

/**
 * Starts loading the configured plugins for the app's routes. The caller does
 * not await it: the app never blocks on plugins, and the registry notifies
 * subscribers when one installs. Null on routes that never load plugins.
 */
export function startPlatform(
  pathname: string,
  load: (host: TickleHost) => Promise<void> = loadConfiguredPlugins,
  host: TickleHost = makeTickleHost(),
): Promise<void> | null {
  if (NO_PLUGIN_PATHS.has(pathname.replace(/\/+$/, ''))) return null
  return load(host).catch((e: unknown) => { console.error('[platform] plugin loading failed', e) })
}
