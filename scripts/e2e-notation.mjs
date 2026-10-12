#!/usr/bin/env node
// Runs the notation e2e specs against a local pepperscore 0.2 tarball (R9: 0.2 is not
// published). Usage:
//   PEPPERSCORE_TARBALL=/abs/path/pepperscore-0.2.0.tgz npm run test:e2e:notation
// Installs the tarball with `npm install --no-save`, runs notation-sync and the embed
// smoke with the notation path required, then uninstalls it and restores the manifests
// byte for byte, so nothing that points at a local path can be committed.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tarball = process.env.PEPPERSCORE_TARBALL
if (!tarball || !existsSync(tarball)) {
  console.error('Set PEPPERSCORE_TARBALL to a pepperscore 0.2 tarball, e.g.\n'
    + '  (cd ../pepperscore-clock && npm run build && npm pack -w pepperscore --pack-destination /tmp)\n'
    + '  PEPPERSCORE_TARBALL=/tmp/pepperscore-0.2.0.tgz npm run test:e2e:notation')
  process.exit(2)
}

const root = resolve(import.meta.dirname, '..')
const KEEP = ['package.json', 'package-lock.json', 'apps/studio/package.json', 'packages/ivories/package.json']
const saved = new Map(KEEP.map((f) => [f, readFileSync(resolve(root, f))]))
const npm = (...args) => execFileSync('npm', args, { cwd: root, stdio: 'inherit' })

let status = 1
try {
  npm('install', '--no-save', '--no-audit', '--no-fund', resolve(tarball))
  const run = spawnSync('npx', ['playwright', 'test', 'e2e/notation-sync.spec.ts', 'e2e/embed-fixture.spec.ts', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PEPPERSCORE_REQUIRED: '1', IVORIES_E2E_PORT: process.env.IVORIES_E2E_PORT ?? '5191' },
  })
  status = run.status ?? 1
} finally {
  try { npm('uninstall', '--no-save', '--no-audit', '--no-fund', 'pepperscore') } catch { /* restored below either way */ }
  for (const [f, bytes] of saved) writeFileSync(resolve(root, f), bytes)
}
process.exit(status)
