#!/usr/bin/env node
// Local e2e for the plugin (Task 19, no production): builds the plugin against
// the mock gateway, copies it into apps/studio/public (gitignored), runs
// e2e/platform-plugin.spec.ts, then removes the copied files.
//
// The mock gateway is not started here: playwright.config.ts adds it as a
// second webServer when TICKLE_PLUGIN_E2E=1, so it runs as a foreground child
// of the Playwright runner (Playwright stops it; its parent-death watchdog
// frees the port if the runner dies). If the port is taken it exits at once and
// Playwright fails fast; it never talks to whatever else holds the port.
//
// The plugin's dist/ is left pointing at localhost: rebuild it before any release (G3).
//   PLUGIN_REPO=/path/to/tickle-ph-plugin E2E_GW_PORT=8790 npm run test:e2e:plugin
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_REPO = resolve(process.env.PLUGIN_REPO ?? join(ROOT, '..', 'tickle-ph-plugin'))
const PORT = Number(process.env.IVORIES_E2E_PORT ?? 5191)
const GW_PORT = Number(process.env.E2E_GW_PORT ?? 8790)
const PUBLIC = join(ROOT, 'apps', 'studio', 'public')
const BUNDLE = join(PLUGIN_REPO, 'dist', 'tickle-ph-plugin.js')

if (!existsSync(join(PLUGIN_REPO, 'package.json'))) {
  console.error(`[e2e-plugin] no plugin repo at ${PLUGIN_REPO}; set PLUGIN_REPO`)
  process.exit(2)
}

const GW = `http://localhost:${GW_PORT}`
execFileSync('npm', ['run', 'build'], { cwd: PLUGIN_REPO, stdio: 'inherit', env: { ...process.env, PH_BASE_URL: GW } })
if (!readFileSync(BUNDLE, 'utf8').includes(GW)) {
  console.error(`[e2e-plugin] the built bundle does not point at ${GW}`)
  process.exit(1)
}

let status = 1
try {
  mkdirSync(join(PUBLIC, 'plugins'), { recursive: true })
  copyFileSync(BUNDLE, join(PUBLIC, 'plugins', 'tickle-ph-plugin.js'))
  writeFileSync(join(PUBLIC, 'tickle.config.json'), JSON.stringify({ plugins: ['/plugins/tickle-ph-plugin.js'] }) + '\n')
  const run = spawnSync('npx', ['playwright', 'test', 'e2e/platform-plugin.spec.ts', ...process.argv.slice(2)], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      IVORIES_E2E_PORT: String(PORT),
      E2E_GW_PORT: String(GW_PORT),
      PLUGIN_REPO,
      TICKLE_PLUGIN_E2E: '1',
    },
  })
  status = run.status ?? 1
} finally {
  rmSync(join(PUBLIC, 'plugins'), { recursive: true, force: true })
  rmSync(join(PUBLIC, 'tickle.config.json'), { force: true })
}
console.log(`[e2e-plugin] done. ${PLUGIN_REPO}/dist points at ${GW}: rebuild it (npm run build) before any release.`)
process.exit(status)
