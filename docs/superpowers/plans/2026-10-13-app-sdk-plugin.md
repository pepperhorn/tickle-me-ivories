# Platform SDK phase 1 + tickle-ph-plugin phase 3: implementation plan (re-planned 2026-10-13)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@pepperhorn/app-sdk` 0.1.0 (phase 1), `@pepperhorn/tickle-ph-plugin` 0.1.0, the studio's account UI, `/s/<code>` share route and runtime plugin loading, plus the ivories.pepperhorn.com hosting artifacts (phase 3), all verified against a mocked gateway. Nothing is published, deployed or pushed.

**Architecture:** The SDK is a framework-free HTTP client for directus-otp-auth (`/otp-auth/*`, bearer transport) and the ph gateway (`/ph/v1/*`), with optional React hooks and a headless OTP form, and ships an in-memory fake gateway (`@pepperhorn/app-sdk/testing`) that every later test and the local e2e use. The plugin adapts the SDK to tickle's provider interfaces (type-only import from `ivories/core`), is bundled into one self-contained ESM file, and is loaded at runtime by the studio from same-origin `/tickle.config.json`. The studio stays backend-independent: it never names the PepperHorn scope and talks only to `AuthProvider`/`StorageProvider`/`ShareProvider`.

**Tech Stack:** TypeScript ~6.0.2, zod ^4.6.7 imported as `zod/v4`, React 19, vitest ^5 (jsdom for DOM tests), tsup ^8.5.1 (JS) + `tsc` (declarations), Playwright ~1.62 (tickle e2e), Node 22 in Docker (local Node 25), nginx:alpine.

**Spec:** `docs/superpowers/specs/2026-09-26-pepperhorn-platform-sdk-design.md` (§3 SDK, §2 and §4 plugin, §7 share routing, §8.5 caps, §9 security). Also read `docs/superpowers/plans/2026-10-13-platform-golive-runbook.md` §2, §3 and §5: **where the runbook corrects the 2026-09-26 plan, the runbook wins** (current paths, SceneV2, CSP, hosting pattern). The gateway contract is the code in `~/ph-apps-extensions/endpoints/ph/src/` (branch `chore/gate-retarget`) and `~/directus-otp-auth/packages/directus/src/routes.js`; wire shapes in this plan are copied from there.

## Repos, branches and order

| Tag | Repo (local path) | Branch for this work | Notes |
|---|---|---|---|
| `[tickle]` | `/home/shaun/tmi-plugin` (worktree of `~/tickle-me-ivorys`) | `feat/platform-plugin` (already created from `master`) | Run `npm ci` in the worktree once before Task 1. |
| `[sdk]` | `/home/shaun/app-sdk` (`pepperhorn/app-sdk`, MIT, only `LICENSE` committed on `main`) | `feat/sdk-0.1` (Task 2 creates it) | |
| `[plugin]` | `/home/shaun/tickle-ph-plugin` (`pepperhorn/tickle-ph-plugin`, MIT, only `LICENSE` on `main`) | `feat/plugin-0.1` (Task 10 creates it) | |

Order: **Task 1** first (it changes the `ivories/core` types the plugin compiles against and re-packs the tarball). Then Tasks 2–9 (sdk) and Tasks 15–18 (tickle) can run in parallel. Tasks 10–14 (plugin) need Tasks 1 and 6 (the SDK tarball). Task 19 needs everything. Task 20 and section G are **gated** and are not executed by this plan.

Dev-time dependency wiring (until the gated publishes in section G):

- plugin → `ivories`: `"ivories": "file:/tmp/ivories-pack/ivories-0.1.0.tgz"` (devDependency, re-packed by Task 1).
- plugin → SDK: `"@pepperhorn/app-sdk": "file:/tmp/app-sdk-pack/pepperhorn-app-sdk-0.1.0.tgz"` (devDependency, packed by Task 6, re-packed by Tasks 7–9).
- G3 switches both to registry ranges (`ivories@^0.1.0`, `@pepperhorn/app-sdk@^0.1.0`) once published, and only then adds plugin CI (CI cannot see `/tmp`).

## Global Constraints

- TypeScript `~6.0.2`; vitest `^5.0.0`; React `>=19` (peer, optional for SDK core); zod peer `>=3.25 <5`, always imported from `'zod/v4'`.
- `erasableSyntaxOnly` everywhere: no parameter properties, no enums, no namespaces.
- App slug `tickle-me-ivories`; default base URL `https://apps.pepperhorn.com`; OTP code length `8`; bearer token shape `^[0-9a-f-]{36}\.[A-Za-z0-9_-]{16,}$`.
- Share codes `^[A-Za-z0-9]{10}$` (gateway base57); share path `/s/<code>`; default `parseShareCode` pattern `/^\/s\/([A-Za-z0-9]{10})\/?$/`.
- Caps (spec §8.5): scene ≤ 256 KiB, look ≤ 16 KiB, ≤ 64 voices, gradient stops 2–16, names ≤ 128 chars, colours ≤ 64 chars, font family `^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$`, uploaded MIDI ≤ 128 KiB raw; scene `v` ∈ {1, 2}, look `v` = 1.
- D14: `ph_uid` never appears in any SDK type, request, log line, fixture or test.
- SDK error messages are user-safe and fixed; raw server text is never surfaced.
- A plugin-thrown error is recognised by shape (`isPlatformError`, `isPayloadVersionError` from `ivories/core`), never by `instanceof`.
- Studio imports only `ivories`, `ivories/core`, `ivories/style.css` (`scripts/check-public-imports.mjs`); the literal PepperHorn npm scope never appears under `apps/studio/src` or `packages/ivories/src` (`pepperhornScope.test.ts`, `smoke.test.ts`).
- UI: contextual class names alongside Tailwind utilities on every element; Poppins (already the studio base font in `index.css`).
- Dev servers bind `0.0.0.0` (`npm run dev` in the studio already does).
- CSP `connect-src` must include `'self' https://apps.pepperhorn.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://smpldsnds.github.io https://gleitz.github.io https://goldst.dev`.
- Hosting: Coolify Dockerfile, `node:22-alpine` build → `nginx:alpine`, `try_files $uri $uri/ /index.html`.
- Every commit ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- No `npm publish`, `git push`, `gh release`, Coolify write, DNS change or production request inside Tasks 1–19. Those are section G and Task 20.

## Review Focus

1. **The plugin installs after the first render while the URL is `/s/<code>`.** A recipient must still get the preview banner; today `useScenes` resolves once on mount and would miss it. Pinned in Task 15 (`useScenes.plugin.test.ts`, "resolves once the plugin installs").
2. **A share of a saved scene leaks this browser's camera `deviceId`s.** Owned shares serve the live save, so `shareSaved`, signed-in `share()` and `update()` must store `sceneForShare` output, and `resolve()` must decode with `{ shared: true }`. Pinned in Task 13 (share tests) and Task 15 (host decode test).
3. **A transient failure on session restore (offline, 5xx, 429) signs the user out.** It must keep the token and retry with backoff; only a 401 signs out. Pinned in Task 4 (restore tests).
4. **nginx drops the CSP on some responses, or serves `index.html` for a missing `/tickle.config.json`.** An `add_header` inside a `location` replaces inherited headers, and `try_files … /index.html` would answer the config fetch with HTML 200. Pinned in Task 18 (`check-hosting` + its test).
5. **Signed out with the plugin installed, saves go to the remote provider and fail.** The scenes panel and "Save a copy" must use the browser's storage until the user signs in. Pinned in Task 15 (saveCopy test) and Task 17 (ScenesSection tests).

## File structure

```
/home/shaun/tmi-plugin (tickle)
  packages/ivories/src/core/platform/types.ts          M  TickleHost + AuthProvider additions (Task 1)
  packages/ivories/src/core/platform/hostContract.test.ts  C  (Task 1)
  packages/ivories/src/core/platform/types.test.ts     M  stale comment (Task 1)
  apps/studio/src/platform/registry.ts                 M  activeStorage() (Task 15)
  apps/studio/src/platform/registry.test.ts            M  fake host gains sceneForShare (Task 1)
  apps/studio/src/platform/boot.ts (+ .test.ts)        C  TickleHost + startPlatform (Task 15)
  apps/studio/src/main.tsx                             M  calls startPlatform (Task 15)
  apps/studio/src/ui/useScenes.ts                      M  re-resolve on install, errors, clearShareLocation, activeStorage (Task 15)
  apps/studio/src/ui/useScenes.test.ts                 M  clearShareHash → clearShareLocation rename only if referenced (Task 15)
  apps/studio/src/ui/useScenes.plugin.test.ts          C  (Task 15)
  apps/studio/src/ui/useAuthState.ts                   C  (Task 16)
  apps/studio/src/ui/SignInDialog.tsx (+ .test.tsx)    C  (Task 16)
  apps/studio/src/ui/AccountMenu.tsx (+ .test.tsx)     C  (Task 16)
  apps/studio/src/ui/testing/fakeAuth.ts               C  (Task 16)
  apps/studio/src/App.tsx                              M  mounts AccountMenu (Task 16)
  apps/studio/src/studio/ScenesSection.tsx (+ .test.tsx) M/C  storage source + share saved (Task 17)
  apps/studio/src/ui/ScenesPanel.tsx                   M  per-row Share / Stop sharing (Task 17)
  apps/studio/src/ui/SharePanel.tsx                    M  export copyText (Task 17)
  Dockerfile, .dockerignore                            C  (Task 18)
  deploy/nginx.conf, deploy/security-headers.conf      C  (Task 18)
  scripts/inject-plugin.mjs (+ .test.mjs)              C  (Task 18)
  scripts/check-hosting.mjs (+ .test.mjs)              C  (Task 18)
  package.json, .gitignore                             M  (Task 18)
  scripts/e2e-plugin.mjs, e2e/platform-plugin.spec.ts  C  (Task 19)

/home/shaun/app-sdk
  package.json, tsconfig.json, tsconfig.build.json, tsup.config.ts, vitest.config.ts, .gitignore,
  .github/workflows/ci.yml, scripts/check-dist.mjs                      (Task 2)
  src/index.ts                                          entry "."      (Tasks 2–5)
  src/core/errors.ts, http.ts, token-store.ts, schemas.ts, types.ts    (Task 3)
  test/stub-fetch.ts                                                   (Task 3)
  src/core/otp-flow.ts, auth.ts, client.ts                             (Task 4)
  src/core/saves.ts, shares.ts                                         (Task 5)
  src/testing/index.ts, src/testing/fakeGateway.ts      entry "./testing" (Task 6)
  test/integration.test.ts                                             (Task 6)
  src/react/index.ts, PhProvider.tsx, useAuth.ts, useSaves.ts, useShareFromUrl.ts  entry "./react" (Task 7)
  src/ui/index.ts, useOtpForm.ts, OtpDigits.tsx         entry "./ui"   (Task 8)
  scripts/check-pack.mjs, scripts/smoke-auth.ts, scripts/smoke-saves.ts, README.md (Task 9)

/home/shaun/tickle-ph-plugin
  package.json, tsconfig.json, tsconfig.build.json, tsup.config.ts, vitest.config.ts, .gitignore,
  src/globals.d.ts, src/schema.ts, test/schema.test.ts, test/schema.types.test.ts      (Task 10)
  src/errors.ts, src/auth.ts, test/fixtures.ts, test/auth.test.ts                      (Task 11)
  src/storage.ts, test/storage.test.ts                                                 (Task 12)
  src/share.ts, test/share.test.ts                                                     (Task 13)
  src/index.ts, scripts/check-bundle.mjs, scripts/mock-gateway.ts, test/activate.test.ts, test/flow.test.ts (Task 14)
```

---

## Part A: tickle contract change (do first)

### Task 1 `[tickle]` Extend `TickleHost` and `AuthProvider`, re-pack the ivories tarball

Why: the plugin must decode share payloads with `{ shared: true }` and strip camera ids with `sceneForShare` before anything leaves the browser (carried requirement), but it imports tickle's *types only* and so cannot call those functions itself; the host hands them over. The studio also needs a device list (spec e2e step 5) that `AuthProvider` cannot express today. Both additions change the published `ivories/core` types, so **this must merge before `ivories` 0.1.0 is published (G1), or the publish becomes 0.1.1.**

**Files:**
- Modify: `packages/ivories/src/core/platform/types.ts` (header comment, `AuthProvider`, `TickleHost`, new `PlatformDevice`)
- Modify: `packages/ivories/src/core/platform/types.test.ts:15-22` (stale comment only)
- Create: `packages/ivories/src/core/platform/hostContract.test.ts`
- Modify: `apps/studio/src/platform/registry.test.ts:14-19` (fake host)

**Interfaces:**
- Consumes: `decodeScene(u, o2?: { shared?: boolean }): SceneV2`, `sceneForShare(s: SceneV2): SceneV2` (`scene.ts`), `decodeLook(u): LookV1` (`look.ts`).
- Produces (exported from `ivories/core`):
  ```ts
  export interface PlatformDevice { id: string; label: string | null; userAgent: string | null; lastAccessAt: string | null; current: boolean }
  // AuthProvider gains three OPTIONAL members:
  devices?(): Promise<PlatformDevice[]>
  revokeDevice?(id: string): Promise<void>          // revoking the current device signs this browser out
  signOutEverywhere?(): Promise<void>
  // TickleHost becomes:
  export interface TickleHost {
    appVersion: string
    origin: string
    decodeScene(u: unknown, o?: { shared?: boolean }): SceneV2
    decodeLook(u: unknown): LookV1
    sceneForShare(s: SceneV2): SceneV2
  }
  ```
  Tarball: `/tmp/ivories-pack/ivories-0.1.0.tgz` (overwritten).

- [ ] **Step 0: Install the worktree**

Run: `cd /home/shaun/tmi-plugin && npm ci`
Expected: completes; `npm test` passes on the untouched branch (baseline).

- [ ] **Step 1: Write the failing contract test**

Create `packages/ivories/src/core/platform/hostContract.test.ts`:

```ts
import { describe, it, expect, expectTypeOf } from 'vitest'
import type { AuthProvider, PlatformDevice, TickleHost } from './types'
import { decodeScene, sceneForShare } from './scene'
import { decodeLook } from './look'

// The plugin contract (spec §2, runbook §3.2). A plugin imports these types
// only; the host hands it the real codecs, so the shared-decode option and
// sceneForShare must be part of TickleHost itself.
describe('TickleHost', () => {
  it('is satisfied by the real codecs, including the shared-decode option', () => {
    const host: TickleHost = { appVersion: 't', origin: 'https://x.test', decodeScene, decodeLook, sceneForShare }
    expectTypeOf(host.decodeScene).parameter(1).toEqualTypeOf<{ shared?: boolean } | undefined>()
    expectTypeOf(host.sceneForShare).returns.toEqualTypeOf<ReturnType<typeof sceneForShare>>()
    expect(typeof host.sceneForShare).toBe('function')
  })
})

describe('AuthProvider device management', () => {
  it('is optional, so a provider without it still type-checks', () => {
    expectTypeOf<AuthProvider['devices']>().toEqualTypeOf<(() => Promise<PlatformDevice[]>) | undefined>()
    expectTypeOf<AuthProvider['revokeDevice']>().toEqualTypeOf<((id: string) => Promise<void>) | undefined>()
    expectTypeOf<AuthProvider['signOutEverywhere']>().toEqualTypeOf<(() => Promise<void>) | undefined>()
  })
})
```

- [ ] **Step 2: Run the type check to verify it fails**

Run: `cd /home/shaun/tmi-plugin && npm run check -w packages/ivories`
Expected: FAIL with TS2305 `Module './types' has no exported member 'PlatformDevice'` and TS2353 on `sceneForShare` in the `TickleHost` literal.

- [ ] **Step 3: Edit `types.ts`**

Replace the header comment's first paragraph (lines 3–11, "package.json exposes this file as the `./platform` export …") with:

```ts
// Consumers (the PepperHorn plugin) reach this file as a declaration through
// `ivories/core` (dist/types/core/platform/types.d.ts), as a TYPE-ONLY import.
// It must stay runtime-free: it may import only settings/types.ts,
// model/types.ts, layout/types.ts and ./errors (types.test.ts walks the graph).
```

Keep the rest of the header. Add after the `AuthState` type and change `AuthProvider`:

```ts
/** One signed-in browser or app session, as the account's device list shows it. */
export interface PlatformDevice {
  id: string
  label: string | null
  userAgent: string | null
  lastAccessAt: string | null
  current: boolean
}
export interface AuthProvider {
  readonly id: string
  readonly codeLength: number                // 8 on ph-apps (OTP_AUTH_CODE_DIGITS)
  getState(): AuthState
  subscribe(listener: (s: AuthState) => void): () => void
  requestCode(email: string): Promise<void>  // always resolves for a well-formed email (no enumeration)
  verifyCode(email: string, code: string): Promise<PlatformUser>  // PlatformError('invalid_code')
  signOut(): Promise<void>
  manageAccount?(): void                     // opens the device list (plugin-rendered link/route)
  /** The account's signed-in devices. Optional: a provider without sessions omits it. */
  devices?(): Promise<PlatformDevice[]>
  /** Ends one device's session. Revoking the current device signs this browser out. */
  revokeDevice?(id: string): Promise<void>
  signOutEverywhere?(): Promise<void>
}
```

Replace `TickleHost`:

```ts
export interface TickleHost {
  appVersion: string
  origin: string                                    // for share URLs: `${origin}/s/<code>`
  /** Throws; the app's own validators (§9.1). `shared: true` for a payload from
      someone else's link: camera deviceIds are dropped (they name another
      browser's devices). Own saves decode without it. */
  decodeScene(u: unknown, o?: { shared?: boolean }): SceneV2
  decodeLook(u: unknown): LookV1
  /** What a scene may carry out of this browser (no camera deviceIds). A
      provider applies it to every scene it uploads for sharing. */
  sceneForShare(s: SceneV2): SceneV2
}
```

In `types.test.ts`, replace the comment block above `describe('platform/types.ts stays runtime-free …` (lines 15–22) with:

```ts
// preflight F4, updated 2026-10-13: the plugin type-checks this file through
// `ivories/core`'s emitted declarations, so types.ts (and everything it
// imports) must stay runtime-free. Checked by statically walking the
// relative-import graph rather than by shelling out to a second tsc build.
```

In `apps/studio/src/platform/registry.test.ts`, make the fake host:

```ts
const host: TickleHost = {
  appVersion: '0.0.0-test',
  origin: 'http://app.example',
  decodeScene: (u) => u as never,
  decodeLook: (u) => u as never,
  sceneForShare: (s) => s,
}
```

- [ ] **Step 4: Verify**

Run: `cd /home/shaun/tmi-plugin && npm run check -w packages/ivories && npx tsc -b apps/studio && npm test`
Expected: PASS (type check clean, all vitest projects green, including `types.test.ts`'s runtime-free walk).

- [ ] **Step 5: Re-pack the tarball the plugin consumes**

Run:
```bash
cd /home/shaun/tmi-plugin
rm -f /tmp/ivories-pack/ivories-0.1.0.tgz
npm pack -w packages/ivories --pack-destination /tmp/ivories-pack
tar xOzf /tmp/ivories-pack/ivories-0.1.0.tgz package/dist/types/core/platform/types.d.ts | grep -c "sceneForShare\|PlatformDevice"
```
Expected: `ivories-0.1.0.tgz` written; the grep count is ≥ 2.

- [ ] **Step 6: Commit**

```bash
cd /home/shaun/tmi-plugin
git add packages/ivories/src/core/platform/types.ts packages/ivories/src/core/platform/types.test.ts \
  packages/ivories/src/core/platform/hostContract.test.ts apps/studio/src/platform/registry.test.ts
git commit -m "feat(ivories): TickleHost hands plugins shared decode and sceneForShare; optional device management on AuthProvider" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part B: `@pepperhorn/app-sdk` (`/home/shaun/app-sdk`)

### Task 2 `[sdk]` Scaffold, build, CI

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `.github/workflows/ci.yml`, `scripts/check-dist.mjs`
- Create: `src/index.ts`, `src/react/index.ts`, `src/ui/index.ts`, `src/testing/index.ts`, `src/index.test.ts`

**Interfaces:**
- Produces: entries `.` → `dist/index.js`, `./react` → `dist/react/index.js`, `./ui` → `dist/ui/index.js`, `./testing` → `dist/testing/index.js`, each with a `.d.ts` beside it; `export const SDK_VERSION: string` from `.`.

- [ ] **Step 1: Branch and package manifest**

```bash
cd /home/shaun/app-sdk && git checkout -b feat/sdk-0.1
```

Create `package.json`:

```json
{
  "name": "@pepperhorn/app-sdk",
  "version": "0.1.0",
  "description": "PepperHorn client SDK: email sign-in, saves and share links for PepperHorn apps.",
  "license": "MIT",
  "type": "module",
  "repository": { "type": "git", "url": "git+https://github.com/pepperhorn/app-sdk.git" },
  "sideEffects": false,
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./react": { "types": "./dist/react/index.d.ts", "import": "./dist/react/index.js" },
    "./ui": { "types": "./dist/ui/index.d.ts", "import": "./dist/ui/index.js" },
    "./testing": { "types": "./dist/testing/index.d.ts", "import": "./dist/testing/index.js" },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "rm -rf dist && tsup && tsc -p tsconfig.build.json && node scripts/check-dist.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "prepack": "npm run build"
  },
  "peerDependencies": { "react": ">=19", "zod": ">=3.25 <5" },
  "peerDependenciesMeta": { "react": { "optional": true } }
}
```

Run:
```bash
npm install -D typescript@~6.0.2 vitest@^5.0.0 tsup@^8.5.1 tsx@^4 zod@^4.6.7 react@^19.2.8 react-dom@^19.2.8 \
  @types/react@^19.2.18 @types/react-dom@^19.2.7 @types/node@^24.13.3 jsdom@^29.1.1 @testing-library/react@^16.3.3
```
Expected: `package-lock.json` created, no peer warnings for zod/react.

- [ ] **Step 2: Config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test", "scripts", "vitest.config.ts", "tsup.config.ts"]
}
```

`tsconfig.build.json` (declarations only; tsup emits the JS):
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "declaration": true, "emitDeclarationOnly": true, "rootDir": "src", "outDir": "dist" },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
}
```

`tsup.config.ts`:
```ts
import { defineConfig } from 'tsup'

// JS only: declarations come from tsc (tsconfig.build.json), which keeps the
// d.ts output independent of tsup's bundled TypeScript version.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'ui/index': 'src/ui/index.ts',
    'testing/index': 'src/testing/index.ts',
  },
  format: ['esm'],
  target: 'es2022',
  dts: false,
  splitting: true,
  sourcemap: true,
  treeshake: true,
  external: ['react', 'react/jsx-runtime', 'zod', 'zod/v4'],
})
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

// Node by default; DOM tests opt in with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'], environment: 'node' },
})
```

`.gitignore`:
```
node_modules/
dist/
*.tgz
.env
.env.*
coverage/
```

`.github/workflows/ci.yml`:
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

`scripts/check-dist.mjs`:
```js
// Build guard: every entry and its declaration exist, and the core entry
// never reaches React (directly or through a shared chunk), so a non-React
// app can use the SDK without installing React.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const problems = []
for (const e of ['index', 'react/index', 'ui/index', 'testing/index']) {
  for (const ext of ['.js', '.d.ts']) if (!existsSync(`dist/${e}${ext}`)) problems.push(`missing dist/${e}${ext}`)
}
for (const start of ['dist/index.js', 'dist/testing/index.js']) {
  const seen = new Set()
  const stack = [start]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f) || !existsSync(f)) continue
    seen.add(f)
    const src = readFileSync(f, 'utf8')
    if (/(?:from|import)\s*["']react(?:\/[^"']*)?["']/.test(src)) problems.push(`${f} imports react (reached from ${start})`)
    for (const m of src.matchAll(/(?:from|import)\s*["'](\.\.?\/[^"']+)["']/g)) stack.push(join(dirname(f), m[1]))
  }
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('dist ok')
```

- [ ] **Step 3: Write the failing test**

`src/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SDK_VERSION } from './index.js'

describe('SDK_VERSION', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(SDK_VERSION).toBe(pkg.version)
  })
})
```

Run: `npx vitest run src/index.test.ts`
Expected: FAIL (`./index.js` cannot be resolved).

- [ ] **Step 4: Entry placeholders**

`src/index.ts`:
```ts
/** Kept equal to package.json's version by src/index.test.ts. */
export const SDK_VERSION = '0.1.0'
```
`src/react/index.ts`, `src/ui/index.ts`, `src/testing/index.ts` (each, replaced by Tasks 6–8):
```ts
export {}
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS; build prints `dist ok`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold @pepperhorn/app-sdk (tsup + tsc declarations, vitest, CI)" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3 `[sdk]` Errors, HTTP client, token store, wire schemas

**Files:**
- Create: `src/core/errors.ts`, `src/core/http.ts`, `src/core/token-store.ts`, `src/core/schemas.ts`, `src/core/types.ts`
- Create: `test/stub-fetch.ts`
- Test: `src/core/errors.test.ts`, `src/core/http.test.ts`, `src/core/token-store.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  type PhErrorCode = 'network'|'unavailable'|'unauthorized'|'forbidden'|'not_found'|'conflict'|'rate_limited'|'too_large'|'invalid'|'invalid_code'|'upload_requires_sign_in'|'server'
  class PhError extends Error { code: PhErrorCode; status: number|undefined; retryAfterSec: number|undefined; detail: string|undefined; constructor(code, init?: PhErrorInit) }
  isPhError(e: unknown): e is PhError
  codeForStatus(status: number): PhErrorCode
  errorFromResponse(res: Response, now?: number): Promise<PhError>
  type AuthMode = 'none'|'optional'|'required'
  interface HttpRequest { method: 'GET'|'POST'|'PATCH'|'DELETE'; path: string; query?: Record<string, string|number|undefined>; body?: unknown; auth: AuthMode }
  type Http = <T>(req: HttpRequest, schema: z.ZodType<T>) => Promise<T>
  createHttp(d: { baseUrl: string; fetch: typeof fetch; tokens: TokenStore; onUnauthorized(): void; now?: () => number }): Http
  interface TokenStore { get(): string|null; set(token: string, expiresAt: string): void; clear(): void }
  memoryTokenStore(now?): TokenStore; localStorageTokenStore(key: string, now?): TokenStore
  schemas: VisibilitySchema, AuthUserSchema, SaveSummarySchema, SaveRowSchema(payload), PublicSaveSchema, ShareCreatedSchema, ResolvedShareSchema(payload), DeviceWireSchema, ErrorBodySchema, OkSchema
  types: Visibility, AuthUser, PendingOtp, AuthSnapshot, Device, SaveSummaryRow, SaveRow<T>, PublicSave, ShareCreated, ResolvedShare<T>
  test helpers: stubFetch(routes), json(status, body, headers?), TOKEN
  ```

- [ ] **Step 1: Test helper**

`test/stub-fetch.ts`:
```ts
// A route-table fetch for unit tests. Keys are `METHOD /path`; a handler
// array answers in order and repeats its last entry.
export interface StubCall { method: string; path: string; query: Record<string, string>; auth: string | null; body: unknown }
export type StubHandler = (call: StubCall) => Response | Promise<Response>

export const TOKEN = '0f8fad5b-d9cb-469f-a165-70867728950e.abcdefghijklmnopqrstuvwx'

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

export function stubFetch(routes: Record<string, StubHandler | StubHandler[]>) {
  const calls: StubCall[] = []
  const queues = new Map<string, StubHandler | StubHandler[]>(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
  )
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const headers = new Headers(init.headers)
    const call: StubCall = {
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      auth: headers.get('Authorization'),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(call)
    const key = `${call.method} ${call.path}`
    const h = queues.get(key)
    if (!h) throw new Error(`stubFetch: no route for ${key}`)
    if (Array.isArray(h)) {
      const next = h.length > 1 ? h.shift() : h[0]
      if (!next) throw new Error(`stubFetch: ${key} has no handlers`)
      return next(call)
    }
    return h(call)
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}
```

- [ ] **Step 2: Write the failing tests**

`src/core/errors.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PhError, codeForStatus, errorFromResponse, isPhError } from './errors.js'
import { json } from '../../test/stub-fetch.js'

describe('codeForStatus', () => {
  it.each([
    [400, 'invalid'], [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [409, 'conflict'],
    [413, 'too_large'], [415, 'invalid'], [429, 'rate_limited'], [500, 'server'], [502, 'unavailable'],
    [503, 'unavailable'], [504, 'unavailable'],
  ] as const)('%i -> %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code)
  })
})

describe('errorFromResponse', () => {
  it('uses the gateway body code and a machine detail', async () => {
    const e = await errorFromResponse(json(403, { ok: false, error: 'upload_requires_sign_in', detail: 'midi_upload' }))
    expect(e.code).toBe('upload_requires_sign_in')
    expect(e.detail).toBe('midi_upload')
    expect(e.status).toBe(403)
  })

  it('maps otp-auth {ok:false} and Directus error chains by status, never echoing server text', async () => {
    const a = await errorFromResponse(json(401, { ok: false }))
    expect(a.code).toBe('unauthorized')
    const b = await errorFromResponse(json(400, { errors: [{ message: 'secret internals', extensions: { code: 'INVALID_PAYLOAD' } }] }))
    expect(b.code).toBe('invalid')
    expect(b.message).not.toContain('secret')
    const c = await errorFromResponse(new Response('<html>bad gateway</html>', { status: 502 }))
    expect(c.code).toBe('unavailable')
    expect(c.message).not.toContain('html')
  })

  it('reads retryAfterSec from the body, then from Retry-After', async () => {
    expect((await errorFromResponse(json(429, { ok: false, error: 'rate_limited', retryAfterSec: 12 }))).retryAfterSec).toBe(12)
    expect((await errorFromResponse(json(429, { errors: [] }, { 'Retry-After': '7' }))).retryAfterSec).toBe(7)
  })

  it('never takes "network" from a server body, and drops a non-machine detail', async () => {
    const e = await errorFromResponse(json(500, { ok: false, error: 'network', detail: 'Key (email)=(a@b) exists' }))
    expect(e.code).toBe('server')
    expect(e.detail).toBeUndefined()
  })

  it('gives quota and handle_taken their own messages', async () => {
    expect((await errorFromResponse(json(409, { ok: false, error: 'conflict', detail: 'quota' }))).message).toMatch(/limit of saves/)
    expect((await errorFromResponse(json(409, { ok: false, error: 'conflict', detail: 'handle_taken' }))).message).toMatch(/handle/)
  })
})

describe('isPhError', () => {
  it('matches by shape, so a second copy of the SDK still matches', () => {
    expect(isPhError(new PhError('network'))).toBe(true)
    const foreign = Object.assign(new Error('x'), { name: 'PhError', code: 'conflict' })
    expect(isPhError(foreign)).toBe(true)
    expect(isPhError(Object.assign(new Error('x'), { name: 'PhError', code: 'nope' }))).toBe(false)
  })
})
```

`src/core/token-store.test.ts`:
```ts
import { afterEach, describe, it, expect, vi } from 'vitest'
import { localStorageTokenStore, memoryTokenStore } from './token-store.js'

const FUTURE = '2099-01-01T00:00:00.000Z'
const PAST = '2000-01-01T00:00:00.000Z'

function fakeStorage(o: { throwOn?: 'get' | 'set' } = {}): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => { if (o.throwOn === 'get') throw new Error('denied'); return m.get(k) ?? null },
    setItem: (k: string, v: string) => { if (o.throwOn === 'set') throw new Error('quota'); m.set(k, v) },
    removeItem: (k: string) => { m.delete(k) },
  }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('memoryTokenStore', () => {
  it('returns the token until it expires', () => {
    const s = memoryTokenStore()
    s.set('t', FUTURE)
    expect(s.get()).toBe('t')
    s.set('t', PAST)
    expect(s.get()).toBeNull()
  })
})

describe('localStorageTokenStore', () => {
  it('persists across instances under its key', () => {
    vi.stubGlobal('localStorage', fakeStorage())
    localStorageTokenStore('ph.session.x').set('t', FUTURE)
    expect(localStorageTokenStore('ph.session.x').get()).toBe('t')
    localStorageTokenStore('ph.session.x').clear()
    expect(localStorageTokenStore('ph.session.x').get()).toBeNull()
  })

  it('drops an expired or malformed entry', () => {
    const ls = fakeStorage()
    vi.stubGlobal('localStorage', ls)
    ls.setItem('k', JSON.stringify({ token: 't', expiresAt: PAST }))
    expect(localStorageTokenStore('k').get()).toBeNull()
    expect(ls.getItem('k')).toBeNull()
    ls.setItem('k', '{not json')
    expect(localStorageTokenStore('k').get()).toBeNull()
  })

  it('keeps working in memory when storage refuses writes or reads', () => {
    vi.stubGlobal('localStorage', fakeStorage({ throwOn: 'set' }))
    const s = localStorageTokenStore('k')
    s.set('t', FUTURE)
    expect(s.get()).toBe('t')
    vi.stubGlobal('localStorage', fakeStorage({ throwOn: 'get' }))
    const r = localStorageTokenStore('k')
    r.set('u', FUTURE)
    expect(r.get()).toBe('u')
  })

  it('works with no localStorage at all (node, workers)', () => {
    const s = localStorageTokenStore('k')
    s.set('t', FUTURE)
    expect(s.get()).toBe('t')
  })
})
```

`src/core/http.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod/v4'
import { createHttp } from './http.js'
import { memoryTokenStore } from './token-store.js'
import { TOKEN, json, stubFetch } from '../../test/stub-fetch.js'

const Ok = z.object({ ok: z.literal(true) })
const FUTURE = '2099-01-01T00:00:00.000Z'

function setup(routes: Parameters<typeof stubFetch>[0], withToken = true) {
  const stub = stubFetch(routes)
  const tokens = memoryTokenStore()
  if (withToken) tokens.set(TOKEN, FUTURE)
  const onUnauthorized = vi.fn()
  const http = createHttp({ baseUrl: 'https://apps.test/', fetch: stub.fetch, tokens, onUnauthorized })
  return { http, stub, tokens, onUnauthorized }
}

describe('createHttp', () => {
  it('sends JSON with the bearer and a query string, and parses the response', async () => {
    const { http, stub } = setup({ 'POST /ph/v1/saves': () => json(200, { ok: true, extra: 1 }) })
    await expect(http({ method: 'POST', path: '/ph/v1/saves', query: { appSlug: 'a', skip: undefined }, body: { x: 1 }, auth: 'required' }, Ok))
      .resolves.toEqual({ ok: true })
    expect(stub.calls[0]).toMatchObject({ path: '/ph/v1/saves', query: { appSlug: 'a' }, auth: `Bearer ${TOKEN}`, body: { x: 1 } })
  })

  it('never sends the token on auth "none"', async () => {
    const { http, stub } = setup({ 'POST /ph/v1/enroll': () => json(200, { ok: true }) })
    await http({ method: 'POST', path: '/ph/v1/enroll', body: {}, auth: 'none' }, Ok)
    expect(stub.calls[0]!.auth).toBeNull()
  })

  it('maps a rejected fetch to network', async () => {
    const { http } = setup({ 'GET /x': () => { throw new TypeError('Failed to fetch') } })
    await expect(http({ method: 'GET', path: '/x', auth: 'none' }, Ok)).rejects.toMatchObject({ code: 'network' })
  })

  it('maps a 2xx body that fails the schema to server', async () => {
    const { http } = setup({ 'GET /x': () => json(200, { nope: true }) })
    await expect(http({ method: 'GET', path: '/x', auth: 'none' }, Ok)).rejects.toMatchObject({ code: 'server' })
  })

  it('a 401 on a request that carried the token clears it and reports it', async () => {
    const { http, tokens, onUnauthorized } = setup({ 'GET /ph/v1/me': () => json(401, { ok: false, error: 'unauthorized' }) })
    await expect(http({ method: 'GET', path: '/ph/v1/me', auth: 'required' }, Ok)).rejects.toMatchObject({ code: 'unauthorized' })
    expect(tokens.get()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('optional auth retries once without a stale token (gateway carry: 401, never a silent fallback)', async () => {
    const { http, stub, tokens } = setup({
      'GET /ph/v1/shares/AbCdEfGhJk': (c) => (c.auth ? json(401, { ok: false, error: 'unauthorized' }) : json(200, { ok: true })),
    })
    await expect(http({ method: 'GET', path: '/ph/v1/shares/AbCdEfGhJk', auth: 'optional' }, Ok)).resolves.toEqual({ ok: true })
    expect(stub.calls.map((c) => c.auth)).toEqual([`Bearer ${TOKEN}`, null])
    expect(tokens.get()).toBeNull()
  })

  it('required auth without a token fails before any request', async () => {
    const { http, stub, onUnauthorized } = setup({}, false)
    await expect(http({ method: 'GET', path: '/ph/v1/me', auth: 'required' }, Ok)).rejects.toMatchObject({ code: 'unauthorized' })
    expect(stub.calls).toHaveLength(0)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('a 429 keeps the token (session 429 is retry, never sign-out)', async () => {
    const { http, tokens, onUnauthorized } = setup({ 'GET /otp-auth/session': () => json(429, { errors: [] }, { 'Retry-After': '3' }) })
    await expect(http({ method: 'GET', path: '/otp-auth/session', auth: 'required' }, Ok)).rejects.toMatchObject({ code: 'rate_limited', retryAfterSec: 3 })
    expect(tokens.get()).toBe(TOKEN)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('keeps a base URL path prefix', async () => {
    const stub = stubFetch({ 'GET /prefix/ph/v1/me': () => json(200, { ok: true }) })
    const http = createHttp({ baseUrl: 'https://apps.test/prefix', fetch: stub.fetch, tokens: memoryTokenStore(), onUnauthorized: () => {} })
    await http({ method: 'GET', path: '/ph/v1/me', auth: 'none' }, Ok)
    expect(stub.calls[0]!.path).toBe('/prefix/ph/v1/me')
  })
})
```

Run: `npx vitest run src/core`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `src/core/errors.ts`**

```ts
// PhError: the only error the SDK throws (spec §3.1). Its message is always
// user-safe and comes from this file, never from a server body; the server's
// machine-readable `detail` is kept separately when it is a plain token.

export type PhErrorCode =
  | 'network' | 'unavailable' | 'unauthorized' | 'forbidden' | 'not_found'
  | 'conflict' | 'rate_limited' | 'too_large' | 'invalid' | 'invalid_code'
  | 'upload_requires_sign_in' | 'server'

export const PH_ERROR_CODES: readonly PhErrorCode[] = [
  'network', 'unavailable', 'unauthorized', 'forbidden', 'not_found', 'conflict',
  'rate_limited', 'too_large', 'invalid', 'invalid_code', 'upload_requires_sign_in', 'server',
]

const MESSAGES: Record<PhErrorCode, string> = {
  network: 'Could not reach PepperHorn. Check your connection and try again.',
  unavailable: 'PepperHorn is temporarily unavailable. Try again in a moment.',
  unauthorized: 'Your session has ended. Sign in again.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'That could not be found.',
  conflict: 'This was changed somewhere else. Reload and try again.',
  rate_limited: 'Too many attempts. Wait a moment and try again.',
  too_large: 'That is too large to save.',
  invalid: 'That request was not valid.',
  invalid_code: 'That code is not right, or it has expired.',
  upload_requires_sign_in: 'Sign in to share a file you uploaded.',
  server: 'Something went wrong on our side. Try again later.',
}

const DETAIL_MESSAGES: Record<string, string> = {
  quota: 'You have reached the limit of saves for this app. Delete some to make room.',
  handle_taken: 'That handle is already taken.',
  newer_version: 'This was made with a newer version of the app.',
}

export interface PhErrorInit { status?: number; retryAfterSec?: number; detail?: string; message?: string }

function messageFor(code: PhErrorCode, init: PhErrorInit): string {
  const byDetail = init.detail ? DETAIL_MESSAGES[init.detail] : undefined
  if (byDetail) return byDetail
  if (code === 'rate_limited' && init.retryAfterSec !== undefined) {
    return `Too many attempts. Try again in ${Math.max(1, Math.ceil(init.retryAfterSec))} seconds.`
  }
  return MESSAGES[code]
}

export class PhError extends Error {
  readonly code: PhErrorCode
  readonly status: number | undefined
  readonly retryAfterSec: number | undefined
  readonly detail: string | undefined

  constructor(code: PhErrorCode, init: PhErrorInit = {}) {
    super(init.message ?? messageFor(code, init))
    this.name = 'PhError'
    this.code = code
    this.status = init.status
    this.retryAfterSec = init.retryAfterSec
    this.detail = init.detail
  }
}

/** Shape check, so an error from a second copy of the SDK still matches. */
export function isPhError(e: unknown): e is PhError {
  return e instanceof Error && e.name === 'PhError'
    && PH_ERROR_CODES.includes((e as { code?: unknown }).code as PhErrorCode)
}

export function codeForStatus(status: number): PhErrorCode {
  switch (status) {
    case 400: case 415: case 422: return 'invalid'
    case 401: return 'unauthorized'
    case 403: return 'forbidden'
    case 404: case 410: return 'not_found'
    case 409: return 'conflict'
    case 413: return 'too_large'
    case 429: return 'rate_limited'
    case 502: case 503: case 504: return 'unavailable'
    default: return status >= 500 ? 'server' : 'invalid'
  }
}

const DETAIL_RE = /^[a-z][a-z0-9_]{0,63}$/

function retryAfter(res: Response, fromBody: unknown, now: number): number | undefined {
  if (typeof fromBody === 'number' && Number.isFinite(fromBody) && fromBody >= 0) return fromBody
  const h = res.headers.get('retry-after')?.trim()
  if (!h) return undefined
  if (/^\d+$/.test(h)) return Number(h)
  const at = Date.parse(h)
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : undefined
}

/**
 * The PhError for a non-2xx response. Reads the gateway's shared body
 * `{ ok:false, error, detail?, retryAfterSec? }` when present; otp-auth's
 * uniform `{ ok:false }`, a Directus error chain or a non-JSON body map by
 * status alone.
 */
export async function errorFromResponse(res: Response, now: number = Date.now()): Promise<PhError> {
  let body: unknown = null
  try { body = await res.json() } catch { body = null }
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const named = typeof b.error === 'string' && b.error !== 'network' && PH_ERROR_CODES.includes(b.error as PhErrorCode)
    ? (b.error as PhErrorCode)
    : null
  const code = named ?? codeForStatus(res.status)
  const init: PhErrorInit = { status: res.status }
  if (typeof b.detail === 'string' && DETAIL_RE.test(b.detail)) init.detail = b.detail
  if (code === 'rate_limited') {
    const r = retryAfter(res, b.retryAfterSec, now)
    if (r !== undefined) init.retryAfterSec = r
  }
  return new PhError(code, init)
}
```

- [ ] **Step 4: Implement `src/core/token-store.ts`**

```ts
// Where the bearer token lives (spec §3.1, §9.3). localStorage by default,
// guarded: a browser that refuses storage (private mode, quota, a sandboxed
// iframe) falls back to memory for the rest of the page's life.

export interface TokenStore {
  get(): string | null
  set(token: string, expiresAt: string): void
  clear(): void
}

interface Stored { token: string; expiresAt: string }

function live(v: unknown, now: number): v is Stored {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.token !== 'string' || o.token.length === 0 || typeof o.expiresAt !== 'string') return false
  const at = Date.parse(o.expiresAt)
  return Number.isFinite(at) && at > now
}

export function memoryTokenStore(now: () => number = Date.now): TokenStore {
  let s: Stored | null = null
  return {
    get() {
      if (live(s, now())) return s.token
      s = null
      return null
    },
    set(token, expiresAt) { s = { token, expiresAt } },
    clear() { s = null },
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function localStorageTokenStore(key: string, now: () => number = Date.now): TokenStore {
  const mem = memoryTokenStore(now)
  let memoryOnly = false
  return {
    get() {
      const ls = storage()
      if (memoryOnly || !ls) return mem.get()
      let raw: string | null
      try {
        raw = ls.getItem(key)
      } catch {
        memoryOnly = true
        return mem.get()
      }
      if (raw === null) return null
      let parsed: unknown = null
      try { parsed = JSON.parse(raw) } catch { parsed = null }
      if (live(parsed, now())) return parsed.token
      try { ls.removeItem(key) } catch { /* nothing more to do */ }
      return null
    },
    set(token, expiresAt) {
      mem.set(token, expiresAt)
      const ls = storage()
      if (!ls) { memoryOnly = true; return }
      try {
        ls.setItem(key, JSON.stringify({ token, expiresAt }))
      } catch {
        memoryOnly = true
      }
    },
    clear() {
      mem.clear()
      try { storage()?.removeItem(key) } catch { /* nothing more to do */ }
    },
  }
}
```

- [ ] **Step 5: Implement `src/core/http.ts`**

```ts
import type { z } from 'zod/v4'
import { PhError, errorFromResponse } from './errors.js'
import type { TokenStore } from './token-store.js'

export type AuthMode = 'none' | 'optional' | 'required'

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, string | number | undefined>
  body?: unknown
  auth: AuthMode
}

export interface HttpDeps {
  baseUrl: string
  fetch: typeof fetch
  tokens: TokenStore
  /** After a 401 on a request that carried the token (already cleared), or a required call with no token. */
  onUnauthorized(): void
  now?: () => number
}

export type Http = <T>(req: HttpRequest, schema: z.ZodType<T>) => Promise<T>

export function buildUrl(baseUrl: string, path: string, query?: HttpRequest['query']): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`)
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v))
  return url.href
}

/**
 * JSON over fetch with bearer injection (spec §3.1). Rules:
 * - a rejected fetch is `network`; a non-2xx is errorFromResponse; a 2xx
 *   body that fails `schema` is `server`;
 * - only a 401 on a request that carried the token clears it (never a 429
 *   or a 5xx: the gate 0.6 "session 429 is retry" note);
 * - `optional` auth retries once without a stale token, because the gateway
 *   answers a bad optional token with 401 rather than falling back.
 */
export function createHttp(d: HttpDeps): Http {
  const now = d.now ?? Date.now

  async function send(req: HttpRequest, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (req.body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = `Bearer ${token}`
    const init: RequestInit = { method: req.method, headers }
    if (req.body !== undefined) init.body = JSON.stringify(req.body)
    try {
      return await d.fetch(buildUrl(d.baseUrl, req.path, req.query), init)
    } catch {
      throw new PhError('network')
    }
  }

  return async function http<T>(req: HttpRequest, schema: z.ZodType<T>): Promise<T> {
    const token = req.auth === 'none' ? null : d.tokens.get()
    if (req.auth === 'required' && !token) {
      d.onUnauthorized()
      throw new PhError('unauthorized')
    }
    let res = await send(req, token)
    if (res.status === 401 && token) {
      d.tokens.clear()
      d.onUnauthorized()
      if (req.auth === 'optional') res = await send(req, null)
    }
    if (!res.ok) throw await errorFromResponse(res, now())
    let body: unknown
    try {
      body = await res.json()
    } catch {
      throw new PhError('server', { status: res.status })
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new PhError('server', { status: res.status })
    return parsed.data
  }
}
```

- [ ] **Step 6: Implement `src/core/schemas.ts` and `src/core/types.ts`**

`src/core/schemas.ts`:
```ts
// zod envelopes for every wire shape (spec §3.1). Wire shapes are copied from
// ph-apps-extensions endpoints/ph/src/wire.ts and routes/*.ts, and from
// directus-otp-auth routes.js. `payload` defaults to z.unknown(): the app
// validates its own content. z.object strips unknown keys.
import { z } from 'zod/v4'

export const VisibilitySchema = z.enum(['private', 'link_view', 'link_edit', 'public'])

export const OkSchema = z.object({ ok: z.literal(true) })

export const ErrorBodySchema = z.object({
  ok: z.literal(false),
  error: z.string().optional(),
  detail: z.string().optional(),
  retryAfterSec: z.number().optional(),
})

export const AuthUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  handle: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
})

export const SaveSummarySchema = z.object({
  id: z.string(),
  appSlug: z.string(),
  kind: z.string(),
  externalId: z.string(),
  name: z.string(),
  visibility: VisibilitySchema,
  forkedFrom: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  bytes: z.number(),
})

export function SaveRowSchema<T>(payload: z.ZodType<T>) {
  return z.object({
    id: z.string(),
    appSlug: z.string(),
    kind: z.string(),
    externalId: z.string(),
    name: z.string(),
    payload,
    visibility: VisibilitySchema,
    forkedFrom: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
}

export const PublicSaveSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  kind: z.string(),
  ownerHandle: z.string().nullable(),
  updatedAt: z.string(),
  shareCode: z.string().nullable(),
})

export const ShareCreatedSchema = z.object({
  code: z.string(),
  url: z.string(),
  shortUrl: z.string().nullable(),
  revokeKey: z.string().optional(),
})

export function ResolvedShareSchema<T>(payload: z.ZodType<T>) {
  return z.object({
    code: z.string(),
    appSlug: z.string(),
    kind: z.string(),
    payload,
    owner: z.object({ handle: z.string() }).nullable(),
    visibility: VisibilitySchema,
    isOwner: z.boolean(),
    canEdit: z.boolean(),
    canFork: z.boolean(),
    viewCount: z.number(),
    createdAt: z.string(),
  })
}

/** otp-auth GET /sessions rows (session.js listSessions); `ip` is read by nobody and dropped. */
export const DeviceWireSchema = z.object({
  id: z.string(),
  appSlug: z.string(),
  deviceLabel: z.string().nullable(),
  userAgent: z.string().nullable(),
  lastAccessAt: z.string().nullable(),
  expiresAt: z.string(),
  current: z.boolean(),
})
```

`src/core/types.ts`:
```ts
import type { z } from 'zod/v4'
import type { AuthUserSchema, PublicSaveSchema, SaveSummarySchema, ShareCreatedSchema, VisibilitySchema } from './schemas.js'

export type Visibility = z.infer<typeof VisibilitySchema>
/** Never carries ph_uid (D14). */
export type AuthUser = z.infer<typeof AuthUserSchema>
export interface PendingOtp { email: string; codeSentAt: number }
export type AuthSnapshot =
  | { status: 'unknown' }
  | { status: 'signed-out'; pending: PendingOtp | null }
  | { status: 'signed-in'; user: AuthUser; expiresAt: string }
export interface Device {
  id: string; appSlug: string; label: string | null; userAgent: string | null
  lastAccessAt: string | null; expiresAt: string; current: boolean
}
export type SaveSummaryRow = z.infer<typeof SaveSummarySchema>
export interface SaveRow<T> {
  id: string; appSlug: string; kind: string; externalId: string; name: string
  payload: T; visibility: Visibility; forkedFrom: string | null
  createdAt: string; updatedAt: string
}
export type PublicSave = z.infer<typeof PublicSaveSchema>
export type ShareCreated = z.infer<typeof ShareCreatedSchema>
export interface ResolvedShare<T> {
  code: string; appSlug: string; kind: string; payload: T
  owner: { handle: string } | null; visibility: Visibility
  isOwner: boolean; canEdit: boolean; canFork: boolean
  viewCount: number; createdAt: string
}
```

`src/index.ts`:
```ts
/** Kept equal to package.json's version by src/index.test.ts. */
export const SDK_VERSION = '0.1.0'
export { PhError, isPhError, PH_ERROR_CODES } from './core/errors.js'
export type { PhErrorCode, PhErrorInit } from './core/errors.js'
export { localStorageTokenStore, memoryTokenStore } from './core/token-store.js'
export type { TokenStore } from './core/token-store.js'
export * from './core/schemas.js'
export type * from './core/types.js'
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS (errors, token-store, http suites green; `dist ok`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(core): PhError mapping, JSON http client, token store, wire schemas" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4 `[sdk]` Auth store, OTP-flow persistence, `createPepperhornClient`

**Files:**
- Create: `src/core/otp-flow.ts`, `src/core/auth.ts`, `src/core/client.ts`
- Test: `src/core/otp-flow.test.ts`, `src/core/auth.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `createHttp`, `Http`, `PhError`, `isPhError`, `TokenStore`, `OkSchema`, `AuthUserSchema`, `DeviceWireSchema`, `AuthSnapshot`, `AuthUser`, `Device`, `PendingOtp` (Task 3).
- Produces:
  ```ts
  interface OtpFlowStore { load(): PendingOtp | null; save(p: PendingOtp): void; clear(): void }
  OTP_FLOW_TTL_MS = 600_000; memoryOtpFlow(now?): OtpFlowStore; localStorageOtpFlow(key: string, now?): OtpFlowStore
  interface AuthStore {
    getSnapshot(): AuthSnapshot; subscribe(l: () => void): () => void
    restore(): Promise<AuthSnapshot>; requestCode(email: string): Promise<void>
    verifyCode(email: string, code: string): Promise<AuthUser>; signOut(): Promise<void>
    signOutEverywhere(): Promise<number>; devices(): Promise<Device[]>; revokeDevice(id: string): Promise<void>
    updateProfile(p: Partial<Pick<AuthUser, 'firstName'|'lastName'|'handle'>>): Promise<AuthUser>
    authorizedFetch(input: string, init?: RequestInit): Promise<Response>
  }
  RESTORE_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000]
  interface PhClientOptions { appSlug: string; baseUrl?: string; appVersion?: string; deviceLabel?: string; tokenStore?: TokenStore; otpFlowStore?: OtpFlowStore; fetch?: typeof fetch; now?: () => number }
  interface PhClient { readonly appSlug: string; readonly baseUrl: string; auth: AuthStore }   // Task 5 adds saves, shares
  createPepperhornClient(o: PhClientOptions): PhClient; DEFAULT_BASE_URL = 'https://apps.pepperhorn.com'
  ```
  All `AuthStore` methods are closures (no `this`), so hooks may pass them around detached.

Wire calls (directus-otp-auth bearer transport + gateway):

| Method | Request | 200 body |
|---|---|---|
| `requestCode` | `POST /ph/v1/enroll {email, appSlug}` then `POST /otp-auth/code {email, appSlug}` (no auth) | `{ok:true}` each |
| `verifyCode` | `POST /otp-auth/verify {email, code, appSlug, transport:'bearer', appVersion?, deviceLabel?}` (no auth) then `GET /ph/v1/me?appSlug` | `{ok, token, expiresAt}`; `{ok, user}`. A bad code is `401 {ok:false}`. |
| `restore` | `GET /otp-auth/session?appSlug` then `GET /ph/v1/me?appSlug` | `{ok, principal, appSlug, expiresAt}` (principal ignored); `{ok, user}` |
| `signOut` | `POST /otp-auth/logout {appSlug}` | `{ok:true}` |
| `signOutEverywhere` | `POST /otp-auth/logout-all {appSlug}` | `{ok, revoked}` |
| `devices` | `GET /otp-auth/sessions?appSlug` | `{ok, sessions:[{id, appSlug, deviceLabel, userAgent, ip, lastAccessAt, expiresAt, current}]}` |
| `revokeDevice` | `DELETE /otp-auth/sessions/:id?appSlug` | `{ok:true}`; a stranger's id is `404 {ok:false}` |
| `updateProfile` | `PATCH /ph/v1/me {appSlug, firstName?, lastName?, handle?}` | `{ok, user}`; `409 conflict/handle_taken` |

- [ ] **Step 1: Write the failing tests**

`src/core/otp-flow.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { OTP_FLOW_TTL_MS, memoryOtpFlow } from './otp-flow.js'

describe('otp flow persistence', () => {
  it('returns the pending step until its 10 minute TTL passes', () => {
    let t = 1_000_000
    const s = memoryOtpFlow(() => t)
    s.save({ email: 'a@b.test', codeSentAt: t })
    expect(s.load()).toEqual({ email: 'a@b.test', codeSentAt: t })
    t += OTP_FLOW_TTL_MS + 1
    expect(s.load()).toBeNull()
  })
})
```

`src/core/auth.test.ts`:
```ts
import { afterEach, describe, it, expect, vi } from 'vitest'
import { createPepperhornClient } from './client.js'
import { memoryTokenStore } from './token-store.js'
import { memoryOtpFlow } from './otp-flow.js'
import { TOKEN, json, stubFetch } from '../../test/stub-fetch.js'
import type { StubHandler } from '../../test/stub-fetch.js'

const FUTURE = '2099-01-01T00:00:00.000Z'
const USER = { id: 'u1', email: 'ana@example.test', handle: 'ana', firstName: 'Ana', lastName: null }
const ok = (b: object = {}) => json(200, { ok: true, ...b })
const session = () => ok({ principal: { type: 'app_user', id: 'u1' }, appSlug: 'tickle-me-ivories', expiresAt: FUTURE })
const me = () => ok({ user: USER })

function client(routes: Record<string, StubHandler | StubHandler[]>, o: { token?: boolean } = {}) {
  const stub = stubFetch(routes)
  const tokens = memoryTokenStore()
  if (o.token) tokens.set(TOKEN, FUTURE)
  const otp = memoryOtpFlow()
  const c = createPepperhornClient({
    appSlug: 'tickle-me-ivories', baseUrl: 'https://apps.test', fetch: stub.fetch, tokenStore: tokens,
    otpFlowStore: otp, appVersion: '1.2.3', deviceLabel: 'Test browser',
  })
  return { c, stub, tokens, otp }
}

afterEach(() => { vi.useRealTimers() })

describe('initial snapshot', () => {
  it('is signed-out without a token and unknown with one', () => {
    expect(client({}).c.auth.getSnapshot()).toEqual({ status: 'signed-out', pending: null })
    expect(client({}, { token: true }).c.auth.getSnapshot()).toEqual({ status: 'unknown' })
  })
})

describe('requestCode', () => {
  it('enrolls, then asks for a code, with a normalised email, and remembers the pending step', async () => {
    const { c, stub, otp } = client({ 'POST /ph/v1/enroll': ok, 'POST /otp-auth/code': ok })
    await c.auth.requestCode('  Ana@Example.TEST ')
    expect(stub.calls.map((x) => `${x.method} ${x.path}`)).toEqual(['POST /ph/v1/enroll', 'POST /otp-auth/code'])
    expect(stub.calls[0]!.body).toEqual({ email: 'ana@example.test', appSlug: 'tickle-me-ivories' })
    expect(stub.calls.every((x) => x.auth === null)).toBe(true)
    const snap = c.auth.getSnapshot()
    expect(snap).toMatchObject({ status: 'signed-out', pending: { email: 'ana@example.test' } })
    expect(otp.load()?.email).toBe('ana@example.test')
  })

  it('refuses a malformed email before any request', async () => {
    const { c, stub } = client({})
    await expect(c.auth.requestCode('not-an-email')).rejects.toMatchObject({ code: 'invalid' })
    expect(stub.calls).toHaveLength(0)
  })
})

describe('verifyCode', () => {
  it('stores the bearer token, reads /me with it and signs in', async () => {
    const { c, stub, tokens } = client({
      'POST /otp-auth/verify': () => ok({ token: TOKEN, expiresAt: FUTURE }),
      'GET /ph/v1/me': me,
    })
    const user = await c.auth.verifyCode('ana@example.test', ' 1234 5678 ')
    expect(user).toEqual(USER)
    expect(tokens.get()).toBe(TOKEN)
    expect(stub.calls[0]!.body).toEqual({
      email: 'ana@example.test', code: '12345678', appSlug: 'tickle-me-ivories', transport: 'bearer',
      appVersion: '1.2.3', deviceLabel: 'Test browser',
    })
    expect(stub.calls[1]!.auth).toBe(`Bearer ${TOKEN}`)
    expect(c.auth.getSnapshot()).toEqual({ status: 'signed-in', user: USER, expiresAt: FUTURE })
  })

  it('maps a 401 to invalid_code and stores nothing', async () => {
    const { c, tokens } = client({ 'POST /otp-auth/verify': () => json(401, { ok: false }) })
    await expect(c.auth.verifyCode('ana@example.test', '00000000')).rejects.toMatchObject({ code: 'invalid_code' })
    expect(tokens.get()).toBeNull()
  })
})

describe('restore', () => {
  it('signs in from a stored token', async () => {
    const { c } = client({ 'GET /otp-auth/session': session, 'GET /ph/v1/me': me }, { token: true })
    await expect(c.auth.restore()).resolves.toMatchObject({ status: 'signed-in', user: { handle: 'ana' } })
  })

  it('signs out and clears the token only on a 401', async () => {
    const { c, tokens } = client({ 'GET /otp-auth/session': () => json(401, { ok: false }) }, { token: true })
    await expect(c.auth.restore()).resolves.toMatchObject({ status: 'signed-out' })
    expect(tokens.get()).toBeNull()
  })

  it('keeps the token through a 503 and retries with backoff (Review Focus 3)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { c, tokens, stub } = client({
      'GET /otp-auth/session': [() => json(503, { ok: false }), session],
      'GET /ph/v1/me': me,
    }, { token: true })
    await expect(c.auth.restore()).resolves.toEqual({ status: 'unknown' })
    expect(tokens.get()).toBe(TOKEN)
    await vi.advanceTimersByTimeAsync(999)
    expect(stub.calls.filter((x) => x.path === '/otp-auth/session')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(c.auth.getSnapshot().status).toBe('signed-in'))
  })

  it('honours Retry-After on a 429 and never signs out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { c, tokens, stub } = client({
      'GET /otp-auth/session': [() => json(429, { errors: [] }, { 'Retry-After': '7' }), session],
      'GET /ph/v1/me': me,
    }, { token: true })
    await c.auth.restore()
    await vi.advanceTimersByTimeAsync(6_000)
    expect(stub.calls.filter((x) => x.path === '/otp-auth/session')).toHaveLength(1)
    expect(tokens.get()).toBe(TOKEN)
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(c.auth.getSnapshot().status).toBe('signed-in'))
  })

  it('keeps the token when offline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { c, tokens } = client({ 'GET /otp-auth/session': () => { throw new TypeError('Failed to fetch') } }, { token: true })
    await expect(c.auth.restore()).resolves.toEqual({ status: 'unknown' })
    expect(tokens.get()).toBe(TOKEN)
  })
})

describe('sign out and devices', () => {
  it('signOut clears the token even when the server call fails', async () => {
    const { c, tokens } = client({ 'POST /otp-auth/logout': () => json(500, { ok: false }) }, { token: true })
    await c.auth.signOut()
    expect(tokens.get()).toBeNull()
    expect(c.auth.getSnapshot()).toEqual({ status: 'signed-out', pending: null })
  })

  it('signOutEverywhere returns the revoked count', async () => {
    const { c, tokens } = client({ 'POST /otp-auth/logout-all': () => ok({ revoked: 3 }) }, { token: true })
    await expect(c.auth.signOutEverywhere()).resolves.toBe(3)
    expect(tokens.get()).toBeNull()
  })

  const sessions = () => ok({
    sessions: [
      { id: 's1', appSlug: 'tickle-me-ivories', deviceLabel: 'Laptop', userAgent: 'UA1', ip: '10.0.0.1', lastAccessAt: FUTURE, expiresAt: FUTURE, current: true },
      { id: 's2', appSlug: 'tickle-me-ivories', deviceLabel: null, userAgent: 'UA2', ip: null, lastAccessAt: null, expiresAt: FUTURE, current: false },
    ],
  })

  it('devices maps deviceLabel to label and drops ip', async () => {
    const { c } = client({ 'GET /otp-auth/sessions': sessions }, { token: true })
    const list = await c.auth.devices()
    expect(list[0]).toEqual({ id: 's1', appSlug: 'tickle-me-ivories', label: 'Laptop', userAgent: 'UA1', lastAccessAt: FUTURE, expiresAt: FUTURE, current: true })
    expect(JSON.stringify(list)).not.toContain('10.0.0.1')
  })

  it('revoking another device keeps this one signed in; revoking this one signs out', async () => {
    const { c, tokens, stub } = client({
      'GET /otp-auth/sessions': sessions, 'DELETE /otp-auth/sessions/s2': ok, 'DELETE /otp-auth/sessions/s1': ok,
      'GET /otp-auth/session': session, 'GET /ph/v1/me': me,
    }, { token: true })
    await c.auth.restore()
    await c.auth.revokeDevice('s2')
    expect(c.auth.getSnapshot().status).toBe('signed-in')
    expect(stub.calls.find((x) => x.method === 'DELETE')?.query).toEqual({ appSlug: 'tickle-me-ivories' })
    await c.auth.revokeDevice('s1')
    expect(c.auth.getSnapshot().status).toBe('signed-out')
    expect(tokens.get()).toBeNull()
  })

  it('any 401 on an authenticated call signs out', async () => {
    const { c } = client({ 'GET /otp-auth/session': session, 'GET /ph/v1/me': me, 'GET /otp-auth/sessions': () => json(401, { ok: false }) }, { token: true })
    await c.auth.restore()
    await expect(c.auth.devices()).rejects.toMatchObject({ code: 'unauthorized' })
    expect(c.auth.getSnapshot().status).toBe('signed-out')
  })

  it('updateProfile updates the signed-in user; handle_taken is a conflict', async () => {
    const { c } = client({
      'GET /otp-auth/session': session, 'GET /ph/v1/me': me,
      'PATCH /ph/v1/me': [() => ok({ user: { ...USER, handle: 'ana2' } }), () => json(409, { ok: false, error: 'conflict', detail: 'handle_taken' })],
    }, { token: true })
    await c.auth.restore()
    await c.auth.updateProfile({ handle: 'ana2' })
    expect(c.auth.getSnapshot()).toMatchObject({ user: { handle: 'ana2' } })
    await expect(c.auth.updateProfile({ handle: 'bob' })).rejects.toMatchObject({ code: 'conflict', detail: 'handle_taken' })
  })
})

describe('authorizedFetch', () => {
  it('adds the bearer for PepperHorn and refuses any other origin', async () => {
    const { c, stub } = client({ 'GET /ph/v1/files/f1': () => json(200, {}) }, { token: true })
    await c.auth.authorizedFetch('/ph/v1/files/f1')
    expect(stub.calls[0]!.auth).toBe(`Bearer ${TOKEN}`)
    await expect(c.auth.authorizedFetch('https://evil.test/steal')).rejects.toMatchObject({ code: 'invalid' })
    expect(stub.calls).toHaveLength(1)
  })
})

describe('createPepperhornClient', () => {
  it('refuses a malformed app slug', () => {
    expect(() => createPepperhornClient({ appSlug: 'Bad Slug' })).toThrow(/appSlug/)
  })
})
```

Run: `npx vitest run src/core/otp-flow.test.ts src/core/auth.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 2: Implement `src/core/otp-flow.ts`**

```ts
// The in-flight OTP step (drumlet's {step, email, codeSentAt}, 10 min TTL), so
// a reload between "send code" and "enter code" lands back on the code step.
import type { PendingOtp } from './types.js'

export const OTP_FLOW_TTL_MS = 10 * 60 * 1000

export interface OtpFlowStore {
  load(): PendingOtp | null
  save(p: PendingOtp): void
  clear(): void
}

function fresh(v: unknown, now: number): v is PendingOtp {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.email === 'string' && typeof o.codeSentAt === 'number'
    && o.codeSentAt <= now && now - o.codeSentAt < OTP_FLOW_TTL_MS
}

export function memoryOtpFlow(now: () => number = Date.now): OtpFlowStore {
  let p: PendingOtp | null = null
  return {
    load() { return fresh(p, now()) ? p : (p = null) },
    save(next) { p = { email: next.email, codeSentAt: next.codeSentAt } },
    clear() { p = null },
  }
}

export function localStorageOtpFlow(key: string, now: () => number = Date.now): OtpFlowStore {
  const mem = memoryOtpFlow(now)
  const ls = (): Storage | null => {
    try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
  }
  return {
    load() {
      const s = ls()
      let raw: string | null = null
      try { raw = s ? s.getItem(key) : null } catch { raw = null }
      if (raw === null) return mem.load()
      let v: unknown = null
      try { v = JSON.parse(raw) } catch { v = null }
      if (typeof v === 'object' && v !== null && (v as { step?: unknown }).step === 'code') {
        const { email, codeSentAt } = v as { email?: unknown; codeSentAt?: unknown }
        const p = { email, codeSentAt }
        if (fresh(p, now())) return p
      }
      try { s?.removeItem(key) } catch { /* nothing more to do */ }
      return null
    },
    save(p) {
      mem.save(p)
      try { ls()?.setItem(key, JSON.stringify({ step: 'code', email: p.email, codeSentAt: p.codeSentAt })) } catch { /* memory copy stands */ }
    },
    clear() {
      mem.clear()
      try { ls()?.removeItem(key) } catch { /* nothing more to do */ }
    },
  }
}
```

- [ ] **Step 3: Implement `src/core/auth.ts`**

```ts
// AuthStore (spec §3.1): one module-pattern store per client. Snapshots are
// immutable, replaced on every change, so React's useSyncExternalStore and
// the tickle plugin can compare them by reference.
import { z } from 'zod/v4'
import { PhError, isPhError } from './errors.js'
import type { Http } from './http.js'
import type { TokenStore } from './token-store.js'
import type { OtpFlowStore } from './otp-flow.js'
import { AuthUserSchema, DeviceWireSchema, OkSchema } from './schemas.js'
import type { AuthSnapshot, AuthUser, Device } from './types.js'

export interface AuthStore {
  getSnapshot(): AuthSnapshot
  subscribe(listener: () => void): () => void
  /** GET /otp-auth/session. Keeps the token on network/5xx/429 and retries with backoff; clears it only on 401. */
  restore(): Promise<AuthSnapshot>
  /** POST /ph/v1/enroll, then POST /otp-auth/code. Resolves for any well-formed email (no enumeration). */
  requestCode(email: string): Promise<void>
  /** POST /otp-auth/verify, then GET /ph/v1/me. PhError('invalid_code') on a wrong or expired code. */
  verifyCode(email: string, code: string): Promise<AuthUser>
  /** POST /otp-auth/logout; the local token is cleared even if that fails. */
  signOut(): Promise<void>
  signOutEverywhere(): Promise<number>
  devices(): Promise<Device[]>
  /** Revoking the current device signs this client out. */
  revokeDevice(id: string): Promise<void>
  updateProfile(p: Partial<Pick<AuthUser, 'firstName' | 'lastName' | 'handle'>>): Promise<AuthUser>
  /** Escape hatch for gateway routes the SDK does not wrap (files). Same origin as baseUrl only. */
  authorizedFetch(input: string, init?: RequestInit): Promise<Response>
}

export interface AuthStoreInternal extends AuthStore {
  /** Called by http after a 401 that cleared the token. */
  handleUnauthorized(): void
}

export interface AuthDeps {
  appSlug: string
  baseUrl: string
  http: Http
  fetch: typeof fetch
  tokens: TokenStore
  otp: OtpFlowStore
  now: () => number
  appVersion?: string | undefined
  deviceLabel?: string | undefined
}

export const RESTORE_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000] as const
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const SessionWire = z.object({ ok: z.literal(true), appSlug: z.string(), expiresAt: z.string() })
const VerifyWire = z.object({ ok: z.literal(true), token: z.string().min(1), expiresAt: z.string() })
const MeWire = z.object({ ok: z.literal(true), user: AuthUserSchema })
const LogoutAllWire = z.object({ ok: z.literal(true), revoked: z.number() })
const SessionsWire = z.object({ ok: z.literal(true), sessions: z.array(DeviceWireSchema) })

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createAuthStore(d: AuthDeps): AuthStoreInternal {
  const listeners = new Set<() => void>()
  const signedOut = (): AuthSnapshot => ({ status: 'signed-out', pending: d.otp.load() })
  let snapshot: AuthSnapshot = d.tokens.get() ? { status: 'unknown' } : signedOut()
  let inflight: Promise<AuthSnapshot> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  // Bumped by every sign-in/sign-out so a restore that started earlier
  // cannot overwrite what happened while it was in flight.
  let epoch = 0
  const q = { appSlug: d.appSlug }

  const set = (s: AuthSnapshot) => {
    snapshot = s
    for (const l of [...listeners]) l()
  }
  const stopRetry = () => {
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
    attempt = 0
  }
  const endSession = () => {
    epoch++
    stopRetry()
    d.tokens.clear()
    set({ status: 'signed-out', pending: null })
  }
  const readMe = async () => (await d.http({ method: 'GET', path: '/ph/v1/me', query: q, auth: 'required' }, MeWire)).user

  const store: AuthStoreInternal = {
    getSnapshot: () => snapshot,
    subscribe(l) {
      listeners.add(l)
      return () => { listeners.delete(l) }
    },

    restore() {
      if (inflight) return inflight
      const mine = epoch
      inflight = (async (): Promise<AuthSnapshot> => {
        if (!d.tokens.get()) {
          stopRetry()
          set(signedOut())
          return snapshot
        }
        try {
          const session = await d.http({ method: 'GET', path: '/otp-auth/session', query: q, auth: 'required' }, SessionWire)
          const user = await readMe()
          if (mine === epoch) {
            stopRetry()
            set({ status: 'signed-in', user, expiresAt: session.expiresAt })
          }
        } catch (e) {
          if (mine !== epoch) return snapshot
          if (isPhError(e) && e.code === 'unauthorized') {
            stopRetry()
            set(signedOut())
          } else {
            // Offline, 5xx or 429: the session may be fine. Keep the token, stay
            // 'unknown' (or signed-in if we already were) and try again later.
            if (snapshot.status === 'signed-out') set({ status: 'unknown' })
            if (retryTimer === null) {
              const base = RESTORE_BACKOFF_MS[Math.min(attempt, RESTORE_BACKOFF_MS.length - 1)]!
              const wait = Math.max(base, ((isPhError(e) ? e.retryAfterSec : undefined) ?? 0) * 1000)
              attempt++
              retryTimer = setTimeout(() => {
                retryTimer = null
                void store.restore()
              }, wait)
            }
          }
        }
        return snapshot
      })().finally(() => { inflight = null })
      return inflight
    },

    async requestCode(email) {
      const e = normalizeEmail(email)
      if (e.length > 254 || !EMAIL_RE.test(e)) throw new PhError('invalid', { message: 'Enter a valid email address.' })
      await d.http({ method: 'POST', path: '/ph/v1/enroll', body: { email: e, appSlug: d.appSlug }, auth: 'none' }, OkSchema)
      await d.http({ method: 'POST', path: '/otp-auth/code', body: { email: e, appSlug: d.appSlug }, auth: 'none' }, OkSchema)
      const pending = { email: e, codeSentAt: d.now() }
      d.otp.save(pending)
      if (snapshot.status !== 'signed-in') set({ status: 'signed-out', pending })
    },

    async verifyCode(email, code) {
      const e = normalizeEmail(email)
      const c = code.replace(/\s+/g, '')
      if (!/^\d{4,12}$/.test(c)) throw new PhError('invalid_code')
      let v: z.infer<typeof VerifyWire>
      try {
        v = await d.http({
          method: 'POST', path: '/otp-auth/verify', auth: 'none',
          body: { email: e, code: c, appSlug: d.appSlug, transport: 'bearer', appVersion: d.appVersion, deviceLabel: d.deviceLabel },
        }, VerifyWire)
      } catch (err) {
        if (isPhError(err) && err.code === 'unauthorized') throw new PhError('invalid_code', { status: 401 })
        throw err
      }
      epoch++
      stopRetry()
      d.tokens.set(v.token, v.expiresAt)
      let user: AuthUser
      try {
        user = await readMe()
      } catch (err) {
        void store.restore()
        throw err
      }
      d.otp.clear()
      set({ status: 'signed-in', user, expiresAt: v.expiresAt })
      return user
    },

    async signOut() {
      if (d.tokens.get()) {
        try {
          await d.http({ method: 'POST', path: '/otp-auth/logout', body: { appSlug: d.appSlug }, auth: 'required' }, OkSchema)
        } catch {
          // The local sign-out stands either way.
        }
      }
      d.otp.clear()
      endSession()
    },

    async signOutEverywhere() {
      const r = await d.http({ method: 'POST', path: '/otp-auth/logout-all', body: { appSlug: d.appSlug }, auth: 'required' }, LogoutAllWire)
      endSession()
      return r.revoked
    },

    async devices() {
      const r = await d.http({ method: 'GET', path: '/otp-auth/sessions', query: q, auth: 'required' }, SessionsWire)
      return r.sessions.map((s) => ({
        id: s.id, appSlug: s.appSlug, label: s.deviceLabel, userAgent: s.userAgent,
        lastAccessAt: s.lastAccessAt, expiresAt: s.expiresAt, current: s.current,
      }))
    },

    async revokeDevice(id) {
      const target = (await store.devices()).find((x) => x.id === id)
      if (!target) throw new PhError('not_found')
      await d.http({ method: 'DELETE', path: `/otp-auth/sessions/${encodeURIComponent(id)}`, query: q, auth: 'required' }, OkSchema)
      if (target.current) endSession()
    },

    async updateProfile(p) {
      const r = await d.http({ method: 'PATCH', path: '/ph/v1/me', body: { appSlug: d.appSlug, ...p }, auth: 'required' }, MeWire)
      if (snapshot.status === 'signed-in') set({ ...snapshot, user: r.user })
      return r.user
    },

    async authorizedFetch(input, init = {}) {
      const url = /^https?:\/\//i.test(input) ? input : `${d.baseUrl}${input.startsWith('/') ? '' : '/'}${input}`
      if (new URL(url).origin !== new URL(d.baseUrl).origin) {
        throw new PhError('invalid', { message: 'authorizedFetch only calls PepperHorn.' })
      }
      const token = d.tokens.get()
      if (!token) {
        store.handleUnauthorized()
        throw new PhError('unauthorized')
      }
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${token}`)
      let res: Response
      try {
        res = await d.fetch(url, { ...init, headers })
      } catch {
        throw new PhError('network')
      }
      if (res.status === 401) {
        d.tokens.clear()
        store.handleUnauthorized()
      }
      return res
    },

    handleUnauthorized() {
      epoch++
      stopRetry()
      set({ status: 'signed-out', pending: null })
    },
  }
  return store
}
```

- [ ] **Step 4: Implement `src/core/client.ts`**

```ts
import { createHttp } from './http.js'
import { localStorageTokenStore, type TokenStore } from './token-store.js'
import { localStorageOtpFlow, type OtpFlowStore } from './otp-flow.js'
import { createAuthStore, type AuthStore, type AuthStoreInternal } from './auth.js'

export const DEFAULT_BASE_URL = 'https://apps.pepperhorn.com'
const SLUG_RE = /^[a-z0-9-]{1,50}$/

export interface PhClientOptions {
  /** Must be in OTP_AUTH_APP_SLUGS and the gateway registry. */
  appSlug: string
  baseUrl?: string
  appVersion?: string
  deviceLabel?: string
  /** Default localStorageTokenStore(`ph.session.${appSlug}`). */
  tokenStore?: TokenStore
  /** Default localStorageOtpFlow(`ph.otp.${appSlug}`). */
  otpFlowStore?: OtpFlowStore
  fetch?: typeof fetch
  now?: () => number
}

export interface PhClient {
  readonly appSlug: string
  readonly baseUrl: string
  auth: AuthStore
}

export function createPepperhornClient(o: PhClientOptions): PhClient {
  if (!SLUG_RE.test(o.appSlug)) throw new TypeError('createPepperhornClient: appSlug must match /^[a-z0-9-]{1,50}$/')
  const baseUrl = (o.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const now = o.now ?? Date.now
  const tokens = o.tokenStore ?? localStorageTokenStore(`ph.session.${o.appSlug}`, now)
  const otp = o.otpFlowStore ?? localStorageOtpFlow(`ph.otp.${o.appSlug}`, now)
  // Late-bound so a test (or a polyfill) that replaces globalThis.fetch later still applies.
  const fetchImpl: typeof fetch = o.fetch ?? ((input, init) => globalThis.fetch(input, init))
  let auth: AuthStoreInternal | null = null
  const http = createHttp({ baseUrl, fetch: fetchImpl, tokens, now, onUnauthorized: () => auth?.handleUnauthorized() })
  auth = createAuthStore({
    appSlug: o.appSlug, baseUrl, http, fetch: fetchImpl, tokens, otp, now,
    appVersion: o.appVersion, deviceLabel: o.deviceLabel,
  })
  return { appSlug: o.appSlug, baseUrl, auth }
}
```

Add to `src/index.ts` (append):
```ts
export { createPepperhornClient, DEFAULT_BASE_URL } from './core/client.js'
export type { PhClient, PhClientOptions } from './core/client.js'
export { localStorageOtpFlow, memoryOtpFlow, OTP_FLOW_TTL_MS } from './core/otp-flow.js'
export type { OtpFlowStore } from './core/otp-flow.js'
export { RESTORE_BACKOFF_MS } from './core/auth.js'
export type { AuthStore } from './core/auth.js'
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(core): auth store over otp-auth bearer transport, OTP-flow persistence, client factory" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5 `[sdk]` Saves and shares clients

**Files:**
- Create: `src/core/saves.ts`, `src/core/shares.ts`
- Test: `src/core/saves.test.ts`, `src/core/shares.test.ts`
- Modify: `src/core/client.ts` (add `saves`, `shares`), `src/index.ts`

**Interfaces:**
- Consumes: `Http`, `PhError`, `isPhError`, `OkSchema`, `SaveSummarySchema`, `SaveRowSchema`, `PublicSaveSchema`, `ShareCreatedSchema`, `ResolvedShareSchema`, `Visibility`, `SaveRow`, `SaveSummaryRow`, `PublicSave`, `ShareCreated`, `ResolvedShare` (Task 3).
- Produces:
  ```ts
  interface UpsertInput<T> { kind: string; externalId: string; name: string; payload: T; visibility?: Visibility; ifUpdatedAt?: string }
  interface SavesClient {
    list(q: { kind?: string; cursor?: string; limit?: number }): Promise<{ items: SaveSummaryRow[]; next: string | null }>
    get<T = unknown>(kind: string, externalId: string, schema?: z.ZodType<T>): Promise<SaveRow<T> | null>
    upsert<T>(i: UpsertInput<T>): Promise<SaveRow<T>>
    setVisibility(kind: string, externalId: string, v: Visibility): Promise<void>
    remove(kind: string, externalId: string): Promise<void>
    listPublic(q: { kind: string; cursor?: string }): Promise<{ items: PublicSave[]; next: string | null }>
  }
  SHARE_CODE_RE = /^[A-Za-z0-9]{10}$/; DEFAULT_SHARE_PATH_RE = /^\/s\/([A-Za-z0-9]{10})\/?$/
  parseShareCode(pathname: string, pattern?: RegExp): string | null
  interface SharesClient {
    createAnonymous<T>(i: { kind: string; payload: T }): Promise<ShareCreated>
    createFromSave(i: { kind: string; externalId: string; visibility: Exclude<Visibility, 'private'> }): Promise<ShareCreated>
    resolve<T = unknown>(code: string, schema?: z.ZodType<T>): Promise<ResolvedShare<T> | null>
    update<T>(code: string, payload: T): Promise<void>
    fork<T = unknown>(code: string, i: { externalId: string; name: string }): Promise<SaveRow<T>>
    revoke(code: string, revokeKey?: string): Promise<void>
  }
  PhClient gains: saves: SavesClient; shares: SharesClient
  ```

Gateway routes (all carry `appSlug`; GET/DELETE in the query, others in the body):

| Client call | Route | Auth | 200 body |
|---|---|---|---|
| `saves.list` | `GET /ph/v1/saves?appSlug&kind&cursor&limit` | required | `{ok, items: SaveSummaryWire[], next}` |
| `saves.get` | `GET /ph/v1/saves/:kind/:externalId?appSlug` | required | `{ok, save}`; 404 → `null` |
| `saves.upsert` | `POST /ph/v1/saves {appSlug, kind, externalId, name, payload, visibility?, ifUpdatedAt?}` | required | `{ok, save}`; 409 `conflict` (stale, or `detail:'quota'`), 413, 400/403 |
| `saves.setVisibility` | `PATCH /ph/v1/saves/:kind/:externalId {appSlug, visibility}` | required | `{ok, save}` |
| `saves.remove` | `DELETE /ph/v1/saves/:kind/:externalId?appSlug` | required | `{ok:true}` |
| `saves.listPublic` | `GET /ph/v1/public?appSlug&kind&cursor` | none | `{ok, items, next}` |
| `shares.createAnonymous` | `POST /ph/v1/shares {appSlug, kind, payload}` | optional | `{ok, code, url, shortUrl, revokeKey}` |
| `shares.createFromSave` | `POST /ph/v1/shares {appSlug, kind, externalId, visibility}` | required | `{ok, code, url, shortUrl}` |
| `shares.resolve` | `GET /ph/v1/shares/:code?appSlug` | optional | `{ok, share}`; 404 → `null` |
| `shares.update` | `PATCH /ph/v1/shares/:code {appSlug, payload}` | required | `{ok:true}` |
| `shares.fork` | `POST /ph/v1/shares/:code/fork {appSlug, externalId, name}` | required | `{ok, save}` |
| `shares.revoke` | `DELETE /ph/v1/shares/:code?appSlug` body `{revokeKey?}` | required without a key, optional with one | `{ok:true}` |

- [ ] **Step 1: Write the failing tests**

`src/core/saves.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { z } from 'zod/v4'
import { createPepperhornClient } from './client.js'
import { memoryTokenStore } from './token-store.js'
import { memoryOtpFlow } from './otp-flow.js'
import { TOKEN, json, stubFetch } from '../../test/stub-fetch.js'
import type { StubHandler } from '../../test/stub-fetch.js'

const FUTURE = '2099-01-01T00:00:00.000Z'
const T0 = '2026-10-13T00:00:00.000Z'
const row = (o: object = {}) => ({
  id: 'r1', appSlug: 'tickle-me-ivories', kind: 'scene', externalId: 'e1', name: 'One', payload: { a: 1 },
  visibility: 'private', forkedFrom: null, createdAt: T0, updatedAt: T0, ...o,
})

function client(routes: Record<string, StubHandler | StubHandler[]>, token = true) {
  const stub = stubFetch(routes)
  const tokens = memoryTokenStore()
  if (token) tokens.set(TOKEN, FUTURE)
  const c = createPepperhornClient({ appSlug: 'tickle-me-ivories', baseUrl: 'https://apps.test', fetch: stub.fetch, tokenStore: tokens, otpFlowStore: memoryOtpFlow() })
  return { c, stub }
}

describe('SavesClient', () => {
  it('list passes kind, cursor and limit and returns items and next', async () => {
    const { payload: _p, ...summary } = row()
    const { c, stub } = client({ 'GET /ph/v1/saves': () => json(200, { ok: true, items: [{ ...summary, bytes: 9 }], next: 'CUR2' }) })
    await expect(c.saves.list({ kind: 'scene', cursor: 'CUR1', limit: 100 })).resolves.toEqual({ items: [{ ...summary, bytes: 9 }], next: 'CUR2' })
    expect(stub.calls[0]!.query).toEqual({ appSlug: 'tickle-me-ivories', kind: 'scene', cursor: 'CUR1', limit: '100' })
  })

  it('get returns null on 404 and refuses a payload that fails the caller schema', async () => {
    const { c } = client({ 'GET /ph/v1/saves/scene/missing': () => json(404, { ok: false, error: 'not_found' }), 'GET /ph/v1/saves/scene/e1': () => json(200, { ok: true, save: row() }) })
    await expect(c.saves.get('scene', 'missing')).resolves.toBeNull()
    await expect(c.saves.get('scene', 'e1')).resolves.toMatchObject({ externalId: 'e1', payload: { a: 1 } })
    await expect(c.saves.get('scene', 'e1', z.object({ b: z.string() }))).rejects.toMatchObject({ code: 'invalid' })
  })

  it('upsert sends ifUpdatedAt and surfaces a stale write and the quota as conflicts', async () => {
    const { c, stub } = client({
      'POST /ph/v1/saves': [
        () => json(200, { ok: true, save: row() }),
        () => json(409, { ok: false, error: 'conflict' }),
        () => json(409, { ok: false, error: 'conflict', detail: 'quota' }),
      ],
    })
    await c.saves.upsert({ kind: 'scene', externalId: 'e1', name: 'One', payload: { a: 1 }, ifUpdatedAt: T0 })
    expect(stub.calls[0]!.body).toEqual({ appSlug: 'tickle-me-ivories', kind: 'scene', externalId: 'e1', name: 'One', payload: { a: 1 }, ifUpdatedAt: T0 })
    await expect(c.saves.upsert({ kind: 'scene', externalId: 'e1', name: 'One', payload: {}, ifUpdatedAt: T0 })).rejects.toMatchObject({ code: 'conflict', detail: undefined })
    await expect(c.saves.upsert({ kind: 'scene', externalId: 'e2', name: 'Two', payload: {} })).rejects.toMatchObject({ code: 'conflict', detail: 'quota' })
  })

  it('setVisibility, remove and listPublic hit the right routes; listPublic sends no token', async () => {
    const { c, stub } = client({
      'PATCH /ph/v1/saves/scene/e1': () => json(200, { ok: true, save: row({ visibility: 'public' }) }),
      'DELETE /ph/v1/saves/scene/e1': () => json(200, { ok: true }),
      'GET /ph/v1/public': () => json(200, { ok: true, items: [], next: null }),
    })
    await c.saves.setVisibility('scene', 'e1', 'public')
    await c.saves.remove('scene', 'e1')
    await c.saves.listPublic({ kind: 'scene' })
    expect(stub.calls.map((x) => [x.method, x.path, x.auth !== null])).toEqual([
      ['PATCH', '/ph/v1/saves/scene/e1', true], ['DELETE', '/ph/v1/saves/scene/e1', true], ['GET', '/ph/v1/public', false],
    ])
    expect(stub.calls[1]!.query).toEqual({ appSlug: 'tickle-me-ivories' })
  })
})
```

`src/core/shares.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createPepperhornClient } from './client.js'
import { parseShareCode } from './shares.js'
import { memoryTokenStore } from './token-store.js'
import { memoryOtpFlow } from './otp-flow.js'
import { TOKEN, json, stubFetch } from '../../test/stub-fetch.js'
import type { StubHandler } from '../../test/stub-fetch.js'

const FUTURE = '2099-01-01T00:00:00.000Z'
const CODE = 'AbCdEfGhJk'
const share = { code: CODE, appSlug: 'tickle-me-ivories', kind: 'scene', payload: { v: 2 }, owner: { handle: 'ana' }, visibility: 'link_view', isOwner: false, canEdit: false, canFork: true, viewCount: 3, createdAt: FUTURE }

function client(routes: Record<string, StubHandler | StubHandler[]>, token = true) {
  const stub = stubFetch(routes)
  const tokens = memoryTokenStore()
  if (token) tokens.set(TOKEN, FUTURE)
  const c = createPepperhornClient({ appSlug: 'tickle-me-ivories', baseUrl: 'https://apps.test', fetch: stub.fetch, tokenStore: tokens, otpFlowStore: memoryOtpFlow() })
  return { c, stub, tokens }
}

describe('parseShareCode', () => {
  it.each([
    ['/s/AbCdEfGhJk', CODE], ['/s/AbCdEfGhJk/', CODE], ['/s/short', null], ['/s/AbCdEfGhJk1', null],
    ['/x/AbCdEfGhJk', null], ['/s/AbCdEf-hJk', null],
  ])('%s -> %s', (p, want) => { expect(parseShareCode(p)).toBe(want) })
  it('takes a custom pattern (chordee keeps /c/<code>)', () => {
    expect(parseShareCode('/c/AbCdEfGhJk', /^\/c\/([A-Za-z0-9]{10})$/)).toBe(CODE)
  })
})

describe('SharesClient', () => {
  it('createAnonymous works signed out and returns the revoke key', async () => {
    const { c, stub } = client({ 'POST /ph/v1/shares': () => json(200, { ok: true, code: CODE, url: 'https://ivories.test/s/' + CODE, shortUrl: null, revokeKey: 'k'.repeat(43) }) }, false)
    await expect(c.shares.createAnonymous({ kind: 'look', payload: { v: 1 } })).resolves.toMatchObject({ code: CODE, revokeKey: 'k'.repeat(43) })
    expect(stub.calls[0]).toMatchObject({ auth: null, body: { appSlug: 'tickle-me-ivories', kind: 'look', payload: { v: 1 } } })
  })

  it('a stale token on createAnonymous is dropped and the share still goes through', async () => {
    const { c, stub, tokens } = client({ 'POST /ph/v1/shares': (x) => (x.auth ? json(401, { ok: false, error: 'unauthorized' }) : json(200, { ok: true, code: CODE, url: 'u', shortUrl: null, revokeKey: 'k' })) })
    await expect(c.shares.createAnonymous({ kind: 'look', payload: {} })).resolves.toMatchObject({ code: CODE })
    expect(stub.calls).toHaveLength(2)
    expect(tokens.get()).toBeNull()
    expect(c.auth.getSnapshot().status).toBe('signed-out')
  })

  it('createFromSave needs a session and never sends a payload', async () => {
    const signedOut = client({}, false)
    await expect(signedOut.c.shares.createFromSave({ kind: 'scene', externalId: 'e1', visibility: 'link_view' })).rejects.toMatchObject({ code: 'unauthorized' })
    expect(signedOut.stub.calls).toHaveLength(0)
    const { c, stub } = client({ 'POST /ph/v1/shares': () => json(200, { ok: true, code: CODE, url: 'u', shortUrl: 'https://phrn.link/Ab12345' }) })
    await expect(c.shares.createFromSave({ kind: 'scene', externalId: 'e1', visibility: 'public' })).resolves.toEqual({ code: CODE, url: 'u', shortUrl: 'https://phrn.link/Ab12345' })
    expect(stub.calls[0]!.body).toEqual({ appSlug: 'tickle-me-ivories', kind: 'scene', externalId: 'e1', visibility: 'public' })
  })

  it('resolve: a malformed code is null without a request; 404 is null; otherwise the share', async () => {
    const { c, stub } = client({
      [`GET /ph/v1/shares/${CODE}`]: [() => json(200, { ok: true, share }), () => json(404, { ok: false, error: 'not_found' })],
    })
    await expect(c.shares.resolve('../../etc')).resolves.toBeNull()
    expect(stub.calls).toHaveLength(0)
    await expect(c.shares.resolve(CODE)).resolves.toMatchObject({ code: CODE, owner: { handle: 'ana' }, canFork: true })
    await expect(c.shares.resolve(CODE)).resolves.toBeNull()
  })

  it('update, fork and revoke hit the right routes', async () => {
    const T0 = '2026-10-13T00:00:00.000Z'
    const save = { id: 'r9', appSlug: 'tickle-me-ivories', kind: 'scene', externalId: 'f1', name: 'Copy', payload: {}, visibility: 'private', forkedFrom: CODE, createdAt: T0, updatedAt: T0 }
    const { c, stub } = client({
      [`PATCH /ph/v1/shares/${CODE}`]: () => json(200, { ok: true }),
      [`POST /ph/v1/shares/${CODE}/fork`]: () => json(200, { ok: true, save }),
      [`DELETE /ph/v1/shares/${CODE}`]: () => json(200, { ok: true }),
    })
    await c.shares.update(CODE, { v: 2 })
    await expect(c.shares.fork(CODE, { externalId: 'f1', name: 'Copy' })).resolves.toMatchObject({ forkedFrom: CODE })
    await c.shares.revoke(CODE, 'secret-key')
    expect(stub.calls[0]!.body).toEqual({ appSlug: 'tickle-me-ivories', payload: { v: 2 } })
    expect(stub.calls[1]!.body).toEqual({ appSlug: 'tickle-me-ivories', externalId: 'f1', name: 'Copy' })
    expect(stub.calls[2]).toMatchObject({ query: { appSlug: 'tickle-me-ivories' }, body: { revokeKey: 'secret-key' } })
  })

  it('revoke without a key needs a session', async () => {
    const { c } = client({}, false)
    await expect(c.shares.revoke(CODE)).rejects.toMatchObject({ code: 'unauthorized' })
  })
})
```

Run: `npx vitest run src/core/saves.test.ts src/core/shares.test.ts`
Expected: FAIL (`c.saves` undefined / modules not found).

- [ ] **Step 2: Implement `src/core/saves.ts`**

```ts
import { z } from 'zod/v4'
import { PhError, isPhError } from './errors.js'
import type { Http } from './http.js'
import { OkSchema, PublicSaveSchema, SaveRowSchema, SaveSummarySchema } from './schemas.js'
import type { PublicSave, SaveRow, SaveSummaryRow, Visibility } from './types.js'

export interface UpsertInput<T> {
  kind: string; externalId: string; name: string; payload: T
  visibility?: Visibility
  /** "The row I last saw": a different stored updatedAt, or no row at all, is a 409 conflict. */
  ifUpdatedAt?: string
}

export interface SavesClient {
  list(q: { kind?: string; cursor?: string; limit?: number }): Promise<{ items: SaveSummaryRow[]; next: string | null }>
  get<T = unknown>(kind: string, externalId: string, schema?: z.ZodType<T>): Promise<SaveRow<T> | null>
  upsert<T>(i: UpsertInput<T>): Promise<SaveRow<T>>
  setVisibility(kind: string, externalId: string, v: Visibility): Promise<void>
  remove(kind: string, externalId: string): Promise<void>
  listPublic(q: { kind: string; cursor?: string }): Promise<{ items: PublicSave[]; next: string | null }>
}

const ListWire = z.object({ ok: z.literal(true), items: z.array(SaveSummarySchema), next: z.string().nullable() })
const RowWire = z.object({ ok: z.literal(true), save: SaveRowSchema(z.unknown()) })
const PublicWire = z.object({ ok: z.literal(true), items: z.array(PublicSaveSchema), next: z.string().nullable() })

const seg = (s: string) => encodeURIComponent(s)

/** Applies a caller schema to an untrusted payload; a mismatch is 'invalid', never 'server'. */
export function checkPayload<T>(payload: unknown, schema: z.ZodType<T> | undefined): T {
  if (!schema) return payload as T
  const r = schema.safeParse(payload)
  if (!r.success) throw new PhError('invalid', { message: 'This item is not in a format this app can open.' })
  return r.data
}

export function createSavesClient(d: { appSlug: string; http: Http }): SavesClient {
  const appSlug = d.appSlug
  return {
    async list(q) {
      const r = await d.http({ method: 'GET', path: '/ph/v1/saves', query: { appSlug, kind: q.kind, cursor: q.cursor, limit: q.limit }, auth: 'required' }, ListWire)
      return { items: r.items, next: r.next }
    },
    async get<T = unknown>(kind: string, externalId: string, schema?: z.ZodType<T>) {
      try {
        const r = await d.http({ method: 'GET', path: `/ph/v1/saves/${seg(kind)}/${seg(externalId)}`, query: { appSlug }, auth: 'required' }, RowWire)
        return { ...r.save, payload: checkPayload(r.save.payload, schema) } as SaveRow<T>
      } catch (e) {
        if (isPhError(e) && e.code === 'not_found') return null
        throw e
      }
    },
    async upsert<T>(i: UpsertInput<T>) {
      const r = await d.http({ method: 'POST', path: '/ph/v1/saves', body: { appSlug, ...i }, auth: 'required' }, RowWire)
      return r.save as SaveRow<T>
    },
    async setVisibility(kind, externalId, v) {
      await d.http({ method: 'PATCH', path: `/ph/v1/saves/${seg(kind)}/${seg(externalId)}`, body: { appSlug, visibility: v }, auth: 'required' }, RowWire)
    },
    async remove(kind, externalId) {
      await d.http({ method: 'DELETE', path: `/ph/v1/saves/${seg(kind)}/${seg(externalId)}`, query: { appSlug }, auth: 'required' }, OkSchema)
    },
    async listPublic(q) {
      const r = await d.http({ method: 'GET', path: '/ph/v1/public', query: { appSlug, kind: q.kind, cursor: q.cursor }, auth: 'none' }, PublicWire)
      return { items: r.items, next: r.next }
    },
  }
}
```

- [ ] **Step 3: Implement `src/core/shares.ts`**

```ts
import { z } from 'zod/v4'
import { isPhError } from './errors.js'
import type { Http } from './http.js'
import { OkSchema, ResolvedShareSchema, SaveRowSchema, ShareCreatedSchema } from './schemas.js'
import { checkPayload } from './saves.js'
import type { ResolvedShare, SaveRow, ShareCreated, Visibility } from './types.js'

/** Gateway share codes: 10 characters of base57, a subset of [A-Za-z0-9]. */
export const SHARE_CODE_RE = /^[A-Za-z0-9]{10}$/
export const DEFAULT_SHARE_PATH_RE = /^\/s\/([A-Za-z0-9]{10})\/?$/

export function parseShareCode(pathname: string, pattern: RegExp = DEFAULT_SHARE_PATH_RE): string | null {
  const code = pattern.exec(pathname)?.[1]
  return code && SHARE_CODE_RE.test(code) ? code : null
}

export interface SharesClient {
  createAnonymous<T>(i: { kind: string; payload: T }): Promise<ShareCreated>
  createFromSave(i: { kind: string; externalId: string; visibility: Exclude<Visibility, 'private'> }): Promise<ShareCreated>
  resolve<T = unknown>(code: string, schema?: z.ZodType<T>): Promise<ResolvedShare<T> | null>
  update<T>(code: string, payload: T): Promise<void>
  fork<T = unknown>(code: string, i: { externalId: string; name: string }): Promise<SaveRow<T>>
  revoke(code: string, revokeKey?: string): Promise<void>
}

const CreatedWire = ShareCreatedSchema.extend({ ok: z.literal(true) })
const ResolveWire = z.object({ ok: z.literal(true), share: ResolvedShareSchema(z.unknown()) })
const ForkWire = z.object({ ok: z.literal(true), save: SaveRowSchema(z.unknown()) })

const strip = ({ ok: _ok, ...rest }: z.infer<typeof CreatedWire>): ShareCreated => rest

export function createSharesClient(d: { appSlug: string; http: Http }): SharesClient {
  const appSlug = d.appSlug
  const path = (code: string) => `/ph/v1/shares/${encodeURIComponent(code)}`
  return {
    async createAnonymous(i) {
      return strip(await d.http({ method: 'POST', path: '/ph/v1/shares', body: { appSlug, kind: i.kind, payload: i.payload }, auth: 'optional' }, CreatedWire))
    },
    async createFromSave(i) {
      return strip(await d.http({ method: 'POST', path: '/ph/v1/shares', body: { appSlug, kind: i.kind, externalId: i.externalId, visibility: i.visibility }, auth: 'required' }, CreatedWire))
    },
    async resolve<T = unknown>(code: string, schema?: z.ZodType<T>) {
      if (!SHARE_CODE_RE.test(code)) return null
      try {
        const r = await d.http({ method: 'GET', path: path(code), query: { appSlug }, auth: 'optional' }, ResolveWire)
        return { ...r.share, payload: checkPayload(r.share.payload, schema) } as ResolvedShare<T>
      } catch (e) {
        if (isPhError(e) && e.code === 'not_found') return null
        throw e
      }
    },
    async update(code, payload) {
      await d.http({ method: 'PATCH', path: path(code), body: { appSlug, payload }, auth: 'required' }, OkSchema)
    },
    async fork<T = unknown>(code: string, i: { externalId: string; name: string }) {
      const r = await d.http({ method: 'POST', path: `${path(code)}/fork`, body: { appSlug, externalId: i.externalId, name: i.name }, auth: 'required' }, ForkWire)
      return r.save as SaveRow<T>
    },
    async revoke(code, revokeKey) {
      await d.http({
        method: 'DELETE', path: path(code), query: { appSlug },
        body: revokeKey === undefined ? {} : { revokeKey },
        auth: revokeKey === undefined ? 'required' : 'optional',
      }, OkSchema)
    },
  }
}
```

In `src/core/client.ts`: import `createSavesClient`, `SavesClient` from `./saves.js` and `createSharesClient`, `SharesClient` from `./shares.js`; add `saves: SavesClient; shares: SharesClient` to `PhClient`; return
```ts
  return {
    appSlug: o.appSlug, baseUrl, auth,
    saves: createSavesClient({ appSlug: o.appSlug, http }),
    shares: createSharesClient({ appSlug: o.appSlug, http }),
  }
```

Append to `src/index.ts`:
```ts
export type { SavesClient, UpsertInput } from './core/saves.js'
export { parseShareCode, SHARE_CODE_RE, DEFAULT_SHARE_PATH_RE } from './core/shares.js'
export type { SharesClient } from './core/shares.js'
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): saves and shares clients over /ph/v1, parseShareCode" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6 `[sdk]` Fake gateway (`@pepperhorn/app-sdk/testing`), integration test, first tarball

Why: gates 0.5/0.6 have not run, so nothing can call production. One stateful, in-memory implementation of the otp-auth + gateway contract gives the SDK an end-to-end test, the plugin its provider tests, and Task 19 its mock server. It is test/dev code: it ships under `./testing` and is never imported by `.`, `./react` or `./ui`.

**Files:**
- Create: `src/testing/fakeGateway.ts`; replace `src/testing/index.ts`
- Test: `test/integration.test.ts`

**Interfaces:**
- Consumes: `Visibility` type (Task 3).
- Produces:
  ```ts
  type FakeValidateResult = { ok: true } | { ok: false; code: 'invalid' | 'upload_requires_sign_in'; detail: string }
  interface FakeKind { maxBytes: number; validate?(payload: unknown, ctx: { signedIn: boolean }): FakeValidateResult; anonymousShare?: boolean }
  interface FakeGatewayOptions { appSlug?: string; shareOrigin?: string; fixedCode?: string; kinds?: Record<string, FakeKind>; shortLinks?: boolean; now?: () => number }
  interface FakeGateway {
    fetch: typeof fetch
    users: Map<string, FakeUser>; saves: Map<string, FakeSave>; shares: Map<string, FakeShare>; sessions: FakeSession[]
    lastCode(email: string): string | null
    failNext(route: string, status: number, body?: unknown, headers?: Record<string, string>): void   // route = 'METHOD /path'
    seedSave(email: string, s: { kind: string; externalId: string; name: string; payload: unknown; visibility?: Visibility }): FakeSave
  }
  createFakeGateway(o?: FakeGatewayOptions): FakeGateway
  ```
  Save map key: `${userId}|${kind}|${externalId}`. Defaults: `appSlug 'test-app'`, `shareOrigin 'https://app.test'`, any kind matching `^[a-z][a-z0-9_-]{0,31}$` with a 256 KiB cap, `shortUrl: null`.
  Tarball: `/tmp/app-sdk-pack/pepperhorn-app-sdk-0.1.0.tgz`.

- [ ] **Step 1: Write the failing integration test**

`test/integration.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createPepperhornClient, memoryOtpFlow, memoryTokenStore } from '../src/index.js'
import { createFakeGateway } from '../src/testing/index.js'

const APP = 'tickle-me-ivories'

function setup() {
  const gw = createFakeGateway({ appSlug: APP, shareOrigin: 'https://ivories.test', fixedCode: '12345678' })
  const make = () => createPepperhornClient({ appSlug: APP, baseUrl: 'https://apps.test', fetch: gw.fetch, tokenStore: memoryTokenStore(), otpFlowStore: memoryOtpFlow() })
  return { gw, make }
}

async function signIn(c: ReturnType<ReturnType<typeof setup>['make']>, email: string) {
  await c.auth.requestCode(email)
  return c.auth.verifyCode(email, '12345678')
}

describe('SDK against the fake gateway', () => {
  it('signs in, saves, shares from a save, and the owner can make it private', async () => {
    const { make } = setup()
    const owner = make()
    const user = await signIn(owner, 'ana@example.test')
    expect(user.handle).toMatch(/^player-\d+$/)
    expect(JSON.stringify(user)).not.toMatch(/ph_uid/i)

    const saved = await owner.saves.upsert({ kind: 'scene', externalId: 'e1', name: 'One', payload: { n: 1 } })
    await expect(owner.saves.upsert({ kind: 'scene', externalId: 'e1', name: 'One', payload: { n: 2 }, ifUpdatedAt: '2000-01-01T00:00:00.000Z' }))
      .rejects.toMatchObject({ code: 'conflict' })
    await owner.saves.upsert({ kind: 'scene', externalId: 'e1', name: 'One', payload: { n: 2 }, ifUpdatedAt: saved.updatedAt })
    expect((await owner.saves.list({ kind: 'scene' })).items.map((i) => i.externalId)).toEqual(['e1'])

    const created = await owner.shares.createFromSave({ kind: 'scene', externalId: 'e1', visibility: 'link_view' })
    expect(created.url).toBe(`https://ivories.test/s/${created.code}`)
    const guest = make()
    await expect(guest.shares.resolve(created.code)).resolves.toMatchObject({ payload: { n: 2 }, owner: { handle: user.handle }, isOwner: false, canFork: false })

    await owner.saves.setVisibility('scene', 'e1', 'private')
    await expect(guest.shares.resolve(created.code)).resolves.toBeNull()
  })

  it('an anonymous share is revoked with its key', async () => {
    const { make } = setup()
    const anon = make()
    const s = await anon.shares.createAnonymous({ kind: 'look', payload: { v: 1 } })
    expect(s.revokeKey).toBeTruthy()
    await expect(anon.shares.revoke(s.code, 'wrong')).rejects.toMatchObject({ code: 'forbidden' })
    await anon.shares.revoke(s.code, s.revokeKey)
    await expect(anon.shares.resolve(s.code)).resolves.toBeNull()
  })

  it('forks into a private save of the forker, and lists devices', async () => {
    const { make } = setup()
    const owner = make()
    await signIn(owner, 'ana@example.test')
    await owner.saves.upsert({ kind: 'scene', externalId: 'e1', name: 'One', payload: { n: 1 } })
    const { code } = await owner.shares.createFromSave({ kind: 'scene', externalId: 'e1', visibility: 'link_view' })
    const other = make()
    await signIn(other, 'bob@example.test')
    await expect(other.shares.fork(code, { externalId: 'f1', name: 'Copy' })).resolves.toMatchObject({ visibility: 'private', forkedFrom: code })
    await expect(owner.shares.fork(code, { externalId: 'f2', name: 'Mine' })).rejects.toMatchObject({ code: 'forbidden' })

    const second = make()
    await signIn(second, 'ana@example.test')
    const devices = await owner.auth.devices()
    expect(devices).toHaveLength(2)
    await owner.auth.revokeDevice(devices.find((d) => !d.current)!.id)
    await expect(second.auth.restore()).resolves.toMatchObject({ status: 'signed-out' })
  })

  it('failNext injects one error response', async () => {
    const { gw, make } = setup()
    const c = make()
    gw.failNext('POST /ph/v1/enroll', 429, { ok: false, error: 'rate_limited', retryAfterSec: 30 })
    await expect(c.auth.requestCode('ana@example.test')).rejects.toMatchObject({ code: 'rate_limited', retryAfterSec: 30 })
    await expect(c.auth.requestCode('ana@example.test')).resolves.toBeUndefined()
  })

  it('applies a kind validator and the size cap', async () => {
    const gw = createFakeGateway({
      appSlug: APP, fixedCode: '12345678',
      kinds: { scene: { maxBytes: 64, validate: (p, ctx) => (!ctx.signedIn && (p as { midi?: boolean }).midi ? { ok: false, code: 'upload_requires_sign_in', detail: 'midi_upload' } : { ok: true }) } },
    })
    const c = createPepperhornClient({ appSlug: APP, baseUrl: 'https://apps.test', fetch: gw.fetch, tokenStore: memoryTokenStore(), otpFlowStore: memoryOtpFlow() })
    await expect(c.shares.createAnonymous({ kind: 'scene', payload: { midi: true } })).rejects.toMatchObject({ code: 'upload_requires_sign_in' })
    await expect(c.shares.createAnonymous({ kind: 'scene', payload: { pad: 'x'.repeat(100) } })).rejects.toMatchObject({ code: 'too_large' })
    await expect(c.shares.createAnonymous({ kind: 'look', payload: {} })).rejects.toMatchObject({ code: 'invalid' })
  })
})
```

Run: `npx vitest run test/integration.test.ts`
Expected: FAIL (`createFakeGateway` is not exported).

- [ ] **Step 2: Implement `src/testing/fakeGateway.ts`**

```ts
// An in-memory stand-in for apps.pepperhorn.com: directus-otp-auth in bearer
// mode (/otp-auth/*) and the ph gateway (/ph/v1/*). Wire shapes and status
// codes follow ph-apps-extensions endpoints/ph/src and directus-otp-auth
// routes.js. Test and local-dev use only: no persistence, no rate limits, no
// phrn.link sync (shortUrl is null unless `shortLinks`), no ph_uid anywhere.
import type { Visibility } from '../core/types.js'

export type FakeValidateResult = { ok: true } | { ok: false; code: 'invalid' | 'upload_requires_sign_in'; detail: string }
export interface FakeKind {
  maxBytes: number
  validate?(payload: unknown, ctx: { signedIn: boolean }): FakeValidateResult
  anonymousShare?: boolean
}
export interface FakeGatewayOptions {
  appSlug?: string
  shareOrigin?: string
  /** Every code mailed is this one; default: random 8 digits. */
  fixedCode?: string
  kinds?: Record<string, FakeKind>
  shortLinks?: boolean
  now?: () => number
}
export interface FakeUser { id: string; email: string; handle: string; firstName: string | null; lastName: string | null }
export interface FakeSave {
  id: string; userId: string; kind: string; externalId: string; name: string; payload: unknown
  visibility: Visibility; forkedFrom: string | null; createdAt: number; updatedAt: number
}
export interface FakeShare {
  code: string; kind: string; userId: string | null; externalId: string | null; payload: unknown
  revokeKey: string | null; status: 'active' | 'revoked'; viewCount: number; createdAt: number; shortSlug: string | null
}
export interface FakeSession {
  id: string; token: string; userId: string; appSlug: string; deviceLabel: string | null
  userAgent: string | null; expiresAt: number; lastAccessAt: number; revoked: boolean
}
export interface FakeGateway {
  fetch: typeof fetch
  users: Map<string, FakeUser>
  saves: Map<string, FakeSave>
  shares: Map<string, FakeShare>
  sessions: FakeSession[]
  lastCode(email: string): string | null
  failNext(route: string, status: number, body?: unknown, headers?: Record<string, string>): void
  seedSave(email: string, s: { kind: string; externalId: string; name: string; payload: unknown; visibility?: Visibility }): FakeSave
}

const BASE57 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const DAY = 86_400_000
const VISIBILITIES: readonly string[] = ['private', 'link_view', 'link_edit', 'public']
const SHARE_VIS: readonly string[] = ['link_view', 'link_edit', 'public']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EXT_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CODE_RE = /^[A-Za-z0-9]{10}$/
const BEARER_RE = /^Bearer ([0-9a-f-]{36}\.[A-Za-z0-9_-]{16,})$/

const pick = (alphabet: string, n: number) =>
  Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
const iso = (ms: number) => new Date(ms).toISOString()
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
const ok = (body: object = {}) => reply(200, { ok: true, ...body })
/** Gateway shape when `error` is given; otp-auth's uniform {ok:false} otherwise. */
const fail = (status: number, error?: string, detail?: string) =>
  reply(status, error ? { ok: false, error, ...(detail ? { detail } : {}) } : { ok: false })
const norm = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null)

export function createFakeGateway(o: FakeGatewayOptions = {}): FakeGateway {
  const appSlug = o.appSlug ?? 'test-app'
  const shareOrigin = o.shareOrigin ?? 'https://app.test'
  const now = o.now ?? Date.now
  const users = new Map<string, FakeUser>()
  const codes = new Map<string, string>()
  const saves = new Map<string, FakeSave>()
  const shares = new Map<string, FakeShare>()
  const sessions: FakeSession[] = []
  const failures = new Map<string, Array<() => Response>>()
  let handles = 0

  const userById = (id: string | null) => [...users.values()].find((u) => u.id === id) ?? null
  const enroll = (email: string): FakeUser => {
    let u = users.get(email)
    if (!u) {
      u = { id: crypto.randomUUID(), email, handle: `player-${++handles}`, firstName: null, lastName: null }
      users.set(email, u)
    }
    return u
  }
  const kindOf = (kind: unknown): FakeKind | null => {
    if (typeof kind !== 'string') return null
    if (o.kinds) return Object.hasOwn(o.kinds, kind) ? o.kinds[kind]! : null
    return /^[a-z][a-z0-9_-]{0,31}$/.test(kind) ? { maxBytes: 256 * 1024 } : null
  }
  /** null = no Authorization header; 'bad' = a header that does not verify (always a 401). */
  const sessionOf = (h: Headers): FakeSession | null | 'bad' => {
    const a = h.get('authorization')
    if (!a) return null
    const m = BEARER_RE.exec(a)
    const s = m && sessions.find((x) => x.token === m[1] && !x.revoked && x.expiresAt > now() && x.appSlug === appSlug)
    if (!s) return 'bad'
    s.lastAccessAt = now()
    return s
  }
  const userWire = (u: FakeUser) => ({ id: u.id, email: u.email, handle: u.handle, firstName: u.firstName, lastName: u.lastName })
  const saveWire = (s: FakeSave, withPayload: boolean) => ({
    id: s.id, appSlug, kind: s.kind, externalId: s.externalId, name: s.name,
    ...(withPayload ? { payload: s.payload } : { bytes: JSON.stringify(s.payload).length }),
    visibility: s.visibility, forkedFrom: s.forkedFrom, createdAt: iso(s.createdAt), updatedAt: iso(s.updatedAt),
  })
  const checkPayload = (k: FakeKind, payload: unknown, signedIn: boolean): Response | null => {
    if (payload === undefined) return fail(400, 'invalid', 'payload_required')
    if (new TextEncoder().encode(JSON.stringify(payload)).length > k.maxBytes) return fail(413, 'too_large')
    const v = k.validate ? k.validate(payload, { signedIn }) : { ok: true as const }
    return v.ok ? null : fail(v.code === 'upload_requires_sign_in' ? 403 : 400, v.code, v.detail)
  }
  const newShare = (p: Pick<FakeShare, 'kind' | 'userId' | 'externalId' | 'payload' | 'revokeKey'>): FakeShare => {
    let code = pick(BASE57, 10)
    while (shares.has(code)) code = pick(BASE57, 10)
    const sh: FakeShare = { ...p, code, status: 'active', viewCount: 0, createdAt: now(), shortSlug: o.shortLinks ? pick(BASE62, 7) : null }
    shares.set(code, sh)
    return sh
  }
  const created = (sh: FakeShare, revokeKey?: string) => ok({
    code: sh.code, url: `${shareOrigin}/s/${sh.code}`,
    shortUrl: sh.shortSlug ? `https://phrn.link/${sh.shortSlug}` : null,
    ...(revokeKey ? { revokeKey } : {}),
  })
  /** What a caller may see, or null (404): missing, revoked, or an owned share whose save is gone or private. */
  const view = (code: string) => {
    const sh = shares.get(code)
    if (!sh || sh.status !== 'active') return null
    if (sh.externalId === null) return { sh, payload: sh.payload, visibility: 'link_view' as Visibility, owner: null, save: null }
    const save = saves.get(`${sh.userId}|${sh.kind}|${sh.externalId}`)
    if (!save || save.visibility === 'private') return null
    return { sh, payload: save.payload, visibility: save.visibility, owner: userById(sh.userId), save }
  }
  const revokeSharesOf = (userId: string, kind: string, externalId: string) => {
    for (const sh of shares.values()) if (sh.userId === userId && sh.kind === kind && sh.externalId === externalId) sh.status = 'revoked'
  }

  async function handle(method: string, url: URL, headers: Headers, b: Record<string, unknown>): Promise<Response> {
    const p = url.pathname
    const slug = url.searchParams.get('appSlug') ?? b.appSlug

    // ---- directus-otp-auth (bearer transport) ----
    if (method === 'POST' && p === '/otp-auth/code') {
      const email = norm(b.email)
      if (b.appSlug === appSlug && users.has(email)) codes.set(email, o.fixedCode ?? String(Math.floor(Math.random() * 1e8)).padStart(8, '0'))
      return ok()
    }
    if (method === 'POST' && p === '/otp-auth/verify') {
      const email = norm(b.email)
      const code = codes.get(email)
      if (b.appSlug !== appSlug || !code || code !== b.code) return fail(401)
      codes.delete(email)
      const s: FakeSession = {
        id: crypto.randomUUID(), token: `${crypto.randomUUID()}.${pick(BASE62, 32)}`, userId: users.get(email)!.id, appSlug,
        deviceLabel: typeof b.deviceLabel === 'string' ? b.deviceLabel : null, userAgent: headers.get('user-agent'),
        expiresAt: now() + 30 * DAY, lastAccessAt: now(), revoked: false,
      }
      sessions.push(s)
      return ok({ token: s.token, expiresAt: iso(s.expiresAt) })
    }
    if (p.startsWith('/otp-auth/')) {
      if (slug !== undefined && slug !== appSlug) return fail(400)
      const s = sessionOf(headers)
      if (!s || s === 'bad') return fail(401)
      if (method === 'GET' && p === '/otp-auth/session') return ok({ principal: { type: 'app_user', id: s.userId }, appSlug, expiresAt: iso(s.expiresAt) })
      if (method === 'POST' && p === '/otp-auth/logout') { s.revoked = true; return ok() }
      if (method === 'POST' && p === '/otp-auth/logout-all') {
        let revoked = 0
        for (const x of sessions) if (x.userId === s.userId && !x.revoked) { x.revoked = true; revoked++ }
        return ok({ revoked })
      }
      if (method === 'GET' && p === '/otp-auth/sessions') {
        return ok({
          sessions: sessions.filter((x) => x.userId === s.userId && !x.revoked && x.expiresAt > now()).map((x) => ({
            id: x.id, appSlug: x.appSlug, deviceLabel: x.deviceLabel, userAgent: x.userAgent, ip: null,
            lastAccessAt: iso(x.lastAccessAt), expiresAt: iso(x.expiresAt), current: x.id === s.id,
          })),
        })
      }
      const dm = /^\/otp-auth\/sessions\/([^/]+)$/.exec(p)
      if (method === 'DELETE' && dm) {
        const t = sessions.find((x) => x.id === decodeURIComponent(dm[1]!) && x.userId === s.userId && !x.revoked)
        if (!t) return fail(404)
        t.revoked = true
        return ok()
      }
      return fail(404)
    }

    // ---- ph gateway ----
    if (!p.startsWith('/ph/v1/')) return fail(404, 'not_found')
    if (slug !== appSlug) return fail(400, 'invalid', 'unknown_app')
    const sess = sessionOf(headers)
    if (sess === 'bad') return fail(401, 'unauthorized')

    if (method === 'POST' && p === '/ph/v1/enroll') {
      const email = norm(b.email)
      if (email.length > 254 || !EMAIL_RE.test(email)) return fail(400, 'invalid', 'email')
      enroll(email)
      return ok()
    }
    if (method === 'GET' && p === '/ph/v1/public') {
      const kind = url.searchParams.get('kind')
      if (!kindOf(kind)) return fail(400, 'invalid', 'unknown_kind')
      const items = [...saves.values()].filter((s) => s.kind === kind && s.visibility === 'public')
        .sort((a, z) => z.updatedAt - a.updatedAt)
        .map((s) => ({
          externalId: s.externalId, name: s.name, kind: s.kind, ownerHandle: userById(s.userId)?.handle ?? null, updatedAt: iso(s.updatedAt),
          shareCode: [...shares.values()].find((x) => x.status === 'active' && x.userId === s.userId && x.kind === s.kind && x.externalId === s.externalId)?.code ?? null,
        }))
      return ok({ items, next: null })
    }

    let m: RegExpExecArray | null
    if ((m = /^\/ph\/v1\/shares\/([^/]+)$/.exec(p)) && method === 'GET') {
      const v = CODE_RE.test(m[1]!) ? view(m[1]!) : null
      if (!v) return fail(404, 'not_found')
      const isOwner = !!sess && v.sh.userId === sess.userId
      if (!isOwner) v.sh.viewCount++
      return ok({
        share: {
          code: v.sh.code, appSlug, kind: v.sh.kind, payload: v.payload,
          owner: v.owner ? { handle: v.owner.handle } : null, visibility: v.visibility, isOwner,
          canEdit: isOwner || (v.visibility === 'link_edit' && !!sess),
          canFork: !!sess && !isOwner && v.visibility !== 'private',
          viewCount: v.sh.viewCount, createdAt: iso(v.sh.createdAt),
        },
      })
    }
    if (method === 'POST' && p === '/ph/v1/shares') {
      const k = kindOf(b.kind)
      if (!k) return fail(400, 'invalid', 'unknown_kind')
      const kind = b.kind as string
      if (b.externalId !== undefined && b.payload !== undefined) return fail(400, 'invalid', 'mode')
      if (b.externalId !== undefined) {
        if (!sess) return fail(401, 'unauthorized')
        if (typeof b.externalId !== 'string' || !EXT_RE.test(b.externalId) || b.externalId.length > 64) return fail(400, 'invalid', 'externalId')
        if (typeof b.visibility !== 'string' || !SHARE_VIS.includes(b.visibility)) return fail(400, 'invalid', 'visibility')
        const save = saves.get(`${sess.userId}|${kind}|${b.externalId}`)
        if (!save) return fail(404, 'not_found')
        save.visibility = b.visibility as Visibility
        const active = [...shares.values()].find((x) => x.status === 'active' && x.userId === sess.userId && x.kind === kind && x.externalId === b.externalId)
        return created(active ?? newShare({ kind, userId: sess.userId, externalId: b.externalId, payload: null, revokeKey: null }))
      }
      if (k.anonymousShare === false) return fail(403, 'forbidden', 'anonymous_share_disabled')
      const bad = checkPayload(k, b.payload, !!sess)
      if (bad) return bad
      const revokeKey = pick(BASE62, 43)
      return created(newShare({ kind, userId: sess?.userId ?? null, externalId: null, payload: b.payload, revokeKey }), revokeKey)
    }
    if ((m = /^\/ph\/v1\/shares\/([^/]+)$/.exec(p)) && method === 'PATCH') {
      if (!sess) return fail(401, 'unauthorized')
      const v = view(m[1]!)
      if (!v) return fail(404, 'not_found')
      const isOwner = v.sh.userId === sess.userId
      if (!isOwner && v.visibility !== 'link_edit') return fail(403, 'forbidden')
      const bad = checkPayload(kindOf(v.sh.kind)!, b.payload, true)
      if (bad) return bad
      if (v.save) {
        v.save.payload = b.payload
        v.save.updatedAt = Math.max(now(), v.save.updatedAt + 1)
      } else {
        if (!isOwner) return fail(404, 'not_found')
        v.sh.payload = b.payload
      }
      return ok()
    }
    if ((m = /^\/ph\/v1\/shares\/([^/]+)\/fork$/.exec(p)) && method === 'POST') {
      if (!sess) return fail(401, 'unauthorized')
      if (typeof b.externalId !== 'string' || !EXT_RE.test(b.externalId)) return fail(400, 'invalid', 'externalId')
      const name = text(b.name, 128)
      if (!name) return fail(400, 'invalid', 'name')
      const v = view(m[1]!)
      if (!v) return fail(404, 'not_found')
      if (v.sh.userId === sess.userId) return fail(403, 'forbidden', 'not_forkable')
      const key = `${sess.userId}|${v.sh.kind}|${b.externalId}`
      if (saves.has(key)) return fail(409, 'conflict', 'exists')
      const t = now()
      const save: FakeSave = {
        id: crypto.randomUUID(), userId: sess.userId, kind: v.sh.kind, externalId: b.externalId, name,
        payload: structuredClone(v.payload), visibility: 'private', forkedFrom: v.sh.code, createdAt: t, updatedAt: t,
      }
      saves.set(key, save)
      return ok({ save: saveWire(save, true) })
    }
    if ((m = /^\/ph\/v1\/shares\/([^/]+)$/.exec(p)) && method === 'DELETE') {
      if (b.revokeKey === undefined && !sess) return fail(401, 'unauthorized')
      const sh = shares.get(m[1]!)
      if (!sh) return fail(404, 'not_found')
      const byKey = typeof b.revokeKey === 'string' && sh.revokeKey !== null && sh.revokeKey === b.revokeKey
      const byOwner = !!sess && sh.userId === sess.userId
      if (!byKey && !byOwner) return fail(403, 'forbidden')
      sh.status = 'revoked'
      return ok()
    }

    // Everything below needs a session.
    if (!sess) return fail(401, 'unauthorized')
    const me = userById(sess.userId)
    if (!me) return fail(401, 'unauthorized')

    if (p === '/ph/v1/me' && method === 'GET') return ok({ user: userWire(me) })
    if (p === '/ph/v1/me' && method === 'PATCH') {
      if (typeof b.handle === 'string') {
        if ([...users.values()].some((u) => u.id !== me.id && u.handle.toLowerCase() === (b.handle as string).toLowerCase())) return fail(409, 'conflict', 'handle_taken')
        me.handle = b.handle
      }
      if (b.firstName !== undefined) me.firstName = text(b.firstName, 128)
      if (b.lastName !== undefined) me.lastName = text(b.lastName, 128)
      return ok({ user: userWire(me) })
    }
    if (p === '/ph/v1/saves' && method === 'GET') {
      const kind = url.searchParams.get('kind')
      if (kind !== null && !kindOf(kind)) return fail(400, 'invalid', 'unknown_kind')
      const limit = Number(url.searchParams.get('limit') ?? 50)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail(400, 'invalid', 'limit')
      const offset = Number(url.searchParams.get('cursor') ? atob(url.searchParams.get('cursor')!) : 0)
      const mine = [...saves.values()].filter((s) => s.userId === me.id && (kind === null || s.kind === kind))
        .sort((a, z) => z.updatedAt - a.updatedAt || (z.id < a.id ? -1 : 1))
      const page = mine.slice(offset, offset + limit)
      return ok({ items: page.map((s) => saveWire(s, false)), next: offset + limit < mine.length ? btoa(String(offset + limit)) : null })
    }
    if (p === '/ph/v1/saves' && method === 'POST') {
      const k = kindOf(b.kind)
      if (!k) return fail(400, 'invalid', 'unknown_kind')
      const kind = b.kind as string
      if (typeof b.externalId !== 'string' || !EXT_RE.test(b.externalId)) return fail(400, 'invalid', 'externalId')
      const name = text(b.name, 128)
      if (!name) return fail(400, 'invalid', 'name')
      if (b.visibility !== undefined && (typeof b.visibility !== 'string' || !VISIBILITIES.includes(b.visibility))) return fail(400, 'invalid', 'visibility')
      const bad = checkPayload(k, b.payload, true)
      if (bad) return bad
      const key = `${me.id}|${kind}|${b.externalId}`
      const ex = saves.get(key)
      if (b.ifUpdatedAt !== undefined && (!ex || iso(ex.updatedAt) !== b.ifUpdatedAt)) return fail(409, 'conflict')
      if (!ex && [...saves.values()].filter((s) => s.userId === me.id).length >= 500) return fail(409, 'conflict', 'quota')
      const t = now()
      const save: FakeSave = ex
        ? { ...ex, name, payload: b.payload, visibility: (b.visibility as Visibility | undefined) ?? ex.visibility, updatedAt: Math.max(t, ex.updatedAt + 1) }
        : { id: crypto.randomUUID(), userId: me.id, kind, externalId: b.externalId, name, payload: b.payload, visibility: (b.visibility as Visibility | undefined) ?? 'private', forkedFrom: null, createdAt: t, updatedAt: t }
      saves.set(key, save)
      return ok({ save: saveWire(save, true) })
    }
    if ((m = /^\/ph\/v1\/saves\/([^/]+)\/([^/]+)$/.exec(p))) {
      const kind = decodeURIComponent(m[1]!)
      const externalId = decodeURIComponent(m[2]!)
      if (!kindOf(kind)) return fail(400, 'invalid', 'unknown_kind')
      const key = `${me.id}|${kind}|${externalId}`
      const save = saves.get(key)
      if (!save) return fail(404, 'not_found')
      if (method === 'GET') return ok({ save: saveWire(save, true) })
      if (method === 'PATCH') {
        if (b.visibility !== undefined && (typeof b.visibility !== 'string' || !VISIBILITIES.includes(b.visibility))) return fail(400, 'invalid', 'visibility')
        const name = b.name === undefined ? save.name : text(b.name, 128)
        if (!name) return fail(400, 'invalid', 'name')
        const next = { ...save, name, visibility: (b.visibility as Visibility | undefined) ?? save.visibility, updatedAt: Math.max(now(), save.updatedAt + 1) }
        saves.set(key, next)
        return ok({ save: saveWire(next, true) })
      }
      if (method === 'DELETE') {
        saves.delete(key)
        revokeSharesOf(me.id, kind, externalId)
        return ok()
      }
    }
    return fail(404, 'not_found')
  }

  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)
    let body: Record<string, unknown> = {}
    if (typeof init.body === 'string' && init.body.length > 0) {
      try {
        const parsed: unknown = JSON.parse(init.body)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fail(400, 'invalid', 'invalid_body')
        body = parsed as Record<string, unknown>
      } catch {
        return fail(400, 'invalid', 'invalid_body')
      }
    }
    const queued = failures.get(`${method} ${url.pathname}`)?.shift()
    if (queued) return queued()
    return handle(method, url, headers, body)
  }) as typeof fetch

  return {
    fetch: fetchImpl,
    users, saves, shares, sessions,
    lastCode: (email) => codes.get(norm(email)) ?? null,
    failNext(route, status, body = { ok: false }, headers = {}) {
      const q = failures.get(route) ?? []
      q.push(() => reply(status, body, headers))
      failures.set(route, q)
    },
    seedSave(email, s) {
      const u = enroll(norm(email))
      const t = now()
      const save: FakeSave = {
        id: crypto.randomUUID(), userId: u.id, kind: s.kind, externalId: s.externalId, name: s.name,
        payload: s.payload, visibility: s.visibility ?? 'private', forkedFrom: null, createdAt: t, updatedAt: t,
      }
      saves.set(`${u.id}|${s.kind}|${s.externalId}`, save)
      return save
    },
  }
}
```

`src/testing/index.ts`:
```ts
export { createFakeGateway } from './fakeGateway.js'
export type {
  FakeGateway, FakeGatewayOptions, FakeKind, FakeSave, FakeSession, FakeShare, FakeUser, FakeValidateResult,
} from './fakeGateway.js'
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: PASS; `check-dist` confirms `dist/testing/index.js` reaches no React.

- [ ] **Step 4: Pack the dev tarball for the plugin**

Run:
```bash
mkdir -p /tmp/app-sdk-pack && rm -f /tmp/app-sdk-pack/pepperhorn-app-sdk-0.1.0.tgz
npm pack --pack-destination /tmp/app-sdk-pack
```
Expected: `/tmp/app-sdk-pack/pepperhorn-app-sdk-0.1.0.tgz`. (Tasks 7–9 re-run this command at their end.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(testing): in-memory fake gateway (otp-auth bearer + /ph/v1) and an SDK integration test" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7 `[sdk]` React bindings (`@pepperhorn/app-sdk/react`)

**Files:**
- Create: `src/react/PhProvider.tsx`, `src/react/useAuth.ts`, `src/react/useSaves.ts`, `src/react/useShareFromUrl.ts`; replace `src/react/index.ts`
- Test: `src/react/react.test.tsx`

**Interfaces:**
- Consumes: `PhClient`, `AuthStore`, `AuthSnapshot`, `SavesClient`, `UpsertInput`, `SaveSummaryRow`, `ResolvedShare`, `PhError`, `isPhError`, `parseShareCode` (Tasks 3–5); `createFakeGateway` (Task 6, tests only).
- Produces:
  ```ts
  PhProvider(p: { client: PhClient; children: ReactNode }): JSX.Element
  usePh(): PhClient
  type UseAuth = AuthSnapshot & Pick<AuthStore, 'requestCode'|'verifyCode'|'signOut'|'signOutEverywhere'|'devices'|'revokeDevice'|'updateProfile'>
  useAuth(): UseAuth
  useSaves(kind: string): { items: SaveSummaryRow[]; loading: boolean; error: PhError | null; refresh(): void; save: SavesClient['upsert']; remove(externalId: string): Promise<void> }
  useShareFromUrl<T = unknown>(o?: { pattern?: RegExp; schema?: z.ZodType<T>; pathname?: string }): { state: 'none'|'loading'|'ready'|'missing'|'error'; share: ResolvedShare<T> | null; error: PhError | null }
  ```
  Deviation from spec §3.2, recorded: `useSaves` drops the unused `schema` argument (lists carry no payload), `useShareFromUrl` also returns `error`, and `useSyncedSaves` is deferred to phase 4 (module's migration is its only consumer).

- [ ] **Step 1: Write the failing tests**

`src/react/react.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createPepperhornClient, memoryOtpFlow, memoryTokenStore } from '../index.js'
import type { PhClient } from '../index.js'
import { createFakeGateway } from '../testing/index.js'
import { PhProvider, useAuth, useSaves, useShareFromUrl } from './index.js'

const APP = 'tickle-me-ivories'

function setup() {
  const gw = createFakeGateway({ appSlug: APP, fixedCode: '12345678' })
  const calls: string[] = []
  const fetchSpy: typeof fetch = (input, init) => {
    calls.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`)
    return gw.fetch(input, init)
  }
  const client = createPepperhornClient({ appSlug: APP, baseUrl: 'https://apps.test', fetch: fetchSpy, tokenStore: memoryTokenStore(), otpFlowStore: memoryOtpFlow() })
  const wrapper = ({ children }: { children: ReactNode }) => <PhProvider client={client}>{children}</PhProvider>
  return { gw, client, wrapper, calls }
}

async function signIn(client: PhClient, email = 'ana@example.test') {
  await client.auth.requestCode(email)
  await client.auth.verifyCode(email, '12345678')
}

function Status() {
  const a = useAuth()
  return <span data-testid="status">{a.status === 'signed-in' ? `in:${a.user.handle}` : a.status}</span>
}

describe('useAuth', () => {
  it('shares one auth state across components', async () => {
    const { client, wrapper: Wrapper } = setup()
    render(<Wrapper><Status /><Status /></Wrapper>)
    expect(screen.getAllByTestId('status').map((e) => e.textContent)).toEqual(['signed-out', 'signed-out'])
    await act(() => signIn(client))
    expect(screen.getAllByTestId('status').map((e) => e.textContent)).toEqual(['in:player-1', 'in:player-1'])
  })

  it('throws a clear error outside PhProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/PhProvider/)
  })
})

describe('useSaves', () => {
  it('is empty signed out, lists after sign-in, and refreshes after save and remove', async () => {
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useSaves('scene'), { wrapper })
    expect(result.current.items).toEqual([])
    await act(() => signIn(client))
    await act(() => result.current.save({ kind: 'scene', externalId: 'e1', name: 'One', payload: {} }).then(() => undefined))
    await waitFor(() => expect(result.current.items.map((i) => i.externalId)).toEqual(['e1']))
    await act(() => result.current.remove('e1'))
    await waitFor(() => expect(result.current.items).toEqual([]))
  })
})

describe('useShareFromUrl', () => {
  it('waits for auth to leave "unknown" before resolving (chordee ShareResolver rule)', async () => {
    const { client, wrapper, calls, gw } = setup()
    await signIn(client)
    await client.saves.upsert({ kind: 'scene', externalId: 'e1', name: 'One', payload: { n: 1 } })
    const { code } = await client.shares.createFromSave({ kind: 'scene', externalId: 'e1', visibility: 'link_view' })
    // A fresh client holding the same token starts 'unknown' until restore().
    const token = gw.sessions[0]!.token
    const store = memoryTokenStore()
    store.set(token, '2099-01-01T00:00:00.000Z')
    const restoring = createPepperhornClient({ appSlug: APP, baseUrl: 'https://apps.test', fetch: (i, n) => { calls.push(`${n?.method ?? 'GET'} ${new URL(String(i)).pathname}`); return gw.fetch(i, n) }, tokenStore: store, otpFlowStore: memoryOtpFlow() })
    const w = ({ children }: { children: ReactNode }) => <PhProvider client={restoring}>{children}</PhProvider>
    calls.length = 0
    const { result } = renderHook(() => useShareFromUrl({ pathname: `/s/${code}` }), { wrapper: w })
    expect(result.current.state).toBe('loading')
    expect(calls.some((c) => c.includes('/ph/v1/shares/'))).toBe(false)
    await act(() => restoring.auth.restore().then(() => undefined))
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current.share).toMatchObject({ isOwner: true, payload: { n: 1 } })
    void wrapper
  })

  it('is "none" off a share path and "missing" for an unknown code', async () => {
    const { wrapper } = setup()
    expect(renderHook(() => useShareFromUrl({ pathname: '/' }), { wrapper }).result.current.state).toBe('none')
    const { result } = renderHook(() => useShareFromUrl({ pathname: '/s/AbCdEfGhJk' }), { wrapper })
    await waitFor(() => expect(result.current.state).toBe('missing'))
  })
})
```

Run: `npx vitest run src/react`
Expected: FAIL (`./index.js` has no exports).

- [ ] **Step 2: Implement**

`src/react/PhProvider.tsx`:
```tsx
import { createContext, useContext, type ReactNode } from 'react'
import type { PhClient } from '../core/client.js'

const PhContext = createContext<PhClient | null>(null)

/** Holds one PhClient for the hooks below (spec §3.2). */
export function PhProvider(p: { client: PhClient; children: ReactNode }) {
  return <PhContext.Provider value={p.client}>{p.children}</PhContext.Provider>
}

export function usePh(): PhClient {
  const c = useContext(PhContext)
  if (!c) throw new Error('usePh/useAuth: wrap the app in <PhProvider client={…}>.')
  return c
}
```

`src/react/useAuth.ts`:
```ts
import { useMemo, useSyncExternalStore } from 'react'
import type { AuthStore } from '../core/auth.js'
import type { AuthSnapshot } from '../core/types.js'
import { usePh } from './PhProvider.js'

export type UseAuth = AuthSnapshot & Pick<AuthStore,
  'requestCode' | 'verifyCode' | 'signOut' | 'signOutEverywhere' | 'devices' | 'revokeDevice' | 'updateProfile'>

export function useAuth(): UseAuth {
  const { auth } = usePh()
  const snap = useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot)
  return useMemo(() => ({
    ...snap,
    requestCode: auth.requestCode, verifyCode: auth.verifyCode, signOut: auth.signOut,
    signOutEverywhere: auth.signOutEverywhere, devices: auth.devices, revokeDevice: auth.revokeDevice,
    updateProfile: auth.updateProfile,
  }) as UseAuth, [snap, auth])
}
```

`src/react/useSaves.ts`:
```ts
import { useCallback, useEffect, useState } from 'react'
import { PhError, isPhError } from '../core/errors.js'
import type { SavesClient, UpsertInput } from '../core/saves.js'
import type { SaveSummaryRow } from '../core/types.js'
import { usePh } from './PhProvider.js'
import { useAuth } from './useAuth.js'

const MAX_PAGES = 10 // 10 x 100 covers the gateway's 500-save quota

export function useSaves(kind: string) {
  const client = usePh()
  const { status } = useAuth()
  const signedIn = status === 'signed-in'
  const [items, setItems] = useState<SaveSummaryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<PhError | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!signedIn) {
      setItems([])
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    void (async () => {
      const all: SaveSummaryRow[] = []
      let cursor: string | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await client.saves.list({ kind, limit: 100, ...(cursor ? { cursor } : {}) })
        all.push(...r.items)
        if (!r.next) break
        cursor = r.next
      }
      return all
    })().then(
      (all) => { if (alive) setItems(all) },
      (e: unknown) => { if (alive) setError(isPhError(e) ? e : new PhError('server')) },
    ).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [client, kind, signedIn, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  const save = useCallback(<T,>(i: UpsertInput<T>) => client.saves.upsert(i).then((r) => { refresh(); return r }), [client, refresh]) as SavesClient['upsert']
  const remove = useCallback(async (externalId: string) => {
    await client.saves.remove(kind, externalId)
    refresh()
  }, [client, kind, refresh])

  return { items, loading, error, refresh, save, remove }
}
```

`src/react/useShareFromUrl.ts`:
```ts
import { useEffect, useRef, useState } from 'react'
import type { z } from 'zod/v4'
import { PhError, isPhError } from '../core/errors.js'
import { parseShareCode } from '../core/shares.js'
import type { ResolvedShare } from '../core/types.js'
import { usePh } from './PhProvider.js'
import { useAuth } from './useAuth.js'

export type ShareFromUrlState = 'none' | 'loading' | 'ready' | 'missing' | 'error'

/** Resolves `/s/<code>` (or `pattern`) once auth has settled, so isOwner/canEdit are right first time. */
export function useShareFromUrl<T = unknown>(o: { pattern?: RegExp; schema?: z.ZodType<T>; pathname?: string } = {}) {
  const client = usePh()
  const { status } = useAuth()
  const pathname = o.pathname ?? (typeof location === 'undefined' ? '/' : location.pathname)
  const code = parseShareCode(pathname, o.pattern)
  const schemaRef = useRef(o.schema)
  useEffect(() => { schemaRef.current = o.schema })
  const [s, setS] = useState<{ state: ShareFromUrlState; share: ResolvedShare<T> | null; error: PhError | null }>(
    { state: code ? 'loading' : 'none', share: null, error: null })

  useEffect(() => {
    if (!code) {
      setS({ state: 'none', share: null, error: null })
      return
    }
    if (status === 'unknown') return
    let alive = true
    setS({ state: 'loading', share: null, error: null })
    client.shares.resolve<T>(code, schemaRef.current).then(
      (share) => { if (alive) setS(share ? { state: 'ready', share, error: null } : { state: 'missing', share: null, error: null }) },
      (e: unknown) => { if (alive) setS({ state: 'error', share: null, error: isPhError(e) ? e : new PhError('server') }) },
    )
    return () => { alive = false }
  }, [client, code, status])

  return s
}
```

`src/react/index.ts`:
```ts
export { PhProvider, usePh } from './PhProvider.js'
export { useAuth } from './useAuth.js'
export type { UseAuth } from './useAuth.js'
export { useSaves } from './useSaves.js'
export { useShareFromUrl } from './useShareFromUrl.js'
export type { ShareFromUrlState } from './useShareFromUrl.js'
```

- [ ] **Step 3: Verify and re-pack**

Run: `npm run typecheck && npm test && npm run build && rm -f /tmp/app-sdk-pack/*.tgz && npm pack --pack-destination /tmp/app-sdk-pack`
Expected: PASS; `dist ok`; tarball rewritten.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(react): PhProvider, useAuth, useSaves, useShareFromUrl" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8 `[sdk]` Headless OTP form (`@pepperhorn/app-sdk/ui`)

**Files:**
- Create: `src/ui/useOtpForm.ts`, `src/ui/OtpDigits.tsx`; replace `src/ui/index.ts`
- Test: `src/ui/ui.test.tsx`

**Interfaces:**
- Consumes: `usePh` (Task 7), `AuthUser`, `PhError`, `isPhError`.
- Produces:
  ```ts
  interface OtpFormOptions { codeLength: number; onDone(user: AuthUser): void; cooldownSec?: number /* default 60, OTP_AUTH cooldown */ }
  interface OtpFormState {
    step: 'email' | 'code' | 'done'; codeLength: number
    email: string; setEmail(v: string): void
    digits: string[]; setDigit(index: number, value: string): void   // a multi-digit value (paste, autofill) spreads forward
    submitEmail(): Promise<void>; submitCode(): Promise<void>; resend(): Promise<void>; back(): void
    resendInSec: number; busy: boolean; error: PhError | null
  }
  useOtpForm(o: OtpFormOptions): OtpFormState
  OtpDigits(p: { form: OtpFormState; className?: string; inputClassName?: string; autoFocus?: boolean }): JSX.Element
  // emits .ph-otp-form on the group and .ph-otp-digit on each input; no styling
  ```

- [ ] **Step 1: Write the failing tests**

`src/ui/ui.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createPepperhornClient, memoryOtpFlow, memoryTokenStore } from '../index.js'
import { createFakeGateway } from '../testing/index.js'
import { PhProvider } from '../react/index.js'
import { OtpDigits, useOtpForm } from './index.js'
import type { OtpFormState } from './index.js'

function setup() {
  const gw = createFakeGateway({ appSlug: 'tickle-me-ivories', fixedCode: '12345678' })
  const client = createPepperhornClient({ appSlug: 'tickle-me-ivories', baseUrl: 'https://apps.test', fetch: gw.fetch, tokenStore: memoryTokenStore(), otpFlowStore: memoryOtpFlow() })
  const wrapper = ({ children }: { children: ReactNode }) => <PhProvider client={client}>{children}</PhProvider>
  return { client, wrapper }
}

afterEach(() => { vi.useRealTimers() })

describe('useOtpForm', () => {
  it('email -> code -> done, auto-submitting when a pasted code fills every digit', async () => {
    const { wrapper } = setup()
    const onDone = vi.fn()
    const { result } = renderHook(() => useOtpForm({ codeLength: 8, onDone }), { wrapper })
    act(() => result.current.setEmail('ana@example.test'))
    await act(() => result.current.submitEmail())
    expect(result.current.step).toBe('code')
    act(() => result.current.setDigit(0, '1234 5678'))
    await waitFor(() => expect(result.current.step).toBe('done'))
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.test' }))
  })

  it('a wrong code reports invalid_code and clears the digits', async () => {
    const { wrapper } = setup()
    const { result } = renderHook(() => useOtpForm({ codeLength: 8, onDone: () => {} }), { wrapper })
    act(() => result.current.setEmail('ana@example.test'))
    await act(() => result.current.submitEmail())
    act(() => result.current.setDigit(0, '00000000'))
    await waitFor(() => expect(result.current.error?.code).toBe('invalid_code'))
    expect(result.current.digits).toEqual(Array(8).fill(''))
    expect(result.current.step).toBe('code')
  })

  it('holds resend for the cooldown', async () => {
    // Fake the interval and the clock before the code is sent, so the cooldown ticker runs on them.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    const { wrapper } = setup()
    const { result } = renderHook(() => useOtpForm({ codeLength: 8, onDone: () => {}, cooldownSec: 60 }), { wrapper })
    act(() => result.current.setEmail('ana@example.test'))
    await act(() => result.current.submitEmail())
    expect(result.current.resendInSec).toBe(60)
    await act(async () => { vi.advanceTimersByTime(61_000) })
    expect(result.current.resendInSec).toBe(0)
  })
})

function Form(p: { onState(s: OtpFormState): void }) {
  const form = useOtpForm({ codeLength: 8, onDone: () => {} })
  p.onState(form)
  return <OtpDigits form={form} className="my-otp" inputClassName="my-digit" />
}

describe('OtpDigits', () => {
  it('renders the class hooks and spreads a paste across the inputs', async () => {
    const { wrapper: Wrapper } = setup()
    let form: OtpFormState | null = null
    render(<Wrapper><Form onState={(s) => { form = s }} /></Wrapper>)
    await act(async () => { form!.setEmail('ana@example.test') })
    await act(() => form!.submitEmail())
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(8)
    expect(inputs[0]!.className).toBe('ph-otp-digit my-digit')
    expect(inputs[0]!.closest('.ph-otp-form.my-otp')).not.toBeNull()
    fireEvent.paste(inputs[2]!, { clipboardData: { getData: () => '987' } })
    expect(form!.digits.slice(0, 6)).toEqual(['', '', '9', '8', '7', ''])
  })
})
```

Run: `npx vitest run src/ui`
Expected: FAIL (no exports).

- [ ] **Step 2: Implement**

`src/ui/useOtpForm.ts`:
```ts
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PhError, isPhError } from '../core/errors.js'
import type { AuthUser } from '../core/types.js'
import { usePh } from '../react/PhProvider.js'

export interface OtpFormOptions { codeLength: number; onDone(user: AuthUser): void; cooldownSec?: number }
export interface OtpFormState {
  step: 'email' | 'code' | 'done'
  codeLength: number
  email: string
  setEmail(v: string): void
  digits: string[]
  setDigit(index: number, value: string): void
  submitEmail(): Promise<void>
  submitCode(): Promise<void>
  resend(): Promise<void>
  back(): void
  resendInSec: number
  busy: boolean
  error: PhError | null
}

const blank = (n: number) => Array<string>(n).fill('')

/** The email -> code -> done step machine (spec §3.2). A pending code from before a reload resumes on the code step. */
export function useOtpForm(o: OtpFormOptions): OtpFormState {
  const { auth } = usePh()
  const snap = useSyncExternalStore(auth.subscribe, auth.getSnapshot, auth.getSnapshot)
  const pending = snap.status === 'signed-out' ? snap.pending : null
  const [step, setStep] = useState<OtpFormState['step']>(pending ? 'code' : 'email')
  const [email, setEmail] = useState(pending?.email ?? '')
  const [digits, setDigits] = useState(() => blank(o.codeLength))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PhError | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const submitting = useRef(false)
  const onDone = useRef(o.onDone)
  useEffect(() => { onDone.current = o.onDone })

  const cooldownMs = (o.cooldownSec ?? 60) * 1000
  const resendInSec = pending ? Math.max(0, Math.ceil((pending.codeSentAt + cooldownMs - nowMs) / 1000)) : 0
  const cooling = resendInSec > 0
  useEffect(() => {
    if (!cooling) return
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cooling])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(isPhError(e) ? e : new PhError('server'))
    } finally {
      setBusy(false)
    }
  }, [])

  const submitEmail = useCallback(() => run(async () => {
    await auth.requestCode(email)
    setDigits(blank(o.codeLength))
    setNowMs(Date.now())
    setStep('code')
  }), [auth, email, o.codeLength, run])

  const verify = useCallback((code: string) => {
    if (submitting.current) return Promise.resolve()
    submitting.current = true
    return run(async () => {
      try {
        const user = await auth.verifyCode(email, code)
        setStep('done')
        onDone.current(user)
      } catch (e) {
        setDigits(blank(o.codeLength))
        throw e
      }
    }).finally(() => { submitting.current = false })
  }, [auth, email, o.codeLength, run])

  const setDigit = useCallback((index: number, value: string) => {
    const clean = value.replace(/\D/g, '')
    setDigits((prev) => {
      const next = [...prev]
      if (clean.length === 0) next[index] = ''
      for (let i = 0; i < clean.length && index + i < next.length; i++) next[index + i] = clean[i]!
      return next
    })
  }, [])

  const full = digits.every((d) => d !== '')
  useEffect(() => {
    if (step === 'code' && full) void verify(digits.join(''))
    // Fires on the transition to "every digit filled"; a failed verify clears them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, step])

  const resend = useCallback(() => run(async () => {
    if (resendInSec > 0) return
    await auth.requestCode(email)
    setNowMs(Date.now())
  }), [auth, email, resendInSec, run])

  const back = useCallback(() => {
    setStep('email')
    setError(null)
    setDigits(blank(o.codeLength))
  }, [o.codeLength])

  return {
    step, codeLength: o.codeLength, email, setEmail, digits, setDigit,
    submitEmail, submitCode: () => verify(digits.join('')), resend, back,
    resendInSec, busy, error,
  }
}
```

`src/ui/OtpDigits.tsx`:
```tsx
import { useRef } from 'react'
import type { OtpFormState } from './useOtpForm.js'

const cx = (...c: (string | undefined)[]) => c.filter(Boolean).join(' ')

/** Unstyled digit inputs for useOtpForm. Class hooks: .ph-otp-form (group), .ph-otp-digit (each input). */
export function OtpDigits(p: { form: OtpFormState; className?: string; inputClassName?: string; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const { form } = p
  const n = form.digits.length
  const focus = (i: number) => refs.current[Math.max(0, Math.min(i, n - 1))]?.focus()
  return (
    <div className={cx('ph-otp-form', p.className)} role="group" aria-label="Sign-in code">
      {form.digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          className={cx('ph-otp-digit', p.inputClassName)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${n}`}
          autoFocus={p.autoFocus === true && i === 0}
          value={d}
          disabled={form.busy}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '')
            form.setDigit(i, d && v.length === 2 ? v.slice(-1) : v)
            if (v) focus(i + Math.max(1, v.length === 2 && d ? 1 : v.length))
          }}
          onPaste={(e) => {
            e.preventDefault()
            const t = e.clipboardData.getData('text')
            form.setDigit(i, t)
            focus(i + t.replace(/\D/g, '').length)
          }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) focus(i - 1) }}
        />
      ))}
    </div>
  )
}
```

`src/ui/index.ts`:
```ts
export { useOtpForm } from './useOtpForm.js'
export type { OtpFormOptions, OtpFormState } from './useOtpForm.js'
export { OtpDigits } from './OtpDigits.js'
```

- [ ] **Step 3: Verify and re-pack**

Run: `npm run typecheck && npm test && npm run build && rm -f /tmp/app-sdk-pack/*.tgz && npm pack --pack-destination /tmp/app-sdk-pack`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ui): headless useOtpForm and OtpDigits with paste spreading and resend cooldown" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9 `[sdk]` Release preparation (pack check, gated smoke scripts, README)

**Files:**
- Create: `scripts/check-pack.mjs`, `scripts/smoke-auth.ts`, `scripts/smoke-saves.ts`, `README.md`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: the public API from Tasks 3–5.
- Produces: `npm run check:pack` (fails on any packed file outside `dist/`, `README.md`, `LICENSE`, `package.json`, or any `.env`/test file); `npm run smoke:auth` and `npm run smoke:saves` (**[GATED]**, run only in Task 20).

- [ ] **Step 1: Write the pack check and make it fail first**

`scripts/check-pack.mjs`:
```js
// Pre-publish guard (runbook 1.6): the tarball holds only the build, the
// licence, the README and the manifest. Never a .env, a token, a test or a tarball.
import { execFileSync } from 'node:child_process'

const [info] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { encoding: 'utf8' }))
const files = info.files.map((f) => f.path)
const allowed = (f) => f === 'package.json' || f === 'README.md' || f === 'LICENSE' || f.startsWith('dist/')
const bad = files.filter((f) => !allowed(f) || /(^|\/)\.env|\.test\.|\.tgz$|stub-fetch/.test(f))
const missing = ['dist/index.js', 'dist/index.d.ts', 'dist/react/index.js', 'dist/ui/index.js', 'dist/testing/index.js', 'README.md', 'LICENSE']
  .filter((f) => !files.includes(f))
if (bad.length || missing.length) {
  if (bad.length) console.error('unexpected files in the package:\n  ' + bad.join('\n  '))
  if (missing.length) console.error('missing from the package:\n  ' + missing.join('\n  '))
  process.exit(1)
}
console.log(`pack ok: ${files.length} files, ${info.unpackedSize} bytes unpacked`)
```

Add to `package.json` `scripts`:
```json
"check:pack": "npm run build && node scripts/check-pack.mjs",
"smoke:auth": "tsx scripts/smoke-auth.ts",
"smoke:saves": "tsx scripts/smoke-saves.ts"
```

Run: `npm run check:pack`
Expected: FAIL with `missing from the package: README.md`.

- [ ] **Step 2: README**

`README.md`:
````md
# @pepperhorn/app-sdk

The PepperHorn client for apps: email one-time-code sign-in, named saves and share links, against `https://apps.pepperhorn.com`. MIT. It holds no secrets; every check runs on the server.

```ts
import { createPepperhornClient } from '@pepperhorn/app-sdk'

const ph = createPepperhornClient({ appSlug: 'my-app' })
await ph.auth.restore()
await ph.auth.requestCode('me@example.com')
await ph.auth.verifyCode('me@example.com', '12345678')
await ph.saves.upsert({ kind: 'preset', externalId: crypto.randomUUID(), name: 'Mine', payload: {} })
```

- `@pepperhorn/app-sdk/react`: `PhProvider`, `useAuth`, `useSaves`, `useShareFromUrl`.
- `@pepperhorn/app-sdk/ui`: headless `useOtpForm` and `OtpDigits` (class hooks `.ph-otp-form`, `.ph-otp-digit`).
- `@pepperhorn/app-sdk/testing`: an in-memory fake of the PepperHorn endpoints for tests.

Peer dependencies: `zod >=3.25 <5` (imported as `zod/v4`), and `react >=19` for the React entries only.
````

- [ ] **Step 3: Gated smoke scripts (written now, run only in Task 20)**

`scripts/smoke-auth.ts`:
```ts
// [GATED: needs gates 0.5 + 0.6 live] Live sign-in smoke against production.
// A human types the mailed code. Run: PH_SMOKE_EMAIL=<test mailbox> npm run smoke:auth
import { createInterface } from 'node:readline/promises'
import { createPepperhornClient, memoryOtpFlow, memoryTokenStore } from '../src/index.js'

const email = process.env.PH_SMOKE_EMAIL
if (!email) throw new Error('Set PH_SMOKE_EMAIL to a mailbox you can read.')
const client = createPepperhornClient({
  appSlug: 'tickle-me-ivories', baseUrl: process.env.PH_BASE_URL ?? 'https://apps.pepperhorn.com',
  tokenStore: memoryTokenStore(), otpFlowStore: memoryOtpFlow(), deviceLabel: 'app-sdk smoke',
})
await client.auth.requestCode(email)
const rl = createInterface({ input: process.stdin, output: process.stdout })
const code = (await rl.question('Code from the email: ')).trim()
rl.close()
const user = await client.auth.verifyCode(email, code)
console.log(`signed in as @${user.handle}`)
const devices = await client.auth.devices()
const current = devices.find((d) => d.current)
if (!current) throw new Error('the device list has no current session')
console.log(`devices: ${devices.length}`)
await client.auth.revokeDevice(current.id)
const after = await client.auth.restore()
if (after.status !== 'signed-out') throw new Error(`expected signed-out after revoking this device, got ${after.status}`)
console.log('smoke-auth PASS')
```

`scripts/smoke-saves.ts`:
```ts
// [GATED: needs gates 0.5 + 0.6 live] Saves and shares smoke against production
// (runbook 1.4): upsert, 409 on a stale ifUpdatedAt, owned share -> private -> null,
// anonymous share -> revoke with key -> null. Cleans up its own save.
import { createInterface } from 'node:readline/promises'
import { createPepperhornClient, memoryOtpFlow, memoryTokenStore } from '../src/index.js'

const email = process.env.PH_SMOKE_EMAIL
if (!email) throw new Error('Set PH_SMOKE_EMAIL to a mailbox you can read.')
const base = { appSlug: 'tickle-me-ivories', baseUrl: process.env.PH_BASE_URL ?? 'https://apps.pepperhorn.com' }
const owner = createPepperhornClient({ ...base, tokenStore: memoryTokenStore(), otpFlowStore: memoryOtpFlow(), deviceLabel: 'app-sdk smoke' })
const guest = createPepperhornClient({ ...base, tokenStore: memoryTokenStore(), otpFlowStore: memoryOtpFlow() })
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m) }

await owner.auth.requestCode(email)
const rl = createInterface({ input: process.stdin, output: process.stdout })
await owner.auth.verifyCode(email, (await rl.question('Code from the email: ')).trim())
rl.close()

const look = { v: 1, kind: 'look', theme: { name: 'classic', stageBgOverride: null }, display: { mode: 'roll', fallSeconds: 3, settings: { zoom: 'full', showGrid: true, showFlash: true, flashScale: 1, showMiddleC: true } }, text: { labels: 'off', labelPlacement: 'above', chord: 'off', chordPlacement: 'stage-centre', chordAlternates: false, chordWindowMs: 250, keyOverride: null, style: { family: 'Poppins', weight: 600, sizeRatio: 0.5, letterSpacing: 0, color: '#ffffff', opacity: 1, strokeWidth: 3, strokeColor: 'rgba(0,0,0,0.35)' } }, velocity: { kind: 'lightness', lMax: 70, lMin: 35, sat: 80 } }
const id = `smoke-${Date.now()}`
const saved = await owner.saves.upsert({ kind: 'look', externalId: id, name: 'SDK smoke', payload: look })
try {
  await owner.saves.upsert({ kind: 'look', externalId: id, name: 'SDK smoke', payload: look, ifUpdatedAt: '2000-01-01T00:00:00.000Z' })
  throw new Error('a stale ifUpdatedAt was accepted')
} catch (e) { assert((e as { code?: string }).code === 'conflict', `expected conflict, got ${String(e)}`) }
assert((await owner.saves.get('look', id))?.updatedAt === saved.updatedAt, 'get did not return the save')

const owned = await owner.shares.createFromSave({ kind: 'look', externalId: id, visibility: 'link_view' })
assert(/^[A-Za-z0-9]{10}$/.test(owned.code), `odd share code ${owned.code}`)
console.log(`owned share ${owned.url} short ${owned.shortUrl ?? '(none yet)'}`)
assert(await guest.shares.resolve(owned.code), 'guest could not resolve the owned share')
await owner.saves.setVisibility('look', id, 'private')
assert((await guest.shares.resolve(owned.code)) === null, 'a private save still resolved')

const anon = await guest.shares.createAnonymous({ kind: 'look', payload: look })
await guest.shares.revoke(anon.code, anon.revokeKey)
assert((await guest.shares.resolve(anon.code)) === null, 'a revoked anonymous share still resolved')

await owner.saves.remove('look', id)
await owner.auth.signOut()
console.log('smoke-saves PASS')
```

- [ ] **Step 4: Verify (no network)**

Run: `npm run typecheck && npm test && npm run check:pack && rm -f /tmp/app-sdk-pack/*.tgz && npm pack --pack-destination /tmp/app-sdk-pack`
Expected: PASS; `pack ok: … files`. Do **not** run the smoke scripts.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: pack guard, README, and gated production smoke scripts" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part C: `@pepperhorn/tickle-ph-plugin` (`/home/shaun/tickle-ph-plugin`)

Prerequisites: Task 1 (re-packed `/tmp/ivories-pack/ivories-0.1.0.tgz`) and Task 6 (`/tmp/app-sdk-pack/pepperhorn-app-sdk-0.1.0.tgz`). Whenever either tarball is re-packed, refresh it here with `npm install -D <tarball path>` (the lockfile pins the tarball's integrity, so a plain `npm ci` would fail).

### Task 10 `[plugin]` Scaffold and `./schema` (SceneV2-first, gateway-ready)

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsup.config.ts`, `vitest.config.ts`, `.gitignore`, `src/globals.d.ts`, `src/schema.ts`, `src/index.ts` (placeholder), `test/fixtures.ts`
- Test: `test/schema.test.ts`, `test/schema.types.test.ts`

**Interfaces:**
- Consumes: from `ivories/core` (devDependency tarball): types `SceneV1`, `SceneV2`, `LookV1`, `Layout`, `SongRefWithTitle`, `TickleHost`; runtime (tests only) `buildProfile`, `DEFAULT_SETTINGS`, `sceneFromState`, `sceneForShare`, `lookFromSettings`, `decodeScene`, `decodeLook`. From the SDK tarball: `createPepperhornClient`, `memoryTokenStore`, `memoryOtpFlow`, `PhClient`, and `createFakeGateway` (`/testing`).
- Produces (`@pepperhorn/tickle-ph-plugin/schema`, file `dist/schema.js`):
  ```ts
  CAPS = { sceneBytes: 262144, lookBytes: 16384, voices: 64, minStops: 2, maxStops: 16, nameChars: 128, colorChars: 64, midiBytes: 131072 }
  FONT_FAMILY_RE; SongRefSchema; SongRefWithTitleSchema; LayoutSchema; AspectSchema; ProfileSchema
  SceneV1Schema; SceneV2Schema; SceneSchema /* v: 1 | 2 */; LookV1Schema
  type ValidateResult = { ok: true } | { ok: false; code: 'invalid' | 'upload_requires_sign_in'; detail: string }
  validateScene(payload: unknown, ctx: { signedIn: boolean }): ValidateResult
  validateLook(payload: unknown, ctx: { signedIn: boolean }): ValidateResult
  TICKLE_KINDS = { scene: { maxBytes, validate: validateScene, anonymousShare: true }, look: { maxBytes, validate: validateLook, anonymousShare: true } }
  ```
  `TICKLE_KINDS` has the exact shape of the gateway's `KindConfig` (`endpoints/ph/src/apps.ts`), so G4 can drop it in.
- Test fixtures (`test/fixtures.ts`): `SHA`, `APP`, `CODE_OK = '12345678'`, `webcamSplit: Layout` (camera `deviceId: 'cam-1'`), `makeScene(layout?)`, `makeLook()`, `host: TickleHost` (real ivories codecs, origin `https://ivories.test`), `setup(): { gw, client(): PhClient }`, `signIn(c, email?)`.

Rulings recorded here:
- **Gradient stops over 16 are refused by the server** (spec §8.5). The client's "keep the first 16" decode ruling still holds for payloads that reach it some other way; the editor never makes more than 16.
- **Structural, not exhaustive.** `z.object` strips unknown keys while parsing and never refuses them, and the gateway stores the original payload, so a newer client's additive field is not refused. Fields the spec caps (names, voices, stops, colours, font family, layout, aspect, song refs, `v`) are checked exactly; the rest of the profile is left to tickle's decoders (spec §6.4).
- **Type direction.** The type test proves every payload tickle can produce is accepted (`SceneV2 extends z.input<typeof SceneSchema>`). The spec's reverse direction (`z.infer` assignable to `SceneV2`) is not possible for a structural schema and is dropped.

- [ ] **Step 1: Branch, manifest, install**

```bash
cd /home/shaun/tickle-ph-plugin && git checkout -b feat/plugin-0.1
```

`package.json`:
```json
{
  "name": "@pepperhorn/tickle-ph-plugin",
  "version": "0.1.0",
  "description": "PepperHorn sign-in, cloud saves and share links for Tickle Me Ivories, as a runtime plugin.",
  "license": "MIT",
  "type": "module",
  "repository": { "type": "git", "url": "git+https://github.com/pepperhorn/tickle-ph-plugin.git" },
  "sideEffects": false,
  "exports": {
    ".": { "types": "./dist/types/index.d.ts", "import": "./dist/tickle-ph-plugin.js" },
    "./schema": { "types": "./dist/types/schema.d.ts", "import": "./dist/schema.js" },
    "./package.json": "./package.json"
  },
  "files": ["dist", "LICENSE"],
  "scripts": {
    "build": "rm -rf dist && tsup && tsc -p tsconfig.build.json && node scripts/check-bundle.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "mock-gateway": "tsx scripts/mock-gateway.ts"
  }
}
```

Run:
```bash
npm install -D /tmp/ivories-pack/ivories-0.1.0.tgz /tmp/app-sdk-pack/pepperhorn-app-sdk-0.1.0.tgz \
  zod@^4.6.7 typescript@~6.0.2 vitest@^5.0.0 tsup@^8.5.1 tsx@^4 jsdom@^29.1.1 @types/node@^24.13.3
```
Expected: `devDependencies` gains `"ivories": "file:…/ivories-0.1.0.tgz"` and `"@pepperhorn/app-sdk": "file:…/pepperhorn-app-sdk-0.1.0.tgz"`; npm also installs `ivories`'s `react`/`react-dom` peers. There are **no runtime dependencies**: both bundles inline everything (G3 switches the two `file:` entries to registry ranges).

- [ ] **Step 2: Config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test", "scripts", "vitest.config.ts", "tsup.config.ts"]
}
```

`tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "declaration": true, "emitDeclarationOnly": true, "rootDir": "src", "outDir": "dist/types" },
  "include": ["src"]
}
```

`tsup.config.ts`:
```ts
import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsup'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }
// The gateway the bundle talks to. Production by default; Task 19's local e2e
// builds with PH_BASE_URL=http://localhost:8787 (and must be rebuilt before release).
const base = process.env.PH_BASE_URL ?? 'https://apps.pepperhorn.com'
if (!/^https:\/\/[a-z0-9.-]+$/.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
  throw new Error(`PH_BASE_URL must be https://<host> or http://localhost[:port], got ${base}`)
}

export default defineConfig({
  entry: { 'tickle-ph-plugin': 'src/index.ts', schema: 'src/schema.ts' },
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  // One self-contained file each: the studio loads the plugin with a bare
  // dynamic import, and the gateway vendors schema.js. Nothing stays external.
  noExternal: [/.*/],
  splitting: false,
  minify: true,
  sourcemap: true,
  dts: false,
  define: {
    __PH_BASE_URL__: JSON.stringify(base),
    __PLUGIN_VERSION__: JSON.stringify(pkg.version),
  },
})
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __PH_BASE_URL__: JSON.stringify('https://apps.test'), __PLUGIN_VERSION__: JSON.stringify('0.1.0-test') },
  // jsdom: ivories/core's audio modules expect a browser-ish global scope at import.
  test: { environment: 'jsdom', include: ['test/**/*.test.ts'] },
})
```

`src/globals.d.ts`:
```ts
declare const __PH_BASE_URL__: string
declare const __PLUGIN_VERSION__: string
```

`.gitignore`:
```
node_modules/
dist/
*.tgz
.env
.env.*
```

`src/index.ts` (placeholder until Task 14):
```ts
export {}
```

- [ ] **Step 3: Shared test fixtures**

`test/fixtures.ts`:
```ts
import { buildProfile, DEFAULT_SETTINGS, decodeLook, decodeScene, lookFromSettings, sceneForShare, sceneFromState } from 'ivories/core'
import type { Layout, LookV1, SceneV2, TickleHost } from 'ivories/core'
import { createPepperhornClient, memoryOtpFlow, memoryTokenStore } from '@pepperhorn/app-sdk'
import type { PhClient } from '@pepperhorn/app-sdk'
import { createFakeGateway } from '@pepperhorn/app-sdk/testing'
import { TICKLE_KINDS } from '../src/schema'

export const SHA = 'a'.repeat(64)
export const APP = 'tickle-me-ivories'
export const CODE_OK = '12345678'

export const webcamSplit: Layout = {
  kind: 'split', ratio: 0.6,
  top: { kind: 'ivories', view: 'falling' },
  bottom: { kind: 'camera', mode: 'webcam', deviceId: 'cam-1', mirror: true, fit: 'cover' },
}

/** A real scene, made the way the studio makes one. */
export function makeScene(layout?: Layout): SceneV2 {
  const profile = buildProfile({
    song: { id: SHA, name: 'song.mid', format: 'midi' }, voices: [],
    tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 3, settings: DEFAULT_SETTINGS,
  })
  return sceneFromState({ song: { kind: 'local', sha256: SHA, name: 'song.mid', format: 'midi', title: 'Song' }, profile, ...(layout ? { layout } : {}) })
}

export const makeLook = (): LookV1 => lookFromSettings(DEFAULT_SETTINGS, 'roll', 3)

/** The host the studio hands a plugin (apps/studio/src/platform/boot.ts), with the real codecs. */
export const host: TickleHost = { appVersion: '0.0.0-test', origin: 'https://ivories.test', decodeScene, decodeLook, sceneForShare }

export function setup() {
  const gw = createFakeGateway({ appSlug: APP, shareOrigin: 'https://ivories.pepperhorn.com', fixedCode: CODE_OK, kinds: TICKLE_KINDS })
  const client = (): PhClient => createPepperhornClient({
    appSlug: APP, baseUrl: 'https://apps.test', fetch: gw.fetch, tokenStore: memoryTokenStore(), otpFlowStore: memoryOtpFlow(),
  })
  return { gw, client }
}

export async function signIn(c: PhClient, email = 'ana@example.test'): Promise<void> {
  await c.auth.requestCode(email)
  await c.auth.verifyCode(email, CODE_OK)
}
```

- [ ] **Step 4: Write the failing schema tests**

`test/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { decodeScene, sceneForShare } from 'ivories/core'
import type { Layout } from 'ivories/core'
import { CAPS, validateLook, validateScene } from '../src/schema'
import { makeLook, makeScene, webcamSplit } from './fixtures'

const signedIn = { signedIn: true }
const anon = { signedIn: false }
const clone = <T>(v: T): T => structuredClone(v)

describe('validateScene accepts what tickle makes', () => {
  const pip: Layout = {
    kind: 'pip', corner: 'br', size: 0.3, margin: 0.02,
    main: { kind: 'ivories', view: 'rising', orientation: 'horizontal' },
    inset: { kind: 'camera', mode: 'mask', fill: '#00b140' },
  }
  it.each([['single', undefined], ['split with webcam', webcamSplit], ['pip with mask', pip]] as const)('%s', (_n, layout) => {
    const s = makeScene(layout)
    expect(decodeScene(s)).toBeTruthy()
    expect(validateScene(s, anon)).toEqual({ ok: true })
    expect(validateScene(sceneForShare(s), anon)).toEqual({ ok: true })
  })

  it('a v1 scene (no layout)', () => {
    const { layout: _l, aspect: _a, ...rest } = makeScene()
    expect(validateScene({ ...rest, v: 1 }, anon)).toEqual({ ok: true })
  })

  it('an opensongs ref pinned to a tag or a SHA', () => {
    const s = clone(makeScene())
    s.song = { kind: 'opensongs', id: 'fur-elise', ref: 'v1.0.0', title: 'Für Elise' }
    expect(validateScene(s, anon)).toEqual({ ok: true })
    s.song = { kind: 'opensongs', id: 'fur-elise', ref: '3a0a6ff8c5d6beff3a59a2058c094aa43811946b', title: 'Für Elise' }
    expect(validateScene(s, anon)).toEqual({ ok: true })
  })
})

describe('validateScene refuses', () => {
  const bad = (mutate: (s: Record<string, any>) => void) => {
    const s = clone(makeScene()) as unknown as Record<string, any>
    mutate(s)
    return validateScene(s, signedIn)
  }
  it('a newer version, with a detail the SDK maps to its own message', () => {
    expect(bad((s) => { s.v = 3 })).toEqual({ ok: false, code: 'invalid', detail: 'newer_version' })
  })
  it('a look sent as a scene', () => { expect(bad((s) => { s.kind = 'look' }).ok).toBe(false) })
  it('more than 64 voices', () => {
    expect(bad((s) => { s.profile.voices = Array.from({ length: CAPS.voices + 1 }, (_, i) => ({ id: `v${i}` })) }))
      .toMatchObject({ ok: false, code: 'invalid', detail: 'profile_voices' })
  })
  it('a 129-character song title or voice label', () => {
    expect(bad((s) => { s.song.title = 'x'.repeat(129) }).ok).toBe(false)
    expect(bad((s) => { s.profile.voices = [{ id: 'v', label: 'x'.repeat(129) }] }).ok).toBe(false)
  })
  it('a font family that could break out of a CSS declaration', () => {
    expect(bad((s) => { s.profile.text.style.family = 'Poppins", serif; x' }).ok).toBe(false)
  })
  it('17 or 1 gradient stops', () => {
    const stops = (n: number) => Array.from({ length: n }, (_, i) => ({ at: i / Math.max(1, n - 1), color: '#ffffff' }))
    expect(bad((s) => { s.profile.global.velocity = { kind: 'gradient', stops: stops(17) } }).ok).toBe(false)
    expect(bad((s) => { s.profile.global.velocity = { kind: 'gradient', stops: stops(1) } }).ok).toBe(false)
    expect(bad((s) => { s.profile.global.velocity = { kind: 'gradient', stops: stops(16) } }).ok).toBe(true)
  })
  it('a colour over 64 characters, an unknown layout or aspect, a branch ref', () => {
    expect(bad((s) => { s.layout = { kind: 'single', main: { kind: 'camera', mode: 'mask', fill: 'x'.repeat(65) } } }).ok).toBe(false)
    expect(bad((s) => { s.layout = { kind: 'grid' } }).ok).toBe(false)
    expect(bad((s) => { s.aspect = '4:3' }).ok).toBe(false)
    expect(bad((s) => { s.song = { kind: 'opensongs', id: 'fur-elise', ref: 'main', title: 't' } }).ok).toBe(false)
  })
  it('anything that is not an object', () => {
    expect(validateScene(null, signedIn).ok).toBe(false)
    expect(validateScene('scene', signedIn).ok).toBe(false)
  })
})

describe('uploaded MIDI (spec §8.4)', () => {
  const midiScene = (dataB64: string) => {
    const s = clone(makeScene()) as unknown as Record<string, any>
    s.song = { kind: 'midi', sha256: 'b'.repeat(64), name: 'song.mid', dataB64, title: 'Song' }
    return s
  }
  it('is refused anonymously and accepted signed in', () => {
    expect(validateScene(midiScene('TVRoZA=='), anon)).toEqual({ ok: false, code: 'upload_requires_sign_in', detail: 'midi_upload' })
    expect(validateScene(midiScene('TVRoZA=='), signedIn)).toEqual({ ok: true })
  })
  it('is refused over 128 KiB of decoded bytes', () => {
    const tooBig = 'A'.repeat(Math.ceil((CAPS.midiBytes + 3) / 3) * 4)
    expect(validateScene(midiScene(tooBig), signedIn).ok).toBe(false)
  })
})

describe('validateLook', () => {
  it('accepts a look tickle makes and refuses a newer or broken one', () => {
    expect(validateLook(makeLook(), anon)).toEqual({ ok: true })
    expect(validateLook({ ...makeLook(), v: 2 }, anon)).toEqual({ ok: false, code: 'invalid', detail: 'newer_version' })
    expect(validateLook({ ...makeLook(), theme: null }, anon).ok).toBe(false)
  })
})
```

`test/schema.types.test.ts`:
```ts
import { describe, it, expectTypeOf } from 'vitest'
import type { z } from 'zod/v4'
import type { Layout, LookV1, SceneV1, SceneV2, SongRefWithTitle } from 'ivories/core'
import type { LayoutSchema, LookV1Schema, SceneSchema, SongRefWithTitleSchema } from '../src/schema'

// Checked by `npm run typecheck`: every payload tickle can produce is accepted
// by the schema's input type. (expectTypeOf is a no-op at runtime.)
describe('schema input types cover tickle payloads', () => {
  it('compiles', () => {
    expectTypeOf<SceneV2>().toExtend<z.input<typeof SceneSchema>>()
    expectTypeOf<SceneV1>().toExtend<z.input<typeof SceneSchema>>()
    expectTypeOf<LookV1>().toExtend<z.input<typeof LookV1Schema>>()
    expectTypeOf<Layout>().toExtend<z.input<typeof LayoutSchema>>()
    expectTypeOf<SongRefWithTitle>().toExtend<z.input<typeof SongRefWithTitleSchema>>()
  })
})
```

Run: `npx vitest run test/schema.test.ts`
Expected: FAIL (`../src/schema` not found).

- [ ] **Step 5: Implement `src/schema.ts`**

```ts
// Structural schemas and caps for tickle payloads (spec §8.5, §6.4). The
// PepperHorn gateway vendors this module (dist/schema.js) to refuse malformed
// or oversized saves and shares. Structural only: tickle's own decoders
// (ivories/core decodeScene/decodeLook) stay the authority for rendering.
// z.object strips unknown keys while parsing and never refuses them; the
// gateway stores the original payload, so additive fields pass through.
import { z } from 'zod/v4'

export const CAPS = Object.freeze({
  sceneBytes: 256 * 1024,
  lookBytes: 16 * 1024,
  voices: 64,
  minStops: 2,
  maxStops: 16,
  nameChars: 128,
  colorChars: 64,
  midiBytes: 128 * 1024,
})

export const FONT_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$/
const SHA256_RE = /^[0-9a-f]{64}$/
const OPENSONGS_ID_RE = /^[a-z0-9-]{1,80}$/
const OPENSONGS_REF_RE = /^(v\d+\.\d+\.\d+|[0-9a-f]{40})$/
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/
const MAX_MIDI_B64_CHARS = Math.ceil(CAPS.midiBytes / 3) * 4 + 4

const Name = z.string().max(CAPS.nameChars)
const Color = z.string().max(CAPS.colorChars)

export const SongRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('opensongs'), id: z.string().regex(OPENSONGS_ID_RE), ref: z.string().regex(OPENSONGS_REF_RE) }),
  z.object({ kind: z.literal('local'), sha256: z.string().regex(SHA256_RE), name: Name, format: z.enum(['midi', 'musicxml']) }),
  z.object({ kind: z.literal('midi'), sha256: z.string().regex(SHA256_RE), name: Name, dataB64: z.string().max(MAX_MIDI_B64_CHARS).regex(BASE64_RE) }),
  z.object({ kind: z.literal('ph-asset'), assetId: z.string().min(1).max(128) }),
])
export const SongRefWithTitleSchema = z.intersection(SongRefSchema, z.object({ title: Name }))

const SlotSourceSchema = z.union([
  z.object({
    kind: z.literal('ivories'),
    view: z.enum(['keyboard', 'falling', 'rising', 'notation', 'endless']),
    orientation: z.enum(['vertical', 'horizontal']).optional(),
  }),
  z.object({ kind: z.literal('camera'), mode: z.literal('webcam'), deviceId: z.string().max(256).optional(), mirror: z.boolean(), fit: z.enum(['cover', 'contain']) }),
  z.object({ kind: z.literal('camera'), mode: z.literal('mask'), fill: Color }),
])
const Fraction = z.number().min(0).max(1)
export const LayoutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), main: SlotSourceSchema }),
  z.object({ kind: z.literal('split'), top: SlotSourceSchema, bottom: SlotSourceSchema, ratio: Fraction }),
  z.object({ kind: z.literal('pip'), main: SlotSourceSchema, inset: SlotSourceSchema, corner: z.enum(['tl', 'tr', 'bl', 'br']), size: Fraction, margin: Fraction }),
])
export const AspectSchema = z.enum(['free', '16:9', '9:16'])

const DisplayModeSchema = z.enum(['keyboard', 'roll'])
const VelocitySchema = z.union([
  z.object({ kind: z.literal('lightness') }),
  z.object({ kind: z.literal('gradient'), stops: z.array(z.object({ at: z.number(), color: Color })).min(CAPS.minStops).max(CAPS.maxStops) }),
])
const ThemeSchema = z.object({ name: z.string().max(32), stageBgOverride: Color.nullable() })
const TextSchema = z.object({
  style: z.object({ family: z.string().regex(FONT_FAMILY_RE), color: Color.optional(), strokeColor: Color.optional() }).optional(),
  keyOverride: z.string().max(16).nullable().optional(),
})
const DisplaySettingsSchema = z.object({
  zoom: z.enum(['full', 'fit']), showGrid: z.boolean(), showFlash: z.boolean(), flashScale: z.number(), showMiddleC: z.boolean(),
})

export const ProfileSchema = z.object({
  song: z.object({ id: z.string().max(256), name: Name, format: z.enum(['midi', 'musicxml']) }),
  voices: z.array(z.object({ id: z.string().min(1).max(128), label: Name.optional() })).max(CAPS.voices),
  display: z.object({ mode: DisplayModeSchema, fallSeconds: z.number() }).optional(),
  theme: ThemeSchema.optional(),
  text: TextSchema.optional(),
  global: z.object({ velocity: VelocitySchema.optional() }).optional(),
})

const sceneHead = { kind: z.literal('scene'), song: SongRefWithTitleSchema, profile: ProfileSchema }
export const SceneV1Schema = z.object({ v: z.literal(1), ...sceneHead })
export const SceneV2Schema = z.object({ v: z.literal(2), ...sceneHead, layout: LayoutSchema, aspect: AspectSchema })
export const SceneSchema = z.discriminatedUnion('v', [SceneV1Schema, SceneV2Schema])

export const LookV1Schema = z.object({
  v: z.literal(1),
  kind: z.literal('look'),
  theme: ThemeSchema,
  display: z.object({ mode: DisplayModeSchema, fallSeconds: z.number(), settings: DisplaySettingsSchema }),
  text: TextSchema,
  velocity: VelocitySchema,
})

// ---- gateway validators (the KindConfig.validate contract in ph-apps-extensions apps.ts) ----

export type ValidateResult =
  | { ok: true }
  | { ok: false; code: 'invalid' | 'upload_requires_sign_in'; detail: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const newer = (u: unknown, max: number) => isObj(u) && typeof u.v === 'number' && Number.isInteger(u.v) && u.v > max

/** A short machine token for the first problem (e.g. 'profile_voices'), safe for the SDK's detail filter. */
function detailOf(e: z.ZodError): string {
  const path = (e.issues[0]?.path ?? []).map(String).join('_').toLowerCase().replace(/[^a-z0-9_]+/g, '_')
  const d = path.length > 0 ? path : 'payload'
  return (/^[a-z]/.test(d) ? d : `payload_${d}`).slice(0, 64)
}

function base64Bytes(s: string): number {
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0
  return Math.floor((s.length * 3) / 4) - pad
}

export function validateScene(payload: unknown, ctx: { signedIn: boolean }): ValidateResult {
  if (newer(payload, 2)) return { ok: false, code: 'invalid', detail: 'newer_version' }
  const r = SceneSchema.safeParse(payload)
  if (!r.success) return { ok: false, code: 'invalid', detail: detailOf(r.error) }
  const song = r.data.song
  if (song.kind === 'midi') {
    if (!ctx.signedIn) return { ok: false, code: 'upload_requires_sign_in', detail: 'midi_upload' }
    if (base64Bytes(song.dataB64) > CAPS.midiBytes) return { ok: false, code: 'invalid', detail: 'midi_too_large' }
  }
  return { ok: true }
}

export function validateLook(payload: unknown, _ctx: { signedIn: boolean }): ValidateResult {
  if (newer(payload, 1)) return { ok: false, code: 'invalid', detail: 'newer_version' }
  const r = LookV1Schema.safeParse(payload)
  return r.success ? { ok: true } : { ok: false, code: 'invalid', detail: detailOf(r.error) }
}

/** Drop-in for the gateway registry's tickle `kinds` (spec §6.3 AppConfig). */
export const TICKLE_KINDS = Object.freeze({
  scene: Object.freeze({ maxBytes: CAPS.sceneBytes, validate: validateScene, anonymousShare: true }),
  look: Object.freeze({ maxBytes: CAPS.lookBytes, validate: validateLook, anonymousShare: true }),
})
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS. If `expectTypeOf(...).toExtend` is missing from this vitest version, use `.toMatchTypeOf` (same meaning) and note it in the commit body.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(schema): SceneV2-first structural schemas, caps and gateway validators" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11 `[plugin]` Error mapping and the `AuthProvider`

**Files:**
- Create: `src/errors.ts`, `src/auth.ts`
- Test: `test/auth.test.ts`

**Interfaces:**
- Consumes: `AuthStore`, `AuthSnapshot`, `AuthUser`, `Device`, `isPhError` (SDK); `AuthProvider`, `AuthState`, `PlatformDevice`, `PlatformUser`, `PlatformErrorCode` (ivories/core types, Task 1); `setup`, `signIn`, `CODE_OK` (Task 10 fixtures).
- Produces:
  ```ts
  class PlatformError extends Error { code: PlatformErrorCode; retryAfterSec: number | undefined }   // name 'PlatformError'
  toPlatformError(e: unknown): Error          // PhError -> PlatformError (same code; 'server' -> 'unavailable'); PlatformError/PayloadVersionError pass through
  mapErrors<T>(fn: () => Promise<T>): Promise<T>
  notSignedIn(): PlatformError                // 'unauthorized', "Sign in to use your PepperHorn saves."
  CODE_LENGTH = 8
  toPlatformUser(u: AuthUser): PlatformUser   // displayName = "first last" or null; never email
  createAuthProvider(auth: AuthStore): AuthProvider   // id 'pepperhorn'; implements devices, revokeDevice, signOutEverywhere
  ```

- [ ] **Step 1: Write the failing tests**

`test/auth.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { isPlatformError } from 'ivories/core'
import { PhError } from '@pepperhorn/app-sdk'
import { createAuthProvider, toPlatformUser } from '../src/auth'
import { toPlatformError } from '../src/errors'
import { CODE_OK, setup } from './fixtures'

describe('toPlatformError', () => {
  it('keeps the code and the user-safe message, and folds server into unavailable', () => {
    const e = toPlatformError(new PhError('rate_limited', { retryAfterSec: 9 }))
    expect(isPlatformError(e)).toBe(true)
    expect(e).toMatchObject({ code: 'rate_limited', retryAfterSec: 9 })
    expect(toPlatformError(new PhError('server'))).toMatchObject({ code: 'unavailable' })
  })
  it('passes tickle errors through untouched', () => {
    const v = Object.assign(new Error('newer'), { name: 'PayloadVersionError', code: 'invalid' })
    expect(toPlatformError(v)).toBe(v)
  })
  it('never leaks an unknown error message', () => {
    expect(toPlatformError(new Error('SELECT * FROM app_users')).message).not.toContain('SELECT')
  })
})

describe('toPlatformUser', () => {
  it('builds a display name and never carries the email', () => {
    const u = toPlatformUser({ id: 'u1', email: 'ana@example.test', handle: 'ana', firstName: 'Ana', lastName: 'Lee' })
    expect(u).toEqual({ id: 'u1', handle: 'ana', displayName: 'Ana Lee' })
    expect(toPlatformUser({ id: 'u1', email: 'e', handle: 'h', firstName: null, lastName: ' ' }).displayName).toBeNull()
  })
})

describe('createAuthProvider', () => {
  it('signs in through the SDK and notifies with a stable state object', async () => {
    const { client } = setup()
    const c = client()
    const auth = createAuthProvider(c.auth)
    expect(auth.codeLength).toBe(8)
    expect(auth.getState()).toBe(auth.getState())
    const seen: string[] = []
    auth.subscribe((s) => seen.push(s.status))
    await auth.requestCode('ana@example.test')
    expect(auth.getState()).toEqual({ status: 'signed-out', pendingEmail: 'ana@example.test' })
    const user = await auth.verifyCode('ana@example.test', CODE_OK)
    expect(user.handle).toMatch(/^player-/)
    expect(auth.getState()).toMatchObject({ status: 'signed-in', user: { handle: user.handle } })
    expect(seen).toContain('signed-in')
  })

  it('a wrong code is a PlatformError invalid_code', async () => {
    const { client } = setup()
    const auth = createAuthProvider(client().auth)
    await auth.requestCode('ana@example.test')
    const e = await auth.verifyCode('ana@example.test', '00000000').catch((x: unknown) => x)
    expect(isPlatformError(e)).toBe(true)
    expect(e).toMatchObject({ code: 'invalid_code' })
  })

  it('lists devices and signs this browser out when its own device is revoked', async () => {
    const { client } = setup()
    const a = client()
    const b = client()
    const auth = createAuthProvider(a.auth)
    await auth.requestCode('ana@example.test')
    await auth.verifyCode('ana@example.test', CODE_OK)
    await b.auth.requestCode('ana@example.test')
    await b.auth.verifyCode('ana@example.test', CODE_OK)
    const list = await auth.devices!()
    expect(list).toHaveLength(2)
    expect(Object.keys(list[0]!).sort()).toEqual(['current', 'id', 'label', 'lastAccessAt', 'userAgent'])
    await auth.revokeDevice!(list.find((d) => d.current)!.id)
    expect(auth.getState().status).toBe('signed-out')
  })

  it('signOutEverywhere resolves to nothing and signs out', async () => {
    const { client } = setup()
    const auth = createAuthProvider(client().auth)
    await auth.requestCode('ana@example.test')
    await auth.verifyCode('ana@example.test', CODE_OK)
    await expect(auth.signOutEverywhere!()).resolves.toBeUndefined()
    expect(auth.getState().status).toBe('signed-out')
  })

  it('unsubscribes', async () => {
    const { client } = setup()
    const auth = createAuthProvider(client().auth)
    const l = vi.fn()
    const off = auth.subscribe(l)
    off()
    await auth.requestCode('ana@example.test')
    expect(l).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run test/auth.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 2: Implement `src/errors.ts`**

```ts
import type { PlatformErrorCode } from 'ivories/core'
import { isPhError } from '@pepperhorn/app-sdk'

/**
 * tickle recognises platform errors by shape (ivories/core isPlatformError),
 * never by class identity, because this bundle cannot share tickle's runtime.
 * So the plugin defines its own class with the same name and fields.
 */
export class PlatformError extends Error {
  readonly code: PlatformErrorCode
  readonly retryAfterSec: number | undefined

  constructor(code: PlatformErrorCode, message: string, retryAfterSec?: number) {
    super(message)
    this.name = 'PlatformError'
    this.code = code
    this.retryAfterSec = retryAfterSec
  }
}

const named = (e: unknown, name: string): e is Error => e instanceof Error && e.name === name

export function toPlatformError(e: unknown): Error {
  if (named(e, 'PlatformError') || named(e, 'PayloadVersionError')) return e
  if (isPhError(e)) return new PlatformError(e.code === 'server' ? 'unavailable' : e.code, e.message, e.retryAfterSec)
  return new PlatformError('unavailable', 'Something went wrong talking to PepperHorn. Try again.')
}

export async function mapErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw toPlatformError(e)
  }
}

export const notSignedIn = () => new PlatformError('unauthorized', 'Sign in to use your PepperHorn saves.')
```

- [ ] **Step 3: Implement `src/auth.ts`**

```ts
import type { AuthProvider, AuthState, PlatformDevice, PlatformUser } from 'ivories/core'
import type { AuthSnapshot, AuthStore, AuthUser, Device } from '@pepperhorn/app-sdk'
import { mapErrors } from './errors.js'

/** OTP_AUTH_CODE_DIGITS on ph-apps (spec §6.1). */
export const CODE_LENGTH = 8

export function toPlatformUser(u: AuthUser): PlatformUser {
  const name = [u.firstName, u.lastName].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()).join(' ')
  return { id: u.id, handle: u.handle, displayName: name || null }
}

function toState(s: AuthSnapshot): AuthState {
  if (s.status === 'unknown') return { status: 'unknown' }
  if (s.status === 'signed-in') return { status: 'signed-in', user: toPlatformUser(s.user) }
  return s.pending ? { status: 'signed-out', pendingEmail: s.pending.email } : { status: 'signed-out' }
}

const toDevice = (d: Device): PlatformDevice =>
  ({ id: d.id, label: d.label, userAgent: d.userAgent, lastAccessAt: d.lastAccessAt, current: d.current })

export function createAuthProvider(auth: AuthStore): AuthProvider {
  // getState must return the same object until something changes (the studio
  // reads it through useSyncExternalStore). SDK snapshots are immutable, so
  // the mapping is cached per snapshot reference.
  let lastSnap: AuthSnapshot | null = null
  let lastState: AuthState = { status: 'unknown' }
  const getState = (): AuthState => {
    const s = auth.getSnapshot()
    if (s !== lastSnap) {
      lastSnap = s
      lastState = toState(s)
    }
    return lastState
  }
  return {
    id: 'pepperhorn',
    codeLength: CODE_LENGTH,
    getState,
    subscribe: (listener) => auth.subscribe(() => listener(getState())),
    requestCode: (email) => mapErrors(() => auth.requestCode(email)),
    verifyCode: (email, code) => mapErrors(async () => toPlatformUser(await auth.verifyCode(email, code))),
    signOut: () => mapErrors(() => auth.signOut()),
    devices: () => mapErrors(async () => (await auth.devices()).map(toDevice)),
    revokeDevice: (id) => mapErrors(() => auth.revokeDevice(id)),
    signOutEverywhere: () => mapErrors(async () => { await auth.signOutEverywhere() }),
  }
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: AuthProvider over the SDK auth store, with device management and PlatformError mapping" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12 `[plugin]` `StorageProvider` (account saves)

**Files:**
- Create: `src/storage.ts`
- Test: `test/storage.test.ts`

**Interfaces:**
- Consumes: `PhClient` (SDK); `StorageProvider`, `SaveInput`, `SaveKind`, `SaveSummary`, `SceneV2`, `LookV1`, `TickleHost` (ivories/core types); `mapErrors`, `notSignedIn` (Task 11).
- Produces:
  ```ts
  PLUGIN_ID = 'pepperhorn'
  class PepperhornStorage implements StorageProvider { id = 'pepperhorn'; remote = true; constructor(client: PhClient, host: TickleHost) }
  ```
  Behaviour: every method needs a signed-in session (`PlatformError('unauthorized')` without a request otherwise); `id` = the save's `externalId` (minted with `crypto.randomUUID()` when absent); `load` decodes with `host.decodeScene(payload)` (own save: no `shared`, camera ids kept) or `host.decodeLook`; a corrupt payload loads as `null`, a newer one rethrows `PayloadVersionError` (LocalStorageProvider's contract); `list` pages up to 10 × 100.

- [ ] **Step 1: Write the failing tests**

`test/storage.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { decodeScene, isPayloadVersionError, isPlatformError } from 'ivories/core'
import { PepperhornStorage } from '../src/storage'
import { host, makeLook, makeScene, setup, signIn, webcamSplit } from './fixtures'

async function signedIn() {
  const { gw, client } = setup()
  const c = client()
  await signIn(c)
  return { gw, c, storage: new PepperhornStorage(c, host) }
}

describe('PepperhornStorage', () => {
  it('is remote and refuses every call while signed out, without a request', async () => {
    const { client } = setup()
    const storage = new PepperhornStorage(client(), host)
    expect(storage.remote).toBe(true)
    const e = await storage.list('scene').catch((x: unknown) => x)
    expect(isPlatformError(e)).toBe(true)
    expect(e).toMatchObject({ code: 'unauthorized' })
  })

  it('saves, lists and loads a scene, keeping this browser\'s camera ids on its own save', async () => {
    const { storage } = await signedIn()
    const scene = makeScene(webcamSplit)
    const summary = await storage.save({ kind: 'scene', name: 'Mine', payload: scene })
    expect(summary).toMatchObject({ kind: 'scene', name: 'Mine', visibility: 'private', songTitle: 'Song' })
    expect(summary.id).toMatch(/^[0-9a-f-]{36}$/)
    expect((await storage.list('scene')).map((s) => s.id)).toEqual([summary.id])
    const loaded = await storage.load('scene', summary.id)
    expect(loaded).toEqual(decodeScene(scene))
    expect(JSON.stringify(loaded)).toContain('cam-1')
  })

  it('overwrites when an id is given, and removes', async () => {
    const { storage } = await signedIn()
    const a = await storage.save({ kind: 'look', name: 'A', payload: makeLook() })
    await storage.save({ kind: 'look', id: a.id, name: 'B', payload: makeLook() })
    expect((await storage.list('look')).map((s) => s.name)).toEqual(['B'])
    await storage.remove('look', a.id)
    expect(await storage.list('look')).toEqual([])
    expect(await storage.load('look', a.id)).toBeNull()
  })

  it('loads a corrupt save as null and rethrows a newer one', async () => {
    const { gw, storage } = await signedIn()
    gw.seedSave('ana@example.test', { kind: 'scene', externalId: 'bad', name: 'Bad', payload: { v: 2, kind: 'scene', song: 'nope' } })
    gw.seedSave('ana@example.test', { kind: 'scene', externalId: 'newer', name: 'Newer', payload: { ...makeScene(), v: 3 } })
    expect(await storage.load('scene', 'bad')).toBeNull()
    const e = await storage.load('scene', 'newer').catch((x: unknown) => x)
    expect(isPayloadVersionError(e)).toBe(true)
  })

  it('surfaces the gateway refusal of an oversized scene as too_large', async () => {
    const { storage } = await signedIn()
    const big = makeScene() as unknown as Record<string, unknown>
    big.padding = 'x'.repeat(300 * 1024)
    const e = await storage.save({ kind: 'scene', name: 'Big', payload: big as never }).catch((x: unknown) => x)
    expect(e).toMatchObject({ code: 'too_large' })
  })
})
```

Run: `npx vitest run test/storage.test.ts`
Expected: FAIL (`../src/storage` not found).

- [ ] **Step 2: Implement `src/storage.ts`**

```ts
import type { LookV1, SaveInput, SaveKind, SaveSummary, SceneV2, StorageProvider, TickleHost } from 'ivories/core'
import type { PhClient, SaveSummaryRow } from '@pepperhorn/app-sdk'
import { mapErrors, notSignedIn } from './errors.js'

export const PLUGIN_ID = 'pepperhorn'
const MAX_PAGES = 10 // 10 x 100 covers the gateway's 500-save quota

type Summarisable = Pick<SaveSummaryRow, 'externalId' | 'kind' | 'name' | 'updatedAt' | 'visibility'>

export function toSummary(r: Summarisable, songTitle?: string): SaveSummary {
  return {
    id: r.externalId, kind: r.kind as SaveKind, name: r.name, updatedAt: r.updatedAt, visibility: r.visibility,
    ...(songTitle !== undefined ? { songTitle } : {}),
  }
}

/** Named saves in the user's PepperHorn account (spec §2 StorageProvider, §4). */
export class PepperhornStorage implements StorageProvider {
  readonly id = PLUGIN_ID
  readonly remote = true
  readonly #client: PhClient
  readonly #host: TickleHost

  constructor(client: PhClient, host: TickleHost) {
    this.#client = client
    this.#host = host
  }

  #requireSignedIn(): void {
    if (this.#client.auth.getSnapshot().status !== 'signed-in') throw notSignedIn()
  }

  async list(kind: SaveKind): Promise<SaveSummary[]> {
    this.#requireSignedIn()
    return mapErrors(async () => {
      const out: SaveSummary[] = []
      let cursor: string | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await this.#client.saves.list({ kind, limit: 100, ...(cursor ? { cursor } : {}) })
        out.push(...r.items.map((i) => toSummary(i)))
        if (!r.next) break
        cursor = r.next
      }
      return out
    })
  }

  load(kind: 'scene', id: string): Promise<SceneV2 | null>
  load(kind: 'look', id: string): Promise<LookV1 | null>
  async load(kind: SaveKind, id: string): Promise<SceneV2 | LookV1 | null> {
    this.#requireSignedIn()
    const row = await mapErrors(() => this.#client.saves.get(kind, id))
    if (!row) return null
    try {
      // An own save: decoded without `shared`, so this browser's camera ids are kept.
      return kind === 'scene' ? this.#host.decodeScene(row.payload) : this.#host.decodeLook(row.payload)
    } catch (e) {
      if (e instanceof Error && e.name === 'PayloadVersionError') throw e
      return null
    }
  }

  async save(input: SaveInput): Promise<SaveSummary> {
    this.#requireSignedIn()
    const externalId = input.id ?? crypto.randomUUID()
    const row = await mapErrors(() => this.#client.saves.upsert({ kind: input.kind, externalId, name: input.name, payload: input.payload }))
    return toSummary(row, input.kind === 'scene' ? input.payload.song.title : undefined)
  }

  async remove(kind: SaveKind, id: string): Promise<void> {
    this.#requireSignedIn()
    await mapErrors(() => this.#client.saves.remove(kind, id))
  }
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: StorageProvider over account saves, decoding through the host" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13 `[plugin]` `ShareProvider` (owned and anonymous `/s/<code>` links)

**Files:**
- Create: `src/share.ts`
- Test: `test/share.test.ts`

**Interfaces:**
- Consumes: `PhClient`, `ShareCreated`, `parseShareCode` (SDK); `ShareProvider`, `ShareResult`, `ResolvedShare`, `SaveKind`, `SaveSummary`, `SceneV2`, `LookV1`, `TickleHost`, `Visibility` (ivories/core types); `PlatformError`, `mapErrors`, `notSignedIn` (Task 11); `PLUGIN_ID`, `toSummary` (Task 12).
- Produces: `class PepperhornShare implements ShareProvider` with `id 'pepperhorn'`, `supports { anonymous, owned, revoke, fork: true }`, and:
  - `share(i)`: scene payloads go through `host.sceneForShare`. Signed out: `createAnonymous` (returns `revokeKey`). Signed in: a new `link_view` save (name = song title, or "Shared look") then `createFromSave`.
  - `shareSaved(kind, saveId, visibility)`: for a scene, reads the save, and if `sceneForShare` changes it, rewrites the save stripped (with `ifUpdatedAt`) **before** sharing, because an owned share serves the live save.
  - `match(loc)`: `parseShareCode(loc.pathname)`.
  - `resolve(code)`: `null` when missing/private/revoked or an unknown kind; a scene payload is decoded with `host.decodeScene(payload, { shared: true })`, a look with `host.decodeLook`; a decode failure throws the host's `PlatformError`/`PayloadVersionError`.
  - `update(code, payload)`: scene payloads through `host.sceneForShare`.
  - `fork(code, name)`, `revoke(code, revokeKey?)`.
  - `url` is always `${host.origin}/s/${code}` (the host the user is on); `shortUrl` comes from the gateway.

- [ ] **Step 1: Write the failing tests**

`test/share.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { isPayloadVersionError, isPlatformError } from 'ivories/core'
import { PepperhornShare } from '../src/share'
import { host, makeLook, makeScene, setup, signIn, webcamSplit } from './fixtures'

const storedJson = (gw: ReturnType<typeof setup>['gw']) =>
  JSON.stringify([...gw.saves.values()].map((s) => s.payload)) + JSON.stringify([...gw.shares.values()].map((s) => s.payload))

describe('PepperhornShare', () => {
  it('matches /s/<code> only', () => {
    const share = new PepperhornShare(setup().client(), host)
    expect(share.match({ pathname: '/s/AbCdEfGhJk', hash: '' })).toBe('AbCdEfGhJk')
    expect(share.match({ pathname: '/s/short', hash: '' })).toBeNull()
    expect(share.match({ pathname: '/', hash: '#share=abc' })).toBeNull()
  })

  it('signed out: an anonymous share with a revoke key, a host-origin URL and no camera ids', async () => {
    const { gw, client } = setup()
    const share = new PepperhornShare(client(), host)
    const r = await share.share({ kind: 'scene', payload: makeScene(webcamSplit) })
    expect(r.url).toBe(`https://ivories.test/s/${r.code}`)
    expect(r.revokeKey).toBeTruthy()
    expect(storedJson(gw)).not.toContain('cam-1')
  })

  it('signed in: saves as link_view, shares that save, and stores no camera ids', async () => {
    const { gw, client } = setup()
    const c = client()
    await signIn(c)
    const r = await new PepperhornShare(c, host).share({ kind: 'scene', payload: makeScene(webcamSplit) })
    expect(r.revokeKey).toBeUndefined()
    const saves = [...gw.saves.values()]
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({ visibility: 'link_view', name: 'Song' })
    expect(storedJson(gw)).not.toContain('cam-1')
  })

  it('shareSaved strips camera ids from the live save before sharing it (Review Focus 2)', async () => {
    const { gw, client } = setup()
    const c = client()
    await signIn(c)
    const own = await c.saves.upsert({ kind: 'scene', externalId: 'mine', name: 'Mine', payload: makeScene(webcamSplit) })
    const r = await new PepperhornShare(c, host).shareSaved!('scene', 'mine', 'public')
    expect(r.code).toMatch(/^[A-Za-z0-9]{10}$/)
    const live = [...gw.saves.values()].find((s) => s.externalId === 'mine')!
    expect(live.visibility).toBe('public')
    expect(JSON.stringify(live.payload)).not.toContain('cam-1')
    expect(new Date(live.updatedAt).toISOString()).not.toBe(own.updatedAt)
  })

  it('shareSaved leaves a save without camera ids untouched, and reports a missing save', async () => {
    const { gw, client } = setup()
    const c = client()
    await signIn(c)
    const own = await c.saves.upsert({ kind: 'scene', externalId: 'plain', name: 'Plain', payload: makeScene() })
    await new PepperhornShare(c, host).shareSaved!('scene', 'plain', 'link_view')
    expect(new Date([...gw.saves.values()][0]!.updatedAt).toISOString()).toBe(own.updatedAt)
    await expect(new PepperhornShare(c, host).shareSaved!('scene', 'gone', 'link_view')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('resolve decodes someone else\'s scene as shared: camera ids dropped (carried requirement)', async () => {
    const { gw, client } = setup()
    gw.seedSave('bob@example.test', { kind: 'scene', externalId: 'b1', name: 'Bob', payload: makeScene(webcamSplit), visibility: 'link_view' })
    const bob = client()
    await signIn(bob, 'bob@example.test')
    const { code } = await bob.shares.createFromSave({ kind: 'scene', externalId: 'b1', visibility: 'link_view' })
    const r = await new PepperhornShare(client(), host).resolve(code)
    expect(r).toMatchObject({ code, kind: 'scene', owner: { handle: expect.stringMatching(/^player-/) }, isOwner: false })
    expect(JSON.stringify(r!.payload)).not.toContain('cam-1')
  })

  it('resolve: null when missing, the host\'s error when invalid or newer', async () => {
    const { gw, client } = setup()
    const share = new PepperhornShare(client(), host)
    expect(await share.resolve('AbCdEfGhJk')).toBeNull()
    const anon = client()
    // Craft stored payloads directly: the gateway schema would refuse them on the way in.
    const { code: badCode } = await anon.shares.createAnonymous({ kind: 'look', payload: makeLook() })
    gw.shares.get(badCode)!.payload = { v: 1, kind: 'look', theme: 'nope' }
    const bad = await share.resolve(badCode).catch((x: unknown) => x)
    expect(isPlatformError(bad)).toBe(true)
    const { code: newCode } = await anon.shares.createAnonymous({ kind: 'look', payload: makeLook() })
    gw.shares.get(newCode)!.payload = { ...makeScene(), v: 3 }
    gw.shares.get(newCode)!.kind = 'scene'
    expect(isPayloadVersionError(await share.resolve(newCode).catch((x: unknown) => x))).toBe(true)
  })

  it('update strips camera ids; revoke ends the link; fork makes a private copy', async () => {
    const { gw, client } = setup()
    const owner = client()
    await signIn(owner)
    const ownerShare = new PepperhornShare(owner, host)
    const { code } = await ownerShare.share({ kind: 'scene', payload: makeScene() })
    await ownerShare.update!(code, makeScene(webcamSplit))
    expect(storedJson(gw)).not.toContain('cam-1')

    const other = client()
    await signIn(other, 'bob@example.test')
    const copy = await new PepperhornShare(other, host).fork!(code, 'Copy')
    expect(copy).toMatchObject({ name: 'Copy', visibility: 'private', kind: 'scene' })

    await ownerShare.revoke!(code)
    expect(await ownerShare.resolve(code)).toBeNull()
  })
})
```

Run: `npx vitest run test/share.test.ts`
Expected: FAIL (`../src/share` not found).

- [ ] **Step 2: Implement `src/share.ts`**

```ts
import type {
  LookV1, ResolvedShare, SaveKind, SaveSummary, SceneV2, ShareProvider, ShareResult, TickleHost, Visibility,
} from 'ivories/core'
import { parseShareCode } from '@pepperhorn/app-sdk'
import type { PhClient, ShareCreated } from '@pepperhorn/app-sdk'
import { PlatformError, mapErrors, notSignedIn } from './errors.js'
import { PLUGIN_ID, toSummary } from './storage.js'

type Shareable = { kind: 'scene'; payload: SceneV2 } | { kind: 'look'; payload: LookV1 }
const isScene = (p: SceneV2 | LookV1): p is SceneV2 => p.kind === 'scene'

/** Owned and anonymous share links at `/s/<code>` (spec §4 share behaviour, §7). */
export class PepperhornShare implements ShareProvider {
  readonly id = PLUGIN_ID
  readonly supports = { anonymous: true, owned: true, revoke: true, fork: true }
  readonly #client: PhClient
  readonly #host: TickleHost

  constructor(client: PhClient, host: TickleHost) {
    this.#client = client
    this.#host = host
  }

  #signedIn(): boolean {
    return this.#client.auth.getSnapshot().status === 'signed-in'
  }

  /** The link names the host the user is on; phrn.link (shortUrl) redirects to the registered host. */
  #result(c: ShareCreated): ShareResult {
    return { code: c.code, url: `${this.#host.origin}/s/${c.code}`, shortUrl: c.shortUrl, ...(c.revokeKey ? { revokeKey: c.revokeKey } : {}) }
  }

  /** Nothing leaves this browser carrying its camera ids. */
  #outgoing(i: Shareable): Shareable {
    return i.kind === 'scene' ? { kind: 'scene', payload: this.#host.sceneForShare(i.payload) } : i
  }

  async share(input: Shareable): Promise<ShareResult> {
    const out = this.#outgoing(input)
    return mapErrors(async () => {
      if (!this.#signedIn()) {
        return this.#result(await this.#client.shares.createAnonymous({ kind: out.kind, payload: out.payload }))
      }
      // Signed in: save first so the owner can revoke it and later edits reach the link (spec §4).
      const externalId = crypto.randomUUID()
      const name = out.kind === 'scene' ? (out.payload.song.title || 'Shared scene') : 'Shared look'
      await this.#client.saves.upsert({ kind: out.kind, externalId, name, payload: out.payload, visibility: 'link_view' })
      return this.#result(await this.#client.shares.createFromSave({ kind: out.kind, externalId, visibility: 'link_view' }))
    })
  }

  async shareSaved(kind: SaveKind, saveId: string, visibility: Exclude<Visibility, 'private'>): Promise<ShareResult> {
    if (!this.#signedIn()) throw notSignedIn()
    return mapErrors(async () => {
      if (kind === 'scene') {
        const row = await this.#client.saves.get('scene', saveId)
        if (!row) throw new PlatformError('not_found', 'That scene is no longer in your account.')
        const scene = this.#host.decodeScene(row.payload)
        const outgoing = this.#host.sceneForShare(scene)
        if (JSON.stringify(outgoing) !== JSON.stringify(scene)) {
          // An owned share serves the LIVE save, so the save itself must not keep this browser's camera ids.
          await this.#client.saves.upsert({ kind: 'scene', externalId: saveId, name: row.name, payload: outgoing, ifUpdatedAt: row.updatedAt })
        }
      }
      return this.#result(await this.#client.shares.createFromSave({ kind, externalId: saveId, visibility }))
    })
  }

  match(loc: { pathname: string; hash: string }): string | null {
    return parseShareCode(loc.pathname)
  }

  async resolve(code: string): Promise<ResolvedShare | null> {
    const r = await mapErrors(() => this.#client.shares.resolve(code))
    if (!r || (r.kind !== 'scene' && r.kind !== 'look')) return null
    // Someone else's payload: a scene decodes as shared (camera ids dropped). Throws when invalid or newer.
    const payload = r.kind === 'scene' ? this.#host.decodeScene(r.payload, { shared: true }) : this.#host.decodeLook(r.payload)
    return {
      code: r.code, kind: r.kind, payload, owner: r.owner, visibility: r.visibility,
      isOwner: r.isOwner, canEdit: r.canEdit, canFork: r.canFork,
    }
  }

  async update(code: string, payload: SceneV2 | LookV1): Promise<void> {
    const out = isScene(payload) ? this.#host.sceneForShare(payload) : payload
    await mapErrors(() => this.#client.shares.update(code, out))
  }

  async fork(code: string, name: string): Promise<SaveSummary> {
    if (!this.#signedIn()) throw notSignedIn()
    const row = await mapErrors(() => this.#client.shares.fork(code, { externalId: crypto.randomUUID(), name }))
    return toSummary(row)
  }

  async revoke(code: string, revokeKey?: string): Promise<void> {
    await mapErrors(() => this.#client.shares.revoke(code, revokeKey))
  }
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: ShareProvider with sceneForShare on every upload and shared decode on resolve" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14 `[plugin]` `activate`, the single-file bundle, and the mock gateway server

**Files:**
- Replace: `src/index.ts`
- Create: `scripts/check-bundle.mjs`, `scripts/mock-gateway.ts`
- Test: `test/activate.test.ts`, `test/flow.test.ts`

**Interfaces:**
- Consumes: `createPepperhornClient`, `PhClient` (SDK); `ActivatePlugin`, `TickleHost`, `TicklePlugin` (ivories/core types); `createAuthProvider` (Task 11), `PepperhornStorage`, `PLUGIN_ID` (Task 12), `PepperhornShare` (Task 13), `TICKLE_KINDS`, `CAPS` (Task 10); `createFakeGateway` (SDK testing).
- Produces:
  ```ts
  export const APP_SLUG = 'tickle-me-ivories'
  export function createPlugin(host: TickleHost, client: PhClient): TicklePlugin   // { id 'pepperhorn', name 'PepperHorn', version, auth, storage, share }
  export default activate: ActivatePlugin   // creates the client against __PH_BASE_URL__, calls auth.restore() unawaited
  dist/tickle-ph-plugin.js   single ESM file, no bare imports, ≤ 200 KiB
  dist/schema.js             single ESM file
  npm run mock-gateway       http://0.0.0.0:${PORT:-8787}, CORS for any origin, OTP code 12345678, share origin $SHARE_ORIGIN (default http://localhost:5191)
  ```

- [ ] **Step 1: Write the failing tests**

`test/activate.test.ts`:
```ts
import { afterEach, describe, it, expect, vi } from 'vitest'
import activate, { APP_SLUG } from '../src/index'
import { host } from './fixtures'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('activate', () => {
  it('builds the three providers without touching the network when signed out', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const plugin = await activate(host)
    expect(plugin).toMatchObject({ id: 'pepperhorn', name: 'PepperHorn', version: '0.1.0-test' })
    expect(plugin.auth?.codeLength).toBe(8)
    expect(plugin.auth?.getState().status).toBe('signed-out')
    expect(plugin.storage?.remote).toBe(true)
    expect(plugin.share?.match({ pathname: '/s/AbCdEfGhJk', hash: '' })).toBe('AbCdEfGhJk')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('restores a stored session against the configured gateway', async () => {
    localStorage.setItem(`ph.session.${APP_SLUG}`, JSON.stringify({ token: `${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}.abcdefghijklmnop`, expiresAt: '2099-01-01T00:00:00.000Z' }))
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)
    const plugin = await activate(host)
    expect(plugin.auth?.getState().status).toBe('unknown')
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toBe(`https://apps.test/otp-auth/session?appSlug=${APP_SLUG}`)
  })
})
```

`test/flow.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createPlugin } from '../src/index'
import { CODE_OK, host, makeScene, setup } from './fixtures'

describe('plugin flow against the fake gateway', () => {
  it('sign in, save, share a save, open it signed out elsewhere, stop sharing', async () => {
    const { client } = setup()
    const owner = createPlugin(host, client())
    await owner.auth!.requestCode('ana@example.test')
    await owner.auth!.verifyCode('ana@example.test', CODE_OK)
    const saved = await owner.storage!.save({ kind: 'scene', name: 'Mine', payload: makeScene() })
    const link = await owner.share!.shareSaved!('scene', saved.id, 'link_view')

    const guest = createPlugin(host, client())
    const code = guest.share!.match({ pathname: new URL(link.url).pathname, hash: '' })!
    await expect(guest.share!.resolve(code)).resolves.toMatchObject({ kind: 'scene', isOwner: false })

    await owner.share!.revoke!(link.code)
    await expect(guest.share!.resolve(code)).resolves.toBeNull()
  })
})
```

Run: `npx vitest run test/activate.test.ts test/flow.test.ts`
Expected: FAIL (`default` / `createPlugin` not exported).

- [ ] **Step 2: Implement `src/index.ts`**

```ts
// The plugin entry the studio imports from /plugins/tickle-ph-plugin.js
// (spec §2 loadConfiguredPlugins: a same-origin module whose default export
// is an ActivatePlugin). Built into one self-contained file by tsup.
import { createPepperhornClient } from '@pepperhorn/app-sdk'
import type { PhClient } from '@pepperhorn/app-sdk'
import type { ActivatePlugin, TickleHost, TicklePlugin } from 'ivories/core'
import { createAuthProvider } from './auth.js'
import { PLUGIN_ID, PepperhornStorage } from './storage.js'
import { PepperhornShare } from './share.js'

export const APP_SLUG = 'tickle-me-ivories'

export function createPlugin(host: TickleHost, client: PhClient): TicklePlugin {
  return {
    id: PLUGIN_ID,
    name: 'PepperHorn',
    version: __PLUGIN_VERSION__,
    auth: createAuthProvider(client.auth),
    storage: new PepperhornStorage(client, host),
    share: new PepperhornShare(client, host),
  }
}

const activate: ActivatePlugin = (host) => {
  const client = createPepperhornClient({
    appSlug: APP_SLUG,
    baseUrl: __PH_BASE_URL__,
    appVersion: host.appVersion,
    deviceLabel: 'Tickle Me Ivories (web)',
  })
  // Spec §4: restore without blocking activation; the auth state starts 'unknown'.
  void client.auth.restore().catch(() => undefined)
  return createPlugin(host, client)
}

export default activate
```

- [ ] **Step 3: Bundle guard**

`scripts/check-bundle.mjs`:
```js
// The studio imports dist/tickle-ph-plugin.js with a bare dynamic import from
// its own origin, so the file must be self-contained: no bare specifiers, no
// tickle runtime (types only), within budget, and default-exporting a function.
import { readFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const problems = []
for (const f of ['dist/tickle-ph-plugin.js', 'dist/schema.js']) {
  const src = readFileSync(f, 'utf8')
  if (/\bfrom\s*["'](?![./])[^"']+["']|\bimport\s*\(\s*["'](?![./])|(?:^|[;\n])\s*import\s*["'](?![./])/m.test(src)) {
    problems.push(`${f} imports a bare module (everything must be inlined)`)
  }
  for (const banned of ['smplr', 'zustand', '@tonejs']) if (src.includes(banned)) problems.push(`${f} contains ${banned}: tickle runtime must not be bundled`)
}
const size = statSync('dist/tickle-ph-plugin.js').size
if (size > 200 * 1024) problems.push(`dist/tickle-ph-plugin.js is ${size} bytes (budget 200 KiB)`)
const mod = await import(pathToFileURL('dist/tickle-ph-plugin.js').href)
if (typeof mod.default !== 'function') problems.push('dist/tickle-ph-plugin.js: the default export is not an ActivatePlugin function')
const schema = await import(pathToFileURL('dist/schema.js').href)
if (typeof schema.validateScene !== 'function' || typeof schema.validateLook !== 'function' || !schema.TICKLE_KINDS) {
  problems.push('dist/schema.js lacks validateScene / validateLook / TICKLE_KINDS')
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`bundle ok: ${size} bytes`)
```

- [ ] **Step 4: Mock gateway server (local dev and Task 19 only)**

`scripts/mock-gateway.ts`:
```ts
// A local stand-in for apps.pepperhorn.com, for the studio e2e (tickle Task 19)
// and manual testing. In memory; restart = empty. Never deploy this.
//   PORT=8787 SHARE_ORIGIN=http://localhost:5191 npm run mock-gateway
import { createServer } from 'node:http'
import { createFakeGateway } from '@pepperhorn/app-sdk/testing'
import { TICKLE_KINDS } from '../src/schema'

const PORT = Number(process.env.PORT ?? 8787)
const SHARE_ORIGIN = process.env.SHARE_ORIGIN ?? 'http://localhost:5191'
const CODE = '12345678'
const gw = createFakeGateway({ appSlug: 'tickle-me-ivories', shareOrigin: SHARE_ORIGIN, fixedCode: CODE, kinds: TICKLE_KINDS })

createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end()
    return
  }
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const body = Buffer.concat(chunks).toString('utf8')
  const headers: Record<string, string> = {}
  if (req.headers.authorization) headers.authorization = req.headers.authorization
  if (req.headers['user-agent']) headers['user-agent'] = req.headers['user-agent']
  const r = await gw.fetch(`http://mock${req.url ?? '/'}`, { method: req.method ?? 'GET', headers, ...(body ? { body } : {}) })
  res.writeHead(r.status, { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(await r.text())
}).listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-gateway] http://0.0.0.0:${PORT}  OTP code ${CODE}  share origin ${SHARE_ORIGIN}`)
})
```

- [ ] **Step 5: Verify**

Run:
```bash
npm run typecheck && npm test && npm run build
PORT=8799 npm run mock-gateway & sleep 2
curl -s -X POST localhost:8799/ph/v1/enroll -H 'Content-Type: application/json' -d '{"email":"a@b.test","appSlug":"tickle-me-ivories"}'
kill %1
```
Expected: tests PASS; build prints `bundle ok: <n> bytes` (n ≤ 204800); curl prints `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: activate entry, self-contained bundle with guard, local mock gateway" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part D: tickle studio and hosting (`/home/shaun/tmi-plugin`)

Every task here keeps: imports from `ivories`, `ivories/core`, `ivories/style.css` only; no PepperHorn scope literal; contextual class names on every element; verification with `npm test && npm run check && npm run build && npm run lint` at the repo root.

### Task 15 `[tickle]` Load plugins at boot; `/s/<code>` resolves after a late install; provider errors surface

The runbook found that `loadConfiguredPlugins` is never called. This task calls it (through `startPlatform`) with a real `TickleHost`, and fixes the three things that only show up once a plugin can actually install after first render.

**Files:**
- Create: `apps/studio/src/platform/boot.ts`, `apps/studio/src/platform/boot.test.ts`
- Modify: `apps/studio/src/main.tsx`
- Modify: `apps/studio/src/platform/registry.ts` (add `activeStorage`)
- Modify: `apps/studio/src/ui/useScenes.ts`
- Create: `apps/studio/src/ui/useScenes.plugin.test.ts`

**Interfaces:**
- Consumes: `loadConfiguredPlugins`, `getPlatform`, `getDefaults`, `subscribePlatform`, `installPlugin`, `Platform` (registry); `decodeScene`, `decodeLook`, `sceneForShare`, `isPlatformError`, `isPayloadVersionError`, `TickleHost` (ivories/core, Task 1).
- Produces:
  ```ts
  // platform/boot.ts
  export const APP_VERSION: string                       // import.meta.env.VITE_APP_VERSION || '0.0.0-dev'
  export function makeTickleHost(origin?: string): TickleHost
  export function startPlatform(pathname: string, load?: (h: TickleHost) => Promise<void>, host?: TickleHost): Promise<void> | null
  // platform/registry.ts
  export function activeStorage(p?: Platform): StorageProvider   // a remote provider only while its auth is signed in
  // ui/useScenes.ts
  export function clearShareLocation(): void             // replaces clearShareHash: drops #share=… and turns /s/<code> into /
  ```

- [ ] **Step 1: Write the failing tests**

`apps/studio/src/platform/boot.test.ts`:
```ts
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
```

`apps/studio/src/ui/useScenes.plugin.test.ts`:
```ts
// What changes once a plugin can install AFTER the first render (Task 15):
// a /s/<code> link must still resolve, provider errors must reach the user,
// and saves go to the browser until the user signs in (Review Focus 1, 5).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { buildProfile, DEFAULT_SETTINGS, PlatformError, sceneFromState } from 'ivories/core'
import type { AuthProvider, AuthState, Layout, ShareProvider, StorageProvider } from 'ivories/core'
import type { ScenesHost } from './useScenes'

const SHA = 'a'.repeat(64)
const CODE = 'AbCdEfGhJk'
const cam: Layout = {
  kind: 'split', ratio: 0.6,
  top: { kind: 'ivories', view: 'falling' },
  bottom: { kind: 'camera', mode: 'webcam', deviceId: 'cam-1', mirror: true, fit: 'cover' },
}
const sceneWithCam = () => sceneFromState({
  song: { kind: 'local', sha256: SHA, name: 'song.mid', format: 'midi', title: 'Song' },
  profile: buildProfile({ song: { id: SHA, name: 'song.mid', format: 'midi' }, voices: [], tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 3, settings: DEFAULT_SETTINGS }),
  layout: cam,
})

/** Fresh registry + hook per test: the registry holds module-level state. */
async function fresh() {
  vi.resetModules()
  const registry = await import('../platform/registry')
  const { useScenes } = await import('./useScenes')
  return { registry, useScenes }
}

function host(over: Partial<ScenesHost> = {}): ScenesHost {
  return {
    scoreId: () => SHA,
    applyScene: vi.fn(),
    applyLook: vi.fn(),
    replaceSong: vi.fn(async (_f: File, onLoaded: () => void) => { onLoaded(); return true }),
    currentAudio: () => DEFAULT_SETTINGS.audio,
    ...over,
  }
}

/** A remote ShareProvider that hands back a payload still carrying camera ids, as a careless provider might. */
function remoteShare(over: Partial<ShareProvider> = {}): ShareProvider {
  return {
    id: 'remote',
    supports: { anonymous: true, owned: true, revoke: true, fork: true },
    share: vi.fn(),
    match: (loc) => /^\/s\/([A-Za-z0-9]{10})\/?$/.exec(loc.pathname)?.[1] ?? null,
    resolve: vi.fn(async (code: string) => ({
      code, kind: 'scene' as const, payload: sceneWithCam(), owner: { handle: 'ana' }, visibility: 'link_view' as const,
      isOwner: false, canEdit: false, canFork: true,
    })),
    ...over,
  }
}

function fakeAuth(status: 'signed-in' | 'signed-out'): AuthProvider {
  const state: AuthState = status === 'signed-in' ? { status, user: { id: 'u', handle: 'ana', displayName: null } } : { status }
  return {
    id: 'fake', codeLength: 8, getState: () => state, subscribe: () => () => {},
    requestCode: vi.fn(), verifyCode: vi.fn(), signOut: vi.fn(),
  }
}

function remoteStorage(): StorageProvider {
  return {
    id: 'remote', remote: true,
    list: vi.fn(async () => []),
    load: vi.fn(async () => null),
    save: vi.fn(async (i: { kind: 'scene' | 'look'; name: string }) => ({ id: 'r1', kind: i.kind, name: i.name, updatedAt: '2026-10-13T00:00:00.000Z', visibility: 'private' as const })),
    remove: vi.fn(async () => {}),
  } as unknown as StorageProvider
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { history.replaceState(null, '', '/') })

describe('useScenes with a late plugin', () => {
  it('resolves a /s/<code> link once the plugin installs after first render, decoded as shared (Review Focus 1)', async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const h = host()
    const { result } = renderHook(() => useScenes(h))
    await act(async () => {})
    expect(result.current.preview).toBeNull()
    expect(result.current.shareError).toBeNull()

    act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share: remoteShare() }))
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    expect(result.current.preview).toMatchObject({ kind: 'scene', title: 'Song', owner: 'ana' })

    act(() => result.current.applyPreview())
    await waitFor(() => expect(h.applyScene).toHaveBeenCalled())
    const [applied, shared] = (h.applyScene as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(shared).toBe(true)
    expect(JSON.stringify(applied)).not.toContain('cam-1')
    expect(location.pathname).toBe('/')
  })

  it("shows the provider's own error (offline, rate limited)", async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const { result } = renderHook(() => useScenes(host()))
    act(() => registry.installPlugin({
      id: 'p', name: 'P', version: '1',
      share: remoteShare({ resolve: vi.fn(async () => { throw new PlatformError('network', 'Could not reach the server. Check your connection.') }) }),
    }))
    await waitFor(() => expect(result.current.shareError).toBe('Could not reach the server. Check your connection.'))
  })

  it('says a removed share was removed', async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const { result } = renderHook(() => useScenes(host()))
    act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share: remoteShare({ resolve: vi.fn(async () => null) }) }))
    await waitFor(() => expect(result.current.shareError).toBe('This share was removed, or its owner made it private.'))
  })

  it('Dismiss clears /s/<code>, and a later plugin change does not bring the banner back', async () => {
    const { registry, useScenes } = await fresh()
    history.replaceState(null, '', `/s/${CODE}`)
    const share = remoteShare()
    const { result } = renderHook(() => useScenes(host()))
    act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', share }))
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    act(() => result.current.dismissPreview())
    expect(location.pathname).toBe('/')
    act(() => registry.installPlugin({ id: 'q', name: 'Q', version: '1' }))
    await act(async () => {})
    expect(result.current.preview).toBeNull()
    expect(share.resolve).toHaveBeenCalledTimes(1)
  })
})

describe('Save a copy goes where saves live now (Review Focus 5)', () => {
  it('to the browser while signed out, to the account while signed in', async () => {
    for (const status of ['signed-out', 'signed-in'] as const) {
      const { registry, useScenes } = await fresh()
      localStorage.clear()
      history.replaceState(null, '', `/s/${CODE}`)
      const storage = remoteStorage()
      const { result } = renderHook(() => useScenes(host()))
      act(() => registry.installPlugin({ id: 'p', name: 'P', version: '1', auth: fakeAuth(status), storage, share: remoteShare() }))
      await waitFor(() => expect(result.current.preview).not.toBeNull())
      await act(() => result.current.saveCopy())
      const local = await registry.getDefaults().storage.list('scene')
      if (status === 'signed-out') {
        expect(storage.save).not.toHaveBeenCalled()
        expect(local).toHaveLength(1)
      } else {
        expect(storage.save).toHaveBeenCalledTimes(1)
        expect(local).toHaveLength(0)
      }
    }
  })
})
```

Run: `cd /home/shaun/tmi-plugin && npx vitest run --project studio apps/studio/src/platform/boot.test.ts apps/studio/src/ui/useScenes.plugin.test.ts`
Expected: FAIL (`./boot` not found; the late-install test times out with `preview` null).

- [ ] **Step 2: Implement `apps/studio/src/platform/boot.ts`**

```ts
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
```

In `apps/studio/src/main.tsx`, add `import { startPlatform } from './platform/boot'` with the other imports and, after the `createRoot(...).render(...)` call, the line:

```tsx
void startPlatform(window.location.pathname)
```

- [ ] **Step 3: `activeStorage` in `apps/studio/src/platform/registry.ts`**

Add after `getDefaults()`:

```ts
/**
 * Where named saves go right now (runbook §3.3). A remote StorageProvider
 * needs a signed-in session, so until the installed auth says signed-in the
 * browser's own storage is used; a non-remote provider is always used as is.
 */
export function activeStorage(p: Platform = current): StorageProvider {
  if (!p.storage.remote) return p.storage
  return p.auth?.getState().status === 'signed-in' ? p.storage : DEFAULTS.storage
}
```

- [ ] **Step 4: `useScenes.ts` changes**

1. Imports: change the registry import to `import { activeStorage, getDefaults, getPlatform, subscribePlatform } from '../platform/registry'` and add `import { isPlatformError } from 'ivories/core'`.
2. Replace `clearShareHash` with:

```ts
const SHARE_PATH_RE = /^\/s\/[^/]+\/?$/

/** Removes a share link from the address without a navigation (F19a): a
    `#share=…` hash, and a `/s/<code>` path, which becomes `/`. */
export function clearShareLocation(): void {
  const onSharePath = SHARE_PATH_RE.test(location.pathname)
  if (!location.hash && !onSharePath) return
  history.replaceState(history.state, '', (onSharePath ? '/' : location.pathname) + location.search)
}
```

   and rename its three call sites (`applyPreview`, `saveCopy`, `dismissPreview`). If `useScenes.test.ts` or `App.test.tsx` import `clearShareHash`, rename them too (`grep -rn clearShareHash apps/studio/src`).
3. In `resolveShareFromLocation`, replace `try { resolved = await p.resolve(code) } catch { resolved = null }` with:

```ts
    try {
      resolved = await p.resolve(code)
    } catch (e) {
      // A provider's own error (offline, rate limited, a newer version, an
      // invalid payload) is already written for the user: show it as it is.
      if (isPayloadVersionError(e) || (isPlatformError(e) && e.code !== 'not_found')) throw new Error(e.message)
      resolved = null
    }
```

   and the final line with:

```ts
  if (matched) {
    throw new Error(SHARE_PATH_RE.test(loc.pathname)
      ? 'This share was removed, or its owner made it private.'
      : 'This share link could not be opened. It may be incomplete or damaged.')
  }
```
4. Inside `useScenes`, add `const settledRef = useRef(false)` next to the other refs, and replace the mount effect with:

```ts
  // Resolve on mount, and again whenever the platform changes: a plugin
  // installs after the first render, and only then can a /s/<code> link
  // match (Review Focus 1). Once the user has acted on a share (Apply, Save a
  // copy, Dismiss) it is never re-offered.
  useEffect(() => {
    let alive = true
    const run = () => {
      if (settledRef.current) return
      resolveShareFromLocation().then(
        (p) => { if (alive && p && !settledRef.current) { setShareError(null); setPreview(p) } },
        (e: Error) => { if (alive && !settledRef.current) setShareError(e.message) },
      )
    }
    run()
    const unsubscribe = subscribePlatform(run)
    return () => { alive = false; unsubscribe() }
  }, [])
```
5. Set `settledRef.current = true` as the first statement inside `applyPreview` (after the `if (!p) return`), inside `saveCopy` right after a successful save (before `clearShareLocation()`), and as the first statement of `dismissPreview`.
6. In `saveCopy`, replace `const storage = getPlatform().storage` with `const storage = activeStorage()`.

- [ ] **Step 5: Verify**

Run: `cd /home/shaun/tmi-plugin && npm test && npm run check && npm run build && npm run lint`
Expected: PASS, including the existing `useScenes.test.ts`, `App.test.tsx`, `registry.test.ts`, `pepperhornScope.test.ts` and `check:imports`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/platform/boot.ts apps/studio/src/platform/boot.test.ts apps/studio/src/main.tsx \
  apps/studio/src/platform/registry.ts apps/studio/src/ui/useScenes.ts apps/studio/src/ui/useScenes.plugin.test.ts
git add -u apps/studio/src
git commit -m "feat(studio): load configured plugins at boot; resolve /s/ links after a late install; surface provider errors" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16 `[tickle]` Account menu and sign-in dialog

Renders only when the installed platform has an `AuthProvider`, so the open build is unchanged.

**Files:**
- Create: `apps/studio/src/ui/useAuthState.ts`, `apps/studio/src/ui/SignInDialog.tsx`, `apps/studio/src/ui/AccountMenu.tsx`, `apps/studio/src/ui/testing/fakeAuth.ts`
- Test: `apps/studio/src/ui/AccountMenu.test.tsx`
- Modify: `apps/studio/src/App.tsx` (mount the menu)

**Interfaces:**
- Consumes: `AuthProvider`, `AuthState`, `PlatformDevice`, `PlatformError`, `isPlatformError` (ivories/core, Task 1); `platform` from `useSceneActions` (already in `App.tsx`).
- Produces:
  ```ts
  useAuthState(auth: AuthProvider | null): AuthState | null
  SignInDialog(props: { auth: AuthProvider; initialEmail?: string; onClose(): void })   // .sign-in-dialog, .otp-digit × auth.codeLength
  AccountMenu(props: { auth: AuthProvider | null })                                      // .account-menu; null when auth is null
  fakeAuth(o?: { code?: string; handle?: string }): AuthProvider & { requested: string[]; devicesList: PlatformDevice[] }   // tests only
  ```
  Class hooks used by Task 19: `.account-menu-trigger--signed-out`, `.account-menu-trigger--signed-in`, `.sign-in-email-input`, `.btn-send-code`, `.otp-digit`, `.btn-show-devices`, `.account-device`, `.btn-revoke-device`, `.btn-sign-out`.

- [ ] **Step 1: Test double**

`apps/studio/src/ui/testing/fakeAuth.ts`:
```ts
import { PlatformError } from 'ivories/core'
import type { AuthProvider, AuthState, PlatformDevice } from 'ivories/core'

/** An in-memory AuthProvider for UI tests (no backend, no network). */
export function fakeAuth(o: { code?: string; handle?: string } = {}) {
  const code = o.code ?? '12345678'
  let state: AuthState = { status: 'signed-out' }
  const listeners = new Set<(s: AuthState) => void>()
  const set = (s: AuthState) => { state = s; for (const l of listeners) l(s) }
  const requested: string[] = []
  const devicesList: PlatformDevice[] = [
    { id: 'd1', label: 'This laptop', userAgent: 'UA1', lastAccessAt: null, current: true },
    { id: 'd2', label: null, userAgent: 'Phone browser', lastAccessAt: null, current: false },
  ]
  const auth: AuthProvider & { requested: string[]; devicesList: PlatformDevice[] } = {
    id: 'fake', codeLength: code.length, requested, devicesList,
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    async requestCode(email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new PlatformError('invalid', 'Enter a valid email address.')
      requested.push(email.trim())
      set({ status: 'signed-out', pendingEmail: email.trim() })
    },
    async verifyCode(_email, c) {
      if (c !== code) throw new PlatformError('invalid_code', 'That code is not right, or it has expired.')
      const user = { id: 'u1', handle: o.handle ?? 'ana', displayName: null }
      set({ status: 'signed-in', user })
      return user
    },
    async signOut() { set({ status: 'signed-out' }) },
    async devices() { return [...devicesList] },
    async revokeDevice(id) {
      const i = devicesList.findIndex((d) => d.id === id)
      const [gone] = devicesList.splice(i, 1)
      if (gone?.current) set({ status: 'signed-out' })
    },
    async signOutEverywhere() { set({ status: 'signed-out' }) },
  }
  return auth
}
```

- [ ] **Step 2: Write the failing tests**

`apps/studio/src/ui/AccountMenu.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountMenu } from './AccountMenu'
import { fakeAuth } from './testing/fakeAuth'

async function signIn(code = '12345678') {
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
  const first = await screen.findByLabelText('Digit 1 of 8')
  fireEvent.paste(first, { clipboardData: { getData: () => code } })
}

describe('AccountMenu', () => {
  it('renders nothing without an auth provider (the open build)', () => {
    const { container } = render(<AccountMenu auth={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('signs in with a pasted code and shows the handle', async () => {
    const auth = fakeAuth()
    render(<AccountMenu auth={auth} />)
    await signIn()
    await waitFor(() => expect(screen.getByRole('button', { name: '@ana' })).toBeTruthy())
    expect(auth.requested).toEqual(['ana@example.test'])
    expect(document.querySelectorAll('.otp-digit')).toHaveLength(0)
    expect(document.querySelector('.account-menu-trigger--signed-in')).not.toBeNull()
  })

  it('a wrong code shows the provider message and clears the digits', async () => {
    const auth = fakeAuth()
    render(<AccountMenu auth={auth} />)
    await signIn('00000000')
    expect((await screen.findByRole('alert')).textContent).toBe('That code is not right, or it has expired.')
    const digits = [...document.querySelectorAll<HTMLInputElement>('.otp-digit')]
    expect(digits).toHaveLength(8)
    expect(digits.every((d) => d.value === '')).toBe(true)
  })

  it('holds "Resend" for the cooldown', async () => {
    render(<AccountMenu auth={fakeAuth()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ana@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    const resend = await screen.findByRole('button', { name: /Resend in \d+s/ })
    expect((resend as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists devices, signs another one out, and signs this browser out', async () => {
    const auth = fakeAuth()
    render(<AccountMenu auth={auth} />)
    await signIn()
    fireEvent.click(await screen.findByRole('button', { name: '@ana' }))
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }))
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('(this device)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out Phone browser' }))
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })) })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
  })

  it('Escape closes the dialog', () => {
    render(<AccountMenu auth={fakeAuth()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
```

Run: `npx vitest run --project studio apps/studio/src/ui/AccountMenu.test.tsx`
Expected: FAIL (`./AccountMenu` not found).

- [ ] **Step 3: Implement**

`apps/studio/src/ui/useAuthState.ts`:
```ts
import { useCallback, useSyncExternalStore } from 'react'
import type { AuthProvider, AuthState } from 'ivories/core'

/** The provider's auth state, or null without a provider. getState is stable per change (plugin contract). */
export function useAuthState(auth: AuthProvider | null): AuthState | null {
  const subscribe = useCallback((onChange: () => void) => (auth ? auth.subscribe(() => onChange()) : () => {}), [auth])
  const get = useCallback(() => (auth ? auth.getState() : null), [auth])
  return useSyncExternalStore(subscribe, get, get)
}
```

`apps/studio/src/ui/SignInDialog.tsx`:
```tsx
// Email one-time-code sign-in (spec §2 AuthProvider). Backend-neutral: it only
// knows the AuthProvider it is given. The code length comes from the provider.
import { useEffect, useRef, useState } from 'react'
import type { AuthProvider } from 'ivories/core'
import { isPlatformError } from 'ivories/core'

const RESEND_COOLDOWN_SEC = 60
const BTN = 'rounded-full px-4 py-1.5 text-sm font-semibold'

const errorText = (e: unknown, fallback: string) => (isPlatformError(e) ? e.message : fallback)

export function SignInDialog(props: { auth: AuthProvider; initialEmail?: string; onClose(): void }) {
  const { auth, onClose } = props
  const n = auth.codeLength
  const blank = () => Array<string>(n).fill('')
  const [step, setStep] = useState<'email' | 'code'>(props.initialEmail ? 'code' : 'email')
  const [email, setEmail] = useState(props.initialEmail ?? '')
  const [digits, setDigits] = useState<string[]>(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const resendIn = sentAt === null ? 0 : Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_SEC * 1000 - now) / 1000))
  const cooling = resendIn > 0

  useEffect(() => {
    if (!cooling) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cooling])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sendCode = async () => {
    setBusy(true)
    setError(null)
    try {
      await auth.requestCode(email)
      const t = Date.now()
      setSentAt(t)
      setNow(t)
      setDigits(blank())
      setStep('code')
    } catch (e) {
      setError(errorText(e, 'Could not send a code. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (code: string) => {
    setBusy(true)
    setError(null)
    try {
      await auth.verifyCode(email, code)
      onClose()
    } catch (e) {
      setError(errorText(e, 'Could not sign in. Try again.'))
      setDigits(blank())
      queueMicrotask(() => inputs.current[0]?.focus())
    } finally {
      setBusy(false)
    }
  }

  /** Writes digits from `index`; a pasted or autofilled code spreads forward. */
  const fill = (index: number, raw: string) => {
    const clean = raw.replace(/\D/g, '')
    const next = [...digits]
    if (clean.length === 0) next[index] = ''
    for (let i = 0; i < clean.length && index + i < n; i++) next[index + i] = clean[i]!
    setDigits(next)
    inputs.current[Math.min(index + Math.max(clean.length, 1), n - 1)]?.focus()
    if (next.every((d) => d !== '')) void verify(next.join(''))
  }

  return (
    <div
      className="sign-in-backdrop fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-in-title"
        className="sign-in-dialog flex w-96 max-w-[92vw] flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6 text-[var(--ink)] shadow-2xl"
      >
        <h2 id="sign-in-title" className="sign-in-title text-lg font-semibold">Sign in</h2>
        {step === 'email' ? (
          <form className="sign-in-email-form flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void sendCode() }}>
            <p className="sign-in-hint text-xs text-[var(--ink-dim)]">We will email you a sign-in code.</p>
            <label className="sign-in-email-label flex flex-col gap-1 text-xs text-[var(--ink-dim)]">
              Email
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                className="sign-in-email-input rounded border border-[var(--line)] bg-transparent px-2 py-1.5 text-sm text-[var(--ink)]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || !email.trim()} className={`btn-send-code ${BTN} bg-[var(--accent)] text-white disabled:opacity-50`}>
              Send code
            </button>
          </form>
        ) : (
          <div className="sign-in-code-step flex flex-col gap-3">
            <p className="sign-in-code-hint text-xs text-[var(--ink-dim)]">
              Enter the {n}-digit code sent to <span className="sign-in-code-email font-semibold text-[var(--ink)]">{email}</span>.
            </p>
            <div className="otp-digits flex justify-between gap-1" role="group" aria-label="Sign-in code">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputs.current[i] = el }}
                  type="text"
                  aria-label={`Digit ${i + 1} of ${n}`}
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  autoFocus={i === 0}
                  disabled={busy}
                  className="otp-digit h-11 w-9 rounded border border-[var(--line)] bg-transparent text-center text-lg font-semibold text-[var(--ink)]"
                  value={d}
                  onChange={(e) => fill(i, d && e.target.value.length === 2 ? e.target.value.slice(-1) : e.target.value)}
                  onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData('text')) }}
                  onKeyDown={(e) => { if (e.key === 'Backspace' && !d && i > 0) inputs.current[i - 1]?.focus() }}
                />
              ))}
            </div>
            <div className="sign-in-code-actions flex items-center justify-between text-xs">
              <button type="button" className="btn-change-email text-[var(--ink-dim)] underline" onClick={() => { setStep('email'); setError(null) }}>
                Use a different email
              </button>
              <button
                type="button"
                className="btn-resend-code text-[var(--ink-dim)] underline disabled:no-underline disabled:opacity-60"
                disabled={busy || cooling}
                onClick={() => void sendCode()}
              >
                {cooling ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="sign-in-error text-xs text-[#ff6b6b]">{error}</p>}
        <button type="button" className={`btn-close-sign-in ${BTN} self-end border border-[var(--line)] text-[var(--ink-dim)]`} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
```

`apps/studio/src/ui/AccountMenu.tsx`:
```tsx
// The account corner (spec §2 AuthProvider; runbook §3.3). Shown only when an
// installed plugin supplies auth. Device management appears when the
// provider implements it (Task 1's optional AuthProvider members).
import { useState } from 'react'
import type { AuthProvider, PlatformDevice } from 'ivories/core'
import { isPlatformError } from 'ivories/core'
import { useAuthState } from './useAuthState'
import { SignInDialog } from './SignInDialog'

const TRIGGER = 'rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--ink)] shadow'
const ITEM = 'rounded border border-[var(--line)] px-2 py-1 text-left text-[11px] text-[var(--ink-dim)]'
const message = (e: unknown, fallback: string) => (isPlatformError(e) ? e.message : fallback)
const deviceName = (d: PlatformDevice) => d.label ?? d.userAgent?.slice(0, 60) ?? 'Unknown device'

export function AccountMenu(props: { auth: AuthProvider | null }) {
  const { auth } = props
  const state = useAuthState(auth)
  const [dialog, setDialog] = useState(false)
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState<PlatformDevice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!auth || !state) return null

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setError(null)
    try { await fn() } catch (e) { setError(message(e, fallback)) }
  }
  const close = () => { setOpen(false); setDevices(null) }
  // Bound: a class-based provider's optional methods may rely on `this`.
  const listDevices = auth.devices?.bind(auth)
  const revokeDevice = auth.revokeDevice?.bind(auth)
  const signOutEverywhere = auth.signOutEverywhere?.bind(auth)

  return (
    <div className="account-menu absolute right-3 top-3 z-30 flex flex-col items-end gap-2">
      {state.status === 'unknown' && (
        <button type="button" disabled aria-label="Checking your account" className={`account-menu-trigger account-menu-trigger--unknown ${TRIGGER} opacity-60`}>
          …
        </button>
      )}
      {state.status === 'signed-out' && (
        <button type="button" className={`account-menu-trigger account-menu-trigger--signed-out ${TRIGGER}`} onClick={() => setDialog(true)}>
          Sign in
        </button>
      )}
      {state.status === 'signed-in' && (
        <>
          <button
            type="button"
            aria-expanded={open}
            className={`account-menu-trigger account-menu-trigger--signed-in ${TRIGGER}`}
            onClick={() => { setOpen((v) => !v); setError(null) }}
          >
            @{state.user.handle}
          </button>
          {open && (
            <div className="account-menu-panel flex w-72 flex-col gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 text-xs shadow-2xl">
              <p className="account-menu-identity text-[var(--ink-dim)]">
                Signed in as <span className="account-menu-handle font-semibold text-[var(--ink)]">@{state.user.handle}</span>
                {state.user.displayName ? ` (${state.user.displayName})` : ''}
              </p>
              {listDevices && devices === null && (
                <button type="button" className={`btn-show-devices ${ITEM}`} onClick={() => void run(async () => setDevices(await listDevices()), 'Could not list your devices.')}>
                  Devices
                </button>
              )}
              {devices !== null && (
                <ul className="account-devices flex flex-col gap-1">
                  {devices.map((d) => (
                    <li key={d.id} className="account-device flex items-center justify-between gap-2">
                      <span className="account-device-name truncate text-[var(--ink)]" title={d.userAgent ?? ''}>
                        {deviceName(d)}
                        {d.current && <span className="account-device-current ml-1 text-[var(--accent)]">(this device)</span>}
                      </span>
                      {revokeDevice && (
                        <button
                          type="button"
                          aria-label={`Sign out ${deviceName(d)}`}
                          className={`btn-revoke-device ${ITEM}`}
                          onClick={() => void run(async () => {
                            await revokeDevice(d.id)
                            if (d.current) close()
                            else if (listDevices) setDevices(await listDevices())
                          }, 'Could not sign that device out.')}
                        >
                          Sign out
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className={`btn-sign-out ${ITEM}`} onClick={() => void run(async () => { await auth.signOut(); close() }, 'Could not sign out.')}>
                Sign out
              </button>
              {signOutEverywhere && (
                <button type="button" className={`btn-sign-out-everywhere ${ITEM}`} onClick={() => void run(async () => { await signOutEverywhere(); close() }, 'Could not sign out everywhere.')}>
                  Sign out everywhere
                </button>
              )}
              {error && <p role="alert" className="account-error text-[#ff6b6b]">{error}</p>}
            </div>
          )}
        </>
      )}
      {dialog && state.status !== 'signed-in' && (
        <SignInDialog
          auth={auth}
          {...(state.status === 'signed-out' && state.pendingEmail ? { initialEmail: state.pendingEmail } : {})}
          onClose={() => setDialog(false)}
        />
      )}
    </div>
  )
}
```

In `apps/studio/src/App.tsx`: add `import { AccountMenu } from './ui/AccountMenu'` and render `<AccountMenu auth={platform.auth} />` inside the `.stage-wrap` div, immediately after the `</IvoriesProvider>` closing tag. (`platform` already comes from `sceneApi`.)

Note: the "Sign out" device button (`aria-label="Sign out <device>"`) and the panel's "Sign out" button share visible text; tests and Task 19 select them by accessible name or class.

- [ ] **Step 4: Verify**

Run: `cd /home/shaun/tmi-plugin && npm test && npm run check && npm run build && npm run lint`
Expected: PASS. Then `npm run dev` (binds 0.0.0.0) and confirm by eye that the open build shows **no** account corner (no `/tickle.config.json` exists).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/ui/useAuthState.ts apps/studio/src/ui/SignInDialog.tsx apps/studio/src/ui/AccountMenu.tsx \
  apps/studio/src/ui/AccountMenu.test.tsx apps/studio/src/ui/testing/fakeAuth.ts apps/studio/src/App.tsx
git commit -m "feat(studio): account menu with email-code sign-in and device list, shown only with a plugin auth provider" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17 `[tickle]` Account saves and sharing a saved scene

**Files:**
- Modify: `apps/studio/src/studio/ScenesSection.tsx`
- Modify: `apps/studio/src/ui/ScenesPanel.tsx`
- Modify: `apps/studio/src/ui/SharePanel.tsx` (export `copyText`)
- Test: `apps/studio/src/studio/ScenesSection.test.tsx`

**Interfaces:**
- Consumes: `useAuthState` (Task 16); `getDefaults`, `Platform` (registry); `ShareProvider.shareSaved?`, `ShareProvider.revoke?`, `ShareResult`, `SaveSummary` (ivories/core).
- Produces:
  ```ts
  // ScenesPanel gains two optional props
  onShareSaved?: (row: SaveSummary, visibility: 'link_view' | 'public') => Promise<ShareResult>
  onStopSharing?: (code: string) => Promise<void>
  // SharePanel.tsx
  export async function copyText(text: string): Promise<boolean>
  ```
  Behaviour: with a remote storage provider and a signed-in user, the panel lists account saves by default with an "Account | This browser" toggle (`.saves-source-toggle`); otherwise it lists browser saves and shows no toggle. Each account row gets "Share" → visibility (`link_view` "Anyone with the link", `public` "Public (listed)") → "Get link" → `.share-url` showing `shortUrl ?? url` → "Stop sharing" (`revoke(code)`). `link_edit` is deliberately not offered: there is no edit-a-shared-scene UI yet.

- [ ] **Step 1: Write the failing tests**

`apps/studio/src/studio/ScenesSection.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { buildProfile, DEFAULT_SETTINGS, lookFromSettings, sceneFromState } from 'ivories/core'
import type { ShareProvider, StorageProvider } from 'ivories/core'
import { ScenesSection } from './ScenesSection'
import { getDefaults } from '../platform/registry'
import type { Platform } from '../platform/registry'
import type { useScenes } from '../ui/useScenes'
import { fakeAuth } from '../ui/testing/fakeAuth'

const SHA = 'a'.repeat(64)
const scene = () => sceneFromState({
  song: { kind: 'local', sha256: SHA, name: 'song.mid', format: 'midi', title: 'Song' },
  profile: buildProfile({ song: { id: SHA, name: 'song.mid', format: 'midi' }, voices: [], tempo: { mode: 'scale', scale: 1 }, mode: 'roll', fallSeconds: 3, settings: DEFAULT_SETTINGS }),
})
const scenes = { savesVersion: 0, openScene: vi.fn(), applyLook: vi.fn() } as unknown as ReturnType<typeof useScenes>

function remoteStorage(): StorageProvider {
  return {
    id: 'remote', remote: true,
    list: vi.fn(async (kind: string) => (kind === 'scene'
      ? [{ id: 'r1', kind: 'scene', name: 'Cloud scene', updatedAt: '2026-10-13T00:00:00.000Z', visibility: 'private' }]
      : [])),
    load: vi.fn(async () => null), save: vi.fn(), remove: vi.fn(),
  } as unknown as StorageProvider
}

function remoteShare(): ShareProvider {
  return {
    id: 'remote', supports: { anonymous: true, owned: true, revoke: true, fork: true },
    share: vi.fn(), match: () => null, resolve: vi.fn(async () => null),
    shareSaved: vi.fn(async () => ({ code: 'AbCdEfGhJk', url: 'https://ivories.test/s/AbCdEfGhJk', shortUrl: 'https://phrn.link/Xy12345' })),
    revoke: vi.fn(async () => {}),
  }
}

function renderSection(platform: Platform) {
  return render(
    <ScenesSection
      platform={platform} scenes={scenes} canSave defaultName="Song"
      buildScene={scene} buildShareScene={scene} buildLook={() => lookFromSettings(DEFAULT_SETTINGS, 'roll', 3)}
    />,
  )
}

beforeEach(async () => {
  localStorage.clear()
  await getDefaults().storage.save({ kind: 'scene', name: 'Local scene', payload: scene() })
})
afterEach(() => { vi.clearAllMocks() })

describe('ScenesSection with a remote provider', () => {
  it('signed out: lists the browser saves, no toggle, no Share (Review Focus 5)', async () => {
    const storage = remoteStorage()
    renderSection({ auth: fakeAuth(), storage, share: remoteShare(), content: [] })
    expect(await screen.findByText('Local scene')).toBeTruthy()
    expect(storage.list).not.toHaveBeenCalled()
    expect(document.querySelector('.saves-source-toggle')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Share / })).toBeNull()
  })

  it('signed in: lists account saves, and the toggle switches to this browser', async () => {
    const auth = fakeAuth()
    await auth.requestCode('ana@example.test')
    await auth.verifyCode('ana@example.test', '12345678')
    renderSection({ auth, storage: remoteStorage(), share: remoteShare(), content: [] })
    expect(await screen.findByText('Cloud scene')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'This browser' }))
    expect(await screen.findByText('Local scene')).toBeTruthy()
    expect(screen.queryByText('Cloud scene')).toBeNull()
  })

  it('shares a saved scene with a chosen visibility, shows the short link, and stops sharing', async () => {
    const auth = fakeAuth()
    await auth.requestCode('ana@example.test')
    await auth.verifyCode('ana@example.test', '12345678')
    const share = remoteShare()
    renderSection({ auth, storage: remoteStorage(), share, content: [] })
    fireEvent.click(await screen.findByRole('button', { name: 'Share Cloud scene' }))
    const row = document.querySelector('.scene-row-share') as HTMLElement
    fireEvent.change(within(row).getByLabelText('Who can open the link'), { target: { value: 'public' } })
    fireEvent.click(within(row).getByRole('button', { name: 'Get link' }))
    await waitFor(() => expect((within(row).getByLabelText('Share link') as HTMLInputElement).value).toBe('https://phrn.link/Xy12345'))
    expect(share.shareSaved).toHaveBeenCalledWith('scene', 'r1', 'public')
    fireEvent.click(within(row).getByRole('button', { name: 'Stop sharing' }))
    await waitFor(() => expect(share.revoke).toHaveBeenCalledWith('AbCdEfGhJk'))
    expect(await screen.findByText(/Sharing stopped for “Cloud scene”/)).toBeTruthy()
  })
})
```

Run: `npx vitest run --project studio apps/studio/src/studio/ScenesSection.test.tsx`
Expected: FAIL (the signed-out case calls `storage.list`; no toggle; no Share button).

- [ ] **Step 2: `SharePanel.tsx`**

Change `async function copyText(` to `export async function copyText(` (no other change).

- [ ] **Step 3: `ScenesSection.tsx`**

Replace the file with:

```tsx
import { useState } from 'react'
import { ScenesPanel } from '../ui/ScenesPanel'
import { SharePanel } from '../ui/SharePanel'
import type { LookV1, SaveSummary, SceneV2 } from 'ivories/core'
import { getDefaults } from '../platform/registry'
import type { Platform } from '../platform/registry'
import type { useScenes } from '../ui/useScenes'
import { useAuthState } from '../ui/useAuthState'

type Source = 'account' | 'browser'

/** One instance of the panel pair, hosted by the Settings panel with a song
    loaded and by the empty-stage card without one. Loading a scene with no
    song starts the §8.3 drop-the-file flow. With a remote provider, saves live
    in the account only while signed in (Review Focus 5). */
export function ScenesSection(props: {
  platform: Platform
  scenes: ReturnType<typeof useScenes>
  canSave: boolean
  defaultName: string
  buildScene(): SceneV2
  /** The scene as it may leave this browser (sceneForShare: no camera deviceIds). */
  buildShareScene(): SceneV2
  buildLook(): LookV1
}) {
  const { platform, scenes } = props
  const auth = useAuthState(platform.auth)
  const [source, setSource] = useState<Source>('account')
  const remote = platform.storage.remote
  const signedIn = auth?.status === 'signed-in'
  const useAccount = remote && signedIn && source === 'account'
  const storage = remote && !useAccount ? getDefaults().storage : platform.storage
  const { shareSaved, revoke } = platform.share

  return (
    <>
      {remote && signedIn && (
        <div className="saves-source-toggle flex gap-1" role="group" aria-label="Where saves are kept">
          {(['account', 'browser'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={source === s}
              className={`btn-saves-source btn-saves-source--${s} rounded-full border border-[var(--line)] px-3 py-1 text-[11px] ${source === s ? 'bg-[var(--accent)] text-white' : 'text-[var(--ink-dim)]'}`}
              onClick={() => setSource(s)}
            >
              {s === 'account' ? 'Account' : 'This browser'}
            </button>
          ))}
        </div>
      )}
      <ScenesPanel
        storage={storage}
        refreshKey={scenes.savesVersion}
        canSaveScene={props.canSave}
        defaultName={props.defaultName}
        buildScene={props.buildScene}
        buildLook={props.buildLook}
        onOpenScene={(s) => void scenes.openScene(s, false)}
        onApplyLook={scenes.applyLook}
        {...(useAccount && shareSaved
          ? { onShareSaved: (row: SaveSummary, v: 'link_view' | 'public') => shareSaved.call(platform.share, row.kind, row.id, v) }
          : {})}
        {...(useAccount && revoke ? { onStopSharing: (code: string) => revoke.call(platform.share, code) } : {})}
      />
      <SharePanel
        share={platform.share}
        canShareScene={props.canSave}
        buildScene={props.buildShareScene}
        buildLook={props.buildLook}
      />
    </>
  )
}
```

(`.call(platform.share, …)` keeps `this` for class-based providers such as the plugin's `PepperhornShare`.)

- [ ] **Step 4: `ScenesPanel.tsx`**

1. Imports: add `ShareResult` to the `ivories/core` type import and `import { copyText } from './SharePanel'`.
2. Props: add
```ts
  /** Account saves only: makes a link for a saved scene or look. */
  onShareSaved?: (row: SaveSummary, visibility: ShareVisibility) => Promise<ShareResult>
  /** Ends a link made with onShareSaved. */
  onStopSharing?: (code: string) => Promise<void>
```
   with `type ShareVisibility = 'link_view' | 'public'` above the component and
```ts
const VISIBILITY_LABEL: Record<ShareVisibility, string> = { link_view: 'Anyone with the link', public: 'Public (listed)' }
```
3. State and handlers inside the component (after the existing state):
```ts
  const [sharing, setSharing] = useState<{ id: string; visibility: ShareVisibility; result: ShareResult | null } | null>(null)

  const getLink = async (row: SaveSummary) => {
    if (!props.onShareSaved || !sharing) return
    setError(null)
    setStatus(null)
    try {
      const result = await props.onShareSaved(row, sharing.visibility)
      setSharing({ ...sharing, result })
      setStatus((await copyText(result.shortUrl ?? result.url)) ? 'Link copied.' : 'Copy the link below.')
    } catch (e) {
      setError(saveErrorMessage(e, `Could not share “${row.name}”`))
    }
  }

  const stopSharing = async (row: SaveSummary) => {
    const code = sharing?.result?.code
    if (!code || !props.onStopSharing) return
    setError(null)
    try {
      await props.onStopSharing(code)
      setSharing(null)
      setStatus(`Sharing stopped for “${row.name}”. The link no longer opens.`)
    } catch (e) {
      setError(saveErrorMessage(e, 'Could not stop sharing'))
    }
  }
```
4. Row markup: the `<li>` becomes a column holding the existing row and the share area. Replace the `<li …>` element in `list()` with:
```tsx
            <li key={row.id} className={`scene-row scene-row--${kind} flex flex-col gap-1`}>
              <div className="scene-row-main flex items-center justify-between gap-2">
                {/* existing .scene-row-name span, unchanged */}
                <span className="scene-row-actions flex shrink-0 gap-1">
                  {/* existing Load and Delete buttons, unchanged */}
                  {props.onShareSaved && (
                    <button
                      type="button"
                      aria-label={`Share ${row.name}`}
                      aria-expanded={sharing?.id === row.id}
                      className={`btn-share-save ${BTN}`}
                      onClick={() => setSharing(sharing?.id === row.id ? null : { id: row.id, visibility: 'link_view', result: null })}
                    >
                      Share
                    </button>
                  )}
                </span>
              </div>
              {sharing?.id === row.id && (
                <div className="scene-row-share flex flex-col gap-1 rounded border border-[var(--line)] p-2">
                  <div className="scene-row-share-controls flex items-center gap-2">
                    <select
                      aria-label="Who can open the link"
                      className="share-visibility-select rounded border border-[var(--line)] bg-transparent px-1 py-0.5 text-[11px] text-[var(--ink)]"
                      value={sharing.visibility}
                      onChange={(e) => setSharing({ ...sharing, visibility: e.target.value as ShareVisibility, result: null })}
                    >
                      {(Object.keys(VISIBILITY_LABEL) as ShareVisibility[]).map((v) => (
                        <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
                      ))}
                    </select>
                    <button type="button" className={`btn-get-share-link ${BTN}`} onClick={() => void getLink(row)}>Get link</button>
                  </div>
                  {sharing.result && (
                    <>
                      <input
                        type="text"
                        readOnly
                        aria-label="Share link"
                        className="share-url w-full rounded border border-[var(--line)] bg-transparent px-2 py-1 text-[11px] text-[var(--ink)]"
                        value={sharing.result.shortUrl ?? sharing.result.url}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      {props.onStopSharing && (
                        <button type="button" className={`btn-stop-sharing ${BTN} self-start`} onClick={() => void stopSharing(row)}>
                          Stop sharing
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
```
   Keep the existing name span and Load/Delete buttons exactly as they are, moved inside `.scene-row-main`.

- [ ] **Step 5: Verify**

Run: `cd /home/shaun/tmi-plugin && npm test && npm run check && npm run build && npm run lint`
Expected: PASS, including the existing `ScenesPanel.test.tsx` and `SharePanel.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/studio/ScenesSection.tsx apps/studio/src/studio/ScenesSection.test.tsx \
  apps/studio/src/ui/ScenesPanel.tsx apps/studio/src/ui/SharePanel.tsx
git commit -m "feat(studio): account saves with a browser fallback; share a saved scene with visibility and stop sharing" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18 `[tickle]` Hosting artifacts for ivories.pepperhorn.com (no deploy)

Coolify Dockerfile pattern from `~/module/Dockerfile` (runbook §3.7 H1), adapted to the monorepo, plus build-time plugin injection (runbook decision 4) so the open repo never commits `tickle.config.json` or the bundle.

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `deploy/nginx.conf`, `deploy/security-headers.conf`
- Create: `scripts/inject-plugin.mjs`, `scripts/inject-plugin.test.mjs`, `scripts/check-hosting.mjs`, `scripts/check-hosting.test.mjs`
- Modify: root `package.json` (scripts), `.gitignore`

**Interfaces:**
- Produces:
  - `node scripts/inject-plugin.mjs <distDir>` reading `PLUGIN_BUNDLE_URL` and `PLUGIN_BUNDLE_SHA256`: both empty = open build (no-op); otherwise downloads (`https://` or `file:`), checks sha256, writes `<distDir>/plugins/tickle-ph-plugin.js` and `<distDir>/tickle.config.json` = `{"plugins":["/plugins/tickle-ph-plugin.js"]}`. Exported `injectPlugin({ distDir, url, sha256, fetchImpl? })` for tests.
  - `npm run check:hosting` (env `NGINX_CONF`, `NGINX_HEADERS` override the paths for its own test).
  - Docker build args: `APP_VERSION`, `PLUGIN_BUNDLE_URL`, `PLUGIN_BUNDLE_SHA256`.

- [ ] **Step 1: Write the failing script tests**

`scripts/inject-plugin.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { injectPlugin } from './inject-plugin.mjs'

const dist = () => mkdtempSync(join(tmpdir(), 'inject-'))
const sha = (b) => createHash('sha256').update(b).digest('hex')

test('empty args leave an open build untouched', async () => {
  const d = dist()
  assert.deepEqual(await injectPlugin({ distDir: d, url: '', sha256: '' }), { injected: false })
  assert.equal(existsSync(join(d, 'tickle.config.json')), false)
})

test('one arg without the other is refused', async () => {
  await assert.rejects(injectPlugin({ distDir: dist(), url: 'https://x.test/p.js', sha256: '' }), /set together/)
  await assert.rejects(injectPlugin({ distDir: dist(), url: '', sha256: 'a'.repeat(64) }), /set together/)
})

test('a file: bundle with the right hash is installed with its config', async () => {
  const src = join(dist(), 'bundle.js')
  writeFileSync(src, 'export default () => ({})\n')
  const d = dist()
  const r = await injectPlugin({ distDir: d, url: pathToFileURL(src).href, sha256: sha(readFileSync(src)) })
  assert.equal(r.injected, true)
  assert.equal(readFileSync(join(d, 'plugins', 'tickle-ph-plugin.js'), 'utf8'), 'export default () => ({})\n')
  assert.deepEqual(JSON.parse(readFileSync(join(d, 'tickle.config.json'), 'utf8')), { plugins: ['/plugins/tickle-ph-plugin.js'] })
})

test('a hash mismatch writes nothing', async () => {
  const src = join(dist(), 'bundle.js')
  writeFileSync(src, 'tampered')
  const d = dist()
  await assert.rejects(injectPlugin({ distDir: d, url: pathToFileURL(src).href, sha256: 'b'.repeat(64) }), /sha256 mismatch/)
  assert.equal(existsSync(join(d, 'tickle.config.json')), false)
})

test('plain http and failed downloads are refused', async () => {
  await assert.rejects(injectPlugin({ distDir: dist(), url: 'http://x.test/p.js', sha256: 'a'.repeat(64) }), /https:\/\/ or file:/)
  const fetchImpl = async () => new Response('no', { status: 404 })
  await assert.rejects(injectPlugin({ distDir: dist(), url: 'https://x.test/p.js', sha256: 'a'.repeat(64), fetchImpl }), /HTTP 404/)
})
```

`scripts/check-hosting.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const run = (env = {}) => spawnSync(process.execPath, ['scripts/check-hosting.mjs'], { encoding: 'utf8', env: { ...process.env, ...env } })

test('the committed config passes', () => {
  const r = run()
  assert.equal(r.status, 0, r.stderr)
})

test('a location that sets headers without the snippet fails (Review Focus 4)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nginx-'))
  const conf = readFileSync('deploy/nginx.conf', 'utf8').replace(
    /location \/assets\/ \{[^}]*\}/,
    'location /assets/ {\n    add_header Cache-Control "public, max-age=31536000, immutable" always;\n  }',
  )
  writeFileSync(join(dir, 'nginx.conf'), conf)
  const r = run({ NGINX_CONF: join(dir, 'nginx.conf') })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /location \/assets\/ does not include the security headers/)
})

test('a CSP without the smplr sample hosts fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nginx-'))
  writeFileSync(join(dir, 'h.conf'), readFileSync('deploy/security-headers.conf', 'utf8').replace(' https://goldst.dev', ''))
  const r = run({ NGINX_HEADERS: join(dir, 'h.conf') })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /connect-src lacks https:\/\/goldst\.dev/)
})
```

Add to root `package.json` `scripts`:
```json
"test:scripts": "node --test scripts/inject-plugin.test.mjs scripts/check-hosting.test.mjs",
"check:hosting": "node scripts/check-hosting.mjs"
```
and change `"check"` to:
```json
"check": "npm run test:geometry && npm run check:imports && npm run check:hosting && npm run test:scripts && npm run check:css -w packages/ivories"
```

Run: `cd /home/shaun/tmi-plugin && npm run test:scripts`
Expected: FAIL (`inject-plugin.mjs` and `check-hosting.mjs` do not exist).

- [ ] **Step 2: `scripts/inject-plugin.mjs`**

```js
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
```

- [ ] **Step 3: nginx config and headers**

`deploy/security-headers.conf`:
```nginx
# Included by every location in nginx.conf: an add_header inside a location
# replaces the server's set, so each location re-includes this file.
# connect-src: the gateway, opensongs/GM sounds (jsDelivr), Google Fonts CSS,
# and smplr's sample hosts (smpldsnds, gleitz, goldst.dev). Without the
# sample hosts the piano is silent (runbook §0, §3.7).
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://apps.pepperhorn.com https://cdn.jsdelivr.net https://fonts.googleapis.com https://smpldsnds.github.io https://gleitz.github.io https://goldst.dev; media-src 'self' blob: data:; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; object-src 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

`deploy/nginx.conf`:
```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;

  # SPA: /s/<code> and every other app route serve index.html (spec §7).
  location / {
    include /etc/nginx/snippets/security-headers.conf;
    try_files $uri $uri/ /index.html;
  }

  location /assets/ {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    try_files $uri =404;
  }

  location = /index.html {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
  }

  # The plugin config must 404 when absent (open build). Falling back to
  # index.html would answer the studio's config fetch with HTML 200.
  location = /tickle.config.json {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
  }

  location /plugins/ {
    include /etc/nginx/snippets/security-headers.conf;
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
  }
}
```

- [ ] **Step 4: `scripts/check-hosting.mjs`**

```js
#!/usr/bin/env node
// Hosting guard (runbook §3.7): the CSP keeps audio, fonts and the gateway
// working, every nginx location re-includes the security headers, the SPA
// fallback exists, and the plugin config/bundle 404 instead of falling back.
import { readFileSync } from 'node:fs'

const conf = readFileSync(process.env.NGINX_CONF ?? 'deploy/nginx.conf', 'utf8')
const headers = readFileSync(process.env.NGINX_HEADERS ?? 'deploy/security-headers.conf', 'utf8')
const problems = []

const csp = /Content-Security-Policy "([^"]+)"/.exec(headers)?.[1]
if (!csp) problems.push('security-headers.conf has no Content-Security-Policy')
const directive = (name) =>
  (csp ?? '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `))?.split(/\s+/).slice(1) ?? []

const need = {
  'connect-src': ["'self'", 'https://apps.pepperhorn.com', 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com',
    'https://smpldsnds.github.io', 'https://gleitz.github.io', 'https://goldst.dev'],
  'script-src': ["'self'"],
  'style-src': ['https://fonts.googleapis.com'],
  'font-src': ['https://fonts.gstatic.com'],
  'worker-src': ['blob:'],
  'object-src': ["'none'"],
}
for (const [d, values] of Object.entries(need)) {
  for (const v of values) if (!directive(d).includes(v)) problems.push(`CSP ${d} lacks ${v}`)
}
if (directive('script-src').some((v) => v.includes('unsafe'))) problems.push("CSP script-src must not allow 'unsafe-*'")

for (const m of conf.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)) {
  if (!m[2].includes('include /etc/nginx/snippets/security-headers.conf;')) {
    problems.push(`location ${m[1].trim()} does not include the security headers`)
  }
}
if (!/try_files \$uri \$uri\/ \/index\.html;/.test(conf)) problems.push('SPA fallback missing: /s/<code> needs index.html')
if (!/location = \/tickle\.config\.json\s*\{[^}]*try_files \$uri =404;/.test(conf)) problems.push('/tickle.config.json must 404 when absent')
if (!/location \/plugins\/\s*\{[^}]*try_files \$uri =404;/.test(conf)) problems.push('/plugins/ must 404 when absent')

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('hosting config ok')
```

- [ ] **Step 5: Dockerfile and ignores**

`Dockerfile`:
```dockerfile
# ivories.pepperhorn.com (runbook §3.7 H1): Coolify build pack "dockerfile".
# Open build unless PLUGIN_BUNDLE_URL and PLUGIN_BUNDLE_SHA256 are both set.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/ivories/package.json packages/ivories/package.json
COPY apps/studio/package.json apps/studio/package.json
RUN npm ci --no-audit --no-fund
COPY . .
ARG APP_VERSION=0.0.0
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build
ARG PLUGIN_BUNDLE_URL=""
ARG PLUGIN_BUNDLE_SHA256=""
RUN PLUGIN_BUNDLE_URL="$PLUGIN_BUNDLE_URL" PLUGIN_BUNDLE_SHA256="$PLUGIN_BUNDLE_SHA256" \
    node scripts/inject-plugin.mjs apps/studio/dist

FROM nginx:alpine
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/studio/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

`.dockerignore`:
```
.git
node_modules
**/node_modules
**/dist
test-results
playwright-report
local-fixtures
apps/studio/public/tickle.config.json
apps/studio/public/plugins
```

Append to `.gitignore`:
```
# Plugin injection is build-time only (Task 18); never commit these.
apps/studio/public/tickle.config.json
apps/studio/public/plugins/
deploy/local-plugin/
```

- [ ] **Step 6: Verify**

Run: `cd /home/shaun/tmi-plugin && npm run test:scripts && npm run check && npm test && npm run build`
Expected: PASS; `hosting config ok`.

Then, if `docker info` succeeds (Docker Desktop running):
```bash
cd /home/shaun/tmi-plugin
docker build -t ivories-web:local .
docker run --rm -d -p 8080:80 --name ivories-web ivories-web:local
curl -sI http://localhost:8080/ | grep -i '^content-security-policy'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/s/AbCdEfGhJk         # 200 (index.html)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/tickle.config.json   # 404
asset=$(curl -s http://localhost:8080/ | grep -o '/assets/[^"]*\.js' | head -1)
curl -sI "http://localhost:8080$asset" | grep -ic 'content-security-policy\|immutable'  # 2
docker rm -f ivories-web
```
Expected: as commented. If Docker is not running, write "docker check skipped: daemon unavailable" in the commit body; G7 repeats this check on Coolify.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile .dockerignore deploy/nginx.conf deploy/security-headers.conf scripts/inject-plugin.mjs \
  scripts/inject-plugin.test.mjs scripts/check-hosting.mjs scripts/check-hosting.test.mjs package.json .gitignore
git commit -m "build: Coolify Dockerfile + nginx (SPA fallback, CSP with sample hosts) and hash-pinned build-time plugin injection" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19 `[tickle]` Local end-to-end: studio + plugin bundle + mock gateway

Exercises the real wiring: the studio fetches `/tickle.config.json`, dynamically imports the built plugin, and the plugin talks to the mock gateway over HTTP with CORS. No production endpoint is touched.

**Files:**
- Create: `scripts/e2e-plugin.mjs`, `e2e/platform-plugin.spec.ts`
- Modify: root `package.json` (script `test:e2e:plugin`)

**Interfaces:**
- Consumes: plugin repo at `PLUGIN_REPO` (default `../tickle-ph-plugin` next to the tickle checkout, i.e. `/home/shaun/tickle-ph-plugin`) with `npm run build` honouring `PH_BASE_URL` and `npm run mock-gateway` honouring `PORT`/`SHARE_ORIGIN` (Task 14); class hooks from Tasks 16–17; `#file-input`, `.btn-settings`, `.settings-section--scenes .settings-section-toggle`, `.btn-copy-share--look`, `.share-panel .share-url`, `.shared-preview-banner` (existing studio).
- Produces: `npm run test:e2e:plugin`.

- [ ] **Step 1: Orchestrator**

`scripts/e2e-plugin.mjs`:
```js
#!/usr/bin/env node
// Local e2e for the plugin (no production): builds the plugin against the mock
// gateway, copies it into apps/studio/public (gitignored), starts the mock
// gateway, runs e2e/platform-plugin.spec.ts, then removes the copied files.
// The plugin's dist/ is left pointing at localhost: rebuild it before any release (G3).
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_REPO = resolve(process.env.PLUGIN_REPO ?? join(ROOT, '..', 'tickle-ph-plugin'))
const PORT = 5191
const GW_PORT = 8787
const PUBLIC = join(ROOT, 'apps', 'studio', 'public')

execFileSync('npm', ['run', 'build'], { cwd: PLUGIN_REPO, stdio: 'inherit', env: { ...process.env, PH_BASE_URL: `http://localhost:${GW_PORT}` } })
mkdirSync(join(PUBLIC, 'plugins'), { recursive: true })
copyFileSync(join(PLUGIN_REPO, 'dist', 'tickle-ph-plugin.js'), join(PUBLIC, 'plugins', 'tickle-ph-plugin.js'))
writeFileSync(join(PUBLIC, 'tickle.config.json'), JSON.stringify({ plugins: ['/plugins/tickle-ph-plugin.js'] }) + '\n')

const gw = spawn('npm', ['run', 'mock-gateway'], {
  cwd: PLUGIN_REPO, stdio: 'inherit',
  env: { ...process.env, PORT: String(GW_PORT), SHARE_ORIGIN: `http://localhost:${PORT}` },
})
let code = 1
try {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://localhost:${GW_PORT}/`); break } catch { await new Promise((r) => setTimeout(r, 200)) }
  }
  code = await new Promise((done) => {
    spawn('npx', ['playwright', 'test', 'e2e/platform-plugin.spec.ts'], {
      cwd: ROOT, stdio: 'inherit',
      env: { ...process.env, IVORIES_E2E_PORT: String(PORT), TICKLE_PLUGIN_E2E: '1' },
    }).on('exit', (c) => done(c ?? 1))
  })
} finally {
  gw.kill()
  rmSync(join(PUBLIC, 'plugins'), { recursive: true, force: true })
  rmSync(join(PUBLIC, 'tickle.config.json'), { force: true })
}
process.exit(code)
```

Add to root `package.json` `scripts`: `"test:e2e:plugin": "node scripts/e2e-plugin.mjs"`.

- [ ] **Step 2: The spec**

`e2e/platform-plugin.spec.ts`:
```ts
/**
 * The hosted wiring, locally (Task 19): /tickle.config.json -> plugin bundle ->
 * mock gateway. Run through `npm run test:e2e:plugin`, never on its own.
 */
import { test, expect } from './fixtures'
import type { Page } from './fixtures'

test.skip(process.env.TICKLE_PLUGIN_E2E !== '1', 'run through npm run test:e2e:plugin')

const CODE = '12345678' // the mock gateway's fixed code

async function signIn(page: Page, email: string) {
  await page.locator('.account-menu-trigger--signed-out').click()
  await page.locator('.sign-in-email-input').fill(email)
  await page.locator('.btn-send-code').click()
  await page.locator('.otp-digit').first().focus()
  await page.keyboard.insertText(CODE)
  await expect(page.locator('.account-menu-trigger--signed-in')).toHaveText(/^@player-\d+$/)
}

async function openScenes(page: Page) {
  await page.setInputFiles('#file-input', 'docs/demo.mid')
  await page.locator('.btn-settings').click()
  await page.locator('.settings-section--scenes .settings-section-toggle').click()
}

test('sign in, save to the account, share a saved scene, open it elsewhere, stop sharing', async ({ page, browser }) => {
  await page.goto('/')
  await signIn(page, 'ana@example.test')
  await openScenes(page)
  await page.locator('.save-name-input').fill('E2E scene')
  await page.locator('.btn-save-scene').click()
  const row = page.locator('.scene-row--scene', { hasText: 'E2E scene' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Share E2E scene' }).click()
  await row.locator('.btn-get-share-link').click()
  const url = await row.locator('.share-url').inputValue()
  expect(url).toMatch(/^http:\/\/localhost:5191\/s\/[A-Za-z0-9]{10}$/)

  const guestContext = await browser.newContext()
  const guest = await guestContext.newPage()
  await guest.goto(new URL(url).pathname)
  const banner = guest.locator('.shared-preview-banner')
  await expect(banner).toContainText('Shared scene')
  await expect(banner).toContainText('@player-1')

  await row.locator('.btn-stop-sharing').click()
  await guest.reload()
  await expect(guest.locator('.shared-preview-banner--error')).toContainText('removed')
  await guestContext.close()
})

test('signed out, a look share is an anonymous /s/ link through the plugin', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.account-menu-trigger--signed-out')).toBeVisible()
  await openScenes(page)
  await page.locator('.btn-copy-share--look').click()
  await expect(page.locator('.share-panel .share-url')).toHaveValue(/\/s\/[A-Za-z0-9]{10}$/)
})

test('a second sign-in shows two devices, and one can be signed out', async ({ page, browser }) => {
  await page.goto('/')
  await signIn(page, 'dev@example.test')
  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  await other.goto('/')
  await signIn(other, 'dev@example.test')

  await page.locator('.account-menu-trigger--signed-in').click()
  await page.locator('.btn-show-devices').click()
  await expect(page.locator('.account-device')).toHaveCount(2)
  await page.locator('.account-device', { hasNotText: '(this device)' }).locator('.btn-revoke-device').click()
  await expect(page.locator('.account-device')).toHaveCount(1)
  await other.reload()
  await expect(other.locator('.account-menu-trigger--signed-out')).toBeVisible()
  await otherContext.close()
})
```

- [ ] **Step 3: Run it**

Run: `cd /home/shaun/tmi-plugin && npm run test:e2e:plugin`
Expected: 3 passed. Afterwards `git status --short apps/studio/public` is empty (the copied files are removed and gitignored). If a step fails because a selector moved, fix the selector in the spec, not the product, unless the product is wrong.

- [ ] **Step 4: Rebuild the plugin for production**

Run: `cd /home/shaun/tickle-ph-plugin && npm run build && grep -c 'https://apps.pepperhorn.com' dist/tickle-ph-plugin.js`
Expected: count ≥ 1 and `grep -c localhost:8787 dist/tickle-ph-plugin.js` prints 0.

- [ ] **Step 5: Commit**

```bash
cd /home/shaun/tmi-plugin
git add scripts/e2e-plugin.mjs e2e/platform-plugin.spec.ts package.json
git commit -m "test(e2e): studio + plugin bundle + mock gateway, end to end, no production" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Section G: gated steps (not executed by this plan)

Each needs the named approval or a human. Order matters where noted. Commands are the runbook's (`docs/superpowers/plans/2026-10-13-platform-golive-runbook.md`), restated here so this plan is self-contained.

| # | Step | Who | Action | Verify |
|---|---|---|---|---|
| G1 | Publish `ivories` | **[HUMAN]** | **Only after Task 1 is merged to `master`** (its `TickleHost`/`AuthProvider` types are part of 0.1.0). From `packages/ivories` on master: `npm publish --access public --otp <code>`. If 0.1.0 was already published without Task 1, bump to 0.1.1 and publish that. | `npm view ivories version`; `npm pack ivories && tar xOzf ivories-*.tgz package/dist/types/core/platform/types.d.ts \| grep sceneForShare` |
| G2 | Push and publish `@pepperhorn/app-sdk` 0.1.0 | **[HUMAN]** (push may be agent after approval) | `git -C ~/app-sdk push -u origin feat/sdk-0.1`, PR, merge to `main`; `npm login` (owner of `@pepperhorn`), `npm run check:pack`, `npm publish --access public --otp <code>` | `npm view @pepperhorn/app-sdk version` → `0.1.0` |
| G3 | Plugin on registry deps, CI, release | **[AGENT after approval]** for the commits and `gh release`; **[HUMAN]** merges | In `~/tickle-ph-plugin`: `npm install -D ivories@^0.1.0 @pepperhorn/app-sdk@^0.1.0` (replacing the `file:` tarballs), add `.github/workflows/ci.yml` (same as the SDK's), `npm test && npm run build` (production `PH_BASE_URL`), push, merge; tag `v0.1.0`; `gh release create v0.1.0 dist/tickle-ph-plugin.js`; record `sha256sum dist/tickle-ph-plugin.js` | release asset downloads; its sha256 matches the recorded one |
| G4 | Gateway uses the real schema | **[AGENT]** local change in `~/ph-apps-extensions` (branch off `chore/gate-retarget`), then **[PROD GATE, HUMAN]** redeploy | Vendor the plugin's `dist/schema.js`; in `endpoints/ph/src/apps.ts` set `TICKLE.kinds = TICKLE_KINDS` (replacing `permissive`/`tickleScene`); gateway e2e: invalid scene → 400, anonymous midi → 403 `upload_requires_sign_in`, 300 KiB → 413; re-pin `ARTIFACTS.sha256`; redeploy = the gate 0.6 procedure | `gate-prod-checks.sh gateway` passes |
| G5 | Merge `feat/platform-plugin` → tickle `master` | **[HUMAN]** | PR from this worktree's branch | CI green on master |
| G6 | DNS | **[HUMAN]** | Registrar panel (NS `ns*.nameserver.net.au`): `ivories` A `208.87.135.48` → `95.217.32.125` | `dig +short @1.1.1.1 ivories.pepperhorn.com` → `95.217.32.125` |
| G7 | Coolify app, open build | **[AGENT after approval]** | Runbook H4–H6: GitHub App sees `pepperhorn/tickle-me-ivories`; create app (server `localhost`, build pack `dockerfile`, `/Dockerfile`, port 80, fqdn `https://ivories.pepperhorn.com`, branch `master`, plugin build args empty, `APP_VERSION` set); deploy | `curl -sI https://ivories.pepperhorn.com` 200 + valid cert + CSP; `/s/AbCdEfGhJk` 200 HTML; `/tickle.config.json` 404; audio plays with no CSP violations in the console |
| G8 | Plugin-enabled deploy | **[AGENT after approval]**, after G3, G4 and gates 0.5/0.6 | Set build args `PLUGIN_BUNDLE_URL=https://github.com/pepperhorn/tickle-ph-plugin/releases/download/v0.1.0/tickle-ph-plugin.js`, `PLUGIN_BUNDLE_SHA256=<G3 sha>`; redeploy | `/tickle.config.json` 200; the account corner appears |
| G9 | phrn.link host | per runbook gate 0.9-B | `APP_SHARE_HOSTS=tickle-me-ivories=https://ivories.pepperhorn.com` on `platform-links-new` | `curl -sI https://phrn.link/<slug>` → 302 to `/s/<code>` |

### Task 20 `[GATED]` Production verification against the real gateway

**Run only after gates 0.5 and 0.6 are live** (`curl -s -o /dev/null -w '%{http_code}' https://apps.pepperhorn.com/ph/v1/me` → `401`) **and, for steps 3–7, after G7 and G8.** Every step needs a human (mailed codes, two browsers). Record results in `docs/superpowers/handover/2026-MM-DD-platform-phase-3-handover.md` on the tickle repo.

- [ ] **Step 1: SDK auth smoke [HUMAN]:** `cd ~/app-sdk && PH_SMOKE_EMAIL=<test mailbox> npm run smoke:auth` → `smoke-auth PASS`.
- [ ] **Step 2: SDK saves/shares smoke [HUMAN]:** `PH_SMOKE_EMAIL=<test mailbox> npm run smoke:saves` → `smoke-saves PASS`. Cleanup of the test user: `gate-prod-checks.sh cleanup <tag>` in `~/ph-apps-extensions`.
- [ ] **Step 3: Sign in and save [HUMAN]:** on `https://ivories.pepperhorn.com`, sign in with the mailed 8-digit code; save a scene and a look to the account; reload; both list under "Account".
- [ ] **Step 4: Share [HUMAN]:** share the saved scene ("Anyone with the link"); the link shown is `https://phrn.link/<slug>` once synced (or the `/s/<code>` URL if not yet); `curl -sI <phrn.link url>` → 302 to `https://ivories.pepperhorn.com/s/<code>`.
- [ ] **Step 5: Open elsewhere [HUMAN]:** in a private window, open the link → preview banner "by @handle" → Apply (drop the song file when asked) → Save a copy (goes to this browser while signed out).
- [ ] **Step 6: Stop sharing [HUMAN]:** "Stop sharing" in the first browser; reload the private window → "This share was removed, or its owner made it private."
- [ ] **Step 7: Devices [HUMAN]:** sign in in the private window too; the first browser's Devices lists two; sign the other out; it shows "Sign in" after a reload.

---

## Self-review (done while writing; kept for the reviewer)

**Spec coverage.** §3.1 core API: Tasks 3–5 (`ContentClient` is phase 6 and omitted; `PhClient` gains it additively later). §3.2: Tasks 7–8 (`useSyncedSaves` deferred to phase 4 with module, the only consumer; `useSaves` drops its unused `schema` argument). §4 plugin: Tasks 10–14 (types via `ivories/core` per runbook §5.2, not `tickle-me-ivories/platform`; `content.ts` is phase 6). §2 registry `loadConfiguredPlugins`: Task 15. §7 `/s/<code>` routing: Tasks 15, 18. §8.5 caps: Task 10. §9.3 CSP (corrected): Task 18. Runbook §3.3 items: Tasks 15–17. **Out of this plan, still owed by phase 3:** runbook §3.4 opensongs library + `LibraryPanel`, §3.5 opensongs `v1.0.0` tag, §3.6 MIDI embedding in the save flow (the schema and plugin already accept `midi` refs), and G4's gateway vendoring (listed as gated).

**Placeholders.** None: every code step has the code; the two "keep the existing … unchanged" notes in Task 17 refer to markup the executor moves, not writes.

**Type consistency.** `TickleHost.decodeScene(u, o?)` and `sceneForShare` (Task 1) are used by Tasks 10–15 with the same shapes; `PlatformDevice` (Task 1) is produced by Task 11 and consumed by Task 16; `toSummary` (Task 12) is reused by Task 13; `TICKLE_KINDS` (Task 10) feeds the fake gateway (Tasks 10–14) and G4; `createFakeGateway` options are the same in Tasks 6, 10 and 14.

**Decisions taken here (flag in review):** TickleHost/AuthProvider change before the ivories publish (Task 1, G1); recipients "Save a copy" client-side rather than the server `fork` (keeps the recipient's own device audio, §8.1); `link_edit` is not offered in the UI; anonymous-share `revokeKey`s are not kept by the studio; each signed-in `share()` creates a new `link_view` save (spec §4), so repeated quick shares add saves; the plugin builds share URLs from `host.origin`; the account corner is visible over the stage (also in keyed/transparent captures); `shareSaved` rewrites the owner's save without camera ids, so the owner re-picks a camera after sharing a webcam scene.
