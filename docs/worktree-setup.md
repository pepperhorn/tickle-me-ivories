# Worktree setup

The project uses npm workspaces and the committed package-lock.json. T3 project
setup has not been inspected or changed by orch-init; verify its current setup
before launching an implementation task.

## Local PepperScore prerequisite

The library currently declares PepperScore as a local development tarball:
`file:../../../../../tmp/pepperscore-pack/pepperscore-0.3.0.tgz`, relative to
packages/ivories. The lockfile also contains a relative file resolution. In the
main checkout these resolve to `/tmp/pepperscore-pack/pepperscore-0.3.0.tgz`,
which was present on 2026-10-26. A worktree at a different directory depth can
resolve those paths elsewhere; this is a known portability limitation.

Before running npm ci in a fresh worktree, check both resolutions:

```bash
node --input-type=module <<'JS'
import fs from 'node:fs'
import path from 'node:path'
const pkg = JSON.parse(fs.readFileSync('packages/ivories/package.json', 'utf8'))
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const declared = path.resolve('packages/ivories', pkg.devDependencies.pepperscore.slice(5))
const locked = lock.packages['node_modules/pepperscore'].resolved
if (!locked.startsWith('file:')) throw new Error('Reinspect the changed PepperScore lockfile source')
for (const target of new Set([declared, path.resolve(locked.slice(5))])) {
  fs.accessSync(target, fs.constants.R_OK)
  console.log('Readable dependency archive:', target)
}
JS
npm ci
npm run build -w packages/ivories
```

If a path does not resolve, report the exact dependency path to the lead and
resolve setup before dispatch. Do not rewrite package manifests or lockfiles,
install a different PepperScore version, or make filesystem aliases silently.
A portable archive dependency is a separate implementation change.

## Secrets and host configuration

Baseline tests and builds require no production credentials. No .env files or
host plugin configuration are copied automatically. The ignored
apps/studio/public/tickle.config.json, apps/studio/public/plugins/, and
deploy/local-plugin/ are injected separately for platform-specific testing.
Use the existing documented fixture workflows for notation/plugin E2E tests;
do not infer a production target from local configuration.

## Validation and previews

Run `npm run lint && npm test && npm run check && npm run build` for the default
verification gate. Add relevant E2E/browser checks to each implementation plan;
the default gate does not exercise real MIDI hardware or platform credentials.

Allocate the server port through the handoff: `5200 + NNNN*10 + N` (N = 0 for
a single-task item). Start Vite using
`npm run dev -- --host 0.0.0.0 --port PORT --strictPort` with the allocated port.
Check for an existing listener before starting and preserve existing services.
Verify private Tailscale access and give the user that URL. The existing preview
on port 5176 predates this port allocation; initialization does not restart it.
