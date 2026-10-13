#!/usr/bin/env node
// Local e2e for the plugin (Task 19, no production): builds the plugin against
// the mock gateway into a temporary directory (never the plugin's release
// dist/, which G3 hashes), copies it into apps/studio/public (gitignored), runs
// e2e/platform-plugin.spec.ts, then removes the copied files and the build,
// also on failure and on SIGINT/SIGTERM/SIGHUP.
//
// The mock gateway is not started here: playwright.config.ts adds it as a
// second webServer when TICKLE_PLUGIN_E2E=1, so it runs as a foreground child
// of the Playwright runner (Playwright stops it; its parent-death watchdog
// frees the port if the runner dies). If the port is taken the run fails fast;
// it never talks to whatever else holds the port.
//   PLUGIN_REPO=/path/to/tickle-ph-plugin E2E_GW_PORT=8790 npm run test:e2e:plugin
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_REPO = resolve(process.env.PLUGIN_REPO ?? join(ROOT, '..', 'tickle-ph-plugin'))
const PORT = Number(process.env.IVORIES_E2E_PORT ?? 5191)
const GW_PORT = Number(process.env.E2E_GW_PORT ?? 8790)
const PUBLIC = join(ROOT, 'apps', 'studio', 'public')
const GW = `http://localhost:${GW_PORT}`

if (!existsSync(join(PLUGIN_REPO, 'package.json'))) {
  console.error(`[e2e-plugin] no plugin repo at ${PLUGIN_REPO}; set PLUGIN_REPO`)
  process.exit(2)
}

const OUT = mkdtempSync(join(tmpdir(), 'tickle-plugin-e2e-'))
let child = null
let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  rmSync(join(PUBLIC, 'plugins'), { recursive: true, force: true })
  rmSync(join(PUBLIC, 'tickle.config.json'), { force: true })
  rmSync(OUT, { recursive: true, force: true })
}
let signalled = null
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    signalled = sig
    // Let Playwright stop its webServers; cleanup runs when it exits (below).
    if (child && child.exitCode === null) child.kill(sig)
    else { cleanup(); process.exit(130) }
  })
}

let status = 1
try {
  execFileSync('npm', ['run', 'build:e2e'], {
    cwd: PLUGIN_REPO, stdio: 'inherit', env: { ...process.env, PH_BASE_URL: GW, PLUGIN_OUT_DIR: OUT },
  })
  const bundle = join(OUT, 'tickle-ph-plugin.js')
  if (!readFileSync(bundle, 'utf8').includes(GW)) throw new Error(`the e2e bundle does not point at ${GW}`)
  mkdirSync(join(PUBLIC, 'plugins'), { recursive: true })
  copyFileSync(bundle, join(PUBLIC, 'plugins', 'tickle-ph-plugin.js'))
  writeFileSync(join(PUBLIC, 'tickle.config.json'), JSON.stringify({ plugins: ['/plugins/tickle-ph-plugin.js'] }) + '\n')
  if (!signalled) {
    // The CLI directly, not through npx, so a forwarded signal reaches Playwright.
    child = spawn(join(ROOT, 'node_modules', '.bin', 'playwright'), ['test', 'e2e/platform-plugin.spec.ts', ...process.argv.slice(2)], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, IVORIES_E2E_PORT: String(PORT), E2E_GW_PORT: String(GW_PORT), PLUGIN_REPO, TICKLE_PLUGIN_E2E: '1' },
    })
    status = await new Promise((done) => {
      child.on('error', () => done(1))
      child.on('exit', (code) => done(code ?? 1))
    })
  }
} catch (e) {
  console.error(`[e2e-plugin] ${e instanceof Error ? e.message : e}`)
  status = 1
} finally {
  cleanup()
}
process.exit(signalled ? 130 : status)
