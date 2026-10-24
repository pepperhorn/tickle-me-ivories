#!/usr/bin/env node
// Runs the notation e2e specs with the notation path required (PEPPERSCORE_REQUIRED=1):
// notation-sync and the embed smoke must engrave with the real pepperscore, never fall back
// to notation-unavailable. pepperscore (>= 0.3) is a required peer and a devDependency of
// ivories, so it is already installed. To try another build, pass a tarball:
//   PEPPERSCORE_TARBALL=/abs/path/pepperscore-0.3.0.tgz npm run test:e2e:notation
// which is installed with `npm install --no-save` and the manifests restored byte for byte
// afterwards (the devDependency's own install is put back too).
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const tarball = process.env.PEPPERSCORE_TARBALL
if (tarball && !existsSync(tarball)) {
  console.error(`PEPPERSCORE_TARBALL does not exist: ${tarball}`)
  process.exit(2)
}

const KEEP = ['package.json', 'package-lock.json', 'apps/studio/package.json', 'packages/ivories/package.json']
const saved = new Map(KEEP.map((f) => [f, readFileSync(resolve(root, f))]))
const npm = (...args) => execFileSync('npm', args, { cwd: root, stdio: 'inherit' })

let status = 1
try {
  if (tarball) npm('install', '--no-save', '--no-audit', '--no-fund', resolve(tarball))
  const run = spawnSync('npx', ['playwright', 'test', 'e2e/notation-sync.spec.ts', 'e2e/embed-fixture.spec.ts', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PEPPERSCORE_REQUIRED: '1', IVORIES_E2E_PORT: process.env.IVORIES_E2E_PORT ?? '5191' },
  })
  status = run.status ?? 1
} finally {
  if (tarball) {
    for (const [f, bytes] of saved) writeFileSync(resolve(root, f), bytes)
    try { npm('install', '--no-audit', '--no-fund') } catch { /* the manifests are restored either way */ }
  }
}
process.exit(status)
