#!/usr/bin/env node
// Build-time plugin injection for the hosted build (runbook §3.0 decision 4).
// The open repo ships no plugin and no tickle.config.json; a deployment that
// wants one passes PLUGIN_BUNDLE_URL + PLUGIN_BUNDLE_SHA256 as Docker build
// args. The bundle is pinned by hash: a changed release asset fails the build.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PLUGIN_FILE = 'tickle-ph-plugin.js'

export async function injectPlugin({ distDir, url, sha256, fetchImpl = fetch }) {
  const u = (url ?? '').trim()
  const want = (sha256 ?? '').trim().toLowerCase()
  if (!u && !want) return { injected: false }
  if (!u || !/^[0-9a-f]{64}$/.test(want)) {
    throw new Error('PLUGIN_BUNDLE_URL and PLUGIN_BUNDLE_SHA256 (64 hex) must be set together')
  }
  let bytes
  if (u.startsWith('file:')) {
    bytes = await readFile(fileURLToPath(u))
  } else if (u.startsWith('https://')) {
    const res = await fetchImpl(u, { redirect: 'follow' })
    if (!res.ok) throw new Error(`plugin download failed: HTTP ${res.status}`)
    bytes = Buffer.from(await res.arrayBuffer())
  } else {
    throw new Error('PLUGIN_BUNDLE_URL must be https:// or file:')
  }
  const got = createHash('sha256').update(bytes).digest('hex')
  if (got !== want) throw new Error(`plugin sha256 mismatch: expected ${want}, got ${got}`)
  await mkdir(join(distDir, 'plugins'), { recursive: true })
  await writeFile(join(distDir, 'plugins', PLUGIN_FILE), bytes)
  await writeFile(join(distDir, 'tickle.config.json'), JSON.stringify({ plugins: [`/plugins/${PLUGIN_FILE}`] }) + '\n')
  return { injected: true, sha256: got }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const distDir = process.argv[2]
  if (!distDir) {
    console.error('usage: node scripts/inject-plugin.mjs <distDir>')
    process.exit(2)
  }
  injectPlugin({ distDir, url: process.env.PLUGIN_BUNDLE_URL, sha256: process.env.PLUGIN_BUNDLE_SHA256 }).then(
    (r) => console.log(r.injected ? `[inject-plugin] installed ${PLUGIN_FILE} (sha256 ${r.sha256})` : '[inject-plugin] open build: no plugin'),
    (e) => { console.error(`[inject-plugin] ${e.message}`); process.exit(1) },
  )
}
