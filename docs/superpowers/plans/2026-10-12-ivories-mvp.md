# Ivories MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One fresh subagent per task, a spec-compliance review and then a code-quality review between tasks.

**Goal:** Turn Tickle Me Ivories into an npm-workspaces monorepo: a published, MIT, React library `ivories` (shared clock, provider, keyboard / falling-keys / transport / notation / stage components, live MIDI, layouts with camera slots) plus `apps/studio`, today's app rebuilt on the library's public entry points only.

**Architecture:** Stage A moves the code mechanically (`git mv`) into `packages/ivories/src/core` (framework-free) and `apps/studio`, then introduces a `Clock` abstraction. `AudioClock` carries today's transport math, `useTransport` becomes a binding over it, and a `PlaybackDriver` (scheduler + metronome) consumes any `Clock`. Stage B adds `IvoriesProvider` (one score, clock, engine, rAF loop per provider) and canvas views drawn by the existing pure `drawStage`. The studio is decomposed into hooks and its stage swapped onto the provider. Stages C–F add MediaClock/ManualClock, live MIDI, the layout model + `<Stage>` + camera slots + SceneV2, `<Notation>` on pepperscore 0.2's external-clock API, the library build, an embed fixture and a Playwright smoke suite.

**Tech Stack:** npm workspaces, Vite 8 (lib mode + rolldown), React 19, TypeScript 6, Vitest 5 (`test.projects`), jsdom, @testing-library/react, Tailwind v4 (studio only), plain scoped CSS + postcss (library), smplr, @tonejs/midi, tonal, fflate, @noble/hashes, zustand (studio only), @playwright/test 1.62 (Chromium fake media devices), pepperscore ≥0.2 (optional peer, dynamic import).

**Spec:** `docs/superpowers/specs/2026-10-12-ivories-mvp-design.md` (§ references below point there). Earlier specs it builds on: `2026-09-12-piano-visualizer-design.md`, `2026-09-26-pepperhorn-platform-sdk-design.md`.

**Baseline (recorded 2026-10-12 on `feat/ivories-mvp` at `53652a6`):** `npm test` → 49 test files, **680 passed, 1 skipped** (681). The spec's "392+" is stale; 680 is the number every move task must preserve.

## Global Constraints

- **Work only in `/home/shaun/ivories-mvp`** (branch `feat/ivories-mvp`). Never touch other repos; never push or publish.
- **Moves and behaviour changes are separate tasks.** A move task uses `git mv` and import rewrites only; its test count must equal the count before it (680 passed / 1 skipped for Tasks 1–2).
- **Verify with builds, not `npx tsc --noEmit` at the root.** Use `npm run build` (studio `tsc -b && vite build`) and `npm run check -w packages/ivories`. The root has no tsconfig of its own.
- **Studio imports only public entry points:** `ivories`, `ivories/core`, `ivories/style.css`. No path alias into `packages/ivories/src` in any tsconfig or Vite config. Workspace resolution uses the custom export condition `"source"` (package.json `exports`), enabled in the studio's Vite `resolve.conditions` and tsconfig `customConditions`. Enforced by `scripts/check-public-imports.mjs`.
- **The scaffold never imports `@pepperhorn/*`** and works offline (local storage + hash shares).
- **Clock time (controller ruling, clarifies spec §3.1):** `Clock.now()` returns **score-time seconds**: the position on the score's own tempo map at rate 1. `rate` changes only how fast score-time advances (rate 0.5 for 1 wall-second advances `now()` by 0.5); `seek(t)` takes score-time. Negative times (count-in) are legal and passed through unclamped; pepperscore hides its playhead for them. Library providers never retime a score, so for every embed the provider timeline *is* the score's own tempo map. The studio's TempoSetting (ticks are the truth, `retimeScore`) is a studio-only retiming of the document it hands the provider; `<Notation>` converts provider time to own-tempo time through ticks (`toOwnTempoSec`) so pepperscore always receives own-tempo seconds.
- **Library CSS:** plain CSS in `packages/ivories/src/style.css`, every selector starts with `.ivories`, every library class name is prefixed `ivories-`, tokens are `--ivories-*` custom properties, keyframes prefixed `ivories-`, no `html`/`body`/`:root`, no viewport units, no `position: fixed`, no `@font-face`. Checked by `packages/ivories/scripts/css-scope.mjs`. The library ships no Tailwind and no element `id`s (several instances can share a page).
- **Studio CSS:** Tailwind utilities, and every element carries a contextual semantic class name alongside them (`className="layout-toolbar flex items-center gap-2"`). Non-negotiable.
- **Typography:** Poppins everywhere (studio bundles it via `@fontsource/poppins`; library CSS declares `font-family: Poppins, system-ui, sans-serif` and leaves loading to the host).
- **Dev server:** always bound to `0.0.0.0` (`vite --host 0.0.0.0`; `npm run dev` at the root forwards extra args, e.g. `npm run dev -- --port 5183`).
- **SSR-safe imports:** no module touches `window`, `document`, `navigator`, `AudioContext`, `requestMIDIAccess`, `getUserMedia` or pepperscore at import time; only inside effects or methods.
- **Components never throw into the host:** errors go to `onError(err)` with `err.code` one of `score-load`, `score-parse`, `audio-unavailable`, `midi-unavailable`, `camera-unavailable`, `notation-unavailable`, `notation-needs-musicxml` (plus `render-failed`, see resolution R11), and an inline message inside the component's box.
- **Per-voice volume never folds into velocity; `LOOKAHEAD_SEC` (0.15) stays below smplr's 200 ms lookahead; every seek/tempo/rate change is paired with `engine.stopAll()`** (now guaranteed by `PlaybackDriver` on the clock's `seek`/`rate`/`pause` events).
- **The draw path stays a pure function of `t`;** caches keyed by identity (layout, range, voices, theme, key) and `readTheme` runs once per layout/theme change, never per frame.
- **Keyboard geometry constants are fixed** (`aspect` 5.8, `blackWRatio` 0.5652, `blackLenRatio` 0.655, black offsets C# −b/6, D# +b/6, F# −b/4, G# 0, A# +b/4). `node tests/geometry-check.mjs` must keep printing `all passed`.
- **Commits:** every task ends with one commit; the message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A webcam that disappears mid-session** (unplugged, taken by another app, permission revoked): the slot shows its placeholder with a Retry button, the other slots and playback keep running, and Retry re-requests the device. Test: Task 21 (`track 'ended' → placeholder; retry calls getUserMedia again`).
2. **A MIDI device unplugged while keys (or the sustain pedal) are held:** every note from that input is released (no stuck lit keys, no stuck live audio). Test: Task 16 (`statechange disconnected releases that input's notes`).
3. **Rapid seek / rate changes while playing:** no note is handed to the engine twice and every change silences what was scheduled. Test: Task 6 (`seek spam while playing schedules each note at most once per pass and calls stopAll per seek`).
4. **A crafted or corrupted shared scene** (CSS-injection fill like `red;background:url(x)`, NaN ratio, ratio 5, unknown slot kind, a `deviceId` from someone else's browser): refused or clamped, never applied verbatim, and shared `deviceId`s are dropped. Test: Task 20.
5. **An embed in a zero-size or hidden container** (Astro `client:visible` inside a collapsed tab, `display:none`): no throw, no NaN geometry, drawing resumes when the box gets a size. Test: Task 9 (`StageRenderer.draw at 0×0`) and Task 11 (view mounted in a 0×0 box).

## Spec gaps and resolutions (apply exactly; reviewers check against these)

- **R1 Tempo vs rate.** See the Clock-time constraint. The studio keeps its TempoSetting retiming (unchanged behaviour, `useTransport.setTempo`); `Clock.rate` is a separate multiplier used by hosts and the library `<Transport>` tempo slider.
- **R2 `AudioClock(ctx)`** accepts any `{ readonly currentTime: number }` (an `AudioContext` or the `AudioEngine`), plus `isRunning()` so a play session whose audio cannot start runs on `performance.now()` (spec §8 silent clock). It also exposes explicit-time methods (`playAt/pauseAt/seekAt/setRateAt/load/anchors`) so the studio store keeps its `(…, now)` API and its tests unchanged.
- **R3 `useTransport` stays in the studio** as the binding over an `AudioClock` (`bindTransportClock`). The store stays authoritative for its own actions (it loads its anchors into the clock before acting), and mirrors anchors from clock events.
- **R4 Metronome seam:** `AudioEngine.metronome()` lazily builds the `MetronomeVoice`, so the provider's driver and the studio tests share one fake engine (App.test no longer mocks `MetronomeVoice`).
- **R5 Keyboard `range` crop:** implemented with `computeLayout(w, h, { firstPitch, lastPitch })` after `ensureFullBlackKeyGroups`; a test proves it equals the full-keyboard geometry scaled and translated to the range's white-key span (spec §4 wording), so the oracle is untouched.
- **R6 SceneV2 is `v: 2`.** Provider interfaces (`SaveInput`, `StorageProvider.load`, `ShareProvider.share/update`, `TickleHost.decodeScene`) move from `SceneV1` to `SceneV2`; `SceneV1` stays exported for the upgrade path. `readEnvelope` takes a `maxVersion`.
- **R7 Display mode ↔ layout (studio):** the profile's `mode` still exists. The TransportBar roll/keyboard toggle rewrites every ivories slot whose view is `falling`/`keyboard` (`withPrimaryMode`), and a V1 scene upgrades to `single` with `falling` for `roll`, `keyboard` for `keyboard`.
- **R8 PIP `margin`** is a fraction of the stage width (default 0.02, clamped 0–0.1) so a shared layout looks the same at any size. Inset aspect equals the stage aspect.
- **R16 Task order deviates from spec §10 only inside D/E:** camera slots (Task 21) and `<Notation>` (Task 22, stage E's tickle side) land before `<Stage>` (Task 23), so every slot kind renders real content from the first Stage commit.
- **R17 Notation clock adapter (controller ruling):** `<Notation>` passes pepperscore a memoized adapter `{ now(); get playing(); subscribe(fn) }`, identity keyed **only** on the provider's `Clock` instance (pepperscore resubscribes on identity change); the score/tempo mapping is read through a ref.
- **R9 pepperscore is not installed by this plan** (0.2 is unpublished). The library imports it only from `src/react/notation/loadPepperscore.ts` (literal `import('pepperscore')`, external in the lib build). Package tests alias it to a stub; the studio's Vite config resolves a missing pepperscore to a module that throws, so `<Notation>` shows `notation-unavailable` and the notation e2e test skips until pepperscore 0.2 is installed.
- **R10 `labels` prop shape:** `labels?: { noteNames?: NoteLabelContent | boolean; chords?: ChordDisplay | boolean }` (`true` → `'pitch'`/`'symbol'`, `false` → `'off'`), overriding `settings.text`.
- **R11 Render crashes** caught by a slot/component error boundary report `code: 'render-failed'` (the spec's list has no code for a crashed view). Camera and notation boundaries keep their own codes.
- **R12 zustand** is a studio dependency only; the library uses a 15-line `ValueStore`.
- **R13 Tokens and classes renamed:** `--tmi-*` → `--ivories-*`, `html.tmi-transparent` → `html.ivories-transparent`, `.theme-<name>` → `.ivories-theme-<name>`; library overlay classes gain the `ivories-` prefix and drop element ids (tests updated in Task 8).
- **R14 The becreative demo block** (stage F) lives in another repo and is listed under "Out of this plan".
- **R15 Shared onset fixture:** `clock-contract.musicxml` + `clock-contract.expected.json` are copied from `/home/shaun/pepperscore-clock/validation/fixtures/` (commit `12bb378`) into `packages/ivories/src/core/io/__fixtures__/`; ivories' tempo-map onsets must match within 1 ms (Task 22). Checked at plan time: today's parser already produces exactly the 11 expected onsets.

---

## File Structure (end state)

```
package.json                     workspaces root (private): scripts, shared devDependencies
vitest.config.ts                 test.projects: packages/ivories, apps/studio
playwright.config.ts             Chromium + fake camera, webServer = studio dev
scripts/check-public-imports.mjs studio may import only ivories, ivories/core, ivories/style.css
e2e/                             Playwright smoke specs
tests/geometry-check.mjs         unchanged oracle
tools/strike-lab.html            unchanged rig (authority)

packages/ivories/                published library, MIT
  package.json  tsconfig.json  tsconfig.build.json  vite.config.ts  README.md  LICENSE
  scripts/css-scope.mjs  scripts/copy-css.mjs  scripts/check-dist.mjs
  src/index.ts                   "." entry: React components + export type * from core
  src/style.css                  every rule under .ivories
  src/test-setup.ts              jsdom: getContext -> null
  src/core/index.ts              "./core" entry
  src/core/{model,io,audio,render,music,settings,platform}/   moved verbatim in Task 2
  src/core/clock/                types, AudioClock, ManualClock, MediaClock, contract helper
  src/core/audio/playback.ts     PlaybackDriver
  src/core/audio/claim.ts        claimPlayback / releasePlayback
  src/core/audio/sharedContext.ts
  src/core/render/stageRenderer.ts  frameLoop.ts  activeNotes.ts
  src/core/io/loadScoreSource.ts
  src/core/errors.ts             IvoriesError
  src/core/layout/               types, layout helpers, reducer, validate, geometry
  src/core/midi/MidiInput.ts     midi/recorder.ts (stretch)
  src/core/camera/streams.ts
  src/react/                     context, IvoriesProvider, hooks, ValueStore, withProvider, boundary
  src/react/views/               StageView, Keyboard, FallingKeys, Transport, Ivories, Stage, CameraSlot
  src/react/notation/            Notation, loadPepperscore, externalClock, pepperscore.stub (test alias)
  src/react/text/                StageText, ChordReadout, googleFont (moved in Task 7)

apps/studio/                     today's app
  package.json  index.html  vite.config.ts  tsconfig*.json  public/
  src/main.tsx  App.tsx  index.css  test-setup.ts
  src/studio/                    hooks extracted from App.tsx (Task 13) + stage store, toolbar
  src/transport/useTransport.ts  binding over AudioClock
  src/settings/useSettings.ts    zustand settings store
  src/platform/registry.ts       plugin loader (unchanged)
  src/ui/  src/debug/  src/embed/EmbedFixture.tsx
```

---
## Stage A — Monorepo, core, clock

### Task 1: Move the app into `apps/studio` (workspace skeleton, pure move)

**Files:**
- Move (git mv): `src/` → `apps/studio/src/`, `index.html`, `public/`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` → `apps/studio/`
- Create: `apps/studio/package.json`, `vitest.config.ts` (root)
- Modify: `package.json` (root), `.gitignore`, `apps/studio/vite.config.ts`, `apps/studio/src/debug/rigSync.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: root scripts `dev`, `build`, `test`, `test:geometry`, `lint`, `sync:rig`; Vitest project named `studio`; the studio workspace at path `apps/studio` (package name `@ivories/studio`, private).

- [ ] **Step 1: Move the files**

```bash
cd /home/shaun/ivories-mvp
mkdir -p apps/studio
git mv src apps/studio/src
git mv index.html public vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json apps/studio/
```

`tools/`, `scripts/`, `docs/`, `tests/` stay at the root.

- [ ] **Step 2: Write the root `package.json`** (replace the whole file; the old `"exports": {"./platform": …}` is dropped here and replaced by `ivories/core` in Task 2)

```json
{
  "name": "tickle-me-ivories",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "npm run dev -w apps/studio --",
    "build": "npm run build -w apps/studio",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:geometry": "node tests/geometry-check.mjs",
    "lint": "oxlint",
    "sync:rig": "cp tools/strike-lab.html apps/studio/public/strike-lab.html && diff -q tools/strike-lab.html apps/studio/public/strike-lab.html"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@testing-library/react": "^16.3.3",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.18",
    "@types/react-dom": "^19.2.7",
    "@vitejs/plugin-react": "^6.1.1",
    "jsdom": "^29.1.1",
    "oxlint": "^1.81.0",
    "playwright": "^1.62.0",
    "tailwindcss": "^4.3.3",
    "typescript": "~6.0.2",
    "vite": "^8.3.0",
    "vitest": "^5.0.0"
  }
}
```

- [ ] **Step 3: Write `apps/studio/package.json`**

```json
{
  "name": "@ivories/studio",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0"
  },
  "dependencies": {
    "@fontsource/poppins": "^5.3.0",
    "@noble/hashes": "^2.4.0",
    "@tonejs/midi": "^2.0.28",
    "fflate": "^0.8.3",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "smplr": "^1.0.0",
    "tonal": "^6.4.3",
    "zustand": "^5.0.15"
  }
}
```

- [ ] **Step 4: Root `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

// One `npm test` at the root runs every workspace (spec §9).
export default defineConfig({
  test: { projects: ['apps/studio'] },
})
```

- [ ] **Step 5: Name the studio test project** — in `apps/studio/vite.config.ts` change the `test` line to:

```ts
  test: { name: 'studio', environment: 'jsdom', globals: true },
```

- [ ] **Step 6: Fix the rig-sync test paths** (`tools/` stays at the root; `public/` moved). Replace the body of `apps/studio/src/debug/rigSync.test.ts` after the imports with:

```ts
/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Spec §16 / preflight F26: tools/strike-lab.html (repo root) is the single
// authority for the tuning rig. apps/studio/public/strike-lab.html is a served
// copy that must never silently diverge from it.
const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url))

describe('strike-lab rig sync', () => {
  it('keeps apps/studio/public/strike-lab.html byte-equal to tools/strike-lab.html', () => {
    const source = readFileSync(at('../../../../tools/strike-lab.html'))
    const served = readFileSync(at('../../public/strike-lab.html'))
    expect(served.equals(source)).toBe(true)
  })
})
```

(`apps/studio/src/debug/` → four `..` reach the repo root.)

- [ ] **Step 7: `.gitignore`** — append:

```
test-results/
playwright-report/
```

- [ ] **Step 8: Reinstall and verify**

Run: `npm install && npm test`
Expected: `Test Files 49 passed (49)`, `Tests 680 passed | 1 skipped (681)`.

Run: `npm run build && npm run test:geometry`
Expected: the studio build succeeds; geometry check prints `all passed`.

Run: `npm run dev -- --port 5183 --strictPort` (stop it after it prints the Network URL)
Expected: Vite listens on `0.0.0.0:5183`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: move the app into apps/studio as an npm workspace

Pure move (git mv) plus workspace wiring: root workspaces package.json,
Vitest projects config, rig-sync test paths. 680 tests still pass.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Create the `ivories` package and move the core modules (pure move + import rewrite)

**Files:**
- Create: `packages/ivories/package.json`, `packages/ivories/tsconfig.json`, `packages/ivories/vite.config.ts`, `packages/ivories/src/core/index.ts`
- Move (git mv, tests and fixtures move with their modules) from `apps/studio/src/` to `packages/ivories/src/core/`:
  - `model/` (all files)
  - `io/` (all files, including `__fixtures__/`)
  - `audio/` (all files)
  - `music/` (all files)
  - `render/colors.ts`, `colors.test.ts`, `geometry.ts`, `geometry.test.ts`, `keyboard.ts`, `keyboard.test.ts`, `pianoRoll.ts`, `pianoRoll.test.ts`, `pianoRoll.test-helpers.ts`, `shapes.ts`, `theme.ts`, `theme.test.ts`
  - `settings/types.ts`, `settings/profile.ts`, `settings/profile.test.ts`
  - `platform/codec.ts`, `errors.ts`, `errors.test.ts`, `look.ts`, `look.test.ts`, `scene.ts`, `scene.test.ts`, `songRef.ts`, `songRef.test.ts`, `types.ts`, `types.test.ts`, `smoke.test.ts`, `local/` (all files)
- Stay in the studio: `render/useCanvasStage.ts`, `settings/useSettings.ts` (+ test), `transport/`, `platform/registry.ts` (+ test), `ui/`, `debug/`, `App.tsx`, `App.test.tsx`, `main.tsx`, `index.css`, `smoke.test.ts`.
- Modify: every studio file that imported a moved module; `apps/studio/src/App.test.tsx` mocks; `apps/studio/vite.config.ts`; `apps/studio/tsconfig.app.json`; `apps/studio/package.json`; root `vitest.config.ts`; `packages/ivories/src/core/platform/smoke.test.ts`.

**Interfaces:**
- Consumes: Task 1 layout.
- Produces: package `ivories` with export `"./core"` → `packages/ivories/src/core/index.ts` under the `source` condition. Every former module is reachable as a named export of `ivories/core` (e.g. `import { AudioEngine, Scheduler, LOOKAHEAD_SEC, parseScoreFile, drawStage, computeLayout, readTheme, decodeScene, LocalStorageProvider } from 'ivories/core'`). Vitest project `ivories`.

- [ ] **Step 1: Move the modules**

```bash
cd /home/shaun/ivories-mvp
S=apps/studio/src; C=packages/ivories/src/core
mkdir -p $C/render $C/settings $C/platform
git mv $S/model $S/io $S/audio $S/music $C/
for f in colors colors.test geometry geometry.test keyboard keyboard.test pianoRoll pianoRoll.test pianoRoll.test-helpers shapes theme theme.test; do git mv $S/render/$f.ts $C/render/$f.ts; done
git mv $S/settings/types.ts $S/settings/profile.ts $S/settings/profile.test.ts $C/settings/
for f in codec errors errors.test look look.test scene scene.test songRef songRef.test types types.test smoke.test; do git mv $S/platform/$f.ts $C/platform/$f.ts; done
git mv $S/platform/local $C/platform/local
```

Relative imports *inside* the moved tree stay valid (same relative layout). `settings/profile.ts` imports only `./types`, `../model/*` and `smplr`; `render/*` imports `../settings/types` — all moved together.

- [ ] **Step 2: `packages/ivories/package.json`**

```json
{
  "name": "ivories",
  "version": "0.1.0",
  "description": "Falling keys, keyboard, notation and stage layouts for React, on one shared clock.",
  "license": "MIT",
  "type": "module",
  "sideEffects": ["*.css"],
  "exports": {
    "./core": {
      "source": "./src/core/index.ts",
      "types": "./dist/types/core/index.d.ts",
      "import": "./dist/core.js"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "check": "tsc -p tsconfig.json"
  },
  "peerDependencies": {
    "react": ">=19",
    "react-dom": ">=19"
  },
  "dependencies": {
    "@noble/hashes": "^2.4.0",
    "@tonejs/midi": "^2.0.28",
    "fflate": "^0.8.3",
    "smplr": "^1.0.0",
    "tonal": "^6.4.3"
  },
  "devDependencies": {
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  }
}
```

`"source"` must be the **first** key of each export so TypeScript (`customConditions`) and Vite pick the `.ts` file before `types`/`import`.

- [ ] **Step 3: `packages/ivories/tsconfig.json`** (same compiler options as the studio app config; this is the library's real typecheck)

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "types": ["vite/client", "node"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `packages/ivories/vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { name: 'ivories', environment: 'jsdom', globals: true },
})
```

- [ ] **Step 5: `packages/ivories/src/core/index.ts`**

```ts
// "ivories/core": framework-free model, io, audio, render, music, settings and
// platform modules (spec §3). Nothing here touches window/document at import.
export * from './model/types'
export * from './model/tempoMap'
export * from './model/countIn'
export * from './model/timeSignatures'
export * from './model/search'
export * from './io/parseMidi'
export * from './io/parseMusicXml'
export * from './io/loadScoreFile'
export * from './io/hashFile'
export * from './io/handSplit'
export * from './audio/engine'
export * from './audio/scheduler'
export * from './audio/metronome'
export * from './render/geometry'
export * from './render/pianoRoll'
export * from './render/keyboard'
export * from './render/colors'
export * from './render/shapes'
export * from './render/theme'
export * from './music/spell'
export * from './music/chords'
export * from './music/chordFeed'
export * from './music/keyOf'
export * from './music/romanNumerals'
export * from './settings/types'
export * from './settings/profile'
export * from './platform/types'
export * from './platform/codec'
export * from './platform/songRef'
export * from './platform/scene'
export * from './platform/look'
export * from './platform/local/LocalStorageProvider'
export * from './platform/local/HashShareProvider'
```

(`platform/errors` is re-exported by `platform/types`; `scene`/`look`/`profile` re-export the same symbols as `types` — duplicates of the *same* declaration are not ambiguous. If `tsc` nevertheless reports TS2308 for a name, delete the later `export *` line that re-exports it and add an explicit `export { Name } from '…'` for anything that then goes missing.)

- [ ] **Step 6: Point the studio at the package**

`apps/studio/package.json` → add to `dependencies`: `"ivories": "*"` (keep the others; `smplr` stays because `ui/VoicePanel.tsx` imports `getSoundfontNames` from it).

`apps/studio/vite.config.ts` (whole file):

```ts
/// <reference types="vitest/config" />
import { defineConfig, defaultClientConditions, defaultServerConditions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// "source" makes the workspace package resolve to its TypeScript sources
// (packages/ivories/package.json exports) -- no alias into packages/ivories/src.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { conditions: ['source', ...defaultClientConditions] },
  ssr: { resolve: { conditions: ['source', ...defaultServerConditions], externalConditions: ['source'] } },
  server: { host: '0.0.0.0' },
  test: { name: 'studio', environment: 'jsdom', globals: true },
})
```

`apps/studio/tsconfig.app.json` → add `"customConditions": ["source"],` to `compilerOptions` (after `"moduleResolution": "bundler"`).

Root `vitest.config.ts` → `test: { projects: ['packages/ivories', 'apps/studio'] }`.

Run `npm install` so `node_modules/ivories` links to `packages/ivories`.

- [ ] **Step 7: Rewrite studio imports.** Save as `/tmp/rewrite-core-imports.mjs` and run it with `node /tmp/rewrite-core-imports.mjs` from the repo root:

```js
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MOVED = /^(\.\.?\/)+(model\/[A-Za-z]+|io\/[A-Za-z]+|audio\/[A-Za-z]+|music\/[A-Za-z]+|settings\/(types|profile)|platform\/(types|errors|codec|songRef|scene|look|local\/[A-Za-z]+)|render\/(colors|geometry|keyboard|pianoRoll|shapes|theme))$/
const walk = (d, out = []) => {
  for (const e of readdirSync(d)) {
    const f = join(d, e)
    if (statSync(f).isDirectory()) walk(f, out)
    else if (/\.(ts|tsx)$/.test(e)) out.push(f)
  }
  return out
}
for (const file of walk('apps/studio/src')) {
  const before = readFileSync(file, 'utf8')
  const after = before.replace(/(from\s+|import\(\s*|import\s+)(['"])([^'"]+)\2/g, (m, lead, q, spec) =>
    MOVED.test(spec) ? `${lead}${q}ivories/core${q}` : m)
  if (after !== before) { writeFileSync(file, after); console.log('rewrote', file) }
}
```

Then fix by hand, in `apps/studio/src/App.test.tsx`, the two mocks of moved modules (the script only rewrites imports). Replace the `vi.mock('./audio/engine', …)` and `vi.mock('./audio/metronome', …)` blocks with one block:

```ts
vi.mock('ivories/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ivories/core')>()),
  AudioEngine: function AudioEngine() { return engine },
  // Records the metronome's clicks instead of building oscillators.
  MetronomeVoice: function MetronomeVoice() {
    return { click: (time: number, accent: boolean) => { clicks.push({ time, accent }) }, stop: () => {} }
  },
}))
```

Keep the `clicks` `vi.hoisted` declaration above it. Search the studio for `typeof import('./` and `vi.mock('../` with `grep -rn "vi.mock\|typeof import" apps/studio/src` and point any remaining moved-module path at `'ivories/core'` the same way.

- [ ] **Step 8: Keep the "never imports @pepperhorn" check covering the whole package.** In `packages/ivories/src/core/platform/smoke.test.ts` change `const srcRoot = resolve(here, '..')` to `const srcRoot = resolve(here, '../..')` (it now scans `packages/ivories/src`) and the `it` title to `'contains no occurrence of the literal anywhere under packages/ivories/src'`. Then copy it for the studio:

```bash
cp packages/ivories/src/core/platform/smoke.test.ts apps/studio/src/pepperhornScope.test.ts
```

and in the copy set `const srcRoot = here` (it lives in `apps/studio/src`) and the title to `'… under apps/studio/src'`. (This adds one test: 681 passed.)

- [ ] **Step 9: Verify**

Run: `npm test`
Expected: 50 test files; `681 passed | 1 skipped` (680 + the studio scope copy). Both projects `ivories` and `studio` appear in the output.

If the studio project fails with `Failed to resolve entry for package "ivories"` or tries to load `dist/core.js`, the `source` condition is not reaching Vitest's web environment: add `test.server.deps.inline: ['ivories']` to the studio `test` block and re-run (do **not** add an alias).

Run: `npm run build && npm run check -w packages/ivories && npm run test:geometry`
Expected: all succeed.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: move core modules into the ivories package

git mv of model, io, audio, music, pure render, settings types/profile and
platform codecs/providers into packages/ivories/src/core, exposed as
ivories/core via a "source" export condition. Studio imports rewritten.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Public-entry import check

**Files:**
- Create: `scripts/check-public-imports.mjs`
- Modify: root `package.json` (scripts `check:imports`, `check`)

**Interfaces:**
- Consumes: Task 2 package layout.
- Produces: `npm run check:imports` (exit 1 on a violation); `npm run check` = geometry + imports (+ CSS scope from Task 8).

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// Spec §2: the studio may import only the package's public entry points
// (ivories, ivories/core, ivories/style.css) and must never reach into
// packages/ivories/src. Also re-checks the "@pepperhorn never" rule.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const STUDIO = join(ROOT, 'apps', 'studio')
const ALLOWED = new Set(['ivories', 'ivories/core', 'ivories/style.css'])
const NEEDLE = '@pepper' + 'horn'
const SPEC_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|vi\.(?:mock|doMock|importActual)\(\s*['"]([^'"]+)['"]/g

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue
    const f = join(dir, e)
    if (statSync(f).isDirectory()) walk(f, out)
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(e)) out.push(f)
  }
  return out
}

const problems = []
const files = [...walk(join(STUDIO, 'src')), join(STUDIO, 'vite.config.ts')]
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file)
  if (text.includes(NEEDLE) && !rel.endsWith('pepperhornScope.test.ts')) problems.push(`${rel}: mentions the PepperHorn scope`)
  for (const m of text.matchAll(SPEC_RE)) {
    const spec = m[1] ?? m[2] ?? m[3]
    if (spec.startsWith('.')) {
      const target = resolve(dirname(file), spec)
      if (!(target + sep).startsWith(STUDIO + sep)) problems.push(`${rel}: relative import leaves apps/studio: ${spec}`)
    } else if (spec === 'ivories' || spec.startsWith('ivories/')) {
      if (!ALLOWED.has(spec)) problems.push(`${rel}: deep import ${spec} (allowed: ${[...ALLOWED].join(', ')})`)
    } else if (spec.includes('packages/ivories')) {
      problems.push(`${rel}: path into packages/ivories: ${spec}`)
    }
  }
}
for (const cfg of ['tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json']) {
  const text = readFileSync(join(STUDIO, cfg), 'utf8')
  if (/"paths"\s*:/.test(text) || text.includes('packages/ivories')) problems.push(`apps/studio/${cfg}: must not alias into the package`)
}
if (problems.length) {
  console.error(`Public-entry import check failed:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`Public-entry import check: ${files.length} studio files import only ${[...ALLOWED].join(', ')}`)
```

- [ ] **Step 2: Prove it fails on a violation.** Temporarily add `import { Scheduler } from 'ivories/src/core/audio/scheduler'` as the first line of `apps/studio/src/main.tsx`.

Run: `node scripts/check-public-imports.mjs; echo exit=$?`
Expected: `deep import ivories/src/core/audio/scheduler` and `exit=1`.

Revert the line (`git checkout apps/studio/src/main.tsx`).

- [ ] **Step 3: Prove it passes**

Run: `node scripts/check-public-imports.mjs; echo exit=$?`
Expected: `Public-entry import check: … studio files …` and `exit=0`.

- [ ] **Step 4: Wire the scripts.** Root `package.json` scripts gain:

```json
"check:imports": "node scripts/check-public-imports.mjs",
"check": "npm run test:geometry && npm run check:imports"
```

and `"build"` becomes `"npm run check:imports && npm run build -w apps/studio"`.

Run: `npm run check && npm run build`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-public-imports.mjs package.json
git commit -m "$(cat <<'EOF'
build: enforce studio imports of ivories public entries only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 4: `Clock` interface, `AudioClock`, shared contract suite

**Files:**
- Create: `packages/ivories/src/core/clock/types.ts`, `packages/ivories/src/core/clock/listeners.ts`, `packages/ivories/src/core/clock/AudioClock.ts`, `packages/ivories/src/core/clock/clockContract.test-helpers.ts`
- Test: `packages/ivories/src/core/clock/AudioClock.test.ts`
- Modify: `packages/ivories/src/core/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `ivories/core`):
  - `type ClockEventType = 'play' | 'pause' | 'seek' | 'rate'`; `interface ClockEvent { type: ClockEventType; time: number }` (`time` = score-time position at the event)
  - `interface Clock { now(): number; readonly playing: boolean; readonly rate: number; play(): void; pause(): void; seek(t: number): void; setRate(r: number): void; subscribe(fn: (e: ClockEvent) => void): () => void; dispose(): void }`
  - `MIN_RATE = 0.1`, `MAX_RATE = 4`, `clampRate(r: number): number`
  - `class ClockListeners { add(fn): () => void; emit(e: ClockEvent): void; clear(): void }`
  - `interface TimeSource { readonly currentTime: number }`; `interface AudioClockAnchors { playing: boolean; originSec: number; pausedAtSec: number; rate: number }`; `interface AudioClockOptions { isRunning?: () => boolean; wallNow?: () => number }`
  - `class AudioClock implements Clock` with extras: `originSec`, `pausedAtSec`, `silentFallback` getters; `anchors(): AudioClockAnchors`; `load(a: AudioClockAnchors): void` (silent); `positionAt(sourceTime: number): number`; `sourceTime(): number`; `playAt(now: number, silent?: boolean)`, `pauseAt(now)`, `seekAt(sec, now)`, `setRateAt(r, now)`
  - Test helper: `describeClockContract(name: string, make: () => ClockHarness)`, `interface ClockHarness { clock: Clock; advance(sec: number): void; cleanup?(): void }`

- [ ] **Step 1: `clock/types.ts`**

```ts
// Spec §3.1, with the controller's ruling: now() is SCORE-TIME seconds, the
// position on the score's own tempo map at rate 1. `rate` changes only how
// fast score-time advances; seek(t) takes score-time. Negative times (the
// count-in) are legal.
export type ClockEventType = 'play' | 'pause' | 'seek' | 'rate'

export interface ClockEvent {
  type: ClockEventType
  /** Score-time position at the moment of the event. */
  time: number
}

export interface Clock {
  now(): number
  readonly playing: boolean
  /** Tempo multiplier: score-seconds per wall-second. */
  readonly rate: number
  play(): void
  pause(): void
  seek(t: number): void
  setRate(r: number): void
  subscribe(fn: (e: ClockEvent) => void): () => void
  dispose(): void
}

export const MIN_RATE = 0.1
export const MAX_RATE = 4

export function clampRate(r: number): number {
  return Number.isFinite(r) ? Math.min(MAX_RATE, Math.max(MIN_RATE, r)) : 1
}
```

- [ ] **Step 2: `clock/listeners.ts`**

```ts
import type { ClockEvent } from './types'

/** A throwing subscriber must not stop the others (a view crashing must not
    stop the scheduler hearing a seek). */
export class ClockListeners {
  private readonly fns = new Set<(e: ClockEvent) => void>()

  add(fn: (e: ClockEvent) => void): () => void {
    this.fns.add(fn)
    return () => { this.fns.delete(fn) }
  }

  emit(e: ClockEvent): void {
    for (const fn of [...this.fns]) {
      try { fn(e) } catch (err) { console.error('ivories: clock subscriber threw', err) }
    }
  }

  clear(): void { this.fns.clear() }
}
```

- [ ] **Step 3: Write the contract helper `clock/clockContract.test-helpers.ts`** (the same suite runs against all three clocks; Task 15 adds the other two)

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Clock, ClockEvent } from './types'

export interface ClockHarness {
  clock: Clock
  /** Moves wall time forward by `sec` seconds. */
  advance(sec: number): void
  cleanup?(): void
}

export function describeClockContract(name: string, make: () => ClockHarness): void {
  describe(`${name}: Clock contract (spec §3.1)`, () => {
    let h: ClockHarness
    beforeEach(() => { h = make() })
    afterEach(() => { h.clock.dispose(); h.cleanup?.() })

    it('starts paused at 0 and does not move while paused', () => {
      expect(h.clock.playing).toBe(false)
      expect(h.clock.now()).toBeCloseTo(0, 9)
      h.advance(2)
      expect(h.clock.now()).toBeCloseTo(0, 9)
    })

    it('advances one score-second per wall-second at rate 1', () => {
      h.clock.play()
      h.advance(1.5)
      expect(h.clock.playing).toBe(true)
      expect(h.clock.now()).toBeCloseTo(1.5, 6)
    })

    it('rate 0.5 for one wall-second advances now() by 0.5 score-seconds', () => {
      h.clock.setRate(0.5)
      h.clock.play()
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(0.5, 6)
    })

    it('seek while paused moves the position and stays put', () => {
      h.clock.seek(4)
      expect(h.clock.now()).toBeCloseTo(4, 6)
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(4, 6)
      expect(h.clock.playing).toBe(false)
    })

    it('seek while playing jumps and keeps playing from the target', () => {
      h.clock.play()
      h.advance(1)
      h.clock.seek(10)
      expect(h.clock.now()).toBeCloseTo(10, 6)
      expect(h.clock.playing).toBe(true)
      h.advance(0.5)
      expect(h.clock.now()).toBeCloseTo(10.5, 6)
    })

    it('pause freezes the position and play resumes from it', () => {
      h.clock.play()
      h.advance(2)
      h.clock.pause()
      h.advance(5)
      expect(h.clock.now()).toBeCloseTo(2, 6)
      h.clock.play()
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(3, 6)
    })

    it('a rate change mid-play keeps the position continuous', () => {
      h.clock.play()
      h.advance(2)
      const before = h.clock.now()
      h.clock.setRate(2)
      expect(h.clock.now()).toBeCloseTo(before, 6)
      expect(h.clock.rate).toBe(2)
      h.advance(1)
      expect(h.clock.now()).toBeCloseTo(before + 2, 6)
    })

    it('notifies play, seek, rate and pause with the position; unsubscribe stops delivery', () => {
      const seen: ClockEvent[] = []
      const off = h.clock.subscribe((e) => seen.push(e))
      h.clock.play()
      h.advance(1)
      h.clock.seek(3)
      h.clock.setRate(2)
      h.clock.pause()
      expect(seen.map((e) => e.type)).toEqual(['play', 'seek', 'rate', 'pause'])
      expect(seen[0].time).toBeCloseTo(0, 6)
      expect(seen[1].time).toBeCloseTo(3, 6)
      expect(seen[2].time).toBeCloseTo(3, 6)
      expect(seen[3].time).toBeCloseTo(3, 6)
      off()
      h.clock.play()
      expect(seen).toHaveLength(4)
    })

    it('dispose stops notifications', () => {
      const fn = vi.fn()
      h.clock.subscribe(fn)
      h.clock.dispose()
      h.clock.play()
      h.clock.seek(2)
      expect(fn).not.toHaveBeenCalled()
    })
  })
}
```

- [ ] **Step 4: Write the failing test `clock/AudioClock.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { AudioClock } from './AudioClock'
import { describeClockContract } from './clockContract.test-helpers'

describeClockContract('AudioClock', () => {
  const src = { currentTime: 100 }
  return { clock: new AudioClock(src), advance: (s) => { src.currentTime += s } }
})

describe('AudioClock specifics', () => {
  it('anchors exactly like the old transport: origin = now - pausedAt / rate', () => {
    const src = { currentTime: 0 }
    const c = new AudioClock(src)
    c.seekAt(-2, 10)
    c.playAt(10)
    expect(c.originSec).toBe(12)
    expect(c.positionAt(10)).toBe(-2)
    expect(c.positionAt(12)).toBe(0)
  })

  it('load() replaces the anchors without notifying', () => {
    const c = new AudioClock({ currentTime: 5 })
    let n = 0
    c.subscribe(() => { n++ })
    c.load({ playing: true, originSec: 1, pausedAtSec: 0, rate: 1 })
    expect(n).toBe(0)
    expect(c.now()).toBeCloseTo(4, 9)
  })

  it('runs a play session on the wall clock when audio is not running (spec §8)', () => {
    let wall = 50
    const src = { currentTime: 7 }   // a suspended context does not advance
    const c = new AudioClock(src, { isRunning: () => false, wallNow: () => wall })
    c.play()
    expect(c.silentFallback).toBe(true)
    wall += 1.25
    expect(c.now()).toBeCloseTo(1.25, 9)
    c.pause()
    expect(c.silentFallback).toBe(false)
    expect(c.now()).toBeCloseTo(1.25, 9)
  })

  it('ignores a non-finite seek and clamps a silly rate', () => {
    const c = new AudioClock({ currentTime: 0 })
    c.seek(Number.NaN)
    expect(c.now()).toBe(0)
    c.setRate(1000)
    expect(c.rate).toBe(4)
    c.setRate(Number.NaN)
    expect(c.rate).toBe(1)
  })
})
```

Run: `npx vitest run --project ivories src/core/clock`
Expected: FAIL — `Cannot find module './AudioClock'`.

- [ ] **Step 5: Implement `clock/AudioClock.ts`**

```ts
import { ClockListeners } from './listeners'
import { clampRate } from './types'
import type { Clock, ClockEvent, ClockEventType } from './types'

/** Anything with an advancing `currentTime` in seconds: an AudioContext, or the AudioEngine. */
export interface TimeSource { readonly currentTime: number }

export interface AudioClockAnchors {
  playing: boolean
  /** Source time at which the position would be 0 at the current rate. */
  originSec: number
  /** The position while paused; the play-session start while playing. */
  pausedAtSec: number
  rate: number
}

export interface AudioClockOptions {
  /** False while the source does not advance (a suspended AudioContext). A play()
      then runs that session on the wall clock, so visuals move silently. */
  isRunning?: () => boolean
  /** Wall clock in seconds. Default performance.now() / 1000. */
  wallNow?: () => number
}

const defaultWallNow = () => performance.now() / 1000

/**
 * The transport math that used to live in useTransport (spec §3.1):
 * position = (sourceTime - originSec) * rate while playing, pausedAtSec while
 * paused. The `*At(now)` methods take the caller's source time so the studio
 * store keeps its explicit-time API; play/pause/seek/setRate read the source.
 */
export class AudioClock implements Clock {
  private a: AudioClockAnchors = { playing: false, originSec: 0, pausedAtSec: 0, rate: 1 }
  private silent = false
  private disposed = false
  private readonly listeners = new ClockListeners()
  private readonly source: TimeSource
  private readonly opts: AudioClockOptions

  constructor(source: TimeSource, opts: AudioClockOptions = {}) {
    this.source = source
    this.opts = opts
  }

  get playing(): boolean { return this.a.playing }
  get rate(): number { return this.a.rate }
  get originSec(): number { return this.a.originSec }
  get pausedAtSec(): number { return this.a.pausedAtSec }
  /** True while the current play session runs on the wall clock. */
  get silentFallback(): boolean { return this.silent }

  anchors(): AudioClockAnchors { return { ...this.a } }

  /** Replaces the anchors without notifying anyone. */
  load(a: AudioClockAnchors): void {
    this.a = { playing: a.playing, originSec: a.originSec, pausedAtSec: a.pausedAtSec, rate: clampRate(a.rate) }
  }

  /** The time base of the current session. */
  sourceTime(): number {
    return this.silent ? (this.opts.wallNow ?? defaultWallNow)() : this.source.currentTime
  }

  positionAt(now: number): number {
    return this.a.playing ? (now - this.a.originSec) * this.a.rate : this.a.pausedAtSec
  }

  now(): number { return this.positionAt(this.sourceTime()) }

  playAt(now: number, silent = false): void {
    if (this.disposed || this.a.playing) return
    this.silent = silent
    this.a = { ...this.a, playing: true, originSec: now - this.a.pausedAtSec / this.a.rate }
    this.emit('play', this.a.pausedAtSec)
  }

  pauseAt(now: number): void {
    if (this.disposed || !this.a.playing) return
    const at = this.positionAt(now)
    this.a = { ...this.a, playing: false, pausedAtSec: at }
    this.silent = false
    this.emit('pause', at)
  }

  seekAt(sec: number, now: number): void {
    if (this.disposed || !Number.isFinite(sec)) return
    this.a = this.a.playing
      ? { ...this.a, pausedAtSec: sec, originSec: now - sec / this.a.rate }
      : { ...this.a, pausedAtSec: sec }
    this.emit('seek', sec)
  }

  setRateAt(r: number, now: number): void {
    if (this.disposed) return
    const rate = clampRate(r)
    const pos = this.positionAt(now)
    this.a = this.a.playing
      ? { ...this.a, rate, pausedAtSec: pos, originSec: now - pos / rate }
      : { ...this.a, rate, pausedAtSec: pos }
    this.emit('rate', pos)
  }

  play(): void {
    if (this.a.playing) return
    const silent = this.opts.isRunning ? !this.opts.isRunning() : false
    this.playAt(silent ? (this.opts.wallNow ?? defaultWallNow)() : this.source.currentTime, silent)
  }

  pause(): void { this.pauseAt(this.sourceTime()) }
  seek(t: number): void { this.seekAt(t, this.sourceTime()) }
  setRate(r: number): void { this.setRateAt(r, this.sourceTime()) }

  subscribe(fn: (e: ClockEvent) => void): () => void {
    if (this.disposed) return () => {}
    return this.listeners.add(fn)
  }

  dispose(): void {
    this.disposed = true
    this.listeners.clear()
  }

  private emit(type: ClockEventType, time: number): void {
    this.listeners.emit({ type, time })
  }
}
```

- [ ] **Step 6: Export from `core/index.ts`** — append:

```ts
export * from './clock/types'
export * from './clock/listeners'
export * from './clock/AudioClock'
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run --project ivories src/core/clock && npm test`
Expected: the 9 contract tests + 4 specifics pass; whole suite green (681 + 13).

- [ ] **Step 8: Commit**

```bash
git add packages/ivories/src/core/clock packages/ivories/src/core/index.ts
git commit -m "$(cat <<'EOF'
feat(core): Clock interface, AudioClock and the shared contract suite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `useTransport` becomes a binding over `AudioClock`

**Files:**
- Modify: `apps/studio/src/transport/useTransport.ts`, `apps/studio/src/App.tsx` (create + bind the clock)
- Test: `apps/studio/src/transport/useTransport.test.ts` (existing tests unchanged; new `describe` appended)

**Interfaces:**
- Consumes: `AudioClock`, `AudioClockAnchors` (Task 4).
- Produces:
  - `TransportState` gains `rate: number` (default 1)
  - `playheadAt(s: { playing: boolean; originSec: number; pausedAtSec: number; rate?: number }, now: number): number` = `playing ? (now - originSec) * (rate ?? 1) : pausedAtSec`
  - `bindTransportClock(clock: AudioClock): () => void` (returns unbind); `transportClock(): AudioClock`
  - All existing actions keep their signatures.

- [ ] **Step 1: Append the failing tests** to `useTransport.test.ts` (add `AudioClock` to an import from `'ivories/core'` and `bindTransportClock, transportClock` to the `./useTransport` import):

```ts
describe('binding over an AudioClock (spec §3.1)', () => {
  it('mirrors the store into the bound clock and back', () => {
    const src = { currentTime: 0 }
    const clock = new AudioClock(src)
    const unbind = bindTransportClock(clock)
    try {
      useTransport.getState().loadScore(score())
      useTransport.getState().play(10)
      expect(clock.playing).toBe(true)
      src.currentTime = 11.5
      expect(clock.now()).toBeCloseTo(1.5, 9)
      // A host driving the clock directly is reflected in the store.
      clock.pause()
      expect(useTransport.getState().playing).toBe(false)
      expect(useTransport.getState().pausedAtSec).toBeCloseTo(1.5, 9)
      clock.seek(3)
      expect(playheadAt(useTransport.getState(), 99)).toBeCloseTo(3, 9)
    } finally { unbind() }
  })

  it('a store reset is never undone by stale clock anchors', () => {
    const clock = new AudioClock({ currentTime: 0 })
    const unbind = bindTransportClock(clock)
    try {
      useTransport.getState().loadScore(score())
      useTransport.getState().play(0)
      useTransport.setState({ playing: false, originSec: 0, pausedAtSec: 0 })
      useTransport.getState().play(50)
      expect(playheadAt(useTransport.getState(), 51)).toBeCloseTo(1, 9)
    } finally { unbind() }
  })

  it('playheadAt honours a clock rate', () => {
    expect(playheadAt({ playing: true, originSec: 10, pausedAtSec: 0, rate: 0.5 }, 12)).toBeCloseTo(1, 9)
  })

  it('setTempo moves the clock to the same musical moment', () => {
    const clock = new AudioClock({ currentTime: 0 })
    const unbind = bindTransportClock(clock)
    try {
      useTransport.getState().loadScore(score())
      useTransport.getState().seek(4, 0)
      useTransport.getState().setTempo({ mode: 'scale', scale: 2 }, 0)
      expect(clock.now()).toBeCloseTo(2, 6)
    } finally { unbind() }
  })

  it('exposes the default clock when none is bound', () => {
    expect(transportClock()).toBeInstanceOf(AudioClock)
  })
})
```

Run: `npx vitest run --project studio src/transport`
Expected: FAIL — `bindTransportClock` is not exported.

- [ ] **Step 2: Implement.** In `useTransport.ts`:
  - change the imports to `import { AudioClock, retimeScore, secToTicks, ticksToSec } from 'ivories/core'` and `import type { AudioClockAnchors, DisplayMode, ScoreDocument, TempoSetting, Voice } from 'ivories/core'`;
  - add `rate: number` to `TransportState` (doc: `/** Clock rate (hosts / library Transport). The studio's tempo control retimes instead. */`) and `rate: 1,` to the initial state;
  - replace `playheadAt` and add the binding helpers above the store:

```ts
/** The playhead is derived, never stored while running. */
export function playheadAt(
  s: { playing: boolean; originSec: number; pausedAtSec: number; rate?: number }, now: number,
): number {
  return s.playing ? (now - s.originSec) * (s.rate ?? 1) : s.pausedAtSec
}

const anchorsOf = (c: AudioClock): Pick<TransportState, 'playing' | 'originSec' | 'pausedAtSec' | 'rate'> => {
  const a = c.anchors()
  return { playing: a.playing, originSec: a.originSec, pausedAtSec: a.pausedAtSec, rate: a.rate }
}

const IDLE_SOURCE = { currentTime: 0 }
let clock = new AudioClock(IDLE_SOURCE)
let unsubscribe: () => void = () => {}

/** The clock the store currently drives. */
export function transportClock(): AudioClock { return clock }

/**
 * Binds the store to the app's AudioClock (spec §3.1: "a thin React binding
 * over an AudioClock"). The store's anchors are loaded into the clock at bind
 * time; afterwards every clock event (including one a host or the library
 * Transport causes) is mirrored back into the store.
 */
export function bindTransportClock(next: AudioClock): () => void {
  unsubscribe()
  clock = next
  next.load(storeAnchors(useTransport.getState()))
  unsubscribe = next.subscribe(() => useTransport.setState(anchorsOf(next)))
  return () => {
    if (clock !== next) return
    unsubscribe()
    unsubscribe = () => {}
    clock = new AudioClock(IDLE_SOURCE)
  }
}

function storeAnchors(s: TransportState): AudioClockAnchors {
  return { playing: s.playing, originSec: s.originSec, pausedAtSec: s.pausedAtSec, rate: s.rate ?? 1 }
}

/** The store is authoritative for its own actions: load it into the clock first,
    so a store reset (tests, clearScore) is never undone by stale clock anchors. */
function synced(s: TransportState): AudioClock {
  clock.load(storeAnchors(s))
  return clock
}
```

  - replace the action bodies:

```ts
  loadScore: (incoming) => {
    const s = get()
    const score = retimeScore(incoming, s.tempo)
    clock.load({ playing: false, originSec: 0, pausedAtSec: 0, rate: s.rate ?? 1 })
    set({ score, playing: false, pausedAtSec: 0, originSec: 0, maxNoteDur: longestNoteSec(score) })
  },

  clearScore: () => {
    clock.load({ playing: false, originSec: 0, pausedAtSec: 0, rate: get().rate ?? 1 })
    set({ score: null, playing: false, pausedAtSec: 0, originSec: 0, maxNoteDur: 0 })
  },

  play: (now, leadInSec = 0) => {
    const s = get()
    const c = synced(s)
    if (s.pausedAtSec <= 0 && leadInSec > 0) c.seekAt(-leadInSec, now)
    c.playAt(now)
    set(anchorsOf(c))
  },

  // Clamped: a pause inside the lead-in parks at 0, so the next play counts in again.
  pause: (now) => {
    const c = synced(get())
    c.pauseAt(now)
    if (c.pausedAtSec < 0) c.seekAt(0, now)
    set(anchorsOf(c))
  },

  seek: (sec, now) => {
    const s = get()
    const c = synced(s)
    c.seekAt(clampToScore(s, sec), now)
    set(anchorsOf(c))
  },

  setTempo: (setting, now) => {
    const s = get()
    if (!s.score) { set({ tempo: setting }); return }
    const ticks = secToTicks(s.score.tempoMap, s.score.ppq, playheadAt(s, now), s.tempo)
    const score = retimeScore(s.score, setting)
    const target = ticksToSec(score.tempoMap, score.ppq, ticks, setting)
    const c = synced(s)
    // Score first, so a clock subscriber reacting to the seek sees the new notes.
    set({ tempo: setting, score, maxNoteDur: longestNoteSec(score) })
    c.seekAt(target, now)
    set(anchorsOf(c))
  },
```

  Keep the original doc comments on each action. `setMode`, `setFallSeconds`, `updateVoice` are unchanged.

- [ ] **Step 3: Bind the app's clock** in `App.tsx`. Add `AudioClock` to the `'ivories/core'` import and `bindTransportClock` to the `./transport/useTransport` import, then directly after the existing `const engine = engineRef.current` line add:

```ts
  const clockRef = useRef<AudioClock | null>(null)
  if (!clockRef.current) clockRef.current = new AudioClock(engine)
  const clock = clockRef.current
  // Bound in an effect, not during render: StrictMode renders twice.
  useEffect(() => bindTransportClock(clock), [clock])
```

Place this effect **before** every other `useEffect` in `App` so it runs first on mount.

- [ ] **Step 4: Run tests**

Run: `npx vitest run --project studio && npm test`
Expected: every existing `useTransport.test.ts` and `App.test.tsx` test still passes, plus the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/transport apps/studio/src/App.tsx
git commit -m "$(cat <<'EOF'
refactor(studio): useTransport binds to an AudioClock

The store keeps its explicit-time API; the transport math now lives in
AudioClock and clock events (from any driver) are mirrored into the store.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `PlaybackDriver` — the scheduler and metronome consume a `Clock`

**Files:**
- Create: `packages/ivories/src/core/audio/playback.ts`
- Test: `packages/ivories/src/core/audio/playback.test.ts`
- Modify: `packages/ivories/src/core/audio/engine.ts` (`play(..., rate)`, `metronome()`), `packages/ivories/src/core/audio/engine.test.ts` (one new test), `packages/ivories/src/core/index.ts`, `apps/studio/src/App.tsx` (original lines 190–252, 439–457, 505–541, 569–585 as modified by Task 5), `apps/studio/src/App.test.tsx` (fake engine)

**Interfaces:**
- Consumes: `Clock`, `ClockEvent`, `AudioClock` (Task 4); `Scheduler`, `TICK_MS`, `BeatCursor`, `beatTimes`, `countInBeats`, `leadInFor`.
- Produces:
  - `AudioEngine.play(s: ScheduledNote, voice: Voice, originSec: number, rate = 1): void` — time `originSec + atSec / rate`, duration `/ rate`
  - `AudioEngine.metronome(): MetronomeVoice` (lazy, cached; routes through master gain)
  - `interface MetronomeLike { click(time: number, accent: boolean, volume: number): void; stop(): void }`
  - `interface PlaybackEngine { readonly currentTime: number; play(s: ScheduledNote, voice: Voice, originSec: number, rate?: number): void; stopAll(): void; metronome(): MetronomeLike }`
  - `interface PlaybackDriverOptions { clock: Clock; engine: PlaybackEngine; getScore(): ScoreDocument | null; getAudio(): AudioSettings; audioEnabled(): boolean; stopAtEnd?: boolean }`
  - `class PlaybackDriver { constructor(o); setScore(score: ScoreDocument | null, tempo: TempoSetting): void; start(): void; stop(): void; tick(): void; silence(): void; dispose(): void }`

- [ ] **Step 1: Engine changes (test first).** Append to `engine.test.ts` inside its top-level `describe` (reuse that file's existing fake-instrument helpers for building an engine with a recording `start`; if the file names them differently, adapt the two names only):

```ts
  it('scales the note time and duration by the clock rate', async () => {
    const started: { time: number; duration: number }[] = []
    const engine = new AudioEngine({
      makeContext: () => fakeContext(),
      makeInstrument: async () => ({ start: (o: { time: number; duration: number }) => { started.push(o) }, stop() {}, dispose() {} }) as never,
    })
    const voice = { id: 'v', label: 'v', hue: 0, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 }
    await engine.loadVoice(voice)
    const note = { id: 0, pitch: 60, startTicks: 0, durTicks: 480, startSec: 4, endSec: 5, velocity: 90, voiceId: 'v' }
    engine.play({ note, atSec: 4 }, voice, 100, 2)
    expect(started[0].time).toBeCloseTo(102, 9)
    expect(started[0].duration).toBeCloseTo(0.5, 9)
  })
```

(`fakeContext` is the context factory the existing engine tests use; if it is named differently in that file, use that name.)

Run: `npx vitest run --project ivories src/core/audio/engine.test.ts` → FAIL (duration 1).

In `engine.ts`:

```ts
import { MetronomeVoice } from './metronome'
```

add a field `private metro: MetronomeVoice | null = null`, and

```ts
  /** The click, built on first use so it never creates the AudioContext early. */
  metronome(): MetronomeVoice {
    if (!this.metro) this.metro = new MetronomeVoice(this.audioContext, this.masterNode)
    return this.metro
  }

  play(s: ScheduledNote, voice: Voice, originSec: number, rate = 1): void {
    if (!voice.audible) return
    const inst = this.buses.get(voice.id)?.instrument
    if (!inst) return
    inst.start({
      note: s.note.pitch,
      time: clampToNow(originSec + s.atSec / rate, this.currentTime),
      duration: Math.max(0.02, (s.note.endSec - s.note.startSec) / rate),
      velocity: s.note.velocity,
    })
  }
```

(`metronome.ts` imports `clampToNow` from `engine.ts`; the cycle is safe because each side uses the other only inside functions.) Update the doc comment on `play` to mention rate.

- [ ] **Step 2: Write the failing driver test `playback.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PlaybackDriver } from './playback'
import { AudioClock } from '../clock/AudioClock'
import { DEFAULT_SETTINGS } from '../settings/types'
import { buildTempoMap } from '../model/tempoMap'
import type { ScoreDocument, NoteEvent } from '../model/types'

const note = (id: number, startSec: number): NoteEvent => ({
  id, pitch: 60 + id, startTicks: id * 480, durTicks: 480, startSec, endSec: startSec + 0.5, velocity: 90, voiceId: 'v',
})
const score = (): ScoreDocument => ({
  id: 's', name: 's.mid', ppq: 480, tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480),
  voices: [{ id: 'v', label: 'V', hue: 0, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1 }],
  notes: [note(0, 0), note(1, 0.5), note(2, 1), note(3, 1.5)],
  durationSec: 2, sourceFormat: 'midi', timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }], keySignature: null,
})

function rig(audio = { ...DEFAULT_SETTINGS.audio }) {
  const src = { currentTime: 10 }
  const clicks: number[] = []
  const engine = {
    get currentTime() { return src.currentTime },
    play: vi.fn(),
    stopAll: vi.fn(),
    metronome: () => ({ click: (t: number) => { clicks.push(t) }, stop: vi.fn() }),
  }
  const clock = new AudioClock(src)
  const s = score()
  const driver = new PlaybackDriver({
    clock, engine, getScore: () => s, getAudio: () => audio, audioEnabled: () => true,
  })
  driver.setScore(s, { mode: 'scale', scale: 1 })
  return { src, clock, engine, driver, clicks, s }
}

describe('PlaybackDriver (spec §3.1: the scheduler consumes a Clock)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('hands notes inside the lookahead to the engine at origin + atSec', () => {
    const r = rig()
    r.clock.play()
    r.driver.tick()
    expect(r.engine.play).toHaveBeenCalledTimes(1)
    const [sched, , origin, rate] = r.engine.play.mock.calls[0]
    expect(sched.note.id).toBe(0)
    expect(origin).toBe(10)
    expect(rate).toBe(1)
  })

  it('silences and re-seats on seek, so a seek-spam never hands a note twice (Review Focus 3)', () => {
    const r = rig()
    r.clock.play()
    const handed = new Map<number, number>()
    r.engine.play.mockImplementation((s: { note: NoteEvent }) => {
      handed.set(s.note.id, (handed.get(s.note.id) ?? 0) + 1)
    })
    for (let i = 0; i < 20; i++) {
      r.src.currentTime += 0.03
      r.driver.tick()
      if (i % 3 === 0) r.clock.seek(1.2)
    }
    // Seeks at i = 0, 3, 6, …, 18: stopAll ran for every one of the 7, and
    // between two seeks (one pass) no note was handed twice.
    expect(r.engine.stopAll).toHaveBeenCalledTimes(7)
    for (const [, n] of handed) expect(n).toBeLessThanOrEqual(7)
    expect(handed.get(0)).toBe(1)   // only before the first seek
  })

  it('a rate change silences and schedules at origin + atSec / rate', () => {
    const r = rig()
    r.clock.play()
    r.src.currentTime += 0.4
    r.driver.tick()
    r.clock.setRate(2)
    expect(r.engine.stopAll).toHaveBeenCalledTimes(1)
    r.engine.play.mockClear()
    r.driver.tick()
    const [sched, , origin, rate] = r.engine.play.mock.calls[0]
    expect(rate).toBe(2)
    expect(origin).toBe(r.clock.originSec)
    // The engine time handed over is exactly when the clock reaches the note.
    expect(r.clock.positionAt(origin + sched.atSec / rate)).toBeCloseTo(sched.atSec, 9)
  })

  it('pauses at the end of the score, exactly at the duration', () => {
    const r = rig()
    r.clock.play()
    r.src.currentTime += 2.4
    r.driver.tick()
    expect(r.clock.playing).toBe(false)
    expect(r.clock.now()).toBe(2)
    expect(r.engine.stopAll).toHaveBeenCalled()
  })

  it('clicks the count-in only when the count-in setting is on', () => {
    const on = rig({ ...DEFAULT_SETTINGS.audio, metronome: true, countIn: true })
    on.clock.seek(-2)
    on.clock.play()
    on.driver.tick()
    expect(on.clicks.length).toBe(1)
    const off = rig({ ...DEFAULT_SETTINGS.audio, metronome: true, countIn: false })
    off.clock.seek(-2)
    off.clock.play()
    off.driver.tick()
    expect(off.clicks.length).toBe(0)
  })

  it('keeps cursors level but hands nothing to the engine while audio is disabled', () => {
    const r = rig()
    const driver = new PlaybackDriver({
      clock: r.clock, engine: r.engine, getScore: () => r.s, getAudio: () => DEFAULT_SETTINGS.audio, audioEnabled: () => false,
    })
    driver.setScore(r.s, { mode: 'scale', scale: 1 })
    r.clock.play()
    driver.tick()
    expect(r.engine.play).not.toHaveBeenCalled()
  })

  it('start() ticks on an interval and stop()/dispose() end it', () => {
    const r = rig()
    const tick = vi.spyOn(r.driver, 'tick')
    r.driver.start()
    vi.advanceTimersByTime(100)
    expect(tick.mock.calls.length).toBeGreaterThanOrEqual(3)
    r.driver.dispose()
    tick.mockClear()
    vi.advanceTimersByTime(100)
    expect(tick).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run --project ivories src/core/audio/playback.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `audio/playback.ts`**

```ts
import { AudioClock } from '../clock/AudioClock'
import { Scheduler, TICK_MS } from './scheduler'
import { BeatCursor, beatTimes, countInBeats } from './metronome'
import { leadInFor } from '../model/countIn'
import type { Clock, ClockEvent } from '../clock/types'
import type { ScheduledNote } from './scheduler'
import type { AudioSettings } from '../settings/types'
import type { ScoreDocument, TempoSetting, Voice } from '../model/types'

export interface MetronomeLike {
  click(time: number, accent: boolean, volume: number): void
  stop(): void
}

export interface PlaybackEngine {
  readonly currentTime: number
  play(s: ScheduledNote, voice: Voice, originSec: number, rate?: number): void
  stopAll(): void
  metronome(): MetronomeLike
}

export interface PlaybackDriverOptions {
  clock: Clock
  engine: PlaybackEngine
  /** Read every tick: a voice edit replaces the score object but not its notes. */
  getScore(): ScoreDocument | null
  getAudio(): AudioSettings
  /** False: keep the cursors level with the clock but hand nothing to the engine. */
  audioEnabled(): boolean
  /** Pause at the end of the score (default true; off for a MediaClock). */
  stopAtEnd?: boolean
}

/**
 * The scheduler tick that used to live in App.tsx, driven by any Clock.
 * Audio timing comes from the exact `time` handed to smplr, not from when
 * the interval fires. Every seek, rate change and pause silences what was
 * already scheduled and re-seats the cursors (Global Constraints).
 */
export class PlaybackDriver {
  private scheduler: Scheduler | null = null
  private beats: BeatCursor | null = null
  private metronome: MetronomeLike | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly off: () => void
  private readonly o: PlaybackDriverOptions

  constructor(o: PlaybackDriverOptions) {
    this.o = o
    this.off = o.clock.subscribe((e) => this.onClock(e))
  }

  /**
   * Rebuild the cursors. Call when score.notes is REPLACED (load or retime),
   * never on a voice edit: rebuilding re-hands notes smplr already has.
   * The count-in clicks sit before t = 0 in the same beat cursor.
   */
  setScore(score: ScoreDocument | null, tempo: TempoSetting): void {
    if (!score) { this.scheduler = null; this.beats = null; return }
    const head = this.o.clock.now()
    const s = new Scheduler(score.notes)
    s.seek(head)
    this.scheduler = s
    const b = new BeatCursor([...countInBeats(leadInFor(score, tempo)), ...beatTimes(score, tempo)])
    b.seek(head)
    this.beats = b
  }

  start(): void {
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS)
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  dispose(): void {
    this.stop()
    this.off()
  }

  /** Cancels everything already handed to the engine, notes and clicks. */
  silence(): void {
    this.o.engine.stopAll()
    this.metronome?.stop()
  }

  tick(): void {
    const { clock, engine } = this.o
    const score = this.o.getScore()
    const s = this.scheduler
    if (!clock.playing || !s || !score) return
    const head = clock.now()

    if ((this.o.stopAtEnd ?? true) && head >= score.durationSec) {
      clock.pause()
      clock.seek(score.durationSec)
      return
    }

    const audible = this.o.audioEnabled()
    const rate = clock.rate
    const origin = this.originFor(head)
    for (const sched of s.collect(head)) {
      if (!audible) continue
      const voice = score.voices.find((v) => v.id === sched.note.voiceId)
      if (voice) engine.play(sched, voice, origin, rate)
    }

    const audio = this.o.getAudio()
    if (audible && audio.metronome && this.beats) {
      this.metronome ??= engine.metronome()
      for (const beat of this.beats.collect(head)) {
        // Count-in clicks (sec < 0) only while the Count-in setting is on.
        if (beat.sec < 0 && audio.countIn === false) continue
        this.metronome.click(origin + beat.sec / rate, beat.accent, audio.metronomeVolume)
      }
    } else {
      // Keep the beat cursor level with the playhead while the click is off,
      // so switching it on mid-piece does not fire every beat since the start.
      this.beats?.seek(head)
    }
  }

  /** Engine time of score-time 0. Exact for an AudioClock; derived otherwise. */
  private originFor(head: number): number {
    const c = this.o.clock
    if (c instanceof AudioClock && !c.silentFallback) return c.originSec
    return this.o.engine.currentTime - head / c.rate
  }

  private onClock(e: ClockEvent): void {
    switch (e.type) {
      case 'play':
        // e.time is the exact session start (e.g. -(lead + pad)), not now - origin,
        // which can land an ulp past the accented first count-in beat.
        this.scheduler?.seek(e.time)
        this.beats?.seek(e.time)
        break
      case 'pause':
        this.silence()
        break
      case 'seek':
      case 'rate':
        this.silence()
        this.scheduler?.seek(e.time)
        this.beats?.seek(e.time)
        break
    }
  }
}
```

Append `export * from './audio/playback'` to `core/index.ts`.

Run: `npx vitest run --project ivories src/core/audio` → PASS.

- [ ] **Step 4: Use it in the studio** (`App.tsx`). Remove `schedulerRef`, `beatsRef`, `metronomeRef`, the scheduler-rebuild effect (original lines 190–208) and the interval effect (original 210–252). Add after the clock binding effect from Task 5:

```ts
  const driverRef = useRef<PlaybackDriver | null>(null)
  useEffect(() => {
    const d = new PlaybackDriver({
      clock, engine,
      getScore: () => useTransport.getState().score,
      getAudio: () => useSettings.getState().audio,
      audioEnabled: () => true,
    })
    driverRef.current = d
    const s = useTransport.getState()
    d.setScore(s.score, s.tempo)
    d.start()
    return () => { d.dispose(); driverRef.current = null }
  }, [clock, engine])

  // Rebuild the cursors whenever the note array is REPLACED (load or retime).
  // Keyed on score.notes, not score: updateVoice replaces the score object while
  // keeping the same notes, and rebuilding there would sound notes twice.
  const notes = t.score?.notes
  useEffect(() => {
    const s = useTransport.getState()
    driverRef.current?.setScore(notes ? s.score : null, s.tempo)
  }, [notes])
```

Then simplify the callers (the driver now pairs silence with the clock events):
- `beginPlayback`: keep the guard, lead and pad lines, then only `state.play(engine.currentTime, lead + pad)` with the comment `// The driver re-seats its cursors at the exact start on the play event.` (delete the `head`/`schedulerRef`/`beatsRef` lines).
- `toggle` pause branch: `state.pause(engine.currentTime)`.
- `seek`: `useTransport.getState().seek(sec, engine.currentTime); chordFeed.reset()`.
- `changeTempo`: keep the `sameTempo` early return; then `useTransport.getState().setTempo(setting, engine.currentTime)` (the seek event silences).
- `loadAnother`: replace `engine.stopAll(); metronomeRef.current?.stop()` with `driverRef.current?.silence()`.
- Imports: drop `BeatCursor, MetronomeVoice, beatTimes, countInBeats, Scheduler, TICK_MS` from the `'ivories/core'` import if now unused; add `PlaybackDriver`.

- [ ] **Step 5: Update the App test fake** (`App.test.tsx`): give the hoisted `engine` a metronome and drop the `MetronomeVoice` override from the `vi.mock('ivories/core', …)` block:

```ts
const clicks = vi.hoisted(() => [] as { time: number; accent: boolean }[])
const engine = vi.hoisted(() => ({
  currentTime: 0,
  running: true,
  resume: vi.fn(async () => {}),
  setMasterVolume: vi.fn(),
  setVoiceVolume: vi.fn(),
  loadVoice: vi.fn(async () => {}),
  retainVoices: vi.fn(),
  play: vi.fn(),
  stopAll: vi.fn(),
  // Records the metronome's clicks instead of building oscillators.
  metronome: () => ({ click: (time: number, accent: boolean) => { clicks.push({ time, accent }) }, stop: () => {} }),
}))
vi.mock('ivories/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ivories/core')>()),
  AudioEngine: function AudioEngine() { return engine },
}))
```

(`clicks` must be declared before `engine`, since the hoisted factory reads it.)

- [ ] **Step 6: Run everything**

Run: `npm test && npm run build`
Expected: all green, including every `App: lead-in, count-in and audio unlock` test (click times at `5 + LOOKAHEAD_SEC`, accented first click, no count-in on resume).

- [ ] **Step 7: Commit**

```bash
git add -A packages/ivories/src/core apps/studio/src
git commit -m "$(cat <<'EOF'
feat(core): PlaybackDriver schedules notes and clicks from any Clock

The scheduler/metronome tick moves out of App.tsx; seek, rate and pause
events silence and re-seat. AudioEngine gains rate-aware play() and a lazy
metronome().

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
## Stage B — Provider, components, CSS scoping, studio on the library

### Task 7: Move the on-stage text into the library (pure move)

**Files:**
- Move (git mv) from `apps/studio/src/ui/` to `packages/ivories/src/react/text/`: `StageText.tsx`, `StageText.test.tsx`, `ChordReadout.tsx`, `ChordReadout.test.tsx`, `googleFont.ts`, `googleFont.test.ts`
- Create: `packages/ivories/src/index.ts`
- Modify: `packages/ivories/package.json` (`"."` export), moved files' imports, `apps/studio/src/App.tsx` imports

**Interfaces:**
- Consumes: Task 2 package.
- Produces: `import { StageText, ChordReadout, samePitches, labelText, textCss, chordDisplayText, ensureGoogleFont } from 'ivories'`; `import type { ChordDisplayValue } from 'ivories'`; `"."` exports every core *type* (`export type * from './core'`).

- [ ] **Step 1: Move**

```bash
cd /home/shaun/ivories-mvp
mkdir -p packages/ivories/src/react/text
for f in StageText.tsx StageText.test.tsx ChordReadout.tsx ChordReadout.test.tsx googleFont.ts googleFont.test.ts; do
  git mv apps/studio/src/ui/$f packages/ivories/src/react/text/$f
done
```

- [ ] **Step 2: Fix the moved files' imports.** In the three moved sources and their tests, replace imports of `'../music/spell'`, `'../render/geometry'`, `'../settings/types'`, `'../settings/profile'` with the core paths `'../../core/music/spell'`, `'../../core/render/geometry'`, `'../../core/settings/types'`, `'../../core/settings/profile'` (same named imports). `./googleFont` and `./StageText` stay relative.

- [ ] **Step 3: `packages/ivories/src/index.ts`**

```ts
// "ivories": React components and hooks (spec §4), plus every core type.
// Runtime core lives at "ivories/core".
export type * from './core'
export { StageText, samePitches, labelText, textCss } from './react/text/StageText'
export { ChordReadout, chordDisplayText } from './react/text/ChordReadout'
export type { ChordDisplayValue } from './react/text/ChordReadout'
export { ensureGoogleFont } from './react/text/googleFont'
```

(If `googleFont.ts` names its export differently, export that name.)

- [ ] **Step 4: Add the `"."` export** as the first entry of `exports` in `packages/ivories/package.json`:

```json
    ".": {
      "source": "./src/index.ts",
      "types": "./dist/types/index.d.ts",
      "import": "./dist/index.js"
    },
```

- [ ] **Step 5: Studio imports.** In `App.tsx` replace the `./ui/ChordReadout` and `./ui/StageText` imports with `import { ChordReadout, StageText, samePitches } from 'ivories'` and `import type { ChordDisplayValue } from 'ivories'`. `grep -rn "googleFont\|StageText\|ChordReadout" apps/studio/src` must show only `'ivories'` imports (e.g. `ui/TextSettings.tsx` may import `ensureGoogleFont`; point it at `'ivories'`).

- [ ] **Step 6: Verify**

Run: `npm test && npm run build && npm run check:imports`
Expected: same test count as after Task 6, all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: move on-stage text overlays into ivories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Library stylesheet, `--ivories-*` tokens, CSS scope check

**Files:**
- Create: `packages/ivories/src/style.css`, `packages/ivories/scripts/css-scope.mjs`
- Modify: `packages/ivories/package.json` (export `./style.css`, script `check:css`, devDependency `postcss`), `packages/ivories/src/core/render/theme.ts` + `theme.test.ts`, `packages/ivories/src/react/text/StageText.tsx`, `ChordReadout.tsx` and both tests, `apps/studio/src/index.css`, `apps/studio/src/main.tsx`, `apps/studio/src/App.tsx`, root `package.json` (`check`)

**Interfaces:**
- Consumes: Task 7.
- Produces: tokens `--ivories-stage-bg`, `--ivories-key-white`, `--ivories-key-black`, `--ivories-key-border`, `--ivories-key-border-width`, `--ivories-key-outline`, `--ivories-key-radius`, `--ivories-key-gap`, `--ivories-middle-c-mark`, `--ivories-black-key-top`, `--ivories-grid-line`, `--ivories-grid-line-c4`, `--ivories-grid-line-width`, `--ivories-grid-line-style`, `--ivories-bar-radius`, `--ivories-flash-core-rgb`, `--ivories-flash-warm-rgb`, `--ivories-progress-track`, `--ivories-progress-fill`, chrome tokens `--ivories-ink`, `--ivories-ink-dim`, `--ivories-accent`, `--ivories-panel`, `--ivories-line`; theme classes `ivories-theme-classic|outline|contrast|transparent`; page class `html.ivories-transparent` (studio CSS); classes `ivories-stage-text`, `ivories-note-label`, `ivories-note-label--white|black`, `ivories-chord-readout`, `ivories-chord-readout--<placement>`, `ivories-chord-alternates`.

- [ ] **Step 1: Write the scope checker** `packages/ivories/scripts/css-scope.mjs` (mirrors pepperscore's `validation/css-scope.mjs`):

```js
#!/usr/bin/env node
// Every library rule is scoped under .ivories (spec §2): no page selectors,
// viewport units, fixed positions, @font-face or unprefixed keyframes.
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

const file = new URL('../src/style.css', import.meta.url)
const root = postcss.parse(readFileSync(file, 'utf8'), { from: 'src/style.css' })
const problems = []
root.walkRules((rule) => {
  if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
  for (const selector of rule.selectors) {
    if (!/^\.ivories(?![\w-])/.test(selector)) problems.push(`unscoped selector "${selector}"`)
    if (/(^|[\s,>+~(])(html|body)(?![\w-])|:root/.test(selector)) problems.push(`page-level selector "${selector}"`)
    for (const m of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      if (m[1] !== 'ivories' && !m[1].startsWith('ivories-')) problems.push(`class .${m[1]} is not prefixed ivories- in "${selector}"`)
    }
  }
})
root.walkAtRules((rule) => {
  if (/keyframes$/.test(rule.name) && !rule.params.startsWith('ivories-')) problems.push(`@keyframes ${rule.params} must start with ivories-`)
  if (rule.name === 'font-face') problems.push('@font-face is the host\'s job')
  if (rule.name === 'media' && /width|height|orientation|aspect/.test(rule.params)) problems.push(`viewport query @media ${rule.params}`)
})
root.walkDecls((decl) => {
  if (decl.prop === 'position' && decl.value === 'fixed') problems.push(`position:fixed in ${decl.parent.selector}`)
  if (/\d(d|s|l)?v(h|w|min|max)\b/.test(decl.value)) problems.push(`viewport unit in ${decl.parent.selector} { ${decl.prop}: ${decl.value} }`)
})
if (problems.length) {
  console.error(`CSS scope check failed:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log('CSS scope: every rule under .ivories, prefixed classes, no page selectors, viewport units or fixed positions')
```

`npm install -D postcss@^8.5.29 -w packages/ivories`; add `"check:css": "node scripts/css-scope.mjs"` to the package scripts and `"./style.css": { "source": "./src/style.css", "default": "./dist/style.css" }` to its exports (before `"./package.json"`).

- [ ] **Step 2: Prove the checker fails.** Create `src/style.css` with only `.stage-text { color: red; }`.
Run: `npm run check:css -w packages/ivories; echo exit=$?` → `unscoped selector ".stage-text"`, `exit=1`.

- [ ] **Step 3: Write the real `src/style.css`** — the token block and theme presets are the studio's `index.css` `:root` canvas-token block and `.theme-*` blocks moved verbatim with `--tmi-` → `--ivories-` and the selectors re-scoped:

```css
/* ivories: every rule is scoped under .ivories (scripts/css-scope.mjs). */
.ivories {
  /* Canvas theme tokens (spec §14.1 of the visualizer spec). readTheme() reads
     them once per layout or theme change from the view's root element. */
  --ivories-stage-bg: #000000;
  --ivories-key-white: #f6f2e4;
  --ivories-key-black: #0c0c10;
  --ivories-key-border: rgba(255, 255, 255, 0.16);
  --ivories-key-border-width: 1px;
  --ivories-key-outline: transparent;
  --ivories-key-radius: 0px;
  --ivories-key-gap: 1px;
  --ivories-middle-c-mark: rgba(0, 0, 0, 0.55);
  --ivories-black-key-top: rgba(255, 255, 255, 0.35);
  --ivories-grid-line: rgba(255, 255, 255, 0.06);
  --ivories-grid-line-c4: rgba(255, 255, 255, 0.14);
  --ivories-grid-line-width: 1px;
  --ivories-grid-line-style: solid;
  --ivories-bar-radius: 4px;
  --ivories-flash-core-rgb: 255, 255, 255;
  --ivories-flash-warm-rgb: 255, 242, 214;
  --ivories-progress-track: rgba(255, 255, 255, 0.06);
  --ivories-progress-fill: #e8384f;
  /* Chrome tokens (Transport, messages, stage). */
  --ivories-ink: #e9eaf2;
  --ivories-ink-dim: #9698ad;
  --ivories-accent: #ff9c1a;
  --ivories-panel: #101119;
  --ivories-line: #22232e;
  position: relative;
  box-sizing: border-box;
  color: var(--ivories-ink);
  font-family: Poppins, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.ivories *, .ivories *::before, .ivories *::after { box-sizing: border-box; }

.ivories.ivories-theme-outline {
  --ivories-key-white: transparent;
  --ivories-key-black: rgba(0, 0, 0, 0.35);
  --ivories-key-border: rgba(255, 255, 255, 0.85);
  --ivories-key-border-width: 2px;
  --ivories-key-outline: rgba(255, 255, 255, 0.85);
  --ivories-key-radius: 3px;
  --ivories-key-gap: 2px;
  --ivories-middle-c-mark: rgba(255, 255, 255, 0.85);
  --ivories-grid-line-style: dashed;
}
.ivories.ivories-theme-contrast {
  --ivories-stage-bg: #000000;
  --ivories-key-white: #ffffff;
  --ivories-key-black: #000000;
  --ivories-key-border: #ffffff;
  --ivories-key-border-width: 2px;
  --ivories-middle-c-mark: #000000;
  --ivories-black-key-top: #ffffff;
  --ivories-grid-line: rgba(255, 255, 255, 0.25);
  --ivories-grid-line-c4: rgba(255, 255, 255, 0.6);
  --ivories-progress-fill: #ffff00;
}
.ivories.ivories-theme-transparent {
  --ivories-stage-bg: transparent;
  --ivories-key-white: #f6f2e4;
  --ivories-key-black: #0c0c10;
  --ivories-key-border: rgba(255, 255, 255, 0.5);
  --ivories-grid-line: rgba(255, 255, 255, 0.02);
  --ivories-grid-line-c4: rgba(255, 255, 255, 0.06);
  --ivories-progress-track: transparent;
}

/* On-stage text overlays (spec §15 of the visualizer spec). */
.ivories .ivories-stage-text { position: absolute; inset: 0; pointer-events: none; }
.ivories .ivories-chord-readout { pointer-events: none; }
```

Compare the moved values against the old `apps/studio/src/index.css` blocks line by line before deleting them (Step 6) — the four presets must be identical apart from the prefix.

Run: `npm run check:css -w packages/ivories` → passes.

- [ ] **Step 4: Rename the tokens `readTheme` reads.** In `core/render/theme.ts` replace every `'--tmi-` with `'--ivories-'` (19 occurrences) and the doc comment `--tmi-*` with `--ivories-*`. In `theme.test.ts` replace `'--tmi-` with `'--ivories-'`. In `core/settings/profile.test.ts` the comment `--tmi-stage-bg` becomes `--ivories-stage-bg`.

- [ ] **Step 5: Rename the overlay classes and drop ids.**
  - `StageText.tsx`: both `className="stage-text absolute inset-0"` → `className="ivories-stage-text"` (keep the inline `pointerEvents: 'none'`); the label span loses `id={...}` and gets `className={\`ivories-note-label ivories-note-label--${k.black ? 'black' : 'white'}\`}` (keep `data-pitch` and `data-midi`).
  - `ChordReadout.tsx`: drop `id="chord-readout"`; `className={\`ivories-chord-readout ivories-chord-readout--${text.chordPlacement}\`}`; `className="chord-alternates"` → `"ivories-chord-alternates"`.
  - Tests: in `StageText.test.tsx` replace `'.note-label'` → `'.ivories-note-label'`, `'#note-label-60'` → `'[data-midi="60"]'`, `'#note-label-61'` → `'[data-midi="61"]'`, `'note-label--white'` → `'ivories-note-label--white'`, `'note-label--black'` → `'ivories-note-label--black'`, `'.stage-text'` → `'.ivories-stage-text'`. In `ChordReadout.test.tsx` replace `'#chord-readout'` → `'.ivories-chord-readout'`, `toContain('chord-readout')` → `toContain('ivories-chord-readout')`, `'chord-readout--above-keys'` → `'ivories-chord-readout--above-keys'`, `'.chord-alternates'` → `'.ivories-chord-alternates'`.

- [ ] **Step 6: Studio switches to the library tokens.**
  - `apps/studio/src/main.tsx`: add `import 'ivories/style.css'` **before** `import './index.css'`.
  - `apps/studio/src/index.css`: delete the second `:root { --tmi-… }` block and the four `.theme-*` blocks (now in the library). Keep the first `:root` (studio chrome: `--stage`, `--ground`, `--panel`, `--line`, `--ink`, `--ink-dim`, `--accent`). Change the transparent rule to:

```css
html.ivories-transparent,
html.ivories-transparent body,
html.ivories-transparent #root,
html.ivories-transparent .app-shell,
html.ivories-transparent .stage-wrap {
  background: transparent !important;
}
```

  - `App.tsx`: `'tmi-transparent'` → `'ivories-transparent'` (both lines); the stage wrapper becomes ``className={`stage-wrap ivories ivories-theme-${settings.theme.name} relative min-h-0 flex-1`}`` and its style key `'--tmi-stage-bg'` → `'--ivories-stage-bg'`.

- [ ] **Step 7: Wire the root check.** Root `package.json`: `"check": "npm run test:geometry && npm run check:imports && npm run check:css -w packages/ivories"`.

- [ ] **Step 8: Verify**

Run: `npm test && npm run check && npm run build`
Expected: all green. Then `npm run dev -- --port 5183`, load `docs/demo.mid` in a browser on the LAN URL, switch the four themes in Settings → the stage looks exactly as before.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(ivories): scoped library stylesheet with --ivories-* tokens

Theme tokens and presets move from the studio into ivories/style.css under
.ivories; a postcss scope check guards it. Overlay classes are prefixed and
lose element ids so several instances can share a page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `StageRenderer`, `FrameLoop`, held-note helpers (core)

**Files:**
- Create: `packages/ivories/src/core/render/stageRenderer.ts`, `packages/ivories/src/core/render/frameLoop.ts`, `packages/ivories/src/core/render/activeNotes.ts`
- Modify: `packages/ivories/src/core/music/keyOf.ts` (add `KeyContextCache`), `packages/ivories/src/core/index.ts`
- Test: `packages/ivories/src/core/render/stageRenderer.test.ts`, `frameLoop.test.ts`, `activeNotes.test.ts`

**Interfaces:**
- Consumes: `drawStage`, `RenderState`, `computeLayout`, `fitRange`, `ensureFullBlackKeyGroups`, `FIRST_PITCH`, `LAST_PITCH`, `DEFAULT_THEME`, `Theme`, `visibleNotes`, `heldNotes`, `keyOfScore`.
- Produces:
  - `interface StageInput { score: ScoreDocument | null; settings: Settings; fallSeconds: number; maxNoteDur: number; showRoll: boolean; range: [number, number] | null }`
  - `interface StageFrame { layout: KeyboardLayout; held: Map<number, NoteEvent> }`
  - `class StageRenderer { constructor(readThemeFrom: () => Theme); draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, input: StageInput): StageFrame; rangeFor(score, zoom): [number, number]; layoutFor(w, h, first, last): KeyboardLayout }`
  - `class FrameLoop { constructor(now: () => number); add(fn: (t: number) => void): () => void; tick(): void; dispose(): void }`
  - `heldScoreNotes(score: ScoreDocument, t: number, maxNoteDur: number): Map<number, NoteEvent>`; `diffHeld(prev: ReadonlyMap<number, NoteEvent>, next: ReadonlyMap<number, NoteEvent>): { on: NoteEvent[]; off: NoteEvent[] } | null`; `EMPTY_HELD: ReadonlyMap<number, NoteEvent>`
  - `class KeyContextCache { get(score: ScoreDocument | null, override: string | null): KeyContext }`
  - `rangeFromProp(range: 'full' | [number, number] | undefined): [number, number] | null`

- [ ] **Step 1: Failing tests.** `stageRenderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { StageRenderer, rangeFromProp } from './stageRenderer'
import { computeLayout, ensureFullBlackKeyGroups } from './geometry'
import { DEFAULT_THEME } from './theme'
import { stubCtx } from './pianoRoll.test-helpers'
import { DEFAULT_SETTINGS } from '../settings/types'
import type { StageInput } from './stageRenderer'

const input = (patch: Partial<StageInput> = {}): StageInput => ({
  score: null, settings: structuredClone(DEFAULT_SETTINGS), fallSeconds: 3, maxNoteDur: 0,
  showRoll: true, range: null, ...patch,
})

describe('StageRenderer', () => {
  it('caches the layout by size and range (no per-frame allocation)', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const a = r.draw(ctx, 800, 400, 0, input())
    const b = r.draw(ctx, 800, 400, 1, input())
    expect(b.layout).toBe(a.layout)
    const c = r.draw(ctx, 900, 400, 1, input())
    expect(c.layout).not.toBe(a.layout)
  })

  it('reads the theme once per layout, not per frame', () => {
    let reads = 0
    const r = new StageRenderer(() => { reads++; return DEFAULT_THEME })
    const { ctx } = stubCtx()
    for (let i = 0; i < 5; i++) r.draw(ctx, 800, 400, i, input())
    expect(reads).toBe(1)
  })

  it('an explicit range overrides the zoom setting', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input({ range: [48, 72] }))
    expect(f.layout.keys[0].pitch).toBe(48)
    expect(f.layout.keys.at(-1)!.pitch).toBe(72)
  })

  it('draws at 0x0 (hidden container) without NaN geometry (Review Focus 5)', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 0, 0, 0, input())
    for (const k of f.layout.keys) expect(Number.isFinite(k.x) && Number.isFinite(k.w)).toBe(true)
    expect(Number.isFinite(f.layout.hitY)).toBe(true)
  })
})

describe('range crop equals the full keyboard scaled to the range (spec §4, R5)', () => {
  it('matches key positions of the 88-key geometry, scaled and shifted', () => {
    const [lo, hi] = ensureFullBlackKeyGroups(48, 72)
    const crop = computeLayout(700, 400, { firstPitch: lo, lastPitch: hi })
    const fullW = 700 * (52 / crop.whiteCount)
    const full = computeLayout(fullW, 400)
    const shift = full.byPitch.get(lo)!.x
    for (const k of crop.keys) {
      const f = full.byPitch.get(k.pitch)!
      expect(k.x).toBeCloseTo(f.x - shift, 6)
      expect(k.w).toBeCloseTo(f.w, 6)
    }
  })

  it('rangeFromProp: full, a tuple widened to whole groups, or none', () => {
    expect(rangeFromProp('full')).toEqual([21, 108])
    expect(rangeFromProp([62, 70])).toEqual(ensureFullBlackKeyGroups(62, 70))
    expect(rangeFromProp(undefined)).toBeNull()
  })
})
```

`frameLoop.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { FrameLoop } from './frameLoop'

afterEach(() => { vi.unstubAllGlobals() })

describe('FrameLoop (one rAF loop per provider)', () => {
  it('reads the clock once per frame and hands every view the same t', () => {
    const now = vi.fn(() => 1.25)
    const loop = new FrameLoop(now)
    const a = vi.fn(), b = vi.fn()
    loop.add(a); loop.add(b)
    loop.tick()
    expect(now).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(1.25)
    expect(b).toHaveBeenCalledWith(1.25)
    loop.dispose()
  })

  it('a throwing subscriber does not stop the others', () => {
    const loop = new FrameLoop(() => 0)
    const ok = vi.fn()
    loop.add(() => { throw new Error('boom') })
    loop.add(ok)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    loop.tick()
    expect(ok).toHaveBeenCalled()
    loop.dispose()
  })

  it('starts requestAnimationFrame on the first subscriber and stops on the last', () => {
    const raf = vi.fn(() => 7)
    const caf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', caf)
    const loop = new FrameLoop(() => 0)
    const off = loop.add(() => {})
    expect(raf).toHaveBeenCalledTimes(1)
    loop.add(() => {})
    expect(raf).toHaveBeenCalledTimes(1)
    off()
    loop.dispose()
    expect(caf).toHaveBeenCalledWith(7)
  })
})
```

`activeNotes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { diffHeld, heldScoreNotes } from './activeNotes'
import type { NoteEvent, ScoreDocument } from '../model/types'

const n = (id: number, pitch: number, s: number, e: number, voiceId = 'v'): NoteEvent =>
  ({ id, pitch, startTicks: 0, durTicks: 0, startSec: s, endSec: e, velocity: 80, voiceId })
const score = (notes: NoteEvent[]): ScoreDocument => ({
  id: 'x', name: 'x', ppq: 480, tempoMap: [], notes, durationSec: 4, sourceFormat: 'midi',
  timeSignatures: [], keySignature: null,
  voices: [
    { id: 'v', label: 'v', hue: 0, instrument: 'p', visible: true, audible: true, volume: 1 },
    { id: 'drums', label: 'd', hue: 0, instrument: 'p', visible: true, audible: true, volume: 1, percussion: true },
    { id: 'hidden', label: 'h', hue: 0, instrument: 'p', visible: false, audible: true, volume: 1 },
  ],
})

describe('held score notes', () => {
  it('is what sounds at t, without percussion or hidden voices', () => {
    const s = score([n(0, 60, 0, 1), n(1, 36, 0, 1, 'drums'), n(2, 64, 0, 1, 'hidden'), n(3, 67, 2, 3)])
    expect([...heldScoreNotes(s, 0.5, 1).keys()]).toEqual([60])
    expect([...heldScoreNotes(s, 2.5, 1).keys()]).toEqual([67])
  })

  it('diffHeld reports ons and offs, and null when nothing changed', () => {
    const a = new Map([[60, n(0, 60, 0, 1)]])
    const b = new Map([[64, n(1, 64, 0.5, 1)]])
    expect(diffHeld(a, new Map(a))).toBeNull()
    const d = diffHeld(a, b)!
    expect(d.on.map((x) => x.pitch)).toEqual([64])
    expect(d.off.map((x) => x.pitch)).toEqual([60])
  })

  it('a re-strike of the same pitch (new note id) is an off then an on', () => {
    const d = diffHeld(new Map([[60, n(0, 60, 0, 1)]]), new Map([[60, n(5, 60, 1, 2)]]))!
    expect(d.off.map((x) => x.id)).toEqual([0])
    expect(d.on.map((x) => x.id)).toEqual([5])
  })
})
```

Run: `npx vitest run --project ivories src/core/render` → FAIL (modules missing).

- [ ] **Step 2: `activeNotes.ts`**

```ts
import { heldNotes, visibleNotes } from './pianoRoll'
import type { NoteEvent, ScoreDocument } from '../model/types'

export const EMPTY_HELD: ReadonlyMap<number, NoteEvent> = new Map()

/** What sounds at t on the keys: visible, non-percussion voices (spec §6.1). */
export function heldScoreNotes(score: ScoreDocument, t: number, maxNoteDur: number): Map<number, NoteEvent> {
  const vis = visibleNotes(score.notes, t, 0, maxNoteDur).filter((n) => {
    const v = score.voices.find((x) => x.id === n.voiceId)
    return v?.visible !== false && !v?.percussion
  })
  return heldNotes(vis, t)
}

/** Ons and offs between two held sets; null when they hold the same notes. */
export function diffHeld(
  prev: ReadonlyMap<number, NoteEvent>, next: ReadonlyMap<number, NoteEvent>,
): { on: NoteEvent[]; off: NoteEvent[] } | null {
  let same = prev.size === next.size
  if (same) for (const [p, note] of next) if (prev.get(p)?.id !== note.id) { same = false; break }
  if (same) return null
  const on: NoteEvent[] = []
  const off: NoteEvent[] = []
  for (const [p, note] of prev) if (next.get(p)?.id !== note.id) off.push(note)
  for (const [p, note] of next) if (prev.get(p)?.id !== note.id) on.push(note)
  return { on, off }
}
```

- [ ] **Step 3: `frameLoop.ts`**

```ts
/**
 * One requestAnimationFrame loop per provider (spec §3.2). Every subscriber
 * gets the same t from a single clock read, so two views never disagree.
 * Runs only while something is subscribed; never touches window at import.
 */
export class FrameLoop {
  private readonly fns = new Set<(t: number) => void>()
  private raf = 0
  private readonly now: () => number

  constructor(now: () => number) { this.now = now }

  add(fn: (t: number) => void): () => void {
    this.fns.add(fn)
    this.ensure()
    return () => {
      this.fns.delete(fn)
      if (this.fns.size === 0) this.halt()
    }
  }

  tick(): void {
    const t = this.now()
    for (const fn of [...this.fns]) {
      try { fn(t) } catch (err) { console.error('ivories: frame subscriber threw', err) }
    }
  }

  dispose(): void {
    this.fns.clear()
    this.halt()
  }

  private ensure(): void {
    if (this.raf || typeof requestAnimationFrame !== 'function') return
    const loop = () => { this.raf = requestAnimationFrame(loop); this.tick() }
    this.raf = requestAnimationFrame(loop)
  }

  private halt(): void {
    if (this.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf)
    this.raf = 0
  }
}
```

- [ ] **Step 4: `stageRenderer.ts`** — the four caches move from `App.tsx` (original lines 126–174) with their comments; the `RenderState` literal is App's original lines 270–283.

```ts
import { computeLayout, ensureFullBlackKeyGroups, fitRange, FIRST_PITCH, LAST_PITCH } from './geometry'
import { drawStage } from './pianoRoll'
import type { KeyboardLayout } from './geometry'
import type { RenderState } from './pianoRoll'
import type { Theme } from './theme'
import type { NoteEvent, ScoreDocument, Voice } from '../model/types'
import type { Settings, ThemeName, ZoomMode } from '../settings/types'

export interface StageInput {
  score: ScoreDocument | null
  settings: Settings
  fallSeconds: number
  maxNoteDur: number
  showRoll: boolean
  /** Explicit crop (the `range` prop); null follows settings.display.zoom. */
  range: [number, number] | null
}

export interface StageFrame { layout: KeyboardLayout; held: Map<number, NoteEvent> }

/** The `range` prop: 'full', or a [low, high] widened to whole black-key groups (R5). */
export function rangeFromProp(range: 'full' | [number, number] | undefined): [number, number] | null {
  if (range === undefined) return null
  if (range === 'full') return [FIRST_PITCH, LAST_PITCH]
  return ensureFullBlackKeyGroups(Math.min(range[0], range[1]), Math.max(range[0], range[1]))
}

/**
 * The draw path that used to live in App.tsx: identity-keyed caches around the
 * pure drawStage. Nothing here allocates per frame unless an input changed.
 */
export class StageRenderer {
  private voices: { score: ScoreDocument | null; map: Map<string, Voice> } = { score: null, map: new Map() }
  private layoutCache: { w: number; h: number; first: number; last: number; layout: KeyboardLayout } | null = null
  private rangeCache: { score: ScoreDocument | null; zoom: ZoomMode; range: [number, number] } = {
    score: null, zoom: 'full', range: [FIRST_PITCH, LAST_PITCH],
  }
  private themeCache: { key: string; layout: KeyboardLayout | null; theme: Theme | null } = { key: '', layout: null, theme: null }
  private readonly readThemeFrom: () => Theme

  constructor(readThemeFrom: () => Theme) { this.readThemeFrom = readThemeFrom }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, input: StageInput): StageFrame {
    const st = input.settings
    const [first, last] = input.range ?? this.rangeFor(input.score, st.display.zoom)
    const layout = this.layoutFor(Math.max(1, w), Math.max(1, h), first, last)
    const rs: RenderState = {
      notes: input.score?.notes ?? [],
      voices: this.voicesFor(input.score),
      layout,
      velocity: st.velocity,
      fallSeconds: input.fallSeconds,
      maxNoteDur: input.maxNoteDur,
      showRoll: input.showRoll,
      showGrid: input.showRoll && st.display.showGrid,
      showFlash: st.display.showFlash,
      flashScale: st.display.flashScale,
      showMiddleC: st.display.showMiddleC,
      theme: this.themeFor(st.theme.name, st.theme.stageBgOverride, layout),
    }
    const held = drawStage(ctx, rs, t, input.score ? t / input.score.durationSec : 0)
    return { layout, held }
  }

  // Cached by score identity so the draw loop does not allocate a fresh Map
  // 60x/sec for data that only changes when the score is replaced.
  voicesFor(score: ScoreDocument | null): Map<string, Voice> {
    if (this.voices.score !== score) {
      this.voices = { score, map: new Map((score?.voices ?? []).map((v) => [v.id, v])) }
    }
    return this.voices.map
  }

  // Cached by (w, h, first, last): 88 KeyRects and a Map only on resize or zoom.
  layoutFor(w: number, h: number, first: number, last: number): KeyboardLayout {
    const c = this.layoutCache
    if (!c || c.w !== w || c.h !== h || c.first !== first || c.last !== last) {
      const layout = computeLayout(w, h, { firstPitch: first, lastPitch: last })
      this.layoutCache = { w, h, first, last, layout }
      return layout
    }
    return c.layout
  }

  // fitRange scans every note; the range only changes on load or a zoom switch.
  rangeFor(score: ScoreDocument | null, zoom: ZoomMode): [number, number] {
    const c = this.rangeCache
    if (c.score === score && c.zoom === zoom) return c.range
    const range: [number, number] = zoom === 'fit' && score ? fitRange(score.notes) : [FIRST_PITCH, LAST_PITCH]
    this.rangeCache = { score, zoom, range }
    return range
  }

  // getComputedStyle forces a style recalculation and must never run per frame:
  // keyed on the theme name, the stage-background override and the layout.
  private themeFor(name: ThemeName, override: string | null, layout: KeyboardLayout): Theme {
    const key = `${name}|${override ?? ''}`
    const c = this.themeCache
    if (c.key !== key || c.layout !== layout || !c.theme) {
      this.themeCache = { key, layout, theme: this.readThemeFrom() }
    }
    return this.themeCache.theme!
  }
}
```

- [ ] **Step 5: `KeyContextCache`** — append to `core/music/keyOf.ts` (App's original lines 176–188):

```ts
/**
 * keyOfScore parses a key string into a fresh object; this caches it by key
 * signature and override so the draw loop neither allocates it per frame nor
 * hands the chord feed a new key identity (which forces a tonal re-detect).
 */
export class KeyContextCache {
  private c: { sig: ScoreDocument['keySignature'] | null; override: string | null; key: KeyContext } | null = null

  get(score: ScoreDocument | null, override: string | null): KeyContext {
    const sig = score?.keySignature ?? null
    if (this.c && this.c.sig === sig && this.c.override === override) return this.c.key
    const key = keyOfScore(score, override)
    this.c = { sig, override, key }
    return key
  }
}
```

- [ ] **Step 6: Export** — append to `core/index.ts`:

```ts
export * from './render/stageRenderer'
export * from './render/frameLoop'
export * from './render/activeNotes'
```

- [ ] **Step 7: Run**

Run: `npx vitest run --project ivories src/core && npm test`
Expected: new tests pass; whole suite green.

- [ ] **Step 8: Commit**

```bash
git add packages/ivories/src/core
git commit -m "$(cat <<'EOF'
feat(core): StageRenderer, FrameLoop and held-note diffing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 10: `IvoriesProvider`, hooks, score loading, page-wide audio claim

**Files:**
- Create (core): `packages/ivories/src/core/errors.ts`, `core/io/loadScoreSource.ts`, `core/model/score.ts`, `core/audio/claim.ts`, `core/audio/sharedContext.ts`, `core/settings/resolve.ts`, `core/midi/types.ts`
- Create (react): `packages/ivories/src/react/ValueStore.ts`, `react/context.ts`, `react/useDisposable.ts`, `react/IvoriesProvider.tsx`, `react/hooks.ts`, `react/withProvider.tsx`, `react/IvoriesBoundary.tsx`
- Test: `core/io/loadScoreSource.test.ts`, `core/audio/claim.test.ts`, `react/IvoriesProvider.test.tsx`, `react/ssr.test.ts`, `react/testEngine.test-helpers.ts`
- Modify: `core/index.ts`, `src/index.ts`, `apps/studio/src/transport/useTransport.ts` (import `longestNoteSec` from `ivories/core`, delete its local copy)

**Interfaces:**
- Consumes: Tasks 4, 6, 9.
- Produces:
  - `type IvoriesErrorCode = 'score-load' | 'score-parse' | 'audio-unavailable' | 'midi-unavailable' | 'camera-unavailable' | 'notation-unavailable' | 'notation-needs-musicxml' | 'render-failed'`; `class IvoriesError extends Error { readonly code: IvoriesErrorCode }` (`message`, `cause`); `isIvoriesError(e): e is IvoriesError`
  - `interface ScoreSource { scoreUrl?: string; file?: Blob; musicXml?: string; midi?: ArrayBuffer | Uint8Array }`; `loadScoreSource(src: ScoreSource, tempo?: TempoSetting, fetchFn?: typeof fetch): Promise<ScoreDocument>`
  - `longestNoteSec(score: ScoreDocument): number` (moved from useTransport)
  - `claimPlayback(owner: PlaybackOwner)`, `releasePlayback(owner)`, `interface PlaybackOwner { pause(): void }`; `sharedAudioContext(): AudioContext`
  - `resolveSettings(o: { settings?: Partial<Settings>; look?: LookV1; theme?: ThemeName }): Settings`
  - `interface LiveNote { midi: number; velocity: number; time: number }`
  - `class ValueStore<T> { get(): T; set(v: T): void; subscribe(l: () => void): () => void }`
  - `interface IvoriesNoteEvent { midi: number; velocity: number; time: number; source: 'score' | 'live' }`
  - `interface ActiveNotes { score: ReadonlyMap<number, NoteEvent>; live: ReadonlyMap<number, LiveNote> }`
  - `interface ProviderStatus { loading: boolean; error: IvoriesError | null }`
  - `interface IvoriesContextValue { score: ScoreDocument | null; clock: Clock; engine: AudioEngine; settings: Settings; fallSeconds: number; maxNoteDur: number; audio: boolean; frames: FrameLoop; active: ValueStore<ActiveNotes>; status: ValueStore<ProviderStatus>; setAudio(patch: Partial<AudioSettings>): void; reportError(e: IvoriesError): void }`
  - `interface IvoriesEvents { onReady?(i: { score: ScoreDocument; duration: number }): void; onNoteOn?(e: IvoriesNoteEvent): void; onNoteOff?(e: IvoriesNoteEvent): void; onTimeUpdate?(t: number): void; onError?(e: IvoriesError): void }`
  - `interface IvoriesProviderProps extends ScoreSource, IvoriesEvents { score?: ScoreDocument | null; clock?: Clock; engine?: AudioEngine; audio?: boolean; tempo?: TempoSetting; theme?: ThemeName; look?: LookV1; settings?: Partial<Settings>; fallSeconds?: number; children?: ReactNode; ref?: Ref<IvoriesHandle> }`
  - `interface IvoriesHandle { play(): void; pause(): void; seek(t: number): void; setRate(r: number): void; readonly clock: Clock }`
  - `IvoriesProvider`, `IvoriesContext`, `useIvories()`, `useIvoriesOptional()`, `useClock(): { clock: Clock; playing: boolean; rate: number }`, `useClockTime(hz?: number): number`, `useActiveNotes(): ActiveNotes`
  - `withProvider<P>(View, displayName)`, `PROVIDER_KEYS`, `type SelfContainedProps = Omit<IvoriesProviderProps, 'children' | 'ref'> & { liveAudio?: boolean; midiDeviceId?: string | null }`
  - `IvoriesBoundary` (class), `Guarded({ code?, className?, children })`

- [ ] **Step 1: Core pieces.** `core/errors.ts`:

```ts
export type IvoriesErrorCode =
  | 'score-load' | 'score-parse' | 'audio-unavailable' | 'midi-unavailable'
  | 'camera-unavailable' | 'notation-unavailable' | 'notation-needs-musicxml'
  | 'render-failed'

/** What onError receives (spec §8): { code, message, cause }. Never thrown into the host. */
export class IvoriesError extends Error {
  readonly code: IvoriesErrorCode

  constructor(code: IvoriesErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'IvoriesError'
    this.code = code
  }
}

/** Duck-typed so it survives a second copy of the module. */
export function isIvoriesError(e: unknown): e is IvoriesError {
  return e instanceof Error && e.name === 'IvoriesError' && typeof (e as { code?: unknown }).code === 'string'
}
```

`core/model/score.ts`:

```ts
import type { ScoreDocument } from './types'

/** Longest note in seconds. A fixed cutoff is wrong for some score: at the
    tempo control's 25% minimum, any note over 2s at notated tempo exceeds 8s. */
export function longestNoteSec(score: ScoreDocument): number {
  return score.notes.reduce((m, n) => Math.max(m, n.endSec - n.startSec), 0)
}
```

Delete `longestNoteSec` from `useTransport.ts` and import it from `'ivories/core'` there.

`core/audio/claim.ts`:

```ts
/** Whoever is sounding. Only one provider on a page plays at a time (spec §3.2). */
export interface PlaybackOwner { pause(): void }

let holder: PlaybackOwner | null = null

export function claimPlayback(owner: PlaybackOwner): void {
  if (holder === owner) return
  const previous = holder
  holder = owner
  previous?.pause()
}

export function releasePlayback(owner: PlaybackOwner): void {
  if (holder === owner) holder = null
}
```

`core/audio/sharedContext.ts`:

```ts
let shared: AudioContext | null = null

/** One AudioContext for every provider on the page. Created on first use, never at import. */
export function sharedAudioContext(): AudioContext {
  if (!shared || shared.state === 'closed') shared = new AudioContext()
  return shared
}
```

`core/settings/resolve.ts`:

```ts
import { DEFAULT_SETTINGS } from './types'
import { applyLook } from '../platform/look'
import type { Settings, ThemeName } from './types'
import type { LookV1 } from '../platform/types'

/** Defaults, then a look, then explicit settings, then the theme shorthand. */
export function resolveSettings(o: { settings?: Partial<Settings>; look?: LookV1; theme?: ThemeName }): Settings {
  const s: Settings = structuredClone(DEFAULT_SETTINGS)
  if (o.look) {
    const a = applyLook(o.look)
    s.theme = a.theme
    s.display = a.display
    s.velocity = a.velocity
    s.text = { ...a.text, keyOverride: null }
  }
  if (o.settings) Object.assign(s, structuredClone(o.settings))
  if (o.theme) s.theme = { ...s.theme, name: o.theme }
  return s
}
```

`core/midi/types.ts`:

```ts
/** A live key, as lit and reported (spec §4.1). `time` is seconds on performance.now(). */
export interface LiveNote { midi: number; velocity: number; time: number }
```

- [ ] **Step 2: `loadScoreSource` (test first).** `core/io/loadScoreSource.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Midi } from '@tonejs/midi'
import { loadScoreSource } from './loadScoreSource'

const midiBytes = () => {
  const m = new Midi()
  m.header.setTempo(120)
  const t = m.addTrack()
  t.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 })
  return new Uint8Array(m.toArray())
}
const okFetch = (bytes: Uint8Array) => (async () => new Response(bytes)) as unknown as typeof fetch

describe('loadScoreSource (spec §3.2 score sources)', () => {
  it('parses MIDI bytes and hashes them', async () => {
    const s = await loadScoreSource({ midi: midiBytes() })
    expect(s.notes).toHaveLength(1)
    expect(s.id).toMatch(/^[0-9a-f]{64}$/)
  })

  it('parses a MusicXML string and keeps the raw XML for notation', async () => {
    const xml = readFileSync(join(__dirname, '__fixtures__/musescore4-minuet.musicxml'), 'utf8')
    const s = await loadScoreSource({ musicXml: xml })
    expect(s.sourceFormat).toBe('musicxml')
    expect(s.rawXml).toBe(xml)
  })

  it('fetches a scoreUrl and names the score after the file', async () => {
    const s = await loadScoreSource({ scoreUrl: '/songs/demo%20one.mid?x=1' }, undefined, okFetch(midiBytes()))
    expect(s.name).toBe('demo one.mid')
  })

  it('reports score-load for a failed fetch and score-parse for junk or an empty file', async () => {
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch
    await expect(loadScoreSource({ scoreUrl: '/x.mid' }, undefined, notFound)).rejects.toMatchObject({ code: 'score-load' })
    await expect(loadScoreSource({ midi: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ code: 'score-parse' })
    const empty = new Midi(); empty.addTrack()
    await expect(loadScoreSource({ midi: new Uint8Array(empty.toArray()) })).rejects.toMatchObject({ code: 'score-parse' })
  })
})
```

Run: `npx vitest run --project ivories src/core/io/loadScoreSource.test.ts` → FAIL. Then `core/io/loadScoreSource.ts`:

```ts
import { parseScoreFile } from './loadScoreFile'
import { parseMusicXml } from './parseMusicXml'
import { hashFile } from './hashFile'
import { IvoriesError } from '../errors'
import type { ScoreDocument, TempoSetting } from '../model/types'

/** Score source props, matching pepperscore's (spec §3.2). First present wins. */
export interface ScoreSource {
  scoreUrl?: string
  file?: Blob
  musicXml?: string
  midi?: ArrayBuffer | Uint8Array
}

const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }

function toArrayBuffer(b: ArrayBuffer | Uint8Array): ArrayBuffer {
  return b instanceof ArrayBuffer ? b : (b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
}

async function readSource(src: ScoreSource, fetchFn: typeof fetch): Promise<{ bytes: ArrayBuffer; name: string; xml?: string }> {
  try {
    if (src.musicXml !== undefined) {
      return { bytes: toArrayBuffer(new TextEncoder().encode(src.musicXml)), name: 'score.musicxml', xml: src.musicXml }
    }
    if (src.midi !== undefined) return { bytes: toArrayBuffer(src.midi), name: 'score.mid' }
    if (src.file !== undefined) return { bytes: await src.file.arrayBuffer(), name: (src.file as File).name || 'score' }
    if (src.scoreUrl !== undefined) {
      const res = await fetchFn(src.scoreUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const last = src.scoreUrl.split(/[?#]/)[0].split('/').pop() || 'score'
      return { bytes: await res.arrayBuffer(), name: decodeURIComponent(last) }
    }
  } catch (e) {
    throw new IvoriesError('score-load', `Could not load the score: ${(e as Error).message}`, e)
  }
  throw new IvoriesError('score-load', 'No score source was given.')
}

/** Loads and parses a score source. Rejects only with an IvoriesError. */
export async function loadScoreSource(
  src: ScoreSource, tempo: TempoSetting = SCALE_1, fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<ScoreDocument> {
  const { bytes, name, xml } = await readSource(src, fetchFn)
  let score: ScoreDocument
  try {
    score = xml !== undefined ? parseMusicXml(xml, name, tempo) : parseScoreFile(bytes, name, tempo)
  } catch (e) {
    throw new IvoriesError('score-parse', `Could not read ${name}: ${(e as Error).message}`, e)
  }
  if (score.notes.length === 0) throw new IvoriesError('score-parse', `${name} contains no notes.`)
  score.id = await hashFile(bytes)
  return score
}
```

Run the test → PASS.

- [ ] **Step 3: Claim test** `core/audio/claim.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { claimPlayback, releasePlayback } from './claim'

describe('page-wide playback claim', () => {
  it('a second claimant pauses the first; a released owner is never paused', () => {
    const a = { pause: vi.fn() }, b = { pause: vi.fn() }
    claimPlayback(a)
    claimPlayback(b)
    expect(a.pause).toHaveBeenCalledTimes(1)
    releasePlayback(b)
    claimPlayback(a)
    expect(b.pause).not.toHaveBeenCalled()
    releasePlayback(a)
  })
})
```

- [ ] **Step 4: React plumbing.** `react/ValueStore.ts`:

```ts
/** A tiny external store for useSyncExternalStore (the library ships no zustand, R12). */
export class ValueStore<T> {
  private value: T
  private readonly listeners = new Set<() => void>()

  constructor(value: T) { this.value = value }

  get = (): T => this.value

  set(v: T): void {
    if (Object.is(v, this.value)) return
    this.value = v
    for (const l of [...this.listeners]) l()
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }
}
```

`react/useDisposable.ts`:

```ts
import { useEffect, useState } from 'react'
import type { DependencyList } from 'react'

/**
 * Creates a resource in an effect and disposes it on cleanup. Null until the
 * first effect runs (also on the server), and StrictMode-safe: a remount gets
 * a fresh resource instead of a disposed one.
 */
export function useDisposable<T>(make: () => T | null, dispose: (t: T) => void, deps: DependencyList): T | null {
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    const v = make()
    setValue(() => v)
    return () => {
      if (v !== null) dispose(v)
      setValue(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return value
}
```

`react/context.ts`:

```ts
import { createContext } from 'react'
import type { AudioEngine } from '../core/audio/engine'
import type { Clock } from '../core/clock/types'
import type { FrameLoop } from '../core/render/frameLoop'
import type { IvoriesError } from '../core/errors'
import type { LiveNote } from '../core/midi/types'
import type { NoteEvent, ScoreDocument } from '../core/model/types'
import type { AudioSettings, Settings } from '../core/settings/types'
import type { ValueStore } from './ValueStore'

export interface IvoriesNoteEvent { midi: number; velocity: number; time: number; source: 'score' | 'live' }
export interface ActiveNotes { score: ReadonlyMap<number, NoteEvent>; live: ReadonlyMap<number, LiveNote> }
export interface ProviderStatus { loading: boolean; error: IvoriesError | null }

export interface IvoriesContextValue {
  score: ScoreDocument | null
  clock: Clock
  engine: AudioEngine
  settings: Settings
  fallSeconds: number
  maxNoteDur: number
  /** This provider schedules audio (spec §3.1 rule). */
  audio: boolean
  frames: FrameLoop
  active: ValueStore<ActiveNotes>
  status: ValueStore<ProviderStatus>
  setAudio(patch: Partial<AudioSettings>): void
  reportError(e: IvoriesError): void
}

export const IvoriesContext = createContext<IvoriesContextValue | null>(null)
```

- [ ] **Step 5: `react/IvoriesProvider.tsx`**

```tsx
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'
import { AudioEngine } from '../core/audio/engine'
import { AudioClock } from '../core/clock/AudioClock'
import { PlaybackDriver } from '../core/audio/playback'
import { claimPlayback, releasePlayback } from '../core/audio/claim'
import { sharedAudioContext } from '../core/audio/sharedContext'
import { FrameLoop } from '../core/render/frameLoop'
import { EMPTY_HELD, diffHeld, heldScoreNotes } from '../core/render/activeNotes'
import { loadScoreSource } from '../core/io/loadScoreSource'
import { longestNoteSec } from '../core/model/score'
import { resolveSettings } from '../core/settings/resolve'
import { IvoriesError, isIvoriesError } from '../core/errors'
import { IvoriesContext } from './context'
import { ValueStore } from './ValueStore'
import { useDisposable } from './useDisposable'
import type { Clock } from '../core/clock/types'
import type { ScoreSource } from '../core/io/loadScoreSource'
import type { NoteEvent, ScoreDocument, TempoSetting } from '../core/model/types'
import type { AudioSettings, Settings, ThemeName } from '../core/settings/types'
import type { LookV1 } from '../core/platform/types'
import type { ActiveNotes, IvoriesContextValue, IvoriesNoteEvent, ProviderStatus } from './context'

export interface IvoriesEvents {
  onReady?(info: { score: ScoreDocument; duration: number }): void
  onNoteOn?(e: IvoriesNoteEvent): void
  onNoteOff?(e: IvoriesNoteEvent): void
  /** Throttled to ~10 Hz of score time. */
  onTimeUpdate?(t: number): void
  onError?(e: IvoriesError): void
}

export interface IvoriesHandle {
  play(): void
  pause(): void
  seek(t: number): void
  setRate(r: number): void
  readonly clock: Clock
}

export interface IvoriesProviderProps extends ScoreSource, IvoriesEvents {
  /** An already-parsed score. Passing this (even null) makes the provider controlled. */
  score?: ScoreDocument | null
  clock?: Clock
  /** Advanced/test seam; the provider builds one on the page-wide AudioContext otherwise. */
  engine?: AudioEngine
  /** Schedule audio. Default true (false by default for a MediaClock, Task 15). */
  audio?: boolean
  /** The TempoSetting the given score is timed at (studio only; default scale 1). */
  tempo?: TempoSetting
  theme?: ThemeName
  look?: LookV1
  settings?: Partial<Settings>
  fallSeconds?: number
  children?: ReactNode
  ref?: Ref<IvoriesHandle>
}

const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }
const NO_ACTIVE: ActiveNotes = { score: EMPTY_HELD, live: new Map() }

/** One score, one clock, one audio engine, one animation-frame loop (spec §3.2). */
export function IvoriesProvider(props: IvoriesProviderProps) {
  const latest = useRef(props)
  latest.current = props
  const [status] = useState(() => new ValueStore<ProviderStatus>({ loading: false, error: null }))
  const [active] = useState(() => new ValueStore<ActiveNotes>(NO_ACTIVE))

  const report = useCallback((e: IvoriesError) => {
    status.set({ loading: false, error: e })
    latest.current.onError?.(e)
  }, [status])

  // ---- engine and clock: the host's, or our own ----
  const ownEngine = useDisposable(
    () => (props.engine ? null : new AudioEngine({ makeContext: sharedAudioContext })),
    (e) => e.dispose(), [!props.engine],
  )
  const engine = props.engine ?? ownEngine
  const ownClock = useDisposable(
    () => (props.clock || !engine ? null : new AudioClock(engine, { isRunning: () => engine.running })),
    (c) => c.dispose(), [!props.clock, engine],
  )
  const clock = props.clock ?? ownClock

  // ---- score: controlled, or loaded from a source prop ----
  const controlled = props.score !== undefined
  const { scoreUrl, file, musicXml, midi } = props
  const tempo = props.tempo ?? SCALE_1
  const tempoKey = JSON.stringify(tempo)
  const [loaded, setLoaded] = useState<ScoreDocument | null>(null)
  useEffect(() => {
    if (controlled) return
    if (scoreUrl === undefined && file === undefined && musicXml === undefined && midi === undefined) {
      setLoaded(null)
      return
    }
    let live = true
    status.set({ loading: true, error: null })
    loadScoreSource({ scoreUrl, file, musicXml, midi }, latest.current.tempo ?? SCALE_1).then(
      (s) => { if (live) { status.set({ loading: false, error: null }); setLoaded(s) } },
      (e) => {
        if (!live) return
        setLoaded(null)
        report(isIvoriesError(e) ? e : new IvoriesError('score-load', String(e), e))
      },
    )
    return () => { live = false }
  }, [controlled, scoreUrl, file, musicXml, midi, tempoKey, status, report])
  const score = controlled ? (props.score ?? null) : loaded

  // ---- settings ----
  const [audioPatch, setAudioPatch] = useState<Partial<AudioSettings>>({})
  const settings = useMemo(() => {
    const s = resolveSettings({ settings: props.settings, look: props.look, theme: props.theme })
    return { ...s, audio: { ...s.audio, ...audioPatch } }
  }, [props.settings, props.look, props.theme, audioPatch])
  const fallSeconds = props.fallSeconds ?? props.look?.display.fallSeconds ?? 3
  const notes = score?.notes
  const maxNoteDur = useMemo(() => (score ? longestNoteSec(score) : 0), [notes]) // eslint-disable-line react-hooks/exhaustive-deps
  const audio = props.audio ?? true

  // Read by the driver and the frame loop without re-subscribing.
  const scoreRef = useRef(score); scoreRef.current = score
  const settingsRef = useRef(settings); settingsRef.current = settings
  const audioRef = useRef(audio); audioRef.current = audio
  const tempoRef = useRef(tempo); tempoRef.current = tempo
  const maxNoteDurRef = useRef(maxNoteDur); maxNoteDurRef.current = maxNoteDur

  // ---- scheduler ----
  const driverRef = useRef<PlaybackDriver | null>(null)
  useEffect(() => {
    if (!clock || !engine) return
    const d = new PlaybackDriver({
      clock, engine,
      getScore: () => scoreRef.current,
      getAudio: () => settingsRef.current.audio,
      audioEnabled: () => audioRef.current,
    })
    d.setScore(scoreRef.current, tempoRef.current)
    d.start()
    driverRef.current = d
    return () => { d.dispose(); driverRef.current = null }
  }, [clock, engine])
  // Rebuilt only when the note array is replaced (a voice edit keeps it).
  useEffect(() => { driverRef.current?.setScore(scoreRef.current, tempoRef.current) }, [notes])

  // ---- our own engine loads its instruments ----
  const voices = score?.voices
  useEffect(() => {
    if (!ownEngine || !voices) return
    let live = true
    Promise.all(voices.map((v) => ownEngine.loadVoice(v))).then(
      () => { if (live) ownEngine.retainVoices(voices.map((v) => v.id)) },
      (e) => { if (live) report(new IvoriesError('audio-unavailable', 'The instruments could not load; playing silently.', e)) },
    )
    return () => { live = false }
  }, [ownEngine, voices, report])
  useEffect(() => { ownEngine?.setMasterVolume(settings.audio.masterVolume) }, [ownEngine, settings.audio.masterVolume])

  // ---- only one provider on the page sounds at a time ----
  useEffect(() => {
    if (!clock || !audio) return
    const owner = { pause: () => clock.pause() }
    const off = clock.subscribe((e) => { if (e.type === 'play') claimPlayback(owner) })
    return () => { off(); releasePlayback(owner) }
  }, [clock, audio])

  // ---- the shared frame loop: time updates and score note on/off ----
  const frames = useDisposable(() => (clock ? new FrameLoop(() => clock.now()) : null), (f) => f.dispose(), [clock])
  useEffect(() => {
    if (!frames) return
    let lastT = Number.NaN
    let lastTenth = Number.NaN
    let held: ReadonlyMap<number, NoteEvent> = EMPTY_HELD
    return frames.add((t) => {
      if (t === lastT) return
      lastT = t
      const tenth = Math.round(t * 10)
      if (tenth !== lastTenth) { lastTenth = tenth; latest.current.onTimeUpdate?.(t) }
      const s = scoreRef.current
      const next = s ? heldScoreNotes(s, t, maxNoteDurRef.current) : EMPTY_HELD
      const d = diffHeld(held, next)
      if (!d) return
      held = next
      active.set({ ...active.get(), score: next })
      const ev = latest.current
      for (const n of d.off) ev.onNoteOff?.({ midi: n.pitch, velocity: 0, time: t, source: 'score' })
      for (const n of d.on) ev.onNoteOn?.({ midi: n.pitch, velocity: n.velocity, time: n.startSec, source: 'score' })
    })
  }, [frames, active])

  useEffect(() => { if (score) latest.current.onReady?.({ score, duration: score.durationSec }) }, [score])

  useImperativeHandle(props.ref, () => ({
    play: () => {
      if (!clock) return
      if (engine && audio) {
        engine.resume().catch((e) => report(new IvoriesError('audio-unavailable', 'Audio could not start; playing silently.', e)))
      }
      clock.play()
    },
    pause: () => clock?.pause(),
    seek: (t: number) => clock?.seek(t),
    setRate: (r: number) => clock?.setRate(r),
    get clock() { return clock as Clock },
  }), [clock, engine, audio, report])

  const setAudio = useCallback((p: Partial<AudioSettings>) => setAudioPatch((cur) => ({ ...cur, ...p })), [])
  const value = useMemo<IvoriesContextValue | null>(() => (clock && engine && frames
    ? { score, clock, engine, settings, fallSeconds, maxNoteDur, audio, frames, active, status, setAudio, reportError: report }
    : null), [score, clock, engine, settings, fallSeconds, maxNoteDur, audio, frames, active, status, setAudio, report])

  // Children render once the clock, engine and frame loop exist (after the
  // first effect; never on the server), so a view always finds a context.
  return <IvoriesContext.Provider value={value}>{value ? props.children : null}</IvoriesContext.Provider>
}
```

- [ ] **Step 6: Hooks, `withProvider`, boundary.** `react/hooks.ts`:

```ts
import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { IvoriesContext } from './context'
import type { ActiveNotes, IvoriesContextValue } from './context'
import type { Clock } from '../core/clock/types'

export function useIvoriesOptional(): IvoriesContextValue | null {
  return useContext(IvoriesContext)
}

/** Score, clock, engine and settings of the nearest provider. */
export function useIvories(): IvoriesContextValue {
  const v = useContext(IvoriesContext)
  if (!v) throw new Error('useIvories() must be used inside <IvoriesProvider> or an ivories component.')
  return v
}

/** Re-renders on clock events (play/pause/seek/rate), never per frame. */
export function useClock(): { clock: Clock; playing: boolean; rate: number } {
  const { clock } = useIvories()
  const subscribe = useCallback((cb: () => void) => clock.subscribe(cb), [clock])
  const key = useSyncExternalStore(subscribe, () => `${clock.playing ? 1 : 0}|${clock.rate}`, () => '0|1')
  const [p, r] = key.split('|')
  return { clock, playing: p === '1', rate: Number(r) }
}

/** The clock time for UI, throttled to `hz` updates per score-second. */
export function useClockTime(hz = 10): number {
  const { clock, frames } = useIvories()
  const [t, setT] = useState(() => clock.now())
  useEffect(() => {
    let last = Number.NaN
    return frames.add((now) => {
      const q = Math.round(now * hz)
      if (q !== last) { last = q; setT(now) }
    })
  }, [frames, hz])
  return t
}

/** Score and live notes sounding now; changes only when a set changes. */
export function useActiveNotes(): ActiveNotes {
  const { active } = useIvories()
  return useSyncExternalStore(active.subscribe, active.get, active.get)
}
```

`react/IvoriesBoundary.tsx`:

```tsx
import { Component, useContext } from 'react'
import type { ReactNode } from 'react'
import { IvoriesError } from '../core/errors'
import { IvoriesContext } from './context'
import type { IvoriesErrorCode } from '../core/errors'

interface BoundaryProps {
  code: IvoriesErrorCode
  onError?: (e: IvoriesError) => void
  className?: string
  children?: ReactNode
}

/** A failing view never tears down its siblings (spec §8). */
export class IvoriesBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }

  componentDidCatch(cause: unknown): void {
    this.props.onError?.(new IvoriesError(this.props.code, 'This view stopped working.', cause))
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className={`ivories ivories-message ivories-boundary ${this.props.className ?? ''}`} role="alert">
          This view stopped working.
        </div>
      )
    }
    return this.props.children
  }
}

export function Guarded(props: { code?: IvoriesErrorCode; className?: string; children?: ReactNode }) {
  const ctx = useContext(IvoriesContext)
  return (
    <IvoriesBoundary code={props.code ?? 'render-failed'} onError={ctx?.reportError} className={props.className}>
      {props.children}
    </IvoriesBoundary>
  )
}
```

`react/withProvider.tsx`:

```tsx
import { useContext } from 'react'
import type { ComponentType } from 'react'
import { IvoriesContext } from './context'
import { IvoriesProvider } from './IvoriesProvider'
import type { IvoriesProviderProps } from './IvoriesProvider'

/** Props a self-contained component hands to the provider it creates (spec §3.2). */
export const PROVIDER_KEYS = [
  'score', 'scoreUrl', 'file', 'musicXml', 'midi', 'clock', 'engine', 'audio', 'tempo',
  'theme', 'look', 'settings', 'fallSeconds', 'liveAudio', 'midiDeviceId',
  'onReady', 'onNoteOn', 'onNoteOff', 'onTimeUpdate', 'onError',
] as const

export type SelfContainedProps = Omit<IvoriesProviderProps, 'children' | 'ref'> & {
  liveAudio?: boolean
  midiDeviceId?: string | null
}

/** Inside a provider: render the view. Outside: wrap it in its own provider. */
export function withProvider<P extends object>(View: ComponentType<P>, displayName: string) {
  function Wrapped(props: P & SelfContainedProps) {
    const inside = useContext(IvoriesContext) !== null
    if (inside) return <View {...props} />
    const providerProps: Record<string, unknown> = {}
    const viewProps: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(props)) {
      if ((PROVIDER_KEYS as readonly string[]).includes(k)) providerProps[k] = v
      if (!(PROVIDER_KEYS as readonly string[]).includes(k) || k === 'theme') viewProps[k] = v
    }
    return (
      <IvoriesProvider {...(providerProps as IvoriesProviderProps)}>
        <View {...(viewProps as P)} />
      </IvoriesProvider>
    )
  }
  Wrapped.displayName = displayName
  return Wrapped
}
```

- [ ] **Step 7: Tests.** `react/testEngine.test-helpers.ts`:

```ts
import { vi } from 'vitest'
import type { AudioEngine } from '../core/audio/engine'

/** An AudioEngine stand-in for jsdom (no AudioContext). */
export function fakeEngine(src = { currentTime: 0 }) {
  return {
    get currentTime() { return src.currentTime },
    running: true,
    resume: vi.fn(async () => {}),
    play: vi.fn(),
    stopAll: vi.fn(),
    metronome: () => ({ click: vi.fn(), stop: vi.fn() }),
    loadVoice: vi.fn(async () => {}),
    retainVoices: vi.fn(),
    setMasterVolume: vi.fn(),
    setVoiceVolume: vi.fn(),
    dispose: vi.fn(),
  } as unknown as AudioEngine & { play: ReturnType<typeof vi.fn> }
}
```

`react/IvoriesProvider.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { IvoriesProvider } from './IvoriesProvider'
import { useIvories } from './hooks'
import { AudioClock } from '../core/clock/AudioClock'
import { parseMidi } from '../core/io/parseMidi'
import { fakeEngine } from './testEngine.test-helpers'
import type { IvoriesHandle } from './IvoriesProvider'

const bytes = () => {
  const m = new Midi(); m.header.setTempo(120)
  const t = m.addTrack()
  t.addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  t.addNote({ midi: 64, time: 1, duration: 1, velocity: 0.8 })
  return new Uint8Array(m.toArray())
}
const scoreDoc = () => parseMidi(bytes().buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })

function ScoreName() {
  const { score } = useIvories()
  return <span data-testid="name">{score?.name ?? 'none'}</span>
}

describe('IvoriesProvider (spec §3.2)', () => {
  it('renders children with the controlled score once ready', async () => {
    render(<IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}><ScoreName /></IvoriesProvider>)
    expect((await screen.findByTestId('name')).textContent).toBe('a.mid')
  })

  it('self-contained: loads a midi source and fires onReady with the duration', async () => {
    const onReady = vi.fn()
    render(<IvoriesProvider midi={bytes()} engine={fakeEngine()} onReady={onReady}><ScoreName /></IvoriesProvider>)
    await waitFor(() => expect(onReady).toHaveBeenCalled())
    expect(onReady.mock.calls[0][0].duration).toBeCloseTo(2, 3)
  })

  it('reports a bad source through onError and keeps rendering', async () => {
    const onError = vi.fn()
    render(<IvoriesProvider midi={new Uint8Array([1, 2, 3])} engine={fakeEngine()} onError={onError}><ScoreName /></IvoriesProvider>)
    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(onError.mock.calls[0][0].code).toBe('score-parse')
    expect(screen.getByTestId('name').textContent).toBe('none')
  })

  it('fires onNoteOn from score playback as the clock moves', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    const onNoteOn = vi.fn()
    render(<IvoriesProvider score={scoreDoc()} clock={clock} engine={fakeEngine()} audio={false} onNoteOn={onNoteOn}><span /></IvoriesProvider>)
    act(() => clock.seek(0.1))
    await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 60, source: 'score' })))
    act(() => clock.seek(1.5))
    await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 64 })))
  })

  it('only one provider on the page plays at a time', async () => {
    const a = new AudioClock({ currentTime: 0 }), b = new AudioClock({ currentTime: 0 })
    render(<>
      <IvoriesProvider score={scoreDoc()} clock={a} engine={fakeEngine()}><span /></IvoriesProvider>
      <IvoriesProvider score={scoreDoc()} clock={b} engine={fakeEngine()}><span /></IvoriesProvider>
    </>)
    await waitFor(() => expect(document.querySelectorAll('span')).toHaveLength(2))
    act(() => a.play())
    act(() => b.play())
    expect(b.playing).toBe(true)
    expect(a.playing).toBe(false)
  })

  it('exposes play/pause/seek/setRate/clock on its ref', async () => {
    const ref = createRef<IvoriesHandle>()
    const clock = new AudioClock({ currentTime: 0 })
    render(<IvoriesProvider ref={ref} score={scoreDoc()} clock={clock} engine={fakeEngine()}><span /></IvoriesProvider>)
    await waitFor(() => expect(ref.current).not.toBeNull())
    act(() => ref.current!.seek(1.25))
    expect(clock.now()).toBe(1.25)
    act(() => ref.current!.setRate(0.5))
    expect(ref.current!.clock.rate).toBe(0.5)
  })
})
```

`react/ssr.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'

describe('SSR safety (spec §4)', () => {
  it('imports both entries without touching window', async () => {
    expect(typeof window).toBe('undefined')
    await expect(import('../index')).resolves.toBeDefined()
    await expect(import('../core/index')).resolves.toBeDefined()
  })

  it('renders a provider to a string without running its effects', async () => {
    const { renderToString } = await import('react-dom/server')
    const { IvoriesProvider } = await import('../index')
    const html = renderToString(createElement(IvoriesProvider, { score: null }, createElement('b', null, 'x')))
    expect(html).toBe('')
  })
})
```

- [ ] **Step 8: Exports.** Append to `core/index.ts`:

```ts
export * from './errors'
export * from './io/loadScoreSource'
export * from './model/score'
export * from './audio/claim'
export * from './audio/sharedContext'
export * from './settings/resolve'
export * from './midi/types'
```

Append to `src/index.ts`:

```ts
export { IvoriesProvider } from './react/IvoriesProvider'
export type { IvoriesProviderProps, IvoriesHandle, IvoriesEvents } from './react/IvoriesProvider'
export { useIvories, useIvoriesOptional, useClock, useClockTime, useActiveNotes } from './react/hooks'
export type { ActiveNotes, IvoriesNoteEvent, IvoriesContextValue, ProviderStatus } from './react/context'
export { withProvider } from './react/withProvider'
export type { SelfContainedProps } from './react/withProvider'
export { IvoriesBoundary, Guarded } from './react/IvoriesBoundary'
```

- [ ] **Step 9: Run**

Run: `npx vitest run --project ivories && npm test && npm run build`
Expected: all pass (the SSR test proves nothing reads `window` at import).

- [ ] **Step 10: Commit**

```bash
git add -A packages/ivories apps/studio/src/transport
git commit -m "$(cat <<'EOF'
feat(ivories): IvoriesProvider, hooks and score sources

One score, clock, engine and frame loop per provider; self-contained
score loading, onNoteOn/Off from playback, page-wide playback claim,
ref handle and SSR-safe rendering.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 11: `<Keyboard>` and `<FallingKeys>`

**Files:**
- Create: `packages/ivories/src/react/views/StageView.tsx`, `react/views/Keyboard.tsx`, `react/views/FallingKeys.tsx`, `react/views/labels.ts`, `react/cx.ts`, `packages/ivories/src/test-setup.ts`
- Test: `react/views/StageView.test.tsx`, `react/views/labels.test.ts`
- Modify: `packages/ivories/vite.config.ts` (`setupFiles`), `src/style.css`, `src/index.ts`

**Interfaces:**
- Consumes: Tasks 7–10 (`StageRenderer`, `rangeFromProp`, `KeyContextCache`, `ChordFeed`, `displayChordSymbol`, `toRomanNumeral`, `readTheme`, `StageText`, `ChordReadout`, `samePitches`, `useIvories`, `withProvider`, `Guarded`).
- Produces:
  - `type LabelsProp = { noteNames?: NoteLabelContent | boolean; chords?: ChordDisplay | boolean }`; `applyLabels(text: TextSettings, labels?: LabelsProp): TextSettings`
  - `interface StageViewProps { range?: 'full' | [number, number]; labels?: LabelsProp; height?: number | string; className?: string; theme?: ThemeName; onLayout?(layout: KeyboardLayout): void; children?: ReactNode }`
  - `Keyboard` (`StageViewProps & SelfContainedProps`), `FallingKeys` (`StageViewProps & { lookahead?: number } & SelfContainedProps`)
  - DOM: root `div.ivories.ivories-view.ivories-<keyboard|falling>.ivories-theme-<name>[data-ivories-view]`, `canvas.ivories-canvas`, inline message `p.ivories-message`
  - `cx(...parts: (string | false | null | undefined)[]): string`

- [ ] **Step 1: jsdom setup** `packages/ivories/src/test-setup.ts`:

```ts
// jsdom has no canvas: return null (as a browser without 2D would) instead of
// logging "not implemented" on every view mount. Views skip drawing then.
// Guarded: node-environment test files (ssr.test.ts) run this setup too.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
```

`packages/ivories/vite.config.ts` test block: `test: { name: 'ivories', environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] }`.

- [ ] **Step 2: Failing tests.** `react/views/labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyLabels } from './labels'
import { DEFAULT_SETTINGS } from '../../core/settings/types'

describe('labels prop (R10)', () => {
  const text = DEFAULT_SETTINGS.text
  it('booleans map to pitch names and chord symbols, or off', () => {
    expect(applyLabels(text, { noteNames: true, chords: true })).toMatchObject({ labels: 'pitch', chord: 'symbol' })
    expect(applyLabels({ ...text, labels: 'midi', chord: 'both' }, { noteNames: false, chords: false }))
      .toMatchObject({ labels: 'off', chord: 'off' })
  })
  it('explicit modes pass through and absent keys keep the settings', () => {
    expect(applyLabels(text, { noteNames: 'both' })).toMatchObject({ labels: 'both', chord: text.chord })
    expect(applyLabels(text, undefined)).toBe(text)
  })
})
```

`react/views/StageView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'

const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

describe('Keyboard and FallingKeys (spec §4)', () => {
  it('self-contained: a Keyboard outside a provider builds its own', async () => {
    const onReady = vi.fn()
    const { container } = render(<Keyboard score={doc()} engine={fakeEngine()} onReady={onReady} />)
    await waitFor(() => expect(container.querySelector('.ivories-view.ivories-keyboard')).not.toBeNull())
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('provider mode: two views share one provider (one onReady)', async () => {
    const onReady = vi.fn()
    const { container } = render(
      <IvoriesProvider score={doc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onReady={onReady}>
        <FallingKeys lookahead={2} />
        <Keyboard range={[48, 72]} />
      </IvoriesProvider>,
    )
    await waitFor(() => expect(container.querySelectorAll('.ivories-view')).toHaveLength(2))
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.ivories-falling canvas.ivories-canvas')).not.toBeNull()
  })

  it('carries the theme class and the stage background override', async () => {
    const { container } = render(
      <Keyboard score={doc()} engine={fakeEngine()} settings={{ theme: { name: 'contrast', stageBgOverride: '#00b140' } }} />,
    )
    await waitFor(() => expect(container.querySelector('.ivories-theme-contrast')).not.toBeNull())
    const root = container.querySelector('.ivories-view') as HTMLElement
    expect(root.style.getPropertyValue('--ivories-stage-bg')).toBe('#00b140')
  })

  it('shows a score error inline and keeps its box (spec §8)', async () => {
    const onError = vi.fn()
    const { container } = render(<FallingKeys midi={new Uint8Array([9])} engine={fakeEngine()} onError={onError} />)
    await waitFor(() => expect(container.querySelector('.ivories-message')?.textContent).toMatch(/Could not read/))
    expect(onError.mock.calls[0][0].code).toBe('score-parse')
  })

  it('mounts in a 0x0 box without throwing (Review Focus 5)', async () => {
    const { container } = render(<div style={{ width: 0, height: 0 }}><Keyboard score={doc()} engine={fakeEngine()} /></div>)
    await waitFor(() => expect(container.querySelector('.ivories-keyboard')).not.toBeNull())
  })
})
```

Run: `npx vitest run --project ivories src/react/views` → FAIL.

- [ ] **Step 3: `react/cx.ts` and `react/views/labels.ts`**

```ts
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
```

```ts
import type { ChordDisplay, NoteLabelContent, TextSettings } from '../../core/settings/types'

/** R10: `labels` overrides settings.text; true = pitch names / chord symbol. */
export type LabelsProp = { noteNames?: NoteLabelContent | boolean; chords?: ChordDisplay | boolean }

export function applyLabels(text: TextSettings, labels?: LabelsProp): TextSettings {
  if (!labels) return text
  const out = { ...text }
  if (labels.noteNames !== undefined) {
    out.labels = labels.noteNames === true ? 'pitch' : labels.noteNames === false ? 'off' : labels.noteNames
  }
  if (labels.chords !== undefined) {
    out.chord = labels.chords === true ? 'symbol' : labels.chords === false ? 'off' : labels.chords
  }
  return out
}
```

- [ ] **Step 4: `react/views/StageView.tsx`** — the draw callback is App.tsx's original lines 254–337 (overlay push and chord readout) moved here, reading from the provider.

```tsx
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useIvories } from '../hooks'
import { cx } from '../cx'
import { applyLabels } from './labels'
import { StageText, samePitches } from '../text/StageText'
import { ChordReadout } from '../text/ChordReadout'
import { StageRenderer, rangeFromProp } from '../../core/render/stageRenderer'
import { readTheme } from '../../core/render/theme'
import { ChordFeed } from '../../core/music/chordFeed'
import { KeyContextCache } from '../../core/music/keyOf'
import { displayChordSymbol } from '../../core/music/chords'
import { toRomanNumeral } from '../../core/music/romanNumerals'
import type { LabelsProp } from './labels'
import type { ChordDisplayValue } from '../text/ChordReadout'
import type { KeyboardLayout } from '../../core/render/geometry'
import type { ChordReading } from '../../core/music/chords'
import type { KeyContext } from '../../core/music/spell'
import type { ThemeName } from '../../core/settings/types'

export interface StageViewProps {
  /** 'full' (88 keys) or [lowMidi, highMidi]; absent follows settings.display.zoom. */
  range?: 'full' | [number, number]
  labels?: LabelsProp
  height?: number | string
  className?: string
  theme?: ThemeName
  /** Called when the keyboard geometry changes (resize, zoom), never per frame. */
  onLayout?(layout: KeyboardLayout): void
  children?: ReactNode
}

/** Shared by the labels-off overlay state so it never allocates. */
const NO_PITCHES: number[] = []

export function StageView(p: StageViewProps & { kind: 'keyboard' | 'falling'; lookahead?: number }) {
  const iv = useIvories()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const renderer = useMemo(() => new StageRenderer(() => readTheme(rootRef.current)), [])
  const [chordFeed] = useState(() => new ChordFeed())
  const [keys] = useState(() => new KeyContextCache())
  const status = useSyncExternalStore(iv.status.subscribe, iv.status.get, iv.status.get)

  const text = useMemo(() => applyLabels(iv.settings.text, p.labels), [iv.settings.text, p.labels])
  const [overlay, setOverlay] = useState<{ layout: KeyboardLayout | null; pitches: number[] }>({ layout: null, pitches: [] })
  const [chord, setChord] = useState<ChordDisplayValue | null>(null)

  // Everything the frame callback reads, without re-subscribing per change.
  const live = useRef({ iv, p, text })
  live.current = { iv, p, text }
  const overlayRef = useRef(overlay)
  const lastReadingRef = useRef<ChordReading | null | undefined>(undefined)
  const lastKeyRef = useRef<KeyContext | null>(null)

  // A seek or a new score makes the held chord stale (App's old seek did this).
  useEffect(() => iv.clock.subscribe((e) => { if (e.type === 'seek') chordFeed.reset() }), [iv.clock, chordFeed])
  useEffect(() => { chordFeed.reset() }, [iv.score, chordFeed])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d') ?? null
    if (!canvas || !ctx) return
    let w = 1, h = 1
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, r.width)
      h = Math.max(1, r.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)

    const off = iv.frames.add((t) => {
      const { iv: c, p: props, text: tx } = live.current
      const frame = renderer.draw(ctx, w, h, t, {
        score: c.score,
        settings: c.settings,
        fallSeconds: props.kind === 'falling' ? (props.lookahead ?? c.fallSeconds) : c.fallSeconds,
        maxNoteDur: c.maxNoteDur,
        showRoll: props.kind === 'falling',
        range: rangeFromProp(props.range),
      })
      const held = frame.held

      // The overlay is DOM: push only when the sounding set or the layout
      // changes. While labels are off the pitches are emptied once and left.
      const shown = overlayRef.current
      const labelsOn = tx.labels !== 'off'
      const stale = labelsOn ? !samePitches(held, shown.pitches) : shown.pitches !== NO_PITCHES
      if (frame.layout !== shown.layout || stale) {
        if (frame.layout !== shown.layout) props.onLayout?.(frame.layout)
        const next = { layout: frame.layout, pitches: labelsOn ? [...held.keys()].sort((a, b) => a - b) : NO_PITCHES }
        overlayRef.current = next
        setOverlay(next)
      }

      // Chord readout (F41): the feed runs every frame while it is on; React
      // hears only when the committed reading or its key changes.
      if (tx.chord === 'off') {
        if (lastReadingRef.current !== undefined) {
          lastReadingRef.current = undefined
          chordFeed.reset()
          setChord(null)
        }
        return
      }
      const key = keys.get(c.score, tx.keyOverride)
      const reading = chordFeed.update(c.score?.notes ?? [], t, tx.chordWindowMs / 1000, c.maxNoteDur, key, performance.now())
      if (reading !== lastReadingRef.current || key !== lastKeyRef.current) {
        lastReadingRef.current = reading
        lastKeyRef.current = key
        setChord(reading
          ? {
              symbol: displayChordSymbol(reading.symbol),
              alternates: reading.alternates.map(displayChordSymbol),
              numeral: toRomanNumeral(reading.symbol, key),
            }
          : null)
      }
    })
    return () => { off(); ro?.disconnect() }
  }, [iv.frames, renderer, chordFeed, keys])

  const themeName = p.theme ?? iv.settings.theme.name
  const override = iv.settings.theme.stageBgOverride
  const style: CSSProperties = {
    ...(p.height !== undefined ? { height: p.height } : {}),
    ...(override ? ({ '--ivories-stage-bg': override } as CSSProperties) : {}),
  }
  const keyContext = keys.get(iv.score, text.keyOverride)
  const error = status.error && (status.error.code === 'score-load' || status.error.code === 'score-parse') ? status.error : null

  return (
    <div
      ref={rootRef}
      className={cx('ivories', 'ivories-view', `ivories-${p.kind}`, `ivories-theme-${themeName}`, p.className)}
      data-ivories-view={p.kind}
      style={style}
    >
      <canvas ref={canvasRef} className="ivories-canvas" />
      <StageText layout={overlay.layout} pitches={overlay.pitches} text={text} keyContext={keyContext} />
      <ChordReadout layout={overlay.layout} value={chord} text={text} />
      {error && <p className="ivories-message" role="alert">{error.message}</p>}
      {status.loading && !iv.score && <p className="ivories-message" role="status">Loading score…</p>}
      {p.children}
    </div>
  )
}
```

- [ ] **Step 5: The two components**

`react/views/Keyboard.tsx`:

```tsx
import { StageView } from './StageView'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import type { StageViewProps } from './StageView'

export interface KeyboardProps extends StageViewProps {
  /** Live input (Task 17). */
  input?: 'none' | 'midi'
}

function KeyboardView(props: KeyboardProps) {
  return <Guarded><StageView {...props} kind="keyboard" /></Guarded>
}

/** The 88-key keyboard lit by playback (and live input from Task 17). */
export const Keyboard = withProvider(KeyboardView, 'Keyboard')
```

`react/views/FallingKeys.tsx`:

```tsx
import { StageView } from './StageView'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import type { StageViewProps } from './StageView'

export interface FallingKeysProps extends StageViewProps {
  /** Seconds of music visible above the keys (default: the provider's fallSeconds). */
  lookahead?: number
  input?: 'none' | 'midi'
}

function FallingKeysView(props: FallingKeysProps) {
  return <Guarded><StageView {...props} kind="falling" /></Guarded>
}

/** The falling roll over the keyboard (today's roll mode). */
export const FallingKeys = withProvider(FallingKeysView, 'FallingKeys')
```

(`input` is accepted now and wired in Task 17; `StageView` ignores it until then — destructure it out before spreading if TypeScript complains about the unknown prop.)

- [ ] **Step 6: CSS** — append to `src/style.css`:

```css
.ivories.ivories-view {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.ivories .ivories-canvas { display: block; width: 100%; height: 100%; }
.ivories .ivories-message {
  position: absolute;
  left: 1rem;
  top: 1rem;
  margin: 0;
  max-width: calc(100% - 2rem);
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  background: rgba(0, 0, 0, 0.7);
  color: #ff6b6b;
  font-size: 0.875rem;
}
.ivories .ivories-message[role='status'] { color: var(--ivories-ink); }
.ivories.ivories-boundary { position: relative; display: block; min-height: 3rem; }
```

- [ ] **Step 7: Export** — append to `src/index.ts`:

```ts
export { Keyboard } from './react/views/Keyboard'
export type { KeyboardProps } from './react/views/Keyboard'
export { FallingKeys } from './react/views/FallingKeys'
export type { FallingKeysProps } from './react/views/FallingKeys'
export type { StageViewProps } from './react/views/StageView'
export type { LabelsProp } from './react/views/labels'
```

- [ ] **Step 8: Run**

Run: `npx vitest run --project ivories && npm run check:css -w packages/ivories && npm test`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add -A packages/ivories
git commit -m "$(cat <<'EOF'
feat(ivories): Keyboard and FallingKeys canvas views

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: `<Transport>` and the `<Ivories>` preset (falling, keyboard)

**Files:**
- Create: `packages/ivories/src/react/views/Transport.tsx`, `react/views/Ivories.tsx`, `react/format.ts`
- Test: `react/views/Transport.test.tsx`, `react/views/Ivories.test.tsx`
- Modify: `src/style.css`, `src/index.ts`

**Interfaces:**
- Consumes: Tasks 10–11.
- Produces:
  - `interface TransportControls { play?: boolean; seek?: boolean; tempo?: boolean; metronome?: boolean }`; `Transport` (`{ controls?: TransportControls; className?: string } & SelfContainedProps`)
  - `type IvoriesPreset = 'falling' | 'keyboard'` (Task 25 widens it); `type Chrome = 'full' | 'minimal' | 'none'`
  - `interface IvoriesProps extends IvoriesProviderProps { view?: IvoriesPreset; chrome?: Chrome; labels?: LabelsProp; height?: number | string; className?: string; range?: 'full' | [number, number]; lookahead?: number; input?: 'none' | 'midi' }`; `Ivories` (always its own provider; `ref` → `IvoriesHandle`)
  - `formatTime(sec: number): string` (`m:ss`, floors, clamps at 0)
  - DOM: `div.ivories.ivories-transport[role=group]`, `button.ivories-btn.ivories-btn-play`, `input.ivories-seek[aria-label=Seek]`, `input.ivories-tempo-input[aria-label=Tempo]`, `input.ivories-metronome-input[aria-label=Metronome]`, `button.ivories-btn.ivories-btn-enable-sound`; `div.ivories.ivories-preset.ivories-preset-<slug>`

- [ ] **Step 1: Failing tests.** `Transport.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Transport } from './Transport'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'
import { formatTime } from '../format'

const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 4, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

function setup(controls?: Parameters<typeof Transport>[0]['controls'], engine = fakeEngine()) {
  const clock = new AudioClock({ currentTime: 0 })
  render(<IvoriesProvider score={doc()} clock={clock} engine={engine}><Transport controls={controls} /></IvoriesProvider>)
  return { clock, engine }
}

describe('Transport (spec §4)', () => {
  it('formats m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(75.9)).toBe('1:15')
    expect(formatTime(-3)).toBe('0:00')
  })

  it('play toggles the provider clock and resumes audio', async () => {
    const { clock, engine } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Play' }))
    expect(clock.playing).toBe(true)
    expect(engine.resume).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(clock.playing).toBe(false)
  })

  it('the seek bar seeks and the tempo slider sets the clock rate', async () => {
    const { clock } = setup()
    fireEvent.change(await screen.findByLabelText('Seek'), { target: { value: '2.5' } })
    expect(clock.now()).toBeCloseTo(2.5, 9)
    fireEvent.change(screen.getByLabelText('Tempo'), { target: { value: '0.5' } })
    expect(clock.rate).toBe(0.5)
  })

  it('controls overrides hide pieces', async () => {
    setup({ seek: false, tempo: false, metronome: false })
    await screen.findByRole('button', { name: 'Play' })
    expect(screen.queryByLabelText('Seek')).toBeNull()
    expect(screen.queryByLabelText('Tempo')).toBeNull()
    expect(screen.queryByLabelText('Metronome')).toBeNull()
  })

  it('offers "Tap to enable sound" while the clock runs silently', async () => {
    const engine = fakeEngine()
    ;(engine as unknown as { running: boolean }).running = false
    const { clock } = setup(undefined, engine)
    await screen.findByRole('button', { name: 'Play' })
    act(() => clock.play())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tap to enable sound' })).toBeTruthy())
  })
})
```

`Ivories.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { render, waitFor } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Ivories } from './Ivories'
import { fakeEngine } from '../testEngine.test-helpers'
import type { IvoriesHandle } from '../IvoriesProvider'

const bytes = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return new Uint8Array(m.toArray())
}

describe('Ivories presets (spec §4)', () => {
  it.each([
    ['falling', '.ivories-falling'],
    ['keyboard', '.ivories-keyboard'],
  ] as const)('view=%s renders its view and a full transport', async (view, sel) => {
    const { container } = render(<Ivories view={view} midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(container.querySelector(sel)).not.toBeNull())
    expect(container.querySelector('.ivories-transport .ivories-seek')).not.toBeNull()
  })

  it('chrome="minimal" keeps only play; chrome="none" has no transport', async () => {
    const a = render(<Ivories chrome="minimal" midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(a.container.querySelector('.ivories-btn-play')).not.toBeNull())
    expect(a.container.querySelector('.ivories-seek')).toBeNull()
    const b = render(<Ivories chrome="none" midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(b.container.querySelector('.ivories-falling')).not.toBeNull())
    expect(b.container.querySelector('.ivories-transport')).toBeNull()
  })

  it('exposes the handle on its ref', async () => {
    const ref = createRef<IvoriesHandle>()
    render(<Ivories ref={ref} midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(ref.current?.clock).toBeTruthy())
    ref.current!.seek(0.5)
    expect(ref.current!.clock.now()).toBe(0.5)
  })
})
```

Run: `npx vitest run --project ivories src/react/views` → FAIL.

- [ ] **Step 2: `react/format.ts`**

```ts
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
```

- [ ] **Step 3: `react/views/Transport.tsx`**

```tsx
import { useClock, useClockTime, useIvories } from '../hooks'
import { withProvider } from '../withProvider'
import { formatTime } from '../format'
import { cx } from '../cx'
import { IvoriesError } from '../../core/errors'

export interface TransportControls { play?: boolean; seek?: boolean; tempo?: boolean; metronome?: boolean }

function TransportView({ controls, className }: { controls?: TransportControls; className?: string }) {
  const iv = useIvories()
  const { clock, playing, rate } = useClock()
  const t = useClockTime(10)   // also re-renders the sound affordance while playing
  const c = { play: true, seek: true, tempo: true, metronome: true, ...controls }
  const duration = iv.score?.durationSec ?? 0
  const startAudio = () => {
    iv.engine.resume().catch((e) => iv.reportError(new IvoriesError('audio-unavailable', 'Audio could not start; playing silently.', e)))
  }
  const toggle = () => {
    if (playing) { clock.pause(); return }
    if (iv.audio) startAudio()
    clock.play()
  }
  // Spec §8: blocked audio -> the clock runs silently and we offer a tap.
  const needsTap = iv.audio && playing && !iv.engine.running

  return (
    <div className={cx('ivories', 'ivories-transport', className)} role="group" aria-label="Playback">
      {c.play && (
        <button type="button" className="ivories-btn ivories-btn-play" onClick={toggle}>
          {playing ? 'Pause' : 'Play'}
        </button>
      )}
      {c.seek && (
        <input
          type="range" aria-label="Seek" className="ivories-seek"
          min={0} max={Math.max(duration, 0.001)} step={0.01}
          value={Math.min(Math.max(0, t), duration)}
          onChange={(e) => clock.seek(Number(e.target.value))}
        />
      )}
      <span className="ivories-time">{formatTime(t)} / {formatTime(duration)}</span>
      {c.tempo && (
        <label className="ivories-tempo">
          <span className="ivories-tempo-label">Tempo</span>
          <input
            type="range" aria-label="Tempo" className="ivories-tempo-input"
            min={0.25} max={2} step={0.05} value={rate}
            onChange={(e) => clock.setRate(Number(e.target.value))}
          />
          <span className="ivories-tempo-value">{Math.round(rate * 100)}%</span>
        </label>
      )}
      {c.metronome && (
        <label className="ivories-metronome">
          <input
            type="checkbox" aria-label="Metronome" className="ivories-metronome-input"
            checked={iv.settings.audio.metronome}
            onChange={(e) => iv.setAudio({ metronome: e.target.checked })}
          />
          <span className="ivories-metronome-label">Metronome</span>
        </label>
      )}
      {needsTap && (
        <button type="button" className="ivories-btn ivories-btn-enable-sound" onClick={startAudio}>
          Tap to enable sound
        </button>
      )}
    </div>
  )
}

/** Play/pause, seek bar, tempo (clock rate) and metronome toggle. */
export const Transport = withProvider(TransportView, 'Transport')
```

- [ ] **Step 4: `react/views/Ivories.tsx`**

```tsx
import { IvoriesProvider } from '../IvoriesProvider'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { Transport } from './Transport'
import { cx } from '../cx'
import type { IvoriesProviderProps } from '../IvoriesProvider'
import type { TransportControls } from './Transport'
import type { LabelsProp } from './labels'

export type IvoriesPreset = 'falling' | 'keyboard'
/** Same semantics as pepperscore: full controls, a play button, or none. */
export type Chrome = 'full' | 'minimal' | 'none'

export interface IvoriesProps extends IvoriesProviderProps {
  view?: IvoriesPreset
  chrome?: Chrome
  labels?: LabelsProp
  height?: number | string
  className?: string
  range?: 'full' | [number, number]
  lookahead?: number
  input?: 'none' | 'midi'
}

const MINIMAL: TransportControls = { seek: false, tempo: false, metronome: false }
const slug = (v: string) => v.replace(/\+/g, '-')

/** One-line preset combos (spec §4). Always its own provider; `ref` is the provider handle. */
export function Ivories(props: IvoriesProps) {
  const { view = 'falling', chrome = 'full', labels, height, className, range, lookahead, input, ...provider } = props
  const main = view === 'keyboard'
    ? <Keyboard labels={labels} range={range} input={input} />
    : <FallingKeys labels={labels} range={range} lookahead={lookahead} input={input} />
  return (
    <IvoriesProvider {...provider}>
      <div className={cx('ivories', 'ivories-preset', `ivories-preset-${slug(view)}`, className)} style={height !== undefined ? { height } : undefined}>
        <div className="ivories-preset-main">{main}</div>
        {chrome !== 'none' && <Transport controls={chrome === 'minimal' ? MINIMAL : undefined} />}
      </div>
    </IvoriesProvider>
  )
}
```

- [ ] **Step 5: CSS** — append:

```css
.ivories.ivories-transport {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid var(--ivories-line);
  background: var(--ivories-panel);
  font-size: 0.75rem;
}
.ivories .ivories-btn {
  border: 1px solid var(--ivories-line);
  border-radius: 999px;
  padding: 0.375rem 1rem;
  background: transparent;
  color: var(--ivories-ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.ivories .ivories-btn-play, .ivories .ivories-btn-enable-sound { background: var(--ivories-accent); border-color: var(--ivories-accent); color: #000000; }
.ivories .ivories-seek { flex: 1 1 10rem; min-width: 6rem; accent-color: var(--ivories-accent); }
.ivories .ivories-time, .ivories .ivories-tempo-value { font-variant-numeric: tabular-nums; color: var(--ivories-ink-dim); }
.ivories .ivories-tempo, .ivories .ivories-metronome { display: inline-flex; align-items: center; gap: 0.375rem; color: var(--ivories-ink-dim); }
.ivories .ivories-tempo-input { width: 6rem; accent-color: var(--ivories-accent); }
.ivories.ivories-preset { display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 12rem; }
.ivories .ivories-preset-main { position: relative; flex: 1 1 auto; min-height: 0; }
```

- [ ] **Step 6: Export** — append to `src/index.ts`:

```ts
export { Transport } from './react/views/Transport'
export type { TransportControls } from './react/views/Transport'
export { Ivories } from './react/views/Ivories'
export type { IvoriesProps, IvoriesPreset, Chrome } from './react/views/Ivories'
export { formatTime } from './react/format'
```

- [ ] **Step 7: Run** `npx vitest run --project ivories && npm run check:css -w packages/ivories && npm test` → green.

- [ ] **Step 8: Commit**

```bash
git add -A packages/ivories
git commit -m "$(cat <<'EOF'
feat(ivories): Transport and the Ivories preset component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 13: Decompose the studio `App.tsx` into hooks (pure refactor)

The hardest move in the plan. **No behaviour changes, no test changes**: `App.test.tsx` (804 lines) must pass untouched. Line numbers below are the **original** `App.tsx` (1062 lines, commit `53652a6`); Tasks 5–8 already edited lines 190–252, 439–457, 505–541, 569–585, 587–593 and 858–869, so locate each block by the identifiers named here.

**Move map**

| Original lines | What | Destination (Task 13) | Fate in Task 14 |
|---|---|---|---|
| 1–58 | imports | split across the new files | trimmed |
| 60–67 | `DEFAULT_TEMPO`, `START_GATE_GRACE_MS`, `NO_PITCHES` | `DEFAULT_TEMPO` → `studio/useSongLoader.ts`; `START_GATE_GRACE_MS` → `studio/useStartGate.ts`; `NO_PITCHES` stays in App | `NO_PITCHES` deleted (now in `StageView`) |
| 70–76 | `t`, `settings`, `engineRef` + clock + driver refs (Tasks 5–6), `playhead` | App | driver refs deleted (provider owns the driver) |
| 77 | `error` state | `useSongLoader` | — |
| 78 | `settingsOpen` | App | — |
| 79 | `profileError` | `useProfileActions` | — |
| 80–82 | `emptyScenesOpen` | App | — |
| 83–100, 105–113, 123–124 | `lastTenthRef`, stage-text state, draw caches' refs, chord feed refs/state | App (unchanged) | deleted (moved to `StageRenderer`/`StageView` in Tasks 9/11) |
| 101–104 | `loadTokenRef` | `useSongLoader` | — |
| 114–118 | `startGate`, `startTokenRef` | `useStartGate` | — |
| 119 | `voicesReadyRef` | `useSongLoader` (exposed as `voicesReady()`) | — |
| 121–122 | engine creation | App | — |
| 126–188 | `voicesFor`, `layoutFor`, `rangeFor`, `themeFor`, `keyFor` | App (unchanged) | deleted |
| 190–252 | scheduler effects (already replaced by `PlaybackDriver`, Task 6) | App | deleted (provider) |
| 254–337 | `useCanvasStage` draw callback | App (unchanged) | deleted |
| 339–431 | `loadFile` | `useSongLoader` | — |
| 433–437 | `unlockAudio` | `useSongLoader` | — |
| 439–457 | `beginPlayback` | `useStartGate` | — |
| 459–498 | `requestStart` | `useStartGate` | — |
| 500–503 | `cancelStart` | `useStartGate` | — |
| 505–515 | `toggle` | `useStartGate` | — |
| 517 | `liveHead` | `usePlaybackActions` | — |
| 519–527 | `seek` | `usePlaybackActions` | `onSeek` hook removed |
| 529–541 | `changeTempo` | `usePlaybackActions` | — |
| 543–552 | `changeVoice` | `usePlaybackActions` | — |
| 554–567 | `pendingAutosaveRef`, `flushAutosave` | `useAutosave` | — |
| 569–585 | `loadAnother` | App (composes `autosave.flush`, `gate.cancelStart`, `loader.clearSong`) | silence via engine |
| 587–593 | transparent page class | `studio/useTransparentPage.ts` | — |
| 595–602 | restore globals | `useAutosave` | — |
| 604–623 | autosave effect | `useAutosave` | — |
| 625–630 | pagehide flush | `useAutosave` | — |
| 632–651 | `exportProfile` | `useProfileActions` | — |
| 653–698 | `applyProfileParts` | `useProfileActions` | — |
| 700–717 | `importProfile` | `useProfileActions` | — |
| 719–724 | platform via `useSyncExternalStore` | `useSceneActions` | — |
| 726–742 | `buildScene` | `useSceneActions` | gains layout in Task 23 |
| 744–747 | `buildLook` | `useSceneActions` | — |
| 749–762 | `applySceneToScore` | `useSceneActions` | applies layout in Task 23 |
| 764–774 | `applyLookSettings` | `useSceneActions` | — |
| 776–787 | `replaceSong` | `useSceneActions` | — |
| 789–795 | `useScenes(...)` | `useSceneActions` | — |
| 797–801 | `resetSettings` | `usePlaybackActions` | — |
| 803–808 | `keyContext` memo | App (unchanged) | deleted |
| 810–820 | `effectiveBpm`, `lead` | App | — |
| 822–828 | `changeMasterVolume` | `usePlaybackActions` | — |
| 830–852 | `scenesSection` JSX | `studio/ScenesSection.tsx` | — |
| 854–968 | shell + stage JSX | App | canvas/StageText/ChordReadout → provider + view |
| 970–1057 | Settings button + `SettingsPanel` JSX | `studio/StudioSettings.tsx` | live-MIDI section added in Task 18 |

**Files:**
- Create: `apps/studio/src/studio/useTransparentPage.ts`, `useAutosave.ts`, `useSongLoader.ts`, `useStartGate.ts`, `usePlaybackActions.ts`, `useProfileActions.ts`, `useSceneActions.ts`, `ScenesSection.tsx`, `StudioSettings.tsx`
- Modify: `apps/studio/src/App.tsx`

**Interfaces:**
- Consumes: the Task 6 `App.tsx`.
- Produces (all hooks return objects built with `useMemo` so their callbacks keep the identities the original `useCallback`s had):
  - `useTransparentPage(theme: ThemeSettings): void`
  - `useAutosave(engine: AudioEngine): { flush(): void }`
  - `useSongLoader(o: { engine: AudioEngine; onScoreReplaced(): void }): { error: string | null; setError(e: string | null): void; loadFile(file: File, hooks?: { beforeLoad?(): void; onLoaded?(): void }): Promise<boolean>; unlockAudio(): void; clearSong(): void; voicesReady(): { promise: Promise<void>; done: boolean } }`
  - `useStartGate(o: { engine: AudioEngine; voicesReady(): { promise: Promise<void>; done: boolean } }): { startGate: StartGate; requestStart(): void; cancelStart(): void; toggle(): void }`
  - `usePlaybackActions(o: { engine: AudioEngine; onSeek(): void }): { liveHead(): number; seek(sec: number): void; changeTempo(s: TempoSetting): void; changeVoice(id: string, patch: Partial<Voice>): void; changeMasterVolume(v: number): void; resetSettings(): void }`
  - `useProfileActions(o: { engine: AudioEngine; changeTempo(s: TempoSetting): void }): { profileError: string | null; exportProfile(): void; importProfile(file: File, applyGlobals: boolean): Promise<void>; applyProfileParts(p: ProfileParts): { partial: boolean; message: string } | null }` and `type ProfileParts` (the parameter type of original line 658–668)
  - `useSceneActions(o: { applyProfileParts: …; loadFile: SongLoader['loadFile']; loadAnother(): void }): { platform: Platform; scenes: ReturnType<typeof useScenes>; buildScene(): SceneV1; buildLook(): LookV1 }`
  - `ScenesSection(props: { platform: Platform; scenes: ReturnType<typeof useScenes>; canSave: boolean; defaultName: string; buildScene(): SceneV1; buildLook(): LookV1 })`
  - `StudioSettings(props: { open: boolean; onToggle(): void; onClose(): void; effectiveBpm: number; actions: ReturnType<typeof usePlaybackActions>; profile: ReturnType<typeof useProfileActions>; scenesSection: ReactNode })`

- [ ] **Step 1: Baseline.** Run `npx vitest run --project studio src/App.test.tsx` and note the pass count (every test passes).

- [ ] **Step 2: `studio/useTransparentPage.ts`** (original 587–593):

```ts
import { useEffect } from 'react'
import type { ThemeSettings } from 'ivories/core'

/** The canvas has alpha, but the page behind it does not. Without this the host
    page paints its own ground and an OBS browser source composites only black. */
export function useTransparentPage(theme: ThemeSettings): void {
  useEffect(() => {
    const transparent = theme.name === 'transparent' && theme.stageBgOverride === null
    document.documentElement.classList.toggle('ivories-transparent', transparent)
    return () => document.documentElement.classList.remove('ivories-transparent')
  }, [theme.name, theme.stageBgOverride])
}
```

- [ ] **Step 3: `studio/useAutosave.ts`** (original 554–567, 595–602, 604–623, 625–630, in that order, bodies verbatim):

```ts
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { buildProfile, loadGlobals, saveGlobals, saveProfile } from 'ivories/core'
import type { AudioEngine } from 'ivories/core'
import { useTransport } from '../transport/useTransport'
import { currentSettings, useSettings } from '../settings/useSettings'

export function useAutosave(engine: AudioEngine): { flush(): void } {
  const t = useTransport()
  const settings = useSettings()
  // <original 554–558 comment>
  const pendingAutosaveRef = useRef<{ timer: ReturnType<typeof setTimeout>; run: () => void } | null>(null)

  const flush = useCallback(() => {
    const pending = pendingAutosaveRef.current
    if (!pending) return
    clearTimeout(pending.timer)
    pendingAutosaveRef.current = null
    pending.run()
  }, [])

  // Globals follow the user, not the song: restore them once at startup.
  useEffect(() => {
    const g = loadGlobals()
    if (!g) return
    useSettings.getState().setVelocity(g.velocity)
    useSettings.getState().setAudio(g.audio)
    engine.setMasterVolume(g.audio.masterVolume)
  }, [engine])

  useEffect(() => {
    const run = () => {
      pendingAutosaveRef.current = null
      const st = useSettings.getState()
      saveGlobals({ velocity: st.velocity, audio: st.audio })
      const tr = useTransport.getState()
      if (!tr.score?.id) return
      saveProfile(buildProfile({
        song: { id: tr.score.id, name: tr.score.name, format: tr.score.sourceFormat },
        voices: tr.score.voices,
        tempo: tr.tempo,
        mode: tr.mode,
        fallSeconds: tr.fallSeconds,
        settings: currentSettings(),
      }))
    }
    const timer = setTimeout(run, 400)
    pendingAutosaveRef.current = { timer, run }
    return () => clearTimeout(timer)
  }, [t.score, t.tempo, t.mode, t.fallSeconds, settings])

  // A tab close (or refresh) can land inside the 400ms debounce window;
  // pagehide fires reliably before that, unlike beforeunload/unload.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [flush])

  return useMemo(() => ({ flush }), [flush])
}
```

Replace `<original 554–558 comment>` with the original comment text. Keep the effect order globals → autosave → pagehide as in the original file (globals was at 595, autosave at 604, pagehide at 625; the flush callback at 561 has no effect).

**Effect-order caveat:** in the original, the globals-restore effect ran *after* the engine/driver effects and the draw hook. Call `useAutosave(engine)` in App at the position where line 595 used to be relative to the other effects (after the driver effects, Step 9 below), so mount order is unchanged.

- [ ] **Step 4: `studio/useSongLoader.ts`** — signature and skeleton; bodies of `loadFile` (original 347–431, with its comment block 339–346) and `unlockAudio` (433–437) move **verbatim**, with `chordFeed.reset()` replaced by `onScoreReplaced()`, `setError` from local state, `loadTokenRef`/`voicesReadyRef` local:

```ts
import { useCallback, useMemo, useRef, useState } from 'react'
import { hashFile, loadProfile, mergeVoices, parseScoreFile } from 'ivories/core'
import type { AudioEngine, TempoSetting } from 'ivories/core'
import { useTransport } from '../transport/useTransport'
import { currentSettings, useSettings } from '../settings/useSettings'

/** The tempo a song with no saved profile starts at: the file's own tempi. */
const DEFAULT_TEMPO: TempoSetting = { mode: 'scale', scale: 1 }

export interface VoicesReady { promise: Promise<void>; done: boolean }

export function useSongLoader(o: { engine: AudioEngine; onScoreReplaced(): void }) {
  const { engine } = o
  const onScoreReplaced = useRef(o.onScoreReplaced)
  onScoreReplaced.current = o.onScoreReplaced
  const [error, setError] = useState<string | null>(null)
  // <original 101–103 comment>
  const loadTokenRef = useRef(0)
  const voicesReadyRef = useRef<VoicesReady>({ promise: Promise.resolve(), done: true })

  // <original 339–346 comment>
  const loadFile = useCallback(async (
    file: File,
    hooks: { beforeLoad?: () => void; onLoaded?: () => void } = {},
  ): Promise<boolean> => {
    // original 351–430 verbatim; `chordFeed.reset()` -> `onScoreReplaced.current()`
  }, [engine])

  const unlockAudio = useCallback(() => {
    engine.resume().catch(() => { /* reported by loadFile / the start gate */ })
  }, [engine])

  /** The model half of "Load another file" (original 580–584). Callers stop audio first. */
  const clearSong = useCallback(() => {
    useTransport.getState().clearScore()
    // Silence holds the last chord, so a cleared score would keep showing it.
    onScoreReplaced.current()
    loadTokenRef.current++ // invalidate any in-flight loadFile's retainVoices
    engine.retainVoices([])
  }, [engine])

  const voicesReady = useCallback(() => voicesReadyRef.current, [])

  return useMemo(
    () => ({ error, setError, loadFile, unlockAudio, clearSong, voicesReady }),
    [error, loadFile, unlockAudio, clearSong, voicesReady],
  )
}
```

The `// original 351–430 verbatim` line is replaced by the actual moved code — copy it, do not paraphrase it. Its dependency array was `[engine, chordFeed]`; it becomes `[engine]`.

- [ ] **Step 5: `studio/useStartGate.ts`** — `START_GATE_GRACE_MS` (original 64), state (114–118), `beginPlayback` (as edited in Task 6), `requestStart` (459–498, verbatim, reading `o.voicesReady()` where it read `voicesReadyRef.current`), `cancelStart` (500–503), `toggle` (as edited in Task 6):

```ts
import { useCallback, useMemo, useRef, useState } from 'react'
import { LOOKAHEAD_SEC, leadInFor } from 'ivories/core'
import type { AudioEngine } from 'ivories/core'
import type { StartGate } from '../ui/CountIn'
import { useTransport } from '../transport/useTransport'
import type { VoicesReady } from './useSongLoader'

/** How long a start waits for resume() to settle before showing "Tap to start sound". */
const START_GATE_GRACE_MS = 150

export function useStartGate(o: { engine: AudioEngine; voicesReady(): VoicesReady }) {
  const { engine, voicesReady } = o
  const [startGate, setStartGate] = useState<StartGate>(null)
  const startTokenRef = useRef(0)

  /** Starts the transport now. From the top that is one bar early (the lead-in). */
  const beginPlayback = useCallback(() => {
    const state = useTransport.getState()
    if (!state.score || state.playing) return
    const lead = state.pausedAtSec <= 0 ? leadInFor(state.score, state.tempo).sec : 0
    // <original 445–448 comment>
    const pad = lead > 0 ? LOOKAHEAD_SEC : 0
    // The driver re-seats its cursors at the exact start on the play event.
    state.play(engine.currentTime, lead + pad)
  }, [engine])

  // <original 459–465 doc comment>
  const requestStart = useCallback(() => {
    // original 467–497 verbatim, with `voicesReadyRef.current` -> `voicesReady()`
  }, [engine, beginPlayback, voicesReady])

  const cancelStart = useCallback(() => {
    startTokenRef.current++
    setStartGate(null)
  }, [])

  const toggle = useCallback(() => {
    const state = useTransport.getState()
    if (state.playing) {
      state.pause(engine.currentTime)
    } else if (startGate === 'loading') {
      cancelStart()   // Play pressed again while the sounds load: stop waiting
    } else {
      // Includes the 'sound' gate: this press is a real gesture, so it is the tap.
      requestStart()
    }
  }, [engine, startGate, cancelStart, requestStart])

  return useMemo(() => ({ startGate, requestStart, cancelStart, toggle }), [startGate, requestStart, cancelStart, toggle])
}
```

- [ ] **Step 6: `studio/usePlaybackActions.ts`** (original 517, 519–527 as edited in Task 6, 529–541 as edited, 543–552, 797–801, 822–828, with their comments):

```ts
import { useCallback, useMemo, useRef } from 'react'
import { DEFAULT_SETTINGS, sameTempo } from 'ivories/core'
import type { AudioEngine, TempoSetting, Voice } from 'ivories/core'
import { playheadAt, useTransport } from '../transport/useTransport'
import { useSettings } from '../settings/useSettings'

export function usePlaybackActions(o: { engine: AudioEngine; onSeek(): void }) {
  const { engine } = o
  const onSeek = useRef(o.onSeek)
  onSeek.current = o.onSeek

  const liveHead = useCallback(() => playheadAt(useTransport.getState(), engine.currentTime), [engine])

  const seek = useCallback((sec: number) => {
    useTransport.getState().seek(sec, engine.currentTime)
    onSeek.current()
  }, [engine])

  // <original 529–534 comment, plus: the driver silences on the clock's seek event>
  const changeTempo = useCallback((setting: TempoSetting) => {
    if (sameTempo(setting, useTransport.getState().tempo)) return
    useTransport.getState().setTempo(setting, engine.currentTime)
  }, [engine])

  // Volume and instrument have audio-side effects; colour, label and visibility
  // are model-only and the draw loop picks them up on the next frame.
  const changeVoice = useCallback((id: string, patch: Partial<Voice>) => {
    useTransport.getState().updateVoice(id, patch)
    if (patch.volume !== undefined) engine.setVoiceVolume(id, patch.volume)
    if (patch.instrument !== undefined) {
      const v = useTransport.getState().score?.voices.find((x) => x.id === id)
      if (v) void engine.loadVoice(v)
    }
  }, [engine])

  // <original 822–824 comment>
  const changeMasterVolume = useCallback((v: number) => {
    useSettings.getState().setAudio({ masterVolume: v })
    engine.setMasterVolume(v)
  }, [engine])

  // Reset reaches the engine too, or the master gain stays at the old level.
  const resetSettings = useCallback(() => {
    useSettings.getState().reset()
    engine.setMasterVolume(DEFAULT_SETTINGS.audio.masterVolume)
  }, [engine])

  return useMemo(
    () => ({ liveHead, seek, changeTempo, changeVoice, changeMasterVolume, resetSettings }),
    [liveHead, seek, changeTempo, changeVoice, changeMasterVolume, resetSettings],
  )
}
```

- [ ] **Step 7: `studio/useProfileActions.ts`** — `profileError` state (79), `exportProfile` (632–651), `applyProfileParts` (653–698), `importProfile` (700–717), all verbatim. Export the parameter type of `applyProfileParts`:

```ts
import { useCallback, useMemo, useState } from 'react'
import { buildProfile, decodeProfile, encodeProfile, mergeVoices } from 'ivories/core'
import type {
  AudioEngine, AudioSettings, DisplayMode, DisplaySettings, SavedVoice, Settings, TempoSetting,
  TextSettings, ThemeSettings, VelocityScheme, Voice,
} from 'ivories/core'
import { useTransport } from '../transport/useTransport'
import { currentSettings, useSettings } from '../settings/useSettings'

export interface ProfileParts {
  theme: ThemeSettings
  text: TextSettings
  display?: DisplaySettings
  velocity?: VelocityScheme
  audio?: AudioSettings | null
  voices: SavedVoice[]
  tempo: TempoSetting
  mode: DisplayMode
  fallSeconds: number
}

export function useProfileActions(o: { engine: AudioEngine; changeTempo(s: TempoSetting): void }) {
  const { engine, changeTempo } = o
  const [profileError, setProfileError] = useState<string | null>(null)
  // exportProfile: original 632–651 verbatim (deps [])
  // applyProfileParts: original 653–698 verbatim, parameter typed `p: ProfileParts` (deps [engine, changeTempo])
  // importProfile: original 700–717 verbatim (deps [applyProfileParts])
  return useMemo(
    () => ({ profileError, exportProfile, importProfile, applyProfileParts }),
    [profileError, exportProfile, importProfile, applyProfileParts],
  )
}
```

(The three `//` lines are where the moved functions go; copy them verbatim.)

- [ ] **Step 8: `studio/useSceneActions.ts`** — original 719–795 verbatim, with `applyProfileParts`, `loadFile`, `loadAnother` taken from `o`:

```ts
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { applyLook, buildProfile, lookFromSettings, sceneApplyPlan, sceneFromState } from 'ivories/core'
import type { LookV1, SceneV1, SongRefWithTitle } from 'ivories/core'
import { getPlatform, subscribePlatform } from '../platform/registry'
import { useScenes } from '../ui/useScenes'
import { useTransport } from '../transport/useTransport'
import { currentSettings, useSettings } from '../settings/useSettings'
import type { ProfileParts } from './useProfileActions'
import type { useSongLoader } from './useSongLoader'

export function useSceneActions(o: {
  applyProfileParts(p: ProfileParts): { partial: boolean; message: string } | null
  loadFile: ReturnType<typeof useSongLoader>['loadFile']
  loadAnother(): void
}) {
  const { applyProfileParts, loadFile, loadAnother } = o
  // platform, buildScene, buildLook, applySceneToScore, applyLookSettings,
  // replaceSong and the useScenes(...) call: original 721–795 verbatim.
  return useMemo(() => ({ platform, scenes, buildScene, buildLook }), [platform, scenes, buildScene, buildLook])
}
```

- [ ] **Step 9: `studio/ScenesSection.tsx`** (original 830–852) and `studio/StudioSettings.tsx` (original 970–1057). `ScenesSection`:

```tsx
import { ScenesPanel } from '../ui/ScenesPanel'
import { SharePanel } from '../ui/SharePanel'
import type { LookV1, SceneV1 } from 'ivories/core'
import type { Platform } from '../platform/registry'
import type { useScenes } from '../ui/useScenes'

/** One instance of the panel pair, hosted by Settings with a song loaded and by
    the empty-stage card without one (original App.tsx 830–852). */
export function ScenesSection(props: {
  platform: Platform
  scenes: ReturnType<typeof useScenes>
  canSave: boolean
  defaultName: string
  buildScene(): SceneV1
  buildLook(): LookV1
}) {
  const { platform, scenes } = props
  return (
    <>
      <ScenesPanel
        storage={platform.storage}
        refreshKey={scenes.savesVersion}
        canSaveScene={props.canSave}
        defaultName={props.defaultName}
        buildScene={props.buildScene}
        buildLook={props.buildLook}
        onOpenScene={(s) => void scenes.openScene(s, false)}
        onApplyLook={scenes.applyLook}
      />
      <SharePanel
        share={platform.share}
        canShareScene={props.canSave}
        buildScene={props.buildScene}
        buildLook={props.buildLook}
      />
    </>
  )
}
```

`StudioSettings` takes the props listed under Interfaces and renders the original 972–1055 JSX verbatim (the Settings button and the whole `SettingsPanel`), reading `t`/`settings` via `useTransport()`/`useSettings()` and calling `props.actions.changeTempo`, `props.actions.changeVoice`, `props.actions.changeMasterVolume`, `props.actions.resetSettings`, `props.profile.exportProfile`, `props.profile.importProfile`, `props.profile.profileError`, and rendering `{props.scenesSection}` inside the `scenes` section. The button's `onClick` is `props.onToggle`; the panel's `onClose` is `props.onClose`.

- [ ] **Step 10: Recompose `App`.** After the moves, `App` keeps: imports it still needs; `t`, `settings`, engine/clock refs and the bind effect (Task 5); the driver effects (Task 6); `playhead`, `settingsOpen`, `emptyScenesOpen`; the chord-feed, stage-text and cache code (original 83–100, 105–113, 123–188, 254–337, 803–808) unchanged; then, **in this order** (matching the original effect order):

```tsx
  useTransparentPage(settings.theme)
  const autosave = useAutosave(engine)
  const loader = useSongLoader({ engine, onScoreReplaced: () => chordFeed.reset() })
  const gate = useStartGate({ engine, voicesReady: loader.voicesReady })
  const actions = usePlaybackActions({ engine, onSeek: () => chordFeed.reset() })

  const loadAnother = useCallback(() => {
    // Stop and pause before clearing the model, or the previous file keeps
    // sounding after the drop zone reappears.
    const state = useTransport.getState()
    if (state.playing) state.pause(engine.currentTime)
    driverRef.current?.silence()
    // The debounced autosave is keyed on this score; flush it before
    // clearScore() or an edit made in the last 400ms is lost.
    autosave.flush()
    gate.cancelStart()
    loader.clearSong()
  }, [engine, autosave, gate, loader])

  const profile = useProfileActions({ engine, changeTempo: actions.changeTempo })
  const sceneApi = useSceneActions({ applyProfileParts: profile.applyProfileParts, loadFile: loader.loadFile, loadAnother })
  const { platform, scenes, buildScene, buildLook } = sceneApi
```

followed by `effectiveBpm` and `lead` (810–820), `const scenesSection = <ScenesSection platform={platform} scenes={scenes} canSave={t.score !== null} defaultName={t.score?.name.replace(/\.[^.]+$/, '') || 'Untitled'} buildScene={buildScene} buildLook={buildLook} />`, and the JSX (854–1060) with: `error` → `loader.error`; `loadFile` → `loader.loadFile`; `unlockAudio` → `loader.unlockAudio`; `startGate`/`requestStart`/`toggle` → `gate.*`; `liveHead`/`seek` → `actions.*`; and the `settings={…}` prop of `TransportBar` replaced by:

```tsx
          settings={
            <StudioSettings
              open={settingsOpen}
              onToggle={() => setSettingsOpen((v) => !v)}
              onClose={() => setSettingsOpen(false)}
              effectiveBpm={effectiveBpm}
              actions={actions}
              profile={profile}
              scenesSection={scenesSection}
            />
          }
```

Delete imports that are now unused (`tsc -b` with `noUnusedLocals` will list them).

- [ ] **Step 11: Verify**

Run: `npx vitest run --project studio && npm test && npm run build && npm run check:imports`
Expected: identical pass count to Step 1 for `App.test.tsx`; everything green. `wc -l apps/studio/src/App.tsx` is now well under 500.

- [ ] **Step 12: Commit**

```bash
git add -A apps/studio/src
git commit -m "$(cat <<'EOF'
refactor(studio): decompose App.tsx into studio hooks

Song loading, start gate, playback actions, autosave, profile and scene
actions, the scenes section and the settings panel move into
apps/studio/src/studio. No behaviour change; App.test.tsx untouched.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: The studio stage on `IvoriesProvider` + views

**Files:**
- Create: `apps/studio/src/test-setup.ts`
- Delete: `apps/studio/src/render/useCanvasStage.ts`
- Modify: `apps/studio/src/App.tsx`, `apps/studio/src/App.test.tsx` (drop the `useCanvasStage` mock only), `apps/studio/vite.config.ts` (`setupFiles`), `apps/studio/src/studio/useStartGate.ts` (unchanged API)

**Interfaces:**
- Consumes: `IvoriesProvider`, `FallingKeys`, `Keyboard` (Tasks 10–11); `KeyboardLayout` type.
- Produces: the studio renders its stage through the library; `App` no longer owns a draw loop, chord feed, render caches or a `PlaybackDriver`.

- [ ] **Step 1: Studio test setup** — `apps/studio/src/test-setup.ts`:

```ts
// jsdom has no canvas: return null so library views skip drawing quietly.
// Guarded: node-environment test files (ssr.test.ts) run this setup too.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
```

and in `apps/studio/vite.config.ts`: `test: { name: 'studio', environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] }`.

- [ ] **Step 2: Remove the old draw path from `App.tsx`:** delete `lastTenthRef`, `stageText` state + ref, `voicesRef`, `layoutRef`, `rangeRef`, `stageWrapRef`'s theme use, `themeRef`, `chordFeedRef`/`chordFeed`, `lastReadingRef`, `lastReadingKeyRef`, `chord` state, `keyRef`, `voicesFor`, `layoutFor`, `rangeFor`, `themeFor`, `keyFor`, the `useCanvasStage(...)` call, the `keyContext` memo, `NO_PITCHES`, `driverRef` and both driver effects (the provider owns the driver now). Delete `apps/studio/src/render/useCanvasStage.ts` (`git rm`).

- [ ] **Step 3: Adjust the composition:**

```tsx
  const [kbLayout, setKbLayout] = useState<KeyboardLayout | null>(null)
  const loader = useSongLoader({ engine, onScoreReplaced: () => {} })   // StageView resets its chord on a new score
  const actions = usePlaybackActions({ engine, onSeek: () => {} })      // ... and on the clock's seek event
  const providerSettings = useMemo(
    () => ({ theme: settings.theme, display: settings.display, velocity: settings.velocity, text: settings.text, audio: settings.audio }),
    [settings.theme, settings.display, settings.velocity, settings.text, settings.audio],
  )
```

In `loadAnother` replace `driverRef.current?.silence()` with:

```ts
    engine.stopAll()
    engine.metronome().stop()
```

- [ ] **Step 4: Swap the stage JSX.** The stage wrapper loses the theme class and the stage-bg style (the view carries both now): `className="stage-wrap relative min-h-0 flex-1"`, keep `ref`, `onPointerDown`/`onPointerUp`. Replace the `<canvas …/>`, `<StageText …/>` and `<ChordReadout …/>` elements with:

```tsx
        <IvoriesProvider
          score={t.score}
          clock={clock}
          engine={engine}
          tempo={t.tempo}
          settings={providerSettings}
          fallSeconds={t.fallSeconds}
          onTimeUpdate={setPlayhead}
        >
          {t.mode === 'roll'
            ? <FallingKeys className="studio-stage-view" onLayout={setKbLayout} />
            : <Keyboard className="studio-stage-view" onLayout={setKbLayout} />}
        </IvoriesProvider>
```

and `CountIn`'s `keyboardH={stageText.layout?.keyboardH ?? 0}` becomes `keyboardH={kbLayout?.keyboardH ?? 0}`. Imports: `import { FallingKeys, IvoriesProvider, Keyboard } from 'ivories'`, `import type { KeyboardLayout } from 'ivories'`; drop the `StageText`/`ChordReadout`/`samePitches` and render-cache imports.

- [ ] **Step 5: App test.** In `App.test.tsx` delete only the `vi.mock('./render/useCanvasStage', …)` line and its comment. Nothing else changes.

- [ ] **Step 6: Verify**

Run: `npm test && npm run build && npm run check`
Expected: all green, same studio test count as after Task 13.

Run `npm run dev -- --port 5183`, open the LAN URL, drop `docs/demo.mid`: roll and keyboard modes, all four themes, note labels and chord readout, count-in, metronome, tempo change mid-play, seek, scenes, share link and `/debug` all behave as before. Record this manual check in the commit body.

- [ ] **Step 7: Commit**

```bash
git add -A apps/studio
git commit -m "$(cat <<'EOF'
feat(studio): render the stage through IvoriesProvider and library views

The studio's draw loop, render caches, chord feed and scheduler driver are
gone; the provider and FallingKeys/Keyboard own them. Manual check: roll,
keyboard, themes, labels, chords, count-in, metronome, tempo, seek, scenes,
share and /debug unchanged.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
## Stage C — More clocks, live MIDI

### Task 15: `ManualClock` and `MediaClock` on the contract suite

**Files:**
- Create: `packages/ivories/src/core/clock/ManualClock.ts`, `core/clock/MediaClock.ts`
- Test: `core/clock/ManualClock.test.ts`, `core/clock/MediaClock.test.ts`, `core/clock/fakeMediaElement.test-helpers.ts`, append to `core/audio/playback.test.ts` and `react/IvoriesProvider.test.tsx`
- Modify: `core/index.ts`, `react/IvoriesProvider.tsx` (MediaClock defaults)

**Interfaces:**
- Consumes: `Clock`, `AudioClock`, `ClockListeners`, `clampRate`, `describeClockContract`, `PlaybackDriver`.
- Produces:
  - `class ManualClock implements Clock { constructor(opts?: { nowMs?: () => number }); set(t: number): void }` — `play()` advances on `performance.now()`; `set(t)` moves the position **without** a `seek` event (per-frame host sync); `seek(t)` emits `seek`
  - `type MediaLike = Pick<HTMLMediaElement, 'currentTime' | 'paused' | 'ended' | 'playbackRate' | 'play' | 'pause' | 'addEventListener' | 'removeEventListener'>`
  - `class MediaClock implements Clock { constructor(el: MediaLike, opts?: { offset?: number }); readonly offset: number }` — `now() = el.currentTime - offset`; play/pause/seek/rate delegate to the element; events from `play`/`pause`/`seeked`/`ratechange`
  - Provider: `audio` defaults to `false` and the driver's `stopAtEnd` to `false` when the clock is a `MediaClock`

- [ ] **Step 1: Failing tests.** `ManualClock.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ManualClock } from './ManualClock'
import { describeClockContract } from './clockContract.test-helpers'

describeClockContract('ManualClock', () => {
  let ms = 1000
  return { clock: new ManualClock({ nowMs: () => ms }), advance: (s) => { ms += s * 1000 } }
})

describe('ManualClock specifics', () => {
  it('set(t) moves the position without a seek event, paused or playing', () => {
    let ms = 0
    const c = new ManualClock({ nowMs: () => ms })
    const fn = vi.fn()
    c.subscribe(fn)
    c.set(5)
    expect(c.now()).toBe(5)
    c.play()
    fn.mockClear()
    ms += 500
    c.set(9)
    expect(c.now()).toBeCloseTo(9, 9)
    ms += 1000
    expect(c.now()).toBeCloseTo(10, 9)
    expect(fn).not.toHaveBeenCalled()
  })
})
```

`core/clock/fakeMediaElement.test-helpers.ts`:

```ts
/** A media element stand-in: events fire synchronously, time moves on advance(). */
export class FakeMedia extends EventTarget {
  paused = true
  ended = false
  private t = 0
  private r = 1
  get currentTime() { return this.t }
  set currentTime(v: number) { this.t = Math.max(0, v); this.dispatchEvent(new Event('seeked')) }
  get playbackRate() { return this.r }
  set playbackRate(v: number) { this.r = v; this.dispatchEvent(new Event('ratechange')) }
  play() { if (this.paused) { this.paused = false; this.dispatchEvent(new Event('play')) } return Promise.resolve() }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')) } }
  advance(s: number) { if (!this.paused) this.t += s * this.r }
}
```

`MediaClock.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MediaClock } from './MediaClock'
import { describeClockContract } from './clockContract.test-helpers'
import { FakeMedia } from './fakeMediaElement.test-helpers'

describeClockContract('MediaClock', () => {
  const el = new FakeMedia()
  return { clock: new MediaClock(el as unknown as HTMLMediaElement), advance: (s) => el.advance(s) }
})

describe('MediaClock specifics', () => {
  it('score time is media time minus the offset, both ways', () => {
    const el = new FakeMedia()
    const c = new MediaClock(el as unknown as HTMLMediaElement, { offset: 2 })
    el.currentTime = 5
    expect(c.now()).toBe(3)
    c.seek(10)
    expect(el.currentTime).toBe(12)
  })

  it('a rejected play() (autoplay policy) never throws into the host', async () => {
    const el = new FakeMedia()
    el.play = () => Promise.reject(new Error('NotAllowedError'))
    const c = new MediaClock(el as unknown as HTMLMediaElement)
    expect(() => c.play()).not.toThrow()
    await Promise.resolve()
  })
})
```

Run: `npx vitest run --project ivories src/core/clock` → FAIL.

- [ ] **Step 2: `ManualClock.ts`**

```ts
import { AudioClock } from './AudioClock'
import type { Clock, ClockEvent } from './types'

/**
 * Host-driven time (spec §3.1): seek(t)/set(t) place the position; play()
 * advances it on performance.now() so a host can still get motion.
 * Composition, not inheritance: a ManualClock is not an AudioClock, so the
 * driver derives its audio origin instead of trusting originSec.
 */
export class ManualClock implements Clock {
  private readonly inner: AudioClock

  constructor(opts: { nowMs?: () => number } = {}) {
    const nowMs = opts.nowMs ?? (() => performance.now())
    this.inner = new AudioClock({ get currentTime() { return nowMs() / 1000 } })
  }

  now(): number { return this.inner.now() }
  get playing(): boolean { return this.inner.playing }
  get rate(): number { return this.inner.rate }
  play(): void { this.inner.play() }
  pause(): void { this.inner.pause() }
  seek(t: number): void { this.inner.seek(t) }
  setRate(r: number): void { this.inner.setRate(r) }
  subscribe(fn: (e: ClockEvent) => void): () => void { return this.inner.subscribe(fn) }
  dispose(): void { this.inner.dispose() }

  /** Moves the position without a seek event (no audio re-plan): per-frame host sync. */
  set(t: number): void {
    if (!Number.isFinite(t)) return
    const a = this.inner.anchors()
    const src = this.inner.sourceTime()
    this.inner.load(a.playing ? { ...a, pausedAtSec: t, originSec: src - t / a.rate } : { ...a, pausedAtSec: t })
  }
}
```

- [ ] **Step 3: `MediaClock.ts`**

```ts
import { ClockListeners } from './listeners'
import { clampRate } from './types'
import type { Clock, ClockEvent, ClockEventType } from './types'

export type MediaLike = Pick<HTMLMediaElement,
  'currentTime' | 'paused' | 'ended' | 'playbackRate' | 'play' | 'pause' | 'addEventListener' | 'removeEventListener'>

/**
 * Follows an <audio>/<video> element (spec §3.1): now() = el.currentTime - offset.
 * The media carries the sound, so providers default to audio off with it.
 */
export class MediaClock implements Clock {
  readonly offset: number
  private readonly el: MediaLike
  private readonly listeners = new ClockListeners()
  private readonly handlers: [string, () => void][]
  private disposed = false

  constructor(el: MediaLike, opts: { offset?: number } = {}) {
    this.el = el
    this.offset = opts.offset ?? 0
    this.handlers = [
      ['play', () => this.emit('play')],
      ['pause', () => this.emit('pause')],
      ['seeked', () => this.emit('seek')],
      ['ratechange', () => this.emit('rate')],
    ]
    for (const [type, h] of this.handlers) el.addEventListener(type, h)
  }

  now(): number { return this.el.currentTime - this.offset }
  get playing(): boolean { return !this.el.paused && !this.el.ended }
  get rate(): number { return this.el.playbackRate }

  play(): void {
    const p = this.el.play() as Promise<void> | undefined
    if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay refused: the element stays paused */ })
  }

  pause(): void { this.el.pause() }
  seek(t: number): void { if (Number.isFinite(t)) this.el.currentTime = t + this.offset }
  setRate(r: number): void { this.el.playbackRate = clampRate(r) }

  subscribe(fn: (e: ClockEvent) => void): () => void {
    if (this.disposed) return () => {}
    return this.listeners.add(fn)
  }

  dispose(): void {
    this.disposed = true
    for (const [type, h] of this.handlers) this.el.removeEventListener(type, h)
    this.listeners.clear()
  }

  private emit(type: ClockEventType): void {
    if (!this.disposed) this.listeners.emit({ type, time: this.now() })
  }
}
```

Append to `core/index.ts`: `export * from './clock/ManualClock'` and `export * from './clock/MediaClock'`.

- [ ] **Step 4: Driver with a ManualClock (spec §9)** — append to `playback.test.ts`:

```ts
import { ManualClock } from '../clock/ManualClock'

describe('PlaybackDriver driven by a ManualClock', () => {
  it('derives the engine origin from engine time when the clock is not an AudioClock', () => {
    let ms = 0
    const clock = new ManualClock({ nowMs: () => ms })
    const engine = { currentTime: 50, play: vi.fn(), stopAll: vi.fn(), metronome: () => ({ click: vi.fn(), stop: vi.fn() }) }
    const s = score()
    const d = new PlaybackDriver({ clock, engine, getScore: () => s, getAudio: () => DEFAULT_SETTINGS.audio, audioEnabled: () => true })
    d.setScore(s, { mode: 'scale', scale: 1 })
    clock.seek(0.45)
    clock.play()
    ms += 10
    d.tick()
    const [sched, , origin] = engine.play.mock.calls[0]
    expect(sched.note.id).toBe(1)
    expect(origin).toBeCloseTo(50 - clock.now(), 9)
  })
})
```

- [ ] **Step 5: Provider defaults for a MediaClock.** In `IvoriesProvider.tsx` import `MediaClock` and change:

```ts
  const audio = props.audio ?? !(clock instanceof MediaClock)
```

and in the driver effect add `stopAtEnd: !(clock instanceof MediaClock),` to the options. Update the `audio` prop doc: `/** Schedule audio. Default true, false for a MediaClock (the media carries the sound). */`.

Append to `IvoriesProvider.test.tsx`:

```tsx
import { ManualClock } from '../core/clock/ManualClock'
import { MediaClock } from '../core/clock/MediaClock'
import { FakeMedia } from '../core/clock/fakeMediaElement.test-helpers'

describe('IvoriesProvider with host clocks (spec §3.1, §9)', () => {
  it('onNoteOn fires from score playback with a ManualClock', async () => {
    const clock = new ManualClock()
    const onNoteOn = vi.fn()
    render(<IvoriesProvider score={scoreDoc()} clock={clock} engine={fakeEngine()} audio={false} onNoteOn={onNoteOn}><span /></IvoriesProvider>)
    act(() => clock.set(1.2))
    await waitFor(() => expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 64, source: 'score' })))
  })

  it('a MediaClock mutes the engine by default; audio={true} re-enables it', async () => {
    const el = new FakeMedia()
    const engine = fakeEngine()
    render(<IvoriesProvider score={scoreDoc()} clock={new MediaClock(el as unknown as HTMLMediaElement)} engine={engine}><span /></IvoriesProvider>)
    await waitFor(() => expect(document.querySelector('span')).not.toBeNull())
    act(() => { void el.play() })
    await new Promise((r) => setTimeout(r, 80))
    expect(engine.play).not.toHaveBeenCalled()
  })
})
```


- [ ] **Step 6: Run** `npx vitest run --project ivories && npm test` → green (contract suite now runs ×3).

- [ ] **Step 7: Commit**

```bash
git add -A packages/ivories
git commit -m "$(cat <<'EOF'
feat(core): ManualClock and MediaClock on the shared clock contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: `MidiInput` (core)

**Files:**
- Create: `packages/ivories/src/core/midi/MidiInput.ts`
- Test: `packages/ivories/src/core/midi/MidiInput.test.ts`
- Modify: `core/index.ts`

**Interfaces:**
- Consumes: `IvoriesError`, `LiveNote`.
- Produces:
  - `type MidiMessage = { type: 'on'; note: number; velocity: number } | { type: 'off'; note: number } | { type: 'sustain'; down: boolean }`; `parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiMessage | null`
  - `interface MidiNoteEvent extends LiveNote { on: boolean }`
  - `interface MidiPortLike { id: string; name?: string | null; state?: string; onmidimessage: ((e: { data: Uint8Array | null; timeStamp?: number }) => void) | null }`
  - `interface MidiAccessLike { inputs: { forEach(cb: (port: MidiPortLike) => void): void }; onstatechange: ((e: { port: { id: string; type?: string; state?: string } }) => void) | null }`
  - `class MidiInput { constructor(opts?: { deviceId?: string | null; requestAccess?: () => Promise<MidiAccessLike>; now?: () => number }); static supported(): boolean; start(): Promise<void>; stop(): void; devices(): { id: string; name: string }[]; setDevice(id: string | null): void; held(): ReadonlyMap<number, LiveNote>; subscribe(fn: (e: MidiNoteEvent) => void): () => void }`
  - `listMidiDevices(requestAccess?: () => Promise<MidiAccessLike>): Promise<{ id: string; name: string }[]>`

- [ ] **Step 1: Failing test** `MidiInput.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MidiInput, listMidiDevices, parseMidiMessage } from './MidiInput'
import type { MidiAccessLike, MidiNoteEvent, MidiPortLike } from './MidiInput'

function fakeAccess(ids = ['a', 'b']) {
  const ports: MidiPortLike[] = ids.map((id) => ({ id, name: `Port ${id}`, state: 'connected', onmidimessage: null }))
  const access: MidiAccessLike = { inputs: { forEach: (cb) => ports.forEach((p) => cb(p)) }, onstatechange: null }
  const send = (id: string, ...bytes: number[]) =>
    ports.find((p) => p.id === id)!.onmidimessage?.({ data: Uint8Array.from(bytes), timeStamp: 1000 })
  return { access, ports, send }
}

async function started(ids?: string[], deviceId: string | null = null) {
  const f = fakeAccess(ids)
  const input = new MidiInput({ deviceId, requestAccess: async () => f.access })
  const events: MidiNoteEvent[] = []
  input.subscribe((e) => events.push(e))
  await input.start()
  return { ...f, input, events }
}

describe('parseMidiMessage', () => {
  it('reads note on, note off, velocity-0 off and the sustain pedal', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'on', note: 60, velocity: 100 })
    expect(parseMidiMessage([0x93, 60, 0])).toEqual({ type: 'off', note: 60 })
    expect(parseMidiMessage([0x80, 60, 40])).toEqual({ type: 'off', note: 60 })
    expect(parseMidiMessage([0xb0, 64, 127])).toEqual({ type: 'sustain', down: true })
    expect(parseMidiMessage([0xb0, 64, 10])).toEqual({ type: 'sustain', down: false })
    expect(parseMidiMessage([0xb0, 7, 100])).toBeNull()
    expect(parseMidiMessage([0xf8])).toBeNull()
  })
})

describe('MidiInput (spec §4.1)', () => {
  it('emits on/off with velocity and seconds, and tracks held keys', async () => {
    const r = await started()
    r.send('a', 0x90, 60, 100)
    expect(r.events[0]).toEqual({ midi: 60, velocity: 100, time: 1, on: true })
    expect([...r.input.held().keys()]).toEqual([60])
    r.send('a', 0x90, 60, 0)
    expect(r.events[1]).toMatchObject({ midi: 60, on: false })
    expect(r.input.held().size).toBe(0)
  })

  it('the sustain pedal holds released keys until it lifts', async () => {
    const r = await started()
    r.send('a', 0xb0, 64, 127)
    r.send('a', 0x90, 62, 80)
    r.send('a', 0x80, 62, 0)
    expect(r.events.filter((e) => !e.on)).toHaveLength(0)
    expect(r.input.held().has(62)).toBe(true)
    r.send('a', 0xb0, 64, 0)
    expect(r.events.at(-1)).toMatchObject({ midi: 62, on: false })
    expect(r.input.held().size).toBe(0)
  })

  it('listens to one chosen device only', async () => {
    const r = await started(['a', 'b'], 'b')
    r.send('a', 0x90, 60, 100)
    expect(r.events).toHaveLength(0)
    r.send('b', 0x90, 61, 100)
    expect(r.events).toHaveLength(1)
  })

  it('releases every note and the pedal of an unplugged device (Review Focus 2)', async () => {
    const r = await started(['a', 'b'])
    r.send('a', 0xb0, 64, 127)
    r.send('a', 0x90, 60, 100)
    r.send('a', 0x90, 64, 100)
    r.send('a', 0x80, 64, 0)       // sustained
    r.send('b', 0x90, 72, 100)
    r.ports[0].state = 'disconnected'
    r.access.onstatechange?.({ port: { id: 'a', type: 'input', state: 'disconnected' } })
    expect(r.events.filter((e) => !e.on).map((e) => e.midi).sort()).toEqual([60, 64])
    expect([...r.input.held().keys()]).toEqual([72])
    r.send('b', 0x80, 72, 0)       // the pedal went with device a
    expect(r.input.held().size).toBe(0)
  })

  it('reports midi-unavailable when Web MIDI is missing or denied', async () => {
    await expect(new MidiInput({ requestAccess: async () => { throw new Error('SecurityError') } }).start())
      .rejects.toMatchObject({ code: 'midi-unavailable' })
    await expect(new MidiInput().start()).rejects.toMatchObject({ code: 'midi-unavailable' }) // jsdom has no requestMIDIAccess
  })

  it('lists devices', async () => {
    const f = fakeAccess(['x'])
    expect(await listMidiDevices(async () => f.access)).toEqual([{ id: 'x', name: 'Port x' }])
  })
})
```

Run → FAIL.

- [ ] **Step 2: Implement `MidiInput.ts`**

```ts
import { IvoriesError } from '../errors'
import type { LiveNote } from './types'

export type MidiMessage =
  | { type: 'on'; note: number; velocity: number }
  | { type: 'off'; note: number }
  | { type: 'sustain'; down: boolean }

/** Note on/off on any channel (velocity 0 = off) and CC64 (sustain). */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiMessage | null {
  if (!data || data.length < 3) return null
  const status = data[0] & 0xf0
  if (status === 0x90) return data[2] > 0 ? { type: 'on', note: data[1], velocity: data[2] } : { type: 'off', note: data[1] }
  if (status === 0x80) return { type: 'off', note: data[1] }
  if (status === 0xb0 && data[1] === 64) return { type: 'sustain', down: data[2] >= 64 }
  return null
}

export interface MidiNoteEvent extends LiveNote { on: boolean }

export interface MidiPortLike {
  id: string
  name?: string | null
  state?: string
  onmidimessage: ((e: { data: Uint8Array | null; timeStamp?: number }) => void) | null
}

export interface MidiAccessLike {
  inputs: { forEach(cb: (port: MidiPortLike) => void): void }
  onstatechange: ((e: { port: { id: string; type?: string; state?: string } }) => void) | null
}

export interface MidiInputOptions {
  deviceId?: string | null
  requestAccess?: () => Promise<MidiAccessLike>
  /** Seconds; used when a message has no timeStamp. Default performance.now() / 1000. */
  now?: () => number
}

interface Held { velocity: number; time: number; input: string }

type NavigatorWithMidi = Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> }

/**
 * Live keys from Web MIDI (spec §4.1): all inputs or one device. Keys released
 * while the sustain pedal is down stay held (for display) until it lifts. An
 * unplugged device releases its notes, so nothing stays stuck.
 */
export class MidiInput {
  private access: MidiAccessLike | null = null
  private deviceId: string | null
  private readonly opts: MidiInputOptions
  private readonly listeners = new Set<(e: MidiNoteEvent) => void>()
  private readonly bound = new Set<MidiPortLike>()
  private readonly down = new Map<number, Held>()
  private readonly sustained = new Map<number, Held>()
  private pedalInput: string | null = null

  constructor(opts: MidiInputOptions = {}) {
    this.opts = opts
    this.deviceId = opts.deviceId ?? null
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && typeof (navigator as NavigatorWithMidi).requestMIDIAccess === 'function'
  }

  async start(): Promise<void> {
    if (this.access) return
    const request = this.opts.requestAccess
      ?? (MidiInput.supported() ? () => (navigator as NavigatorWithMidi).requestMIDIAccess!() : null)
    if (!request) throw new IvoriesError('midi-unavailable', 'This browser has no Web MIDI.')
    try {
      this.access = await request()
    } catch (e) {
      throw new IvoriesError('midi-unavailable', 'MIDI access was denied or failed.', e)
    }
    this.bindInputs()
    this.access.onstatechange = (e) => this.onState(e)
  }

  stop(): void {
    for (const p of this.bound) p.onmidimessage = null
    this.bound.clear()
    if (this.access) this.access.onstatechange = null
    this.access = null
    this.releaseWhere(() => true)
  }

  devices(): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = []
    this.access?.inputs.forEach((p) => { if (p.state !== 'disconnected') out.push({ id: p.id, name: p.name || p.id }) })
    return out
  }

  setDevice(id: string | null): void {
    this.deviceId = id
    this.releaseWhere(() => true)
    this.bindInputs()
  }

  held(): ReadonlyMap<number, LiveNote> {
    const out = new Map<number, LiveNote>()
    for (const [midi, h] of this.sustained) out.set(midi, { midi, velocity: h.velocity, time: h.time })
    for (const [midi, h] of this.down) out.set(midi, { midi, velocity: h.velocity, time: h.time })
    return out
  }

  subscribe(fn: (e: MidiNoteEvent) => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private now(): number { return (this.opts.now ?? (() => performance.now() / 1000))() }

  private emit(e: MidiNoteEvent): void {
    for (const fn of [...this.listeners]) {
      try { fn(e) } catch (err) { console.error('ivories: MIDI subscriber threw', err) }
    }
  }

  private bindInputs(): void {
    for (const p of this.bound) p.onmidimessage = null
    this.bound.clear()
    this.access?.inputs.forEach((port) => {
      if (port.state === 'disconnected') return
      if (this.deviceId && port.id !== this.deviceId) return
      port.onmidimessage = (e) => this.onMessage(port.id, e)
      this.bound.add(port)
    })
  }

  private onMessage(input: string, e: { data: Uint8Array | null; timeStamp?: number }): void {
    const m = parseMidiMessage(e.data)
    if (!m) return
    const time = e.timeStamp && e.timeStamp > 0 ? e.timeStamp / 1000 : this.now()
    if (m.type === 'on') {
      if (this.down.has(m.note) || this.sustained.has(m.note)) {
        this.down.delete(m.note)
        this.sustained.delete(m.note)
        this.emit({ midi: m.note, velocity: 0, time, on: false })
      }
      this.down.set(m.note, { velocity: m.velocity, time, input })
      this.emit({ midi: m.note, velocity: m.velocity, time, on: true })
    } else if (m.type === 'off') {
      const h = this.down.get(m.note)
      if (!h) return
      this.down.delete(m.note)
      if (this.pedalInput !== null) this.sustained.set(m.note, h)
      else this.emit({ midi: m.note, velocity: 0, time, on: false })
    } else if (m.down) {
      this.pedalInput = input
    } else {
      this.pedalInput = null
      for (const [note] of this.sustained) this.emit({ midi: note, velocity: 0, time, on: false })
      this.sustained.clear()
    }
  }

  private onState(e: { port: { id: string; type?: string; state?: string } }): void {
    if (e.port.type && e.port.type !== 'input') return
    if (e.port.state === 'disconnected') {
      if (this.pedalInput === e.port.id) this.pedalInput = null
      this.releaseWhere((h) => h.input === e.port.id)
      // Without a pedal, keys sustained by it are released too.
      if (this.pedalInput === null) this.releaseSustained()
    }
    this.bindInputs()
  }

  private releaseWhere(pred: (h: Held) => boolean): void {
    const time = this.now()
    for (const map of [this.down, this.sustained]) {
      for (const [note, h] of [...map]) {
        if (!pred(h)) continue
        map.delete(note)
        this.emit({ midi: note, velocity: 0, time, on: false })
      }
    }
  }

  private releaseSustained(): void {
    const time = this.now()
    for (const [note] of this.sustained) this.emit({ midi: note, velocity: 0, time, on: false })
    this.sustained.clear()
  }
}

/** The connected MIDI inputs, for a device picker. Empty when Web MIDI is unavailable. */
export async function listMidiDevices(requestAccess?: () => Promise<MidiAccessLike>): Promise<{ id: string; name: string }[]> {
  const input = new MidiInput({ requestAccess })
  try {
    await input.start()
    return input.devices()
  } catch {
    return []
  } finally {
    input.stop()
  }
}
```

(`releaseWhere(() => true)` in `stop`/`setDevice` also clears the pedal: set `this.pedalInput = null` at the start of both.) Append `export * from './midi/MidiInput'` to `core/index.ts`.

- [ ] **Step 3: Run** `npx vitest run --project ivories src/core/midi && npm test` → green.

- [ ] **Step 4: Commit**

```bash
git add packages/ivories/src/core
git commit -m "$(cat <<'EOF'
feat(core): MidiInput with sustain and safe device unplug

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 17: Live input in the provider and the keyboard

**Files:**
- Modify: `core/audio/engine.ts` (+ test), `core/render/theme.ts` (+ test), `core/render/keyboard.ts` (+ test), `core/render/pianoRoll.ts` (`RenderState.live`), `core/render/stageRenderer.ts` (`StageInput.live`), `core/music/chordFeed.ts` (+ test), `react/context.ts`, `react/IvoriesProvider.tsx` (+ test), `react/views/StageView.tsx`, `src/style.css`

**Interfaces:**
- Consumes: `MidiInput`, `LiveNote`, `ValueStore`.
- Produces:
  - `AudioEngine.noteOn(midi: number, velocity: number): void`, `noteOff(midi: number): void`, `prepareLive(): Promise<void>`, `LIVE_VOICE_ID = '__live'` (kept by `retainVoices`)
  - `Theme.liveHue: number` (token `--ivories-live-hue`, default 35)
  - `RenderState.live?: ReadonlyMap<number, LiveNote>`; `StageInput.live?: ReadonlyMap<number, LiveNote>`
  - `ChordFeed.update(notes, head, windowSec, maxNoteDur, key, nowMs, extraPitches?: readonly number[])`
  - Context: `live: { held: ValueStore<ReadonlyMap<number, LiveNote>>; enable(): () => void }`
  - Provider props: `liveAudio?: boolean` (default false), `midiDeviceId?: string | null`
  - `Keyboard`/`FallingKeys` `input="midi"` enables live input while mounted

- [ ] **Step 1: Engine live voice (test first)** — append to `engine.test.ts`:

```ts
  it('sounds live keys on a dedicated bus that survives retainVoices', async () => {
    const stops: number[] = []
    const engine = new AudioEngine({
      makeContext: () => fakeContext(),
      makeInstrument: async () => ({ start: (o: { note: number }) => () => { stops.push(o.note) }, stop() {}, dispose() {} }) as never,
    })
    await engine.prepareLive()
    engine.noteOn(60, 90)
    engine.retainVoices([])
    engine.noteOff(60)
    expect(stops).toEqual([60])
  })
```

Implement in `engine.ts`:

```ts
export const LIVE_VOICE_ID = '__live'
const LIVE_VOICE: Voice = {
  id: LIVE_VOICE_ID, label: 'Live', hue: 0, instrument: GRAND_PIANO_ID, visible: true, audible: true, volume: 1,
}
```

fields `private readonly liveStops = new Map<number, () => void>()`, and methods:

```ts
  /** Loads the live piano (spec §4.1 liveAudio). Safe to call repeatedly. */
  prepareLive(): Promise<void> {
    return this.loadVoice(LIVE_VOICE)
  }

  /** Sounds a live key now. Silent until prepareLive() has finished. */
  noteOn(midi: number, velocity: number): void {
    const inst = this.buses.get(LIVE_VOICE_ID)?.instrument
    if (!inst) return
    this.noteOff(midi)
    const stop = inst.start({ note: midi, velocity }) as unknown as () => void
    this.liveStops.set(midi, stop)
  }

  noteOff(midi: number): void {
    const stop = this.liveStops.get(midi)
    if (!stop) return
    this.liveStops.delete(midi)
    try { stop() } catch { /* already stopped */ }
  }
```

`retainVoices(ids)` keeps the live bus: `const keep = new Set([...ids, LIVE_VOICE_ID])`. `dispose()` disposes every bus (iterate `this.buses` directly instead of calling `retainVoices([])`) and clears `liveStops`.

- [ ] **Step 2: Live colour on the keys (test first).** `theme.ts`: add `liveHue: number` to `Theme` (doc: `/** Hue of keys lit by live input (spec §4.1), 0-360. */`), `liveHue: 35` to `DEFAULT_THEME`, and `liveHue: num('--ivories-live-hue', DEFAULT_THEME.liveHue)` in `readTheme`. `theme.test.ts` gains:

```ts
  it('reads the live-input hue', () => {
    const t = readTheme(el, reader({ '--ivories-live-hue': '200' }))
    expect(t.liveHue).toBe(200)
  })
```

`pianoRoll.ts`: `RenderState` gains `live?: ReadonlyMap<number, LiveNote>` (import type from `../midi/types`), and `drawStage` passes it through unchanged (drawKeyboard reads `state.live`). `keyboard.ts` — both key loops change their fill line to:

```ts
    const lv = state.live?.get(k.pitch)
    ctx.fillStyle = lv
      ? noteColor(theme.liveHue, lv.velocity, state.velocity)
      : h && v ? noteColor(v.hue, h.velocity, state.velocity) : theme.keyWhite   // keyBlack in the black loop
```

and the black-key highlight condition becomes `if (h || lv)`. `keyboard.test.ts` gains:

```ts
  it('lights live keys in the live hue over the score colour (spec §4.1)', () => {
    const s = { ...state([]), live: new Map([[60, { midi: 60, velocity: 100, time: 0 }]]) }
    const { ctx, fillStyles } = stubCtx()
    drawKeyboard(ctx, s, new Map())
    expect(fillStyles).toContain(noteColor(s.theme.liveHue, 100, s.velocity))
  })
```

(Import `noteColor` from `./colors`, `state`/`stubCtx` from `./pianoRoll.test-helpers` as the file already does.) `stageRenderer.ts`: `StageInput` gains `live?: ReadonlyMap<number, LiveNote>` and the `rs` literal gets `live: input.live`.

Add to `style.css` inside the `.ivories {}` token block: `--ivories-live-hue: 35;`.

- [ ] **Step 3: Live pitches feed the chord readout (test first).** `chordFeed.test.ts` gains:

```ts
  it('reads a chord from live pitches with no score notes (spec §4.1)', () => {
    const feed = new ChordFeed()
    let reading = null
    for (let i = 0; i < 120 && !reading; i++) reading = feed.update([], 0, WINDOW, MAX_DUR, DEFAULT_KEY, i * 16, [60, 64, 67])
    expect(reading?.symbol).toMatch(/^C/)
  })
```

`ChordFeed.update` gains a last parameter `extraPitches?: readonly number[]` and computes:

```ts
    const fromScore = pitchesInWindow(notes, head, windowSec, maxNoteDur)
    const set = extraPitches && extraPitches.length
      ? [...new Set([...fromScore, ...extraPitches])].sort((a, b) => a - b)
      : fromScore
```

- [ ] **Step 4: Provider live hub.** `context.ts`: add to `IvoriesContextValue`:

```ts
  live: {
    held: ValueStore<ReadonlyMap<number, LiveNote>>
    /** Starts MIDI input (ref-counted); returns the release. */
    enable(): () => void
  }
```

`IvoriesProvider.tsx`: add props `liveAudio?: boolean` (`/** Sound live notes through the engine. Default false (the studio turns it on). */`) and `midiDeviceId?: string | null`, then:

```tsx
  const [liveHeld] = useState(() => new ValueStore<ReadonlyMap<number, LiveNote>>(new Map()))
  const midiRef = useRef<MidiInput | null>(null)
  const liveUsers = useRef(0)
  const engineRef = useRef(engine); engineRef.current = engine

  const onLive = useCallback((e: MidiNoteEvent) => {
    const next = new Map(liveHeld.get())
    if (e.on) next.set(e.midi, { midi: e.midi, velocity: e.velocity, time: e.time })
    else next.delete(e.midi)
    liveHeld.set(next)
    active.set({ ...active.get(), live: next })
    const ev = latest.current
    if (ev.liveAudio) {
      if (e.on) engineRef.current?.noteOn(e.midi, e.velocity)
      else engineRef.current?.noteOff(e.midi)
    }
    const out = { midi: e.midi, velocity: e.velocity, time: e.time, source: 'live' as const }
    if (e.on) ev.onNoteOn?.(out)
    else ev.onNoteOff?.(out)
  }, [liveHeld, active])

  const enableLive = useCallback(() => {
    liveUsers.current++
    if (liveUsers.current === 1) {
      const m = new MidiInput({ deviceId: latest.current.midiDeviceId ?? null })
      midiRef.current = m
      m.subscribe(onLive)
      m.start().catch((err) => report(isIvoriesError(err) ? err : new IvoriesError('midi-unavailable', 'MIDI input is unavailable.', err)))
      if (latest.current.liveAudio) void engineRef.current?.prepareLive().catch(() => {})
    }
    return () => {
      liveUsers.current--
      if (liveUsers.current > 0) return
      midiRef.current?.stop()
      midiRef.current = null
      liveHeld.set(new Map())
      active.set({ ...active.get(), live: new Map() })
    }
  }, [onLive, report, liveHeld, active])

  useEffect(() => { midiRef.current?.setDevice(props.midiDeviceId ?? null) }, [props.midiDeviceId])
  useEffect(() => { if (props.liveAudio && midiRef.current) void engine?.prepareLive().catch(() => {}) }, [props.liveAudio, engine])
  const live = useMemo(() => ({ held: liveHeld, enable: enableLive }), [liveHeld, enableLive])
```

and add `live` to the context value object and its `useMemo` deps. Imports: `MidiInput`, `type MidiNoteEvent` from `../core/midi/MidiInput`, `type LiveNote` from `../core/midi/types`. A MIDI failure only reports `midi-unavailable`; playback is untouched.

- [ ] **Step 5: Views use it.** `StageView.tsx`:
  - accept `input?: 'none' | 'midi'` in its props (from `KeyboardProps`/`FallingKeysProps`) and add `useEffect(() => (p.input === 'midi' ? iv.live.enable() : undefined), [p.input, iv.live])`;
  - in the frame callback read `const liveMap = c.live.held.get()`, pass `live: liveMap` in the `renderer.draw` input;
  - overlay pitches use the union of `held` and `liveMap`: compute `const lit = liveMap.size ? new Map([...held, ...[...liveMap].map(([m, n]) => [m, n] as const)]) : held` and use `lit` where `held` was used for the label set (`samePitches(lit, …)`, `[...lit.keys()]`);
  - pass `liveMap.size ? [...liveMap.keys()] : undefined` as the last `chordFeed.update` argument.

- [ ] **Step 6: Provider test** — append to `IvoriesProvider.test.tsx`:

```tsx
import { Keyboard } from './views/Keyboard'

describe('live MIDI (spec §4.1)', () => {
  it('lights, reports and (with liveAudio) sounds live notes; unavailable MIDI only reports', async () => {
    const port = { id: 'k', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) }
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
    const engine = fakeEngine() as ReturnType<typeof fakeEngine> & { noteOn: ReturnType<typeof vi.fn>; noteOff: ReturnType<typeof vi.fn>; prepareLive: ReturnType<typeof vi.fn> }
    engine.noteOn = vi.fn(); engine.noteOff = vi.fn(); engine.prepareLive = vi.fn(async () => {})
    const onNoteOn = vi.fn()
    render(<IvoriesProvider score={scoreDoc()} engine={engine} clock={new AudioClock({ currentTime: 0 })} liveAudio onNoteOn={onNoteOn}><Keyboard input="midi" /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 62, 70) }))
    expect(onNoteOn).toHaveBeenCalledWith(expect.objectContaining({ midi: 62, velocity: 70, source: 'live' }))
    expect(engine.noteOn).toHaveBeenCalledWith(62, 70)
    vi.unstubAllGlobals()
  })

  it('reports midi-unavailable and keeps rendering when Web MIDI is missing', async () => {
    const onError = vi.fn()
    const { container } = render(<IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}><Keyboard input="midi" /></IvoriesProvider>)
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'midi-unavailable' })))
    expect(container.querySelector('.ivories-keyboard')).not.toBeNull()
  })
})
```

- [ ] **Step 7: Run** `npx vitest run --project ivories && npm test && npm run build` → green.

- [ ] **Step 8: Commit**

```bash
git add -A packages/ivories
git commit -m "$(cat <<'EOF'
feat(ivories): live MIDI lights keys, feeds chords and can sound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: Studio live-MIDI controls

**Files:**
- Create: `apps/studio/src/studio/liveMidi.ts`, `apps/studio/src/studio/LiveMidiSettings.tsx`
- Test: `apps/studio/src/studio/LiveMidiSettings.test.tsx`
- Modify: `apps/studio/src/studio/StudioSettings.tsx`, `apps/studio/src/App.tsx`

**Interfaces:**
- Consumes: `listMidiDevices` (`ivories/core`), provider props `liveAudio`, `midiDeviceId`, view prop `input`.
- Produces: `useLiveMidi` zustand store `{ enabled: boolean; deviceId: string | null; audio: boolean; set(patch): void }` (defaults `false`, `null`, `true` — spec: liveAudio default on in the studio); `LiveMidiSettings` panel section.

- [ ] **Step 1: Failing test** `LiveMidiSettings.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LiveMidiSettings } from './LiveMidiSettings'
import { useLiveMidi } from './liveMidi'

vi.mock('ivories/core', async (orig) => ({
  ...(await orig<typeof import('ivories/core')>()),
  listMidiDevices: async () => [{ id: 'k1', name: 'Stage Piano' }],
}))

beforeEach(() => useLiveMidi.setState({ enabled: false, deviceId: null, audio: true }))

describe('Live MIDI settings (spec §6 toolbar: live MIDI device picker)', () => {
  it('enables input, lists devices and picks one', async () => {
    render(<LiveMidiSettings />)
    fireEvent.click(screen.getByLabelText('Live MIDI input'))
    expect(useLiveMidi.getState().enabled).toBe(true)
    const select = await screen.findByLabelText('MIDI device')
    await waitFor(() => expect(screen.getByRole('option', { name: 'Stage Piano' })).toBeTruthy())
    fireEvent.change(select, { target: { value: 'k1' } })
    expect(useLiveMidi.getState().deviceId).toBe('k1')
  })

  it('"Play live notes" defaults on and toggles', () => {
    render(<LiveMidiSettings />)
    const box = screen.getByLabelText('Play live notes') as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(useLiveMidi.getState().audio).toBe(false)
  })
})
```

- [ ] **Step 2: `studio/liveMidi.ts`**

```ts
import { create } from 'zustand'

interface LiveMidiState {
  enabled: boolean
  deviceId: string | null
  /** liveAudio: default on in the studio (spec §4.1). */
  audio: boolean
  set(patch: Partial<Omit<LiveMidiState, 'set'>>): void
}

export const useLiveMidi = create<LiveMidiState>((set) => ({
  enabled: false,
  deviceId: null,
  audio: true,
  set: (patch) => set(patch),
}))
```

- [ ] **Step 3: `studio/LiveMidiSettings.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { listMidiDevices } from 'ivories/core'
import { SettingsRow } from '../ui/SettingsPanel'
import { useLiveMidi } from './liveMidi'

export function LiveMidiSettings() {
  const { enabled, deviceId, audio, set } = useLiveMidi()
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!enabled) return
    let live = true
    void listMidiDevices().then((d) => { if (live) setDevices(d) })
    return () => { live = false }
  }, [enabled])

  return (
    <div className="live-midi-settings flex flex-col gap-2">
      <SettingsRow label="Live MIDI input">
        <input
          type="checkbox" aria-label="Live MIDI input"
          className="live-midi-toggle accent-[var(--accent)]"
          checked={enabled} onChange={(e) => set({ enabled: e.target.checked })}
        />
      </SettingsRow>
      {enabled && (
        <SettingsRow label="Device" htmlFor="midi-device">
          <select
            id="midi-device" aria-label="MIDI device"
            className="midi-device-select rounded border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs"
            value={deviceId ?? ''} onChange={(e) => set({ deviceId: e.target.value || null })}
          >
            <option value="">All devices</option>
            {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </SettingsRow>
      )}
      <SettingsRow label="Play live notes">
        <input
          type="checkbox" aria-label="Play live notes"
          className="live-audio-toggle accent-[var(--accent)]"
          checked={audio} onChange={(e) => set({ audio: e.target.checked })}
        />
      </SettingsRow>
    </div>
  )
}
```

(Check `SettingsRow`'s props in `ui/SettingsPanel.tsx`; it takes `label`, optional `htmlFor`, children.)

- [ ] **Step 4: Wire it.** `StudioSettings.tsx`: add a section after Audio: `<SettingsSection id="live-midi" title="Live MIDI"><LiveMidiSettings /></SettingsSection>`. `App.tsx`: `const liveMidi = useLiveMidi()`; provider gets `liveAudio={liveMidi.audio}` and `midiDeviceId={liveMidi.deviceId}`; both views get `input={liveMidi.enabled ? 'midi' : 'none'}`; the provider's `onError` is `(e) => { if (e.code === 'midi-unavailable') loader.setError(e.message) }`.

- [ ] **Step 5: Run** `npm test && npm run build && npm run check` → green. Manual: with a USB keyboard (or a virtual MIDI port) on Chrome, enable Live MIDI → keys light in the live colour, chord readout follows, notes sound.

- [ ] **Step 6: Commit**

```bash
git add -A apps/studio
git commit -m "$(cat <<'EOF'
feat(studio): live MIDI input, device picker and live audio toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
## Stage D — Layouts, camera, scenes (with stage E's `<Notation>` slotted in before `<Stage>`, R16)

### Task 19: Layout model, reducer, validators, geometry (core)

**Files:**
- Create: `packages/ivories/src/core/layout/types.ts`, `core/layout/layout.ts`, `core/layout/layoutReducer.ts`, `core/layout/validate.ts`, `core/layout/geometry.ts`
- Test: `core/layout/layoutReducer.test.ts`, `core/layout/validate.test.ts`, `core/layout/geometry.test.ts`
- Modify: `core/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `types.ts` (types only, no runtime code — `platform/types.ts` imports it): `IvoriesView`, `CameraFit = 'cover' | 'contain'`, `SlotSource`, `Corner`, `Layout`, `Aspect`, `LayoutKind`, `SlotName = 'main' | 'top' | 'bottom' | 'inset'`, `CameraSource = Extract<SlotSource, { kind: 'camera' }>` — exactly spec §5.1
  - `layout.ts`: `SPLIT_RATIO_MIN = 0.15`, `SPLIT_RATIO_MAX = 0.85`, `PIP_SIZE_MIN = 0.15`, `PIP_SIZE_MAX = 0.5`, `PIP_MARGIN_MAX = 0.1`, `DEFAULT_PIP = { corner: 'br', size: 0.3, margin: 0.02 }`, `MASK: SlotSource` (transparent mask), `clampRatio(r)`, `clampSize(s)`, `clampMargin(m)`, `singleLayout(view: IvoriesView): Layout`, `slotsOf(l: Layout): SlotName[]`, `sourceAt(l: Layout, slot: SlotName): SlotSource | null`, `stripDeviceIds(l: Layout): Layout`
  - `layoutReducer(l: Layout, a: LayoutAction): Layout`; `type LayoutAction = { type: 'swap' } | { type: 'setCorner'; corner: Corner } | { type: 'setRatio'; ratio: number } | { type: 'setSize'; size: number } | { type: 'setSource'; slot: SlotName; source: SlotSource } | { type: 'setKind'; kind: LayoutKind }`
  - `validate.ts`: `validFill(u): string | null`, `validSource(u, o: { keepDeviceId: boolean }): SlotSource | null`, `validLayout(u, o?: { keepDeviceId: boolean }): Layout | null`, `validAspect(u): Aspect | null`
  - `geometry.ts`: `interface Rect { x: number; y: number; w: number; h: number }`, `aspectBox(cw, ch, aspect): Rect`, `slotRects(l: Layout, w: number, h: number): Partial<Record<SlotName, Rect>>`, `nearestCorner(cx, cy, w, h): Corner`

- [ ] **Step 1: `layout/types.ts`** (spec §5.1 verbatim, plus two aliases)

```ts
// Spec §5.1. Types only: platform/types.ts imports this file and must stay runtime-free.
export type IvoriesView = 'keyboard' | 'falling' | 'notation' | 'endless'
export type CameraFit = 'cover' | 'contain'

export type SlotSource =
  | { kind: 'ivories'; view: IvoriesView }
  | { kind: 'camera'; mode: 'webcam'; deviceId?: string; mirror: boolean; fit: CameraFit }
  | { kind: 'camera'; mode: 'mask'; fill: 'transparent' | string }   // string = CSS colour, e.g. '#00b140'

export type CameraSource = Extract<SlotSource, { kind: 'camera' }>
export type Corner = 'tl' | 'tr' | 'bl' | 'br'

export type Layout =
  | { kind: 'single'; main: SlotSource }
  | { kind: 'split'; top: SlotSource; bottom: SlotSource; ratio: number }      // ratio = top share, 0.15-0.85
  | { kind: 'pip'; main: SlotSource; inset: SlotSource; corner: Corner; size: number; margin: number }
  // size = inset width / stage width, 0.15-0.5; margin = fraction of stage width, 0-0.1 (R8)

export type LayoutKind = Layout['kind']
export type Aspect = 'free' | '16:9' | '9:16'
export type SlotName = 'main' | 'top' | 'bottom' | 'inset'
```

- [ ] **Step 2: Failing tests.** `layoutReducer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { layoutReducer } from './layoutReducer'
import { MASK, singleLayout } from './layout'
import type { Layout, SlotSource } from './types'

const falling: SlotSource = { kind: 'ivories', view: 'falling' }
const cam: SlotSource = { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' }
const split: Layout = { kind: 'split', top: falling, bottom: cam, ratio: 0.3 }
const pip: Layout = { kind: 'pip', main: falling, inset: cam, corner: 'br', size: 0.3, margin: 0.02 }

describe('layoutReducer (spec §5.1)', () => {
  it('swap exchanges split slots (each keeps its size) and pip slots; single is unchanged', () => {
    expect(layoutReducer(split, { type: 'swap' })).toEqual({ kind: 'split', top: cam, bottom: falling, ratio: 0.7 })
    expect(layoutReducer(pip, { type: 'swap' })).toMatchObject({ main: cam, inset: falling, corner: 'br' })
    const single = singleLayout('falling')
    expect(layoutReducer(single, { type: 'swap' })).toBe(single)
  })

  it('setRatio and setSize clamp; non-finite values change nothing', () => {
    expect(layoutReducer(split, { type: 'setRatio', ratio: 0.99 })).toMatchObject({ ratio: 0.85 })
    expect(layoutReducer(split, { type: 'setRatio', ratio: 0.01 })).toMatchObject({ ratio: 0.15 })
    expect(layoutReducer(split, { type: 'setRatio', ratio: Number.NaN })).toBe(split)
    expect(layoutReducer(pip, { type: 'setSize', size: 2 })).toMatchObject({ size: 0.5 })
    expect(layoutReducer(pip, { type: 'setSize', size: 0 })).toMatchObject({ size: 0.15 })
    expect(layoutReducer(split, { type: 'setSize', size: 0.4 })).toBe(split)
  })

  it('setCorner applies to pip only', () => {
    expect(layoutReducer(pip, { type: 'setCorner', corner: 'tl' })).toMatchObject({ corner: 'tl' })
    expect(layoutReducer(split, { type: 'setCorner', corner: 'tl' })).toBe(split)
  })

  it('setSource replaces a slot that exists, and ignores one that does not', () => {
    expect(layoutReducer(split, { type: 'setSource', slot: 'bottom', source: MASK })).toMatchObject({ bottom: MASK })
    expect(layoutReducer(split, { type: 'setSource', slot: 'inset', source: MASK })).toBe(split)
    expect(layoutReducer(singleLayout('keyboard'), { type: 'setSource', slot: 'main', source: cam })).toEqual({ kind: 'single', main: cam })
  })

  it('setKind keeps sources: single->split puts main on top over a mask; split<->pip maps top<->main, bottom<->inset', () => {
    expect(layoutReducer(singleLayout('falling'), { type: 'setKind', kind: 'split' }))
      .toEqual({ kind: 'split', top: falling, bottom: MASK, ratio: 0.5 })
    expect(layoutReducer(split, { type: 'setKind', kind: 'pip' }))
      .toEqual({ kind: 'pip', main: falling, inset: cam, corner: 'br', size: 0.3, margin: 0.02 })
    expect(layoutReducer(pip, { type: 'setKind', kind: 'split' }))
      .toEqual({ kind: 'split', top: falling, bottom: cam, ratio: 0.5 })
    expect(layoutReducer(pip, { type: 'setKind', kind: 'single' })).toEqual({ kind: 'single', main: falling })
    expect(layoutReducer(pip, { type: 'setKind', kind: 'pip' })).toBe(pip)
  })
})
```

`validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validAspect, validFill, validLayout } from './validate'

describe('layout validators (untrusted scenes, Review Focus 4)', () => {
  it('accepts transparent, hex and rgb/hsl fills; refuses CSS injection', () => {
    for (const ok of ['transparent', '#0f0', '#00b140', '#00b140ff', 'rgb(0, 177, 64)', 'hsla(140 100% 35% / 1)']) {
      expect(validFill(ok)).toBe(ok)
    }
    for (const bad of ['red;background:url(x)', 'url(x)', 'var(--x)', 'expression(alert(1))', '#12', 42, '']) {
      expect(validFill(bad)).toBeNull()
    }
  })

  it('clamps an out-of-range ratio/size/margin, refuses NaN and unknown kinds', () => {
    const top = { kind: 'ivories', view: 'falling' }
    expect(validLayout({ kind: 'split', top, bottom: top, ratio: 5 })).toMatchObject({ ratio: 0.85 })
    expect(validLayout({ kind: 'split', top, bottom: top, ratio: 'x' })).toBeNull()
    expect(validLayout({ kind: 'pip', main: top, inset: top, corner: 'br', size: 9, margin: -1 })).toMatchObject({ size: 0.5, margin: 0 })
    expect(validLayout({ kind: 'pip', main: top, inset: top, corner: 'middle', size: 0.3, margin: 0 })).toBeNull()
    expect(validLayout({ kind: 'grid', main: top })).toBeNull()
    expect(validLayout({ kind: 'single', main: { kind: 'ivories', view: 'piano' } })).toBeNull()
    expect(validLayout({ kind: 'single', main: { kind: 'camera', mode: 'mask', fill: 'red;x' } })).toBeNull()
  })

  it('drops a deviceId when asked (shares), keeps it otherwise (local saves), and drops unknown keys', () => {
    const cam = { kind: 'camera', mode: 'webcam', deviceId: 'abc', mirror: true, fit: 'cover', evil: 1 }
    expect(validLayout({ kind: 'single', main: cam })).toEqual({ kind: 'single', main: { kind: 'camera', mode: 'webcam', deviceId: 'abc', mirror: true, fit: 'cover' } })
    expect(validLayout({ kind: 'single', main: cam }, { keepDeviceId: false })).toEqual({ kind: 'single', main: { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' } })
  })

  it('aspects', () => {
    expect(validAspect('16:9')).toBe('16:9')
    expect(validAspect('4:3')).toBeNull()
  })
})
```

`geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { aspectBox, nearestCorner, slotRects } from './geometry'
import type { Layout } from './types'

const f = { kind: 'ivories', view: 'falling' } as const

describe('stage geometry (spec §5.2)', () => {
  it('letterboxes 16:9 and 9:16 in the container; free fills it', () => {
    expect(aspectBox(1000, 1000, '16:9')).toEqual({ x: 0, y: 218.75, w: 1000, h: 562.5 })
    expect(aspectBox(1000, 500, '9:16')).toEqual({ x: 359.375, y: 0, w: 281.25, h: 500 })
    expect(aspectBox(800, 600, 'free')).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })

  it('splits by ratio, top share', () => {
    const r = slotRects({ kind: 'split', top: f, bottom: f, ratio: 0.25 }, 400, 800)
    expect(r.top).toEqual({ x: 0, y: 0, w: 400, h: 200 })
    expect(r.bottom).toEqual({ x: 0, y: 200, w: 400, h: 600 })
  })

  it('places the pip inset in each corner, margin as a fraction of width, same aspect as the stage', () => {
    const base: Layout = { kind: 'pip', main: f, inset: f, corner: 'tl', size: 0.25, margin: 0.05 }
    expect(slotRects(base, 800, 400).inset).toEqual({ x: 40, y: 40, w: 200, h: 100 })
    expect(slotRects({ ...base, corner: 'br' }, 800, 400).inset).toEqual({ x: 560, y: 260, w: 200, h: 100 })
    expect(slotRects({ ...base, corner: 'tr' }, 800, 400).inset!.x).toBe(560)
    expect(slotRects({ ...base, corner: 'bl' }, 800, 400).inset!.y).toBe(260)
  })

  it('snaps a released inset to the nearest corner', () => {
    expect(nearestCorner(10, 10, 100, 100)).toBe('tl')
    expect(nearestCorner(90, 10, 100, 100)).toBe('tr')
    expect(nearestCorner(10, 90, 100, 100)).toBe('bl')
    expect(nearestCorner(90, 90, 100, 100)).toBe('br')
  })
})
```

Run: `npx vitest run --project ivories src/core/layout` → FAIL.

- [ ] **Step 3: `layout/layout.ts`**

```ts
import type { Corner, IvoriesView, Layout, SlotName, SlotSource } from './types'

export const SPLIT_RATIO_MIN = 0.15
export const SPLIT_RATIO_MAX = 0.85
export const PIP_SIZE_MIN = 0.15
export const PIP_SIZE_MAX = 0.5
export const PIP_MARGIN_MAX = 0.1
export const DEFAULT_PIP: { corner: Corner; size: number; margin: number } = { corner: 'br', size: 0.3, margin: 0.02 }
export const MASK: SlotSource = { kind: 'camera', mode: 'mask', fill: 'transparent' }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const clampRatio = (r: number) => clamp(r, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX)
export const clampSize = (s: number) => clamp(s, PIP_SIZE_MIN, PIP_SIZE_MAX)
export const clampMargin = (m: number) => clamp(m, 0, PIP_MARGIN_MAX)

export function singleLayout(view: IvoriesView): Layout {
  return { kind: 'single', main: { kind: 'ivories', view } }
}

export function slotsOf(l: Layout): SlotName[] {
  return l.kind === 'single' ? ['main'] : l.kind === 'split' ? ['top', 'bottom'] : ['main', 'inset']
}

export function sourceAt(l: Layout, slot: SlotName): SlotSource | null {
  switch (l.kind) {
    case 'single': return slot === 'main' ? l.main : null
    case 'split': return slot === 'top' ? l.top : slot === 'bottom' ? l.bottom : null
    case 'pip': return slot === 'main' ? l.main : slot === 'inset' ? l.inset : null
  }
}

/** Device ids are per-browser: never put them in a share (spec §5.4). */
export function stripDeviceIds(l: Layout): Layout {
  const strip = (s: SlotSource): SlotSource => {
    if (s.kind === 'camera' && s.mode === 'webcam' && s.deviceId !== undefined) {
      const { deviceId: _drop, ...rest } = s
      return rest
    }
    return s
  }
  switch (l.kind) {
    case 'single': return { ...l, main: strip(l.main) }
    case 'split': return { ...l, top: strip(l.top), bottom: strip(l.bottom) }
    case 'pip': return { ...l, main: strip(l.main), inset: strip(l.inset) }
  }
}
```

- [ ] **Step 4: `layout/layoutReducer.ts`**

```ts
import { DEFAULT_PIP, MASK, clampRatio, clampSize } from './layout'
import type { Corner, Layout, LayoutKind, SlotName, SlotSource } from './types'

export type LayoutAction =
  | { type: 'swap' }
  | { type: 'setCorner'; corner: Corner }
  | { type: 'setRatio'; ratio: number }
  | { type: 'setSize'; size: number }
  | { type: 'setSource'; slot: SlotName; source: SlotSource }
  | { type: 'setKind'; kind: LayoutKind }

const primary = (l: Layout): SlotSource => (l.kind === 'split' ? l.top : l.main)
const secondary = (l: Layout): SlotSource => (l.kind === 'split' ? l.bottom : l.kind === 'pip' ? l.inset : MASK)

/** Pure (spec §5.1). Returns the same object when nothing changes. */
export function layoutReducer(l: Layout, a: LayoutAction): Layout {
  switch (a.type) {
    case 'swap':
      if (l.kind === 'split') return { ...l, top: l.bottom, bottom: l.top, ratio: clampRatio(1 - l.ratio) }
      if (l.kind === 'pip') return { ...l, main: l.inset, inset: l.main }
      return l
    case 'setCorner':
      return l.kind === 'pip' && l.corner !== a.corner ? { ...l, corner: a.corner } : l
    case 'setRatio':
      return l.kind === 'split' && Number.isFinite(a.ratio) ? { ...l, ratio: clampRatio(a.ratio) } : l
    case 'setSize':
      return l.kind === 'pip' && Number.isFinite(a.size) ? { ...l, size: clampSize(a.size) } : l
    case 'setSource':
      if (l.kind === 'single' && a.slot === 'main') return { ...l, main: a.source }
      if (l.kind === 'split' && a.slot === 'top') return { ...l, top: a.source }
      if (l.kind === 'split' && a.slot === 'bottom') return { ...l, bottom: a.source }
      if (l.kind === 'pip' && a.slot === 'main') return { ...l, main: a.source }
      if (l.kind === 'pip' && a.slot === 'inset') return { ...l, inset: a.source }
      return l
    case 'setKind': {
      if (l.kind === a.kind) return l
      const p = primary(l), s = secondary(l)
      if (a.kind === 'single') return { kind: 'single', main: p }
      if (a.kind === 'split') return { kind: 'split', top: p, bottom: s, ratio: 0.5 }
      return { kind: 'pip', main: p, inset: s, ...DEFAULT_PIP }
    }
  }
}
```

- [ ] **Step 5: `layout/validate.ts`**

```ts
import { clampMargin, clampRatio, clampSize } from './layout'
import type { Aspect, CameraFit, Corner, IvoriesView, Layout, SlotSource } from './types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const VIEWS: readonly IvoriesView[] = ['keyboard', 'falling', 'notation', 'endless']
const CORNERS: readonly Corner[] = ['tl', 'tr', 'bl', 'br']
const ASPECTS: readonly Aspect[] = ['free', '16:9', '9:16']
const FILL_RE = /^(transparent|#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]{1,60}\))$/i
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A mask fill reaches a style attribute: only plain colour syntax gets through. */
export function validFill(u: unknown): string | null {
  return typeof u === 'string' && u.length <= 80 && FILL_RE.test(u.trim()) ? u : null
}

export function validSource(u: unknown, o: { keepDeviceId: boolean }): SlotSource | null {
  if (!isObj(u)) return null
  if (u.kind === 'ivories') {
    return VIEWS.includes(u.view as IvoriesView) ? { kind: 'ivories', view: u.view as IvoriesView } : null
  }
  if (u.kind !== 'camera') return null
  if (u.mode === 'mask') {
    const fill = validFill(u.fill)
    return fill ? { kind: 'camera', mode: 'mask', fill } : null
  }
  if (u.mode !== 'webcam' || typeof u.mirror !== 'boolean' || (u.fit !== 'cover' && u.fit !== 'contain')) return null
  const out: Extract<SlotSource, { mode: 'webcam' }> = {
    kind: 'camera', mode: 'webcam', mirror: u.mirror as boolean, fit: u.fit as CameraFit,
  }
  if (o.keepDeviceId && typeof u.deviceId === 'string' && u.deviceId.length > 0 && u.deviceId.length <= 256) out.deviceId = u.deviceId
  return out
}

/** Decodes an untrusted layout; ratios/sizes/margins are clamped, anything malformed is refused. */
export function validLayout(u: unknown, o: { keepDeviceId: boolean } = { keepDeviceId: true }): Layout | null {
  if (!isObj(u)) return null
  if (u.kind === 'single') {
    const main = validSource(u.main, o)
    return main ? { kind: 'single', main } : null
  }
  if (u.kind === 'split') {
    const top = validSource(u.top, o), bottom = validSource(u.bottom, o), ratio = num(u.ratio)
    return top && bottom && ratio !== null ? { kind: 'split', top, bottom, ratio: clampRatio(ratio) } : null
  }
  if (u.kind === 'pip') {
    const main = validSource(u.main, o), inset = validSource(u.inset, o)
    const size = num(u.size), margin = num(u.margin)
    const corner = CORNERS.includes(u.corner as Corner) ? (u.corner as Corner) : null
    return main && inset && size !== null && margin !== null && corner
      ? { kind: 'pip', main, inset, corner, size: clampSize(size), margin: clampMargin(margin) }
      : null
  }
  return null
}

export function validAspect(u: unknown): Aspect | null {
  return ASPECTS.includes(u as Aspect) ? (u as Aspect) : null
}
```

- [ ] **Step 6: `layout/geometry.ts`**

```ts
import type { Aspect, Corner, Layout, SlotName } from './types'

export interface Rect { x: number; y: number; w: number; h: number }

/** The stage box inside its container: letterboxed to the aspect, centred; 'free' fills. */
export function aspectBox(cw: number, ch: number, aspect: Aspect): Rect {
  if (aspect === 'free' || cw <= 0 || ch <= 0) return { x: 0, y: 0, w: Math.max(0, cw), h: Math.max(0, ch) }
  const r = aspect === '16:9' ? 16 / 9 : 9 / 16
  if (cw / ch > r) {
    const w = ch * r
    return { x: (cw - w) / 2, y: 0, w, h: ch }
  }
  const h = cw / r
  return { x: 0, y: (ch - h) / 2, w: cw, h }
}

/** Slot boxes in a w x h stage (the same maths the CSS in style.css expresses). */
export function slotRects(l: Layout, w: number, h: number): Partial<Record<SlotName, Rect>> {
  if (l.kind === 'single') return { main: { x: 0, y: 0, w, h } }
  if (l.kind === 'split') {
    const th = h * l.ratio
    return { top: { x: 0, y: 0, w, h: th }, bottom: { x: 0, y: th, w, h: h - th } }
  }
  const iw = l.size * w
  const ih = l.size * h
  const m = l.margin * w
  const x = l.corner === 'tl' || l.corner === 'bl' ? m : w - iw - m
  const y = l.corner === 'tl' || l.corner === 'tr' ? m : h - ih - m
  return { main: { x: 0, y: 0, w, h }, inset: { x, y, w: iw, h: ih } }
}

export function nearestCorner(cx: number, cy: number, w: number, h: number): Corner {
  const top = cy < h / 2
  const left = cx < w / 2
  return top ? (left ? 'tl' : 'tr') : (left ? 'bl' : 'br')
}
```

- [ ] **Step 7: Export** — append to `core/index.ts`:

```ts
export * from './layout/types'
export * from './layout/layout'
export * from './layout/layoutReducer'
export * from './layout/validate'
export * from './layout/geometry'
```

- [ ] **Step 8: Run** `npx vitest run --project ivories src/core/layout && npm test` → green.

- [ ] **Step 9: Commit**

```bash
git add packages/ivories/src/core
git commit -m "$(cat <<'EOF'
feat(core): layout model, reducer, validators and stage geometry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 20: `SceneV2` codec with V1 upgrade and share stripping

**Files:**
- Modify: `core/platform/types.ts`, `core/platform/codec.ts`, `core/platform/scene.ts`, `core/platform/local/LocalStorageProvider.ts`, `core/platform/local/HashShareProvider.ts`, `core/platform/types.test.ts`, `core/platform/scene.test.ts` (+ any other platform test that asserts `v: 1` on a decoded scene), `apps/studio/src/ui/ScenesPanel.tsx`, `ui/SharePanel.tsx`, `ui/useScenes.ts` (+ tests), `apps/studio/src/studio/useSceneActions.ts`, `apps/studio/src/App.tsx`
- Test: `core/platform/sceneV2.test.ts`

**Interfaces:**
- Consumes: `Layout`, `Aspect`, `validLayout`, `validAspect`, `stripDeviceIds`, `singleLayout` (Task 19).
- Produces:
  - `interface SceneV2 { v: 2; kind: 'scene'; song: SongRefWithTitle; profile: SongProfile; layout: Layout; aspect: Aspect }` (in `platform/types.ts`); `SceneV1` stays exported
  - Provider interfaces now carry `SceneV2`: `SaveInput` scene payload, `StorageProvider.load(kind: 'scene', id): Promise<SceneV2 | null>`, `ShareProvider.share({ kind: 'scene'; payload: SceneV2 } | …)`, `ShareProvider.update(code, payload: SceneV2 | LookV1)`, `TickleHost.decodeScene(u): SceneV2`
  - `readEnvelope(u, kind, maxBytes, maxVersion = 1)`; `SCENE_VERSION = 2`
  - `defaultLayoutFor(mode: DisplayMode): Layout`
  - `sceneFromState(a: { song; profile; layout?: Layout; aspect?: Aspect }): SceneV2`
  - `decodeScene(u): SceneV2` (V1 → upgraded; V2 → validated, deviceIds kept)
  - `sceneForShare(s: SceneV2): SceneV2` (drops deviceIds)
  - `SceneApplyPlan` gains `layout: Layout; aspect: Aspect` (`deviceId`s dropped when `shared`)

- [ ] **Step 1: Failing test** `core/platform/sceneV2.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { decodeScene, sceneApplyPlan, sceneForShare, sceneFromState } from './scene'
import { buildProfile } from '../settings/profile'
import { DEFAULT_SETTINGS } from '../settings/types'
import { isPayloadVersionError } from './codec'
import type { Layout } from '../layout/types'

const ID = 'a'.repeat(64)
const profile = (mode: 'roll' | 'keyboard' = 'roll') => buildProfile({
  song: { id: ID, name: 'song.mid', format: 'midi' }, voices: [], tempo: { mode: 'scale', scale: 1 },
  mode, fallSeconds: 3, settings: DEFAULT_SETTINGS,
})
const song = { kind: 'local' as const, sha256: ID, name: 'song.mid', format: 'midi' as const, title: 'song' }
const webcamSplit: Layout = {
  kind: 'split', ratio: 0.6,
  top: { kind: 'ivories', view: 'falling' },
  bottom: { kind: 'camera', mode: 'webcam', deviceId: 'cam-1', mirror: true, fit: 'cover' },
}

describe('SceneV2 (spec §5.4)', () => {
  it('a scene built from state is v2 and defaults to single + free from the display mode', () => {
    const s = sceneFromState({ song, profile: profile('keyboard') })
    expect(s).toMatchObject({ v: 2, layout: { kind: 'single', main: { kind: 'ivories', view: 'keyboard' } }, aspect: 'free' })
  })

  it('round-trips a v2 scene, keeping deviceIds for local saves', () => {
    const s = sceneFromState({ song, profile: profile(), layout: webcamSplit, aspect: '16:9' })
    expect(decodeScene(JSON.stringify(s))).toEqual(s)
  })

  it('upgrades a V1 scene: single slot from the V1 display mode, aspect free', () => {
    const v1 = { v: 1, kind: 'scene', song, profile: profile('roll') }
    expect(decodeScene(v1)).toMatchObject({ v: 2, layout: { kind: 'single', main: { kind: 'ivories', view: 'falling' } }, aspect: 'free' })
  })

  it('refuses a crafted layout and a newer version (Review Focus 4)', () => {
    const base = sceneFromState({ song, profile: profile() })
    expect(() => decodeScene({ ...base, layout: { kind: 'single', main: { kind: 'camera', mode: 'mask', fill: 'red;background:url(x)' } } })).toThrow(/layout/)
    expect(() => decodeScene({ ...base, aspect: '4:3' })).toThrow(/aspect/)
    try { decodeScene({ ...base, v: 3 }); throw new Error('accepted') } catch (e) { expect(isPayloadVersionError(e)).toBe(true) }
  })

  it('shares never carry deviceIds, and a shared plan drops any that slipped in', () => {
    const s = sceneFromState({ song, profile: profile(), layout: webcamSplit })
    const shared = sceneForShare(s)
    expect(JSON.stringify(shared)).not.toContain('cam-1')
    expect(JSON.stringify(sceneApplyPlan(s, { shared: true }).layout)).not.toContain('cam-1')
    expect(sceneApplyPlan(s, { shared: false }).layout).toEqual(webcamSplit)
  })
})
```

Run → FAIL.

- [ ] **Step 2: Types.** In `platform/types.ts` add `import type { Aspect, Layout } from '../layout/types'` and, after `SceneV1`:

```ts
/** Spec §5.4: SceneV1 + the stage layout. What every provider stores and shares now. */
export interface SceneV2 {
  v: 2
  kind: 'scene'
  song: SongRefWithTitle
  profile: SongProfile
  layout: Layout
  aspect: Aspect
}
```

Replace `SceneV1` with `SceneV2` in `SaveInput`, `StorageProvider.load`'s scene overload, `ShareProvider.share`, `ShareProvider.update`, `TickleHost.decodeScene`. In `types.test.ts` the expected visited list gains `'layout/types.ts'`.

- [ ] **Step 3: Codec.** In `codec.ts` change `readEnvelope`'s signature to `readEnvelope(u: unknown, kind: 'scene' | 'look', maxBytes: number, maxVersion = PAYLOAD_VERSION): Obj` and its version check to:

```ts
  const v = o.v
  const known = typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= maxVersion
  if (!known) {
    if (typeof v === 'number' && Number.isInteger(v) && v > maxVersion) throw new PayloadVersionError(kind, v)
    throw invalid(kind, 'unknown format version')
  }
```

- [ ] **Step 4: `scene.ts`.** Add imports (`validAspect`, `validLayout` from `../layout/validate`; `stripDeviceIds` from `../layout/layout`; types `Aspect`, `Layout`; `SceneV2`), export `SCENE_VERSION = 2`, and:

```ts
/** A V1 scene's single slot: its display mode as a view (R7). */
export function defaultLayoutFor(mode: DisplayMode): Layout {
  return { kind: 'single', main: { kind: 'ivories', view: mode === 'roll' ? 'falling' : 'keyboard' } }
}

/** Drops per-browser camera device ids before a scene leaves this browser (spec §5.4). */
export function sceneForShare(s: SceneV2): SceneV2 {
  return { ...s, layout: stripDeviceIds(s.layout) }
}
```

`sceneFromState` takes `a: { song: SongRefWithTitle; profile: SongProfile; layout?: Layout; aspect?: Aspect }` and returns:

```ts
  return {
    v: 2, kind: 'scene', song: { ...clean, title: clipName(title) }, profile,
    layout: structuredClone(a.layout ?? defaultLayoutFor(profile.display.mode)),
    aspect: a.aspect ?? 'free',
  }
```

`decodeScene` returns `SceneV2`: call `readEnvelope(u, 'scene', MAX_SCENE_BYTES, SCENE_VERSION)`; keep every existing check; then replace the final `return` with:

```ts
  const head = { kind: 'scene' as const, song: { ...ref, title }, profile }
  if (o.v === 1) return { v: 2, ...head, layout: defaultLayoutFor(profile.display.mode), aspect: 'free' }
  const layout = validLayout(o.layout)
  if (!layout) throw invalidPayload('scene', 'invalid layout')
  const aspect = validAspect(o.aspect)
  if (!aspect) throw invalidPayload('scene', 'invalid aspect')
  return { v: 2, ...head, layout, aspect }
```

`SceneApplyPlan` gains `layout: Layout; aspect: Aspect`; `sceneApplyPlan(s: SceneV2, o)` adds `layout: o.shared ? stripDeviceIds(p.layout) : p.layout, aspect: s.aspect` where `p = structuredClone(s)` (clone the whole scene, then read `p.profile` where it read `p` before).

- [ ] **Step 5: Providers and studio types.** `LocalStorageProvider.ts`, `HashShareProvider.ts`, `ui/ScenesPanel.tsx`, `ui/SharePanel.tsx`, `ui/useScenes.ts` (`ScenesHost.applyScene`, `Preview`, `PendingScene`), `studio/useSceneActions.ts` (`buildScene(): SceneV2`, `applySceneToScore(scene: SceneV2, …)`): replace `SceneV1` with `SceneV2` (types only). In `App.tsx` pass `buildScene={() => sceneForShare(buildScene())}` to **`SharePanel` only** (inside `ScenesSection`, add a `buildShareScene` prop used for `SharePanel`), so local saves keep device ids and shares never have them.

- [ ] **Step 6: Fix test expectations.** Run `npm test`. Tests that build scenes through `sceneFromState` and round-trip them keep passing. Update only assertions that hard-code the old shape: `scene.test.ts` `toMatchObject({ v: 1, … })` → `{ v: 2, … }`; any test that decodes a literal `v: 1` scene and compares with `toEqual(input)` now expects the upgraded object (`{ ...input, v: 2, layout: defaultLayoutFor(input.profile.display.mode), aspect: 'free' }`). Do not weaken any other assertion.

- [ ] **Step 7: Run** `npm test && npm run build && npm run check` → green.

- [ ] **Step 8: Commit**

```bash
git add -A packages/ivories apps/studio
git commit -m "$(cat <<'EOF'
feat(core): SceneV2 carries the stage layout; V1 scenes upgrade

Scenes gain layout + aspect (v: 2). V1 payloads decode to a single slot
from their display mode. Shares drop camera device ids; layouts from
untrusted payloads are validated and clamped.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 21: Camera slots — shared streams, webcam, mask, failure states

**Files:**
- Create: `packages/ivories/src/core/camera/streams.ts`, `packages/ivories/src/react/views/CameraSlot.tsx`
- Test: `core/camera/streams.test.ts`, `react/views/CameraSlot.test.tsx`, `core/camera/fakeMedia.test-helpers.ts`
- Modify: `core/index.ts`, `src/index.ts`, `src/style.css`

**Interfaces:**
- Consumes: `CameraSource` (Task 19), `IvoriesError`, `useIvoriesOptional`.
- Produces:
  - `type CameraFailure = 'denied' | 'no-device' | 'in-use' | 'insecure' | 'ended' | 'unknown'`; `CAMERA_MESSAGES: Record<CameraFailure, string>`; `class CameraError extends Error { readonly reason: CameraFailure }`; `classifyCameraError(e: unknown): CameraFailure`
  - `interface MediaDevicesLike { getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>; enumerateDevices(): Promise<MediaDeviceInfo[]> }`
  - `interface CameraLease { promise: Promise<MediaStream>; release(): void }`; `class StreamRegistry { constructor(devices?: () => MediaDevicesLike | null, secure?: () => boolean); acquire(deviceId?: string): CameraLease }`; `cameraStreams` (page-wide instance)
  - `listVideoInputs(devices?): Promise<{ deviceId: string; label: string }[]>`
  - `useCameraStream(deviceId: string | undefined, registry?: StreamRegistry): { stream: MediaStream | null; error: CameraError | null; retry(): void }`
  - `CameraSlot({ source: CameraSource; registry?: StreamRegistry })` — DOM: `video.ivories-camera.ivories-camera-video`, `div.ivories-camera.ivories-camera-mask[data-fill]`, `div.ivories-camera.ivories-camera-placeholder[role=alert][data-reason]` with `button.ivories-btn.ivories-btn-retry`

- [ ] **Step 1: Test helpers** `core/camera/fakeMedia.test-helpers.ts`:

```ts
import { vi } from 'vitest'

export class FakeTrack extends EventTarget {
  stop = vi.fn()
  end() { this.dispatchEvent(new Event('ended')) }
}

export function fakeStream() {
  const track = new FakeTrack()
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream
  return { stream, track }
}

export function fakeDevices(fail?: string) {
  const made: ReturnType<typeof fakeStream>[] = []
  const devices = {
    getUserMedia: vi.fn(async () => {
      if (fail) throw Object.assign(new Error(fail), { name: fail })
      const s = fakeStream()
      made.push(s)
      return s.stream
    }),
    enumerateDevices: vi.fn(async () => [
      { kind: 'videoinput', deviceId: 'cam-1', label: '' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Mic' },
    ] as MediaDeviceInfo[]),
  }
  return { devices, made }
}
```

- [ ] **Step 2: Failing tests.** `core/camera/streams.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { StreamRegistry, classifyCameraError, listVideoInputs } from './streams'
import { fakeDevices } from './fakeMedia.test-helpers'

describe('camera streams (spec §5.3)', () => {
  it('one stream per deviceId, shared by slots; stopped only when the last slot lets go', async () => {
    const f = fakeDevices()
    const reg = new StreamRegistry(() => f.devices, () => true)
    const a = reg.acquire('cam-1'), b = reg.acquire('cam-1')
    expect(await a.promise).toBe(await b.promise)
    expect(f.devices.getUserMedia).toHaveBeenCalledTimes(1)
    expect(f.devices.getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: 'cam-1' } }, audio: false })
    a.release(); a.release()               // idempotent
    expect(f.made[0].track.stop).not.toHaveBeenCalled()
    b.release()
    expect(f.made[0].track.stop).toHaveBeenCalled()
  })

  it('a stream whose track ends is dropped, so the next acquire asks again (Review Focus 1)', async () => {
    const f = fakeDevices()
    const reg = new StreamRegistry(() => f.devices, () => true)
    await reg.acquire(undefined).promise
    f.made[0].track.end()
    await reg.acquire(undefined).promise
    expect(f.devices.getUserMedia).toHaveBeenCalledTimes(2)
  })

  it('maps failures: denied, no device, in use, insecure origin', async () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('denied')
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('no-device')
    expect(classifyCameraError({ name: 'OverconstrainedError' })).toBe('no-device')
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('in-use')
    const insecure = new StreamRegistry(() => null, () => false)
    await expect(insecure.acquire('x').promise).rejects.toMatchObject({ reason: 'insecure' })
    const denied = new StreamRegistry(() => fakeDevices('NotAllowedError').devices, () => true)
    await expect(denied.acquire('x').promise).rejects.toMatchObject({ reason: 'denied' })
  })

  it('lists video inputs with fallback labels (labels appear after permission)', async () => {
    const f = fakeDevices()
    expect(await listVideoInputs(() => f.devices)).toEqual([{ deviceId: 'cam-1', label: 'Camera 1' }])
  })
})
```

`react/views/CameraSlot.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CameraSlot } from './CameraSlot'
import { StreamRegistry } from '../../core/camera/streams'
import { fakeDevices } from '../../core/camera/fakeMedia.test-helpers'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { fakeEngine } from '../testEngine.test-helpers'

const webcam = { kind: 'camera', mode: 'webcam', mirror: true, fit: 'contain' } as const

describe('CameraSlot (spec §5.3)', () => {
  it('shows the webcam mirrored with the chosen fit', async () => {
    const f = fakeDevices()
    const { container } = render(<CameraSlot source={webcam} registry={new StreamRegistry(() => f.devices, () => true)} />)
    const video = await waitFor(() => container.querySelector('video.ivories-camera-video') as HTMLVideoElement)
    expect(video.style.objectFit).toBe('contain')
    expect(video.style.transform).toBe('scaleX(-1)')
    await waitFor(() => expect((video as unknown as { srcObject: unknown }).srcObject).toBe(f.made[0].stream))
  })

  it('a camera that stops shows a placeholder, and Retry asks for it again (Review Focus 1)', async () => {
    const f = fakeDevices()
    render(<CameraSlot source={webcam} registry={new StreamRegistry(() => f.devices, () => true)} />)
    await waitFor(() => expect(f.made).toHaveLength(1))
    act(() => f.made[0].track.end())
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(f.devices.getUserMedia).toHaveBeenCalledTimes(2))
  })

  it('a denied camera reports camera-unavailable through the provider', async () => {
    const onError = vi.fn()
    render(
      <IvoriesProvider score={null} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}>
        <CameraSlot source={webcam} registry={new StreamRegistry(() => fakeDevices('NotAllowedError').devices, () => true)} />
      </IvoriesProvider>,
    )
    expect((await screen.findByRole('alert')).textContent).toMatch(/denied/)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'camera-unavailable' }))
  })

  it('a mask is transparent or a solid chroma fill', () => {
    const { container } = render(<CameraSlot source={{ kind: 'camera', mode: 'mask', fill: '#00b140' }} />)
    const el = container.querySelector('.ivories-camera-mask') as HTMLElement
    expect(el.dataset.fill).toBe('#00b140')
    expect(el.style.background).toMatch(/0, 177, 64|#00b140/)
  })
})
```

Run → FAIL.

- [ ] **Step 3: `core/camera/streams.ts`**

```ts
export type CameraFailure = 'denied' | 'no-device' | 'in-use' | 'insecure' | 'ended' | 'unknown'

export const CAMERA_MESSAGES: Record<CameraFailure, string> = {
  denied: 'Camera permission was denied.',
  'no-device': 'No camera was found.',
  'in-use': 'The camera is in use by another app.',
  insecure: 'The camera needs a secure (https) page.',
  ended: 'The camera stopped.',
  unknown: 'The camera could not start.',
}

export class CameraError extends Error {
  readonly reason: CameraFailure

  constructor(reason: CameraFailure, cause?: unknown) {
    super(CAMERA_MESSAGES[reason], cause === undefined ? undefined : { cause })
    this.name = 'CameraError'
    this.reason = reason
  }
}

export function classifyCameraError(e: unknown): CameraFailure {
  switch ((e as { name?: string } | null)?.name) {
    case 'NotAllowedError': case 'SecurityError': return 'denied'
    case 'NotFoundError': case 'OverconstrainedError': return 'no-device'
    case 'NotReadableError': case 'AbortError': return 'in-use'
    default: return 'unknown'
  }
}

export interface MediaDevicesLike {
  getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>
  enumerateDevices(): Promise<MediaDeviceInfo[]>
}

export interface CameraLease { promise: Promise<MediaStream>; release(): void }

const defaultDevices = (): MediaDevicesLike | null =>
  typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia ? navigator.mediaDevices : null
const defaultSecure = (): boolean =>
  typeof globalThis.isSecureContext === 'boolean' ? globalThis.isSecureContext : true

interface Entry { promise: Promise<MediaStream>; count: number; stream: MediaStream | null }

const stopStream = (s: MediaStream) => { for (const t of s.getTracks()) t.stop() }

/**
 * One getUserMedia stream per deviceId, shared by every slot showing it
 * (spec §5.3). Requested only when a slot mounts; stopped when the last
 * lease is released. A stream whose track ends is forgotten, so a retry
 * asks the browser again.
 */
export class StreamRegistry {
  private readonly entries = new Map<string, Entry>()
  private readonly devices: () => MediaDevicesLike | null
  private readonly secure: () => boolean

  constructor(devices: () => MediaDevicesLike | null = defaultDevices, secure: () => boolean = defaultSecure) {
    this.devices = devices
    this.secure = secure
  }

  acquire(deviceId?: string): CameraLease {
    const key = deviceId || 'default'
    let entry = this.entries.get(key)
    if (entry) {
      entry.count++
    } else {
      const md = this.devices()
      if (!this.secure() || !md) {
        const promise = Promise.reject(new CameraError('insecure'))
        promise.catch(() => {})
        return { promise, release: () => {} }
      }
      const created: Entry = { promise: Promise.resolve(null as unknown as MediaStream), count: 1, stream: null }
      created.promise = md.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false }).then(
        (stream) => {
          created.stream = stream
          for (const track of stream.getVideoTracks()) {
            track.addEventListener('ended', () => { if (this.entries.get(key) === created) this.entries.delete(key) })
          }
          if (created.count <= 0) stopStream(stream)
          return stream
        },
        (e) => {
          if (this.entries.get(key) === created) this.entries.delete(key)
          throw new CameraError(classifyCameraError(e), e)
        },
      )
      created.promise.catch(() => {})
      this.entries.set(key, created)
      entry = created
    }
    const held = entry
    let released = false
    return {
      promise: held.promise,
      release: () => {
        if (released) return
        released = true
        held.count--
        if (held.count > 0) return
        if (this.entries.get(key) === held) this.entries.delete(key)
        if (held.stream) stopStream(held.stream)
      },
    }
  }
}

/** The page-wide registry every CameraSlot uses by default. */
export const cameraStreams = new StreamRegistry()

/** Video inputs for a device picker; labels are blank until permission is granted. */
export async function listVideoInputs(devices: () => MediaDevicesLike | null = defaultDevices): Promise<{ deviceId: string; label: string }[]> {
  const md = devices()
  if (!md) return []
  try {
    const all = await md.enumerateDevices()
    return all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
  } catch {
    return []
  }
}
```

- [ ] **Step 4: `react/views/CameraSlot.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { CameraError, cameraStreams } from '../../core/camera/streams'
import { IvoriesError } from '../../core/errors'
import { useIvoriesOptional } from '../hooks'
import type { StreamRegistry } from '../../core/camera/streams'
import type { CameraSource } from '../../core/layout/types'

export function useCameraStream(deviceId: string | undefined, registry: StreamRegistry = cameraStreams) {
  const [state, setState] = useState<{ stream: MediaStream | null; error: CameraError | null }>({ stream: null, error: null })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    let offEnded = () => {}
    setState({ stream: null, error: null })
    const lease = registry.acquire(deviceId)
    lease.promise.then(
      (stream) => {
        if (!live) return
        setState({ stream, error: null })
        const onEnded = () => { if (live) setState({ stream: null, error: new CameraError('ended') }) }
        const tracks = stream.getVideoTracks()
        for (const t of tracks) t.addEventListener('ended', onEnded)
        offEnded = () => { for (const t of tracks) t.removeEventListener('ended', onEnded) }
      },
      (e) => { if (live) setState({ stream: null, error: e instanceof CameraError ? e : new CameraError('unknown', e) }) },
    )
    return () => { live = false; offEnded(); lease.release() }
  }, [deviceId, attempt, registry])
  return { ...state, retry: () => setAttempt((a) => a + 1) }
}

function Webcam({ source, registry }: { source: Extract<CameraSource, { mode: 'webcam' }>; registry?: StreamRegistry }) {
  const ctx = useIvoriesOptional()
  const { stream, error, retry } = useCameraStream(source.deviceId, registry)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v || !stream) return
    v.srcObject = stream
    try { v.play()?.catch(() => {}) } catch { /* jsdom: not implemented */ }
    return () => { v.srcObject = null }
  }, [stream])

  useEffect(() => {
    if (error) ctx?.reportError(new IvoriesError('camera-unavailable', error.message, error))
  }, [error]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    // The layout is unaffected: the slot keeps its box and offers a retry.
    return (
      <div className="ivories-camera ivories-camera-placeholder" role="alert" data-reason={error.reason}>
        <p className="ivories-camera-message">{error.message}</p>
        <button type="button" className="ivories-btn ivories-btn-retry" onClick={retry}>Retry</button>
      </div>
    )
  }
  return (
    <video
      ref={videoRef}
      className="ivories-camera ivories-camera-video"
      autoPlay playsInline muted
      style={{ objectFit: source.fit, transform: source.mirror ? 'scaleX(-1)' : undefined }}
    />
  )
}

/** A live webcam, or a compositing mask: transparent (OBS alpha) or a chroma fill. */
export function CameraSlot({ source, registry }: { source: CameraSource; registry?: StreamRegistry }) {
  if (source.mode === 'mask') {
    return (
      <div
        className="ivories-camera ivories-camera-mask"
        data-fill={source.fill}
        style={{ background: source.fill === 'transparent' ? 'transparent' : source.fill }}
      />
    )
  }
  return <Webcam source={source} registry={registry} />
}
```

(The mask fill reaching `style` was validated by `validFill` when it came from a payload, Task 19.)

- [ ] **Step 5: CSS** — append:

```css
.ivories .ivories-camera { display: block; width: 100%; height: 100%; }
.ivories .ivories-camera-video { background: #000000; }
.ivories .ivories-camera-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem;
  background: var(--ivories-panel); color: var(--ivories-ink-dim); font-size: 0.875rem; text-align: center; padding: 1rem;
}
.ivories .ivories-camera-message { margin: 0; }
```

- [ ] **Step 6: Export.** `core/index.ts`: `export * from './camera/streams'`. `src/index.ts`: `export { CameraSlot, useCameraStream } from './react/views/CameraSlot'`.

- [ ] **Step 7: Run** `npx vitest run --project ivories && npm run check:css -w packages/ivories && npm test` → green.

- [ ] **Step 8: Commit**

```bash
git add -A packages/ivories
git commit -m "$(cat <<'EOF'
feat(ivories): camera slots with shared streams and failure states

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 22: `<Notation>` on pepperscore 0.2's external clock (stage E, tickle side)

**Files:**
- Create: `packages/ivories/src/core/model/ownTime.ts`, `packages/ivories/src/react/notation/loadPepperscore.ts`, `react/notation/externalClock.ts`, `react/notation/Notation.tsx`, `react/notation/pepperscore.stub.ts`
- Copy: `/home/shaun/pepperscore-clock/validation/fixtures/clock-contract.musicxml` and `clock-contract.expected.json` → `packages/ivories/src/core/io/__fixtures__/`
- Test: `core/model/ownTime.test.ts`, `core/io/clockContract.onsets.test.ts`, `react/notation/Notation.test.tsx`, `react/notation/Notation.unavailable.test.tsx`
- Modify: `packages/ivories/vite.config.ts` (test alias), `packages/ivories/package.json` (optional peer), `react/context.ts` + `react/IvoriesProvider.tsx` (expose `tempo`), `src/index.ts`, `src/style.css`, `apps/studio/vite.config.ts` (optional-pepperscore plugin)

**Interfaces:**
- Consumes: provider context, `Clock`, `secToTicks`, `ticksToSec`.
- Produces:
  - `toOwnTempoSec(score: ScoreDocument, tempo: TempoSetting, t: number): number`; `fromOwnTempoSec(score, tempo, own: number): number` (identity at `{ mode: 'scale', scale: 1 }`; negative count-in times pass through)
  - Context gains `tempo: TempoSetting`
  - `interface ExternalClock { now(): number; readonly playing: boolean; subscribe(fn: (e?: unknown) => void): () => void }`
  - `toExternalClock(clock: Clock, map: () => (t: number) => number): ExternalClock`
  - `interface PepperScoreClockHandle { seek(seconds: number): void; currentTime(): number }`; `type PepperScoreComponent = ComponentType<PepperScoreClockProps>`; `loadPepperscore(): Promise<PepperScoreComponent>`; `resetPepperscoreCache(): void`
  - `Notation` (`{ view?: 'vertical' | 'endless'; zoom?: number; height?: number | string; className?: string; scoreRef?: Ref<PepperScoreClockHandle> } & SelfContainedProps`); DOM `div.ivories.ivories-view.ivories-notation[data-ivories-view=notation|endless]`

- [ ] **Step 1: Copy the shared fixture (R15).**

```bash
cp /home/shaun/pepperscore-clock/validation/fixtures/clock-contract.musicxml packages/ivories/src/core/io/__fixtures__/
cp /home/shaun/pepperscore-clock/validation/fixtures/clock-contract.expected.json packages/ivories/src/core/io/__fixtures__/
```

- [ ] **Step 2: Onset contract test** `core/io/clockContract.onsets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMusicXml } from './parseMusicXml'

// Shared with pepperscore (pepperscore-clock/validation/fixtures, commit 12bb378):
// a pickup bar and tempo 120 -> 60 -> 180 mid-score. Both repos must place
// every onset at the same score-time second within the tolerance.
const xml = readFileSync(join(__dirname, '__fixtures__/clock-contract.musicxml'), 'utf8')
const expected = JSON.parse(readFileSync(join(__dirname, '__fixtures__/clock-contract.expected.json'), 'utf8')) as {
  tolerance: number
  onsets: { measureIndex: number; midi: number; seconds: number }[]
}

describe('clock contract onsets (spec §4.3)', () => {
  it('ivories tempo-map onsets match pepperscore within 1 ms', () => {
    const s = parseMusicXml(xml, 'clock-contract.musicxml', { mode: 'scale', scale: 1 })
    expect(s.notes).toHaveLength(expected.onsets.length)
    for (const o of expected.onsets) {
      const hit = s.notes.find((n) => n.pitch === o.midi && Math.abs(n.startSec - o.seconds) <= expected.tolerance)
      expect(hit, `midi ${o.midi} at ${o.seconds}s (measure ${o.measureIndex})`).toBeDefined()
    }
  })
})
```

Run it now: it passes (checked at plan time). If it ever fails, treat it as a parser bug (superpowers:systematic-debugging), never loosen the tolerance.

- [ ] **Step 3: Own-tempo mapping (test first).** `core/model/ownTime.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fromOwnTempoSec, toOwnTempoSec } from './ownTime'
import { buildTempoMap } from './tempoMap'
import type { ScoreDocument } from './types'

const score = { ppq: 480, tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }, { ticks: 1920, bpm: 60 }], 480) } as ScoreDocument

describe('provider time <-> the score\'s own tempo map (Global Constraints: clock time)', () => {
  it('is the identity at scale 1 and passes count-in times through', () => {
    expect(toOwnTempoSec(score, { mode: 'scale', scale: 1 }, 3.25)).toBe(3.25)
    expect(toOwnTempoSec(score, { mode: 'scale', scale: 0.5 }, -1.5)).toBe(-1.5)
  })

  it('maps a retimed position to own-tempo seconds through ticks, and back', () => {
    const half = { mode: 'scale', scale: 0.5 } as const
    expect(toOwnTempoSec(score, half, 4)).toBeCloseTo(2, 9)        // 4 retimed s = 2 own s (first 2 s are at 120)
    expect(fromOwnTempoSec(score, half, 2)).toBeCloseTo(4, 9)
    const abs = { mode: 'absolute', bpm: 240 } as const
    expect(fromOwnTempoSec(score, abs, toOwnTempoSec(score, abs, 1.7))).toBeCloseTo(1.7, 9)
  })
})
```

`core/model/ownTime.ts`:

```ts
import { secToTicks, ticksToSec } from './tempoMap'
import type { ScoreDocument, TempoSetting } from './types'

const OWN: TempoSetting = { mode: 'scale', scale: 1 }
const isOwn = (t: TempoSetting) => t.mode === 'scale' && t.scale === 1

/** Provider time (a studio TempoSetting may retime it) -> seconds on the score's own tempo map. */
export function toOwnTempoSec(score: Pick<ScoreDocument, 'tempoMap' | 'ppq'>, tempo: TempoSetting, t: number): number {
  if (isOwn(tempo) || t <= 0) return t
  return ticksToSec(score.tempoMap, score.ppq, secToTicks(score.tempoMap, score.ppq, t, tempo), OWN)
}

/** The inverse: own-tempo seconds (e.g. a pepperscore onSeek) -> provider time. */
export function fromOwnTempoSec(score: Pick<ScoreDocument, 'tempoMap' | 'ppq'>, tempo: TempoSetting, own: number): number {
  if (isOwn(tempo) || own <= 0) return own
  return ticksToSec(score.tempoMap, score.ppq, secToTicks(score.tempoMap, score.ppq, own, OWN), tempo)
}
```

Append `export * from './model/ownTime'` to `core/index.ts`.

- [ ] **Step 4: Expose the tempo in the context.** `context.ts`: add `tempo: TempoSetting` to `IvoriesContextValue`. `IvoriesProvider.tsx`: include `tempo` in the context value and its `useMemo` deps (memoize `tempo` itself with `useMemo(() => props.tempo ?? SCALE_1, [tempoKey])`).

- [ ] **Step 5: The loader and the clock adapter.**

`react/notation/externalClock.ts`:

```ts
import type { Clock } from '../../core/clock/types'

/** pepperscore 0.2's clock prop (spec §4.3), structurally a subset of Clock. */
export interface ExternalClock {
  now(): number
  readonly playing: boolean
  subscribe(fn: (e?: unknown) => void): () => void
}

/**
 * The adapter handed to pepperscore. Its identity must only change with the
 * Clock instance (pepperscore resubscribes on identity change, R17), so the
 * score-time mapping is read through `map()` on every call, not captured.
 */
export function toExternalClock(clock: Clock, map: () => (t: number) => number): ExternalClock {
  return {
    now: () => map()(clock.now()),
    get playing() { return clock.playing },
    subscribe: (fn) => clock.subscribe((e) => fn({ ...e, time: map()(e.time) })),
  }
}
```

`react/notation/loadPepperscore.ts`:

```ts
import type { ComponentType, Ref } from 'react'
import type { ExternalClock } from './externalClock'

export interface PepperScoreClockHandle { seek(seconds: number): void; currentTime(): number }

/** The pepperscore 0.2 props <Notation> uses (spec §4.3). */
export interface PepperScoreClockProps {
  musicXml?: string
  chrome?: 'full' | 'minimal' | 'none'
  view?: 'vertical' | 'endless'
  height?: string
  className?: string
  settings?: { zoom?: number }
  audio?: boolean
  clock?: ExternalClock
  onSeek?(seconds: number): void
  onError?(error: Error): void
  ref?: Ref<PepperScoreClockHandle>
}

export type PepperScoreComponent = ComponentType<PepperScoreClockProps>

let cached: Promise<PepperScoreComponent> | null = null

/** The only place pepperscore is imported (R9): dynamically, so hosts that never
    render notation never need it. A failure is not cached, so a retry can work. */
export function loadPepperscore(): Promise<PepperScoreComponent> {
  // `as string` keeps TypeScript from resolving the optional peer (no ambient
  // types to ship) while the emitted JS stays a literal import('pepperscore')
  // that host bundlers can see.
  cached ??= import('pepperscore' as string).then((m: unknown) => {
    const mod = m as unknown as { PepperScore?: unknown; default?: unknown }
    const C = mod.PepperScore ?? mod.default
    if (typeof C !== 'function' && (typeof C !== 'object' || C === null)) throw new Error('pepperscore has no PepperScore export')
    return C as PepperScoreComponent
  })
  cached.catch(() => { cached = null })
  return cached
}

export function resetPepperscoreCache(): void { cached = null }
```

`react/notation/pepperscore.stub.ts` (resolved only by the package's tests, Step 7):

```ts
// Test-only stand-in so 'pepperscore' resolves when it is not installed.
export const PepperScore = () => null
export default PepperScore
```

- [ ] **Step 6: `react/notation/Notation.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Ref } from 'react'
import { useIvories } from '../hooks'
import { withProvider } from '../withProvider'
import { Guarded } from '../IvoriesBoundary'
import { cx } from '../cx'
import { IvoriesError } from '../../core/errors'
import { fromOwnTempoSec, toOwnTempoSec } from '../../core/model/ownTime'
import { loadPepperscore } from './loadPepperscore'
import { toExternalClock } from './externalClock'
import type { PepperScoreClockHandle, PepperScoreComponent } from './loadPepperscore'

export interface NotationProps {
  view?: 'vertical' | 'endless'
  /** pepperscore stave scale (settings.zoom). */
  zoom?: number
  height?: number | string
  className?: string
  /** The pepperscore handle (seek, currentTime), e.g. for an e2e sync check. */
  scoreRef?: Ref<PepperScoreClockHandle>
}

function NotationView({ view = 'vertical', zoom, height, className, scoreRef }: NotationProps) {
  const iv = useIvories()
  const [loaded, setLoaded] = useState<{ C: PepperScoreComponent | null; error: IvoriesError | null }>({ C: null, error: null })
  const xml = iv.score?.rawXml
  const needsXml = iv.score !== null && !xml

  // Read on every adapter call, so the adapter's identity tracks the clock only (R17).
  const mapRef = useRef({ score: iv.score, tempo: iv.tempo })
  mapRef.current = { score: iv.score, tempo: iv.tempo }
  const adapter = useMemo(() => toExternalClock(iv.clock, () => {
    const { score, tempo } = mapRef.current
    return (t: number) => (score ? toOwnTempoSec(score, tempo, t) : t)
  }), [iv.clock])

  const onSeek = useCallback((seconds: number) => {
    const { score, tempo } = mapRef.current
    iv.clock.seek(score ? fromOwnTempoSec(score, tempo, seconds) : seconds)
  }, [iv.clock])

  useEffect(() => {
    if (needsXml) iv.reportError(new IvoriesError('notation-needs-musicxml', 'Notation needs a MusicXML score; this one is MIDI.'))
  }, [needsXml]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!xml) return
    let live = true
    loadPepperscore().then(
      (C) => { if (live) setLoaded({ C, error: null }) },
      (e) => {
        if (!live) return
        const err = new IvoriesError('notation-unavailable', 'The notation view could not load (it needs pepperscore 0.2 or later).', e)
        setLoaded({ C: null, error: err })
        iv.reportError(err)
      },
    )
    return () => { live = false }
  }, [xml]) // eslint-disable-line react-hooks/exhaustive-deps

  const C = loaded.C
  return (
    <div
      className={cx('ivories', 'ivories-view', 'ivories-notation', className)}
      data-ivories-view={view === 'endless' ? 'endless' : 'notation'}
      style={height !== undefined ? { height } : undefined}
    >
      {!iv.score ? null
        : needsXml ? <p className="ivories-message" role="status">Notation needs MusicXML. This score is MIDI.</p>
        : loaded.error ? <p className="ivories-message" role="alert">{loaded.error.message}</p>
        : C ? (
          <C
            ref={scoreRef}
            musicXml={xml}
            chrome="none"
            audio={false}
            clock={adapter}
            onSeek={onSeek}
            view={view}
            settings={zoom !== undefined ? { zoom } : undefined}
            height="fill"
            className="ivories-notation-score"
            onError={(e) => iv.reportError(new IvoriesError('notation-unavailable', e.message, e))}
          />
        )
        : <p className="ivories-message" role="status">Loading notation…</p>}
    </div>
  )
}

function GuardedNotation(props: NotationProps) {
  return <Guarded code="notation-unavailable"><NotationView {...props} /></Guarded>
}

/** pepperscore driven by the provider clock (spec §4.3). A failure here never stops sibling views. */
export const Notation = withProvider(GuardedNotation, 'Notation')
```

CSS — append:

```css
.ivories.ivories-notation { overflow: auto; background: var(--ivories-panel); }
.ivories .ivories-notation-score { height: 100%; }
```

- [ ] **Step 7: Test wiring.** `packages/ivories/vite.config.ts` → add `import { fileURLToPath } from 'node:url'` and to `test`: `alias: { pepperscore: fileURLToPath(new URL('./src/react/notation/pepperscore.stub.ts', import.meta.url)) }`. `packages/ivories/package.json` → `"peerDependencies"` gains `"pepperscore": ">=0.2"` and add `"peerDependenciesMeta": { "pepperscore": { "optional": true } }`.

`apps/studio/vite.config.ts` → resolve a missing pepperscore to a module that throws, so the studio builds and runs without it (R9):

```ts
import type { Plugin } from 'vite'

/** pepperscore is an optional peer of ivories. Until it is installed, importing it
    rejects at runtime (Notation shows notation-unavailable) instead of failing the build. */
function optionalPepperscore(): Plugin {
  const MISSING = '\0ivories-pepperscore-missing'
  return {
    name: 'ivories-optional-pepperscore',
    enforce: 'pre',
    async resolveId(id, importer, opts) {
      if (id !== 'pepperscore') return null
      const real = await this.resolve(id, importer, { ...opts, skipSelf: true })
      return real ?? MISSING
    },
    load(id) {
      return id === MISSING ? 'throw new Error("pepperscore is not installed")' : null
    },
  }
}
```

and `plugins: [optionalPepperscore(), react(), tailwindcss()]`, `optimizeDeps: { exclude: ['pepperscore'] }`.

- [ ] **Step 8: Component tests.** `react/notation/Notation.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { Notation } from './Notation'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMusicXml } from '../../core/io/parseMusicXml'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'
import type { PepperScoreClockProps } from './loadPepperscore'

const seen: { props: PepperScoreClockProps | null; renders: number } = vi.hoisted(() => ({ props: null, renders: 0 }))
vi.mock('pepperscore', () => ({
  PepperScore: (p: PepperScoreClockProps) => { seen.props = p; seen.renders++; return <div data-testid="pepperscore" /> },
}))

const xml = readFileSync(join(__dirname, '../../core/io/__fixtures__/clock-contract.musicxml'), 'utf8')
const xmlScore = () => parseMusicXml(xml, 'c.musicxml', { mode: 'scale', scale: 1 })
const midiScore = () => {
  const m = new Midi(); m.addTrack().addNote({ midi: 60, time: 0, duration: 1 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

describe('Notation (spec §4.3)', () => {
  it('passes pepperscore the MusicXML in clock mode: chrome none, audio off, a clock adapter', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    render(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()}><Notation view="endless" zoom={1.2} /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    const p = seen.props!
    expect(p).toMatchObject({ musicXml: xml, chrome: 'none', audio: false, view: 'endless', settings: { zoom: 1.2 } })
    act(() => clock.seek(2.5))
    expect(p.clock!.now()).toBe(2.5)
    expect(p.clock!.playing).toBe(false)
  })

  it('keeps the adapter identity across re-renders (pepperscore resubscribes on change, R17)', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    const { rerender } = render(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()}><Notation /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    const first = seen.props!.clock
    rerender(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()} fallSeconds={5}><Notation zoom={2} /></IvoriesProvider>)
    await waitFor(() => expect(seen.props!.settings).toEqual({ zoom: 2 }))
    expect(seen.props!.clock).toBe(first)
  })

  it('onSeek from a click in the score seeks the provider clock', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    render(<IvoriesProvider score={xmlScore()} clock={clock} engine={fakeEngine()}><Notation /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    act(() => seen.props!.onSeek!(4.5))
    expect(clock.now()).toBe(4.5)
  })

  it('maps a studio-retimed provider time to own-tempo seconds and back', async () => {
    const clock = new AudioClock({ currentTime: 0 })
    const half = { mode: 'scale', scale: 0.5 } as const
    const retimed = parseMusicXml(xml, 'c.musicxml', half)
    render(<IvoriesProvider score={retimed} tempo={half} clock={clock} engine={fakeEngine()}><Notation /></IvoriesProvider>)
    await screen.findByTestId('pepperscore')
    act(() => clock.seek(1))           // 1 retimed second = 0.5 own seconds at 120 bpm
    expect(seen.props!.clock!.now()).toBeCloseTo(0.5, 9)
    act(() => seen.props!.onSeek!(0.5))
    expect(clock.now()).toBeCloseTo(1, 9)
  })

  it('a MIDI-only score shows the needs-MusicXML message and reports it', async () => {
    const onError = vi.fn()
    render(<IvoriesProvider score={midiScore()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}><Notation /></IvoriesProvider>)
    expect((await screen.findByRole('status')).textContent).toMatch(/needs MusicXML/)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'notation-needs-musicxml' }))
  })
})
```

`react/notation/Notation.unavailable.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { Notation } from './Notation'
import { Keyboard } from '../views/Keyboard'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMusicXml } from '../../core/io/parseMusicXml'
import { fakeEngine } from '../testEngine.test-helpers'

vi.mock('./loadPepperscore', () => ({
  loadPepperscore: () => Promise.reject(new Error('pepperscore is not installed')),
}))

const xml = readFileSync(join(__dirname, '../../core/io/__fixtures__/clock-contract.musicxml'), 'utf8')

describe('Notation without pepperscore (spec §4.3, §8)', () => {
  it('shows an error and reports notation-unavailable while sibling views keep running', async () => {
    const onError = vi.fn()
    const { container } = render(
      <IvoriesProvider score={parseMusicXml(xml, 'c.musicxml', { mode: 'scale', scale: 1 })} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}>
        <Notation />
        <Keyboard />
      </IvoriesProvider>,
    )
    expect((await screen.findByRole('alert')).textContent).toMatch(/pepperscore 0.2/)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'notation-unavailable' }))
    expect(container.querySelector('.ivories-keyboard')).not.toBeNull()
  })
})
```

- [ ] **Step 9: Export** — `src/index.ts`:

```ts
export { Notation } from './react/notation/Notation'
export type { NotationProps } from './react/notation/Notation'
export type { ExternalClock } from './react/notation/externalClock'
export type { PepperScoreClockHandle } from './react/notation/loadPepperscore'
```

- [ ] **Step 10: Run** `npx vitest run --project ivories && npm test && npm run build && npm run check` → green (the studio build succeeds without pepperscore installed).

- [ ] **Step 11: Commit**

```bash
git add -A packages/ivories apps/studio/vite.config.ts
git commit -m "$(cat <<'EOF'
feat(ivories): Notation on pepperscore 0.2's external clock

pepperscore is loaded lazily as an optional peer; a memoized clock adapter
keyed on the provider clock hands it own-tempo score seconds, onSeek seeks
the provider. Shared onset fixture asserts parity within 1 ms.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 23: `<Stage>` — aspect box, split divider, PIP drag/snap, swap, guarded slots

**Files:**
- Create: `packages/ivories/src/react/views/Stage.tsx`
- Test: `packages/ivories/src/react/views/Stage.test.tsx`
- Modify: `src/style.css`, `src/index.ts`

**Interfaces:**
- Consumes: `layoutReducer`, `LayoutAction`, `nearestCorner`, `clampRatio` (Task 19), `CameraSlot`, `StreamRegistry` (Task 21), `Notation` (Task 22), `Keyboard`, `FallingKeys`, `Guarded`, `withProvider`.
- Produces:
  - `interface StageHandle { swapSlots(): void }`
  - `interface StageSlotViewProps { labels?: LabelsProp; range?: 'full' | [number, number]; lookahead?: number; input?: 'none' | 'midi'; zoom?: number; onLayout?(l: KeyboardLayout): void }`
  - `interface StageProps { layout: Layout; aspect?: Aspect; onLayoutChange?(l: Layout): void; viewProps?: StageSlotViewProps; className?: string; height?: number | string; cameraRegistry?: StreamRegistry; ref?: Ref<StageHandle> }`; `Stage` (`StageProps & SelfContainedProps`). Controlled when `onLayoutChange` is given, otherwise it keeps its own copy of `layout`.
  - DOM: `div.ivories.ivories-stage[data-layout-kind]` > `div.ivories-stage-box[data-aspect]` > `div.ivories-slot.ivories-slot-<name>[data-ivories-slot][data-source]` (source = view name, `webcam` or `mask`); the inset also has `data-corner`; `div.ivories-split-divider[role=separator]`

- [ ] **Step 1: Failing test** `react/views/Stage.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { createRef } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { Stage } from './Stage'
import { IvoriesProvider } from '../IvoriesProvider'
import { AudioClock } from '../../core/clock/AudioClock'
import { parseMusicXml } from '../../core/io/parseMusicXml'
import { fakeEngine } from '../testEngine.test-helpers'
import type { StageHandle } from './Stage'
import type { Layout } from '../../core/layout/types'

vi.mock('pepperscore', () => ({ PepperScore: () => { throw new Error('engraver crashed') } }))

const xml = readFileSync(join(__dirname, '../../core/io/__fixtures__/clock-contract.musicxml'), 'utf8')
const score = () => parseMusicXml(xml, 'c.musicxml', { mode: 'scale', scale: 1 })
const falling = { kind: 'ivories', view: 'falling' } as const
const mask = { kind: 'camera', mode: 'mask', fill: '#00b140' } as const

function inProvider(ui: React.ReactNode) {
  return render(<IvoriesProvider score={score()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}>{ui}</IvoriesProvider>)
}
const slots = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.ivories-slot')].map((s) => `${s.dataset.ivoriesSlot}:${s.dataset.source}`)

describe('Stage (spec §5.2)', () => {
  it('single: one slot inside the aspect box', async () => {
    const { container } = inProvider(<Stage layout={{ kind: 'single', main: falling }} aspect="16:9" />)
    await waitFor(() => expect(slots(container)).toEqual(['main:falling']))
    expect(container.querySelector('.ivories-stage-box')!.getAttribute('data-aspect')).toBe('16:9')
  })

  it('split: ratio sizes the slots; the divider is keyboard-accessible and clamped', async () => {
    const onLayoutChange = vi.fn()
    const layout: Layout = { kind: 'split', top: falling, bottom: mask, ratio: 0.3 }
    const { container } = inProvider(<Stage layout={layout} onLayoutChange={onLayoutChange} />)
    await waitFor(() => expect(slots(container)).toEqual(['top:falling', 'bottom:mask']))
    expect((container.querySelector('.ivories-slot-top') as HTMLElement).style.height).toBe('30%')
    const divider = screen.getByRole('separator')
    expect(divider.getAttribute('aria-valuenow')).toBe('30')
    fireEvent.keyDown(divider, { key: 'ArrowDown' })
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...layout, ratio: 0.35 })
    fireEvent.keyDown(divider, { key: 'Home' })
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...layout, ratio: 0.15 })
  })

  it('swapSlots (handle) swaps uncontrolled slots and keeps their views mounted', async () => {
    const ref = createRef<StageHandle>()
    const { container } = inProvider(<Stage ref={ref} layout={{ kind: 'split', top: falling, bottom: mask, ratio: 0.5 }} />)
    await waitFor(() => expect(container.querySelector('.ivories-falling')).not.toBeNull())
    const view = container.querySelector('.ivories-falling')
    act(() => ref.current!.swapSlots())
    expect(slots(container)).toContain('bottom:falling')
    expect(container.querySelector('.ivories-falling')).toBe(view)
  })

  it('pip: the inset snaps to the nearest corner on release', async () => {
    const onLayoutChange = vi.fn()
    const layout: Layout = { kind: 'pip', main: falling, inset: mask, corner: 'br', size: 0.25, margin: 0.02 }
    const { container } = inProvider(<Stage layout={layout} onLayoutChange={onLayoutChange} />)
    const inset = await waitFor(() => container.querySelector('.ivories-slot-inset') as HTMLElement)
    expect(inset.dataset.corner).toBe('br')
    const box = container.querySelector('.ivories-stage-box') as HTMLElement
    vi.spyOn(box, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 400 } as DOMRect)
    vi.spyOn(inset, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 300, width: 200, height: 100 } as DOMRect)
    fireEvent.pointerDown(inset, { button: 0, clientX: 700, clientY: 350, pointerId: 1 })
    fireEvent.pointerMove(inset, { clientX: 150, clientY: 350, pointerId: 1 })
    fireEvent.pointerUp(inset, { clientX: 150, clientY: 350, pointerId: 1 })
    expect(onLayoutChange).toHaveBeenLastCalledWith({ ...layout, corner: 'bl' })
  })

  it('a crashing slot never tears down its sibling (spec §8)', async () => {
    const { container } = inProvider(<Stage layout={{ kind: 'split', top: { kind: 'ivories', view: 'notation' }, bottom: falling, ratio: 0.5 }} />)
    await waitFor(() => expect(container.querySelector('.ivories-slot-top [role="alert"]')).not.toBeNull())
    expect(container.querySelector('.ivories-slot-bottom .ivories-falling')).not.toBeNull()
  })
})
```

Run → FAIL.

- [ ] **Step 2: `react/views/Stage.tsx`**

```tsx
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, Ref, RefObject } from 'react'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { CameraSlot } from './CameraSlot'
import { Notation } from '../notation/Notation'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import { cx } from '../cx'
import { layoutReducer } from '../../core/layout/layoutReducer'
import { nearestCorner } from '../../core/layout/geometry'
import type { LayoutAction } from '../../core/layout/layoutReducer'
import type { Aspect, Layout, SlotName, SlotSource } from '../../core/layout/types'
import type { StreamRegistry } from '../../core/camera/streams'
import type { KeyboardLayout } from '../../core/render/geometry'
import type { IvoriesErrorCode } from '../../core/errors'
import type { LabelsProp } from './labels'

export interface StageHandle { swapSlots(): void }

export interface StageSlotViewProps {
  labels?: LabelsProp
  range?: 'full' | [number, number]
  lookahead?: number
  input?: 'none' | 'midi'
  zoom?: number
  onLayout?(layout: KeyboardLayout): void
}

export interface StageProps {
  layout: Layout
  aspect?: Aspect
  /** Controlled: every change (drag, keys, swap) comes back here. Absent: the Stage keeps its own copy. */
  onLayoutChange?(layout: Layout): void
  viewProps?: StageSlotViewProps
  className?: string
  height?: number | string
  cameraRegistry?: StreamRegistry
  ref?: Ref<StageHandle>
}

interface SlotSpec { name: SlotName; source: SlotSource; style: CSSProperties; inset?: boolean }

const FULL: CSSProperties = { left: 0, top: 0, width: '100%', height: '100%' }
const DRAG_THRESHOLD_PX = 4

const sourceLabel = (s: SlotSource) => (s.kind === 'ivories' ? s.view : s.mode)
const errorCode = (s: SlotSource): IvoriesErrorCode =>
  s.kind === 'camera' ? 'camera-unavailable' : s.view === 'notation' || s.view === 'endless' ? 'notation-unavailable' : 'render-failed'

/** Keys follow the SOURCE, not the slot, so a swap moves mounted views and streams instead of remounting them. */
function slotKeys(slots: SlotSpec[]): string[] {
  const seen = new Set<string>()
  return slots.map((s) => {
    const base = s.source.kind === 'ivories' ? `v:${s.source.view}` : s.source.mode === 'webcam' ? `c:webcam:${s.source.deviceId ?? ''}` : `c:mask:${s.source.fill}`
    const key = seen.has(base) ? `${base}@${s.name}` : base
    seen.add(key)
    return key
  })
}

function insetStyle(l: Extract<Layout, { kind: 'pip' }>, drag: { dx: number; dy: number } | null): CSSProperties {
  const m = `calc(${l.margin} * 100cqw)`
  const s: CSSProperties = { width: `${l.size * 100}%`, height: `${l.size * 100}%` }
  if (l.corner === 'tl' || l.corner === 'bl') s.left = m
  else s.right = m
  if (l.corner === 'tl' || l.corner === 'tr') s.top = m
  else s.bottom = m
  if (drag) s.transform = `translate(${drag.dx}px, ${drag.dy}px)`
  return s
}

function SlotContent({ source, viewProps, registry }: { source: SlotSource; viewProps?: StageSlotViewProps; registry?: StreamRegistry }) {
  if (source.kind === 'camera') return <CameraSlot source={source} registry={registry} />
  const v = viewProps ?? {}
  switch (source.view) {
    case 'keyboard': return <Keyboard labels={v.labels} range={v.range} input={v.input} onLayout={v.onLayout} />
    case 'falling': return <FallingKeys labels={v.labels} range={v.range} lookahead={v.lookahead} input={v.input} onLayout={v.onLayout} />
    case 'notation': return <Notation view="vertical" zoom={v.zoom} />
    case 'endless': return <Notation view="endless" zoom={v.zoom} />
  }
}

function SplitDivider({ ratio, boxRef, onRatio }: { ratio: number; boxRef: RefObject<HTMLDivElement | null>; onRatio(r: number): void }) {
  const dragging = useRef(false)
  const at = (clientY: number) => {
    const r = boxRef.current?.getBoundingClientRect()
    return r && r.height > 0 ? (clientY - r.top) / r.height : null
  }
  return (
    <div
      role="separator" tabIndex={0} aria-orientation="horizontal" aria-label="Split position"
      aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(ratio * 100)}
      className="ivories-split-divider"
      style={{ top: `${ratio * 100}%` }}
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId) }}
      onPointerMove={(e) => { if (!dragging.current) return; const r = at(e.clientY); if (r !== null) onRatio(r) }}
      onPointerUp={() => { dragging.current = false }}
      onPointerCancel={() => { dragging.current = false }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.05
        const next = e.key === 'ArrowUp' ? ratio - step : e.key === 'ArrowDown' ? ratio + step
          : e.key === 'Home' ? 0 : e.key === 'End' ? 1 : null
        if (next === null) return
        e.preventDefault()
        onRatio(next)
      }}
    />
  )
}

function StageInner(props: StageProps) {
  const { aspect = 'free', viewProps, className, height, cameraRegistry } = props
  const [inner, setInner] = useState(props.layout)
  useEffect(() => { setInner(props.layout) }, [props.layout])
  const layout = props.onLayoutChange ? props.layout : inner
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const onChange = useRef(props.onLayoutChange)
  onChange.current = props.onLayoutChange

  const dispatch = useCallback((a: LayoutAction) => {
    const next = layoutReducer(layoutRef.current, a)
    if (next === layoutRef.current) return
    layoutRef.current = next
    if (onChange.current) onChange.current(next)
    else setInner(next)
  }, [])
  useImperativeHandle(props.ref, () => ({ swapSlots: () => dispatch({ type: 'swap' }) }), [dispatch])

  const boxRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const start = useRef<{ x: number; y: number; captured: boolean } | null>(null)

  const slots: SlotSpec[] =
    layout.kind === 'single' ? [{ name: 'main', source: layout.main, style: FULL }]
    : layout.kind === 'split' ? [
      { name: 'top', source: layout.top, style: { left: 0, top: 0, width: '100%', height: `${layout.ratio * 100}%` } },
      { name: 'bottom', source: layout.bottom, style: { left: 0, top: `${layout.ratio * 100}%`, width: '100%', height: `${(1 - layout.ratio) * 100}%` } },
    ]
    : [
      { name: 'main', source: layout.main, style: FULL },
      { name: 'inset', source: layout.inset, style: insetStyle(layout, drag), inset: true },
    ]
  const keys = slotKeys(slots)

  const insetHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      start.current = { x: e.clientX, y: e.clientY, captured: false }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = start.current
      if (!s) return
      const dx = e.clientX - s.x, dy = e.clientY - s.y
      // A small threshold keeps clicks (Retry, a note in the score) working.
      if (!s.captured && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      if (!s.captured) { s.captured = true; e.currentTarget.setPointerCapture?.(e.pointerId) }
      setDrag({ dx, dy })
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      const s = start.current
      start.current = null
      if (!s?.captured) { setDrag(null); return }
      const box = boxRef.current?.getBoundingClientRect()
      const r = e.currentTarget.getBoundingClientRect()
      setDrag(null)
      if (box && box.width > 0 && box.height > 0) {
        dispatch({ type: 'setCorner', corner: nearestCorner(r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top, box.width, box.height) })
      }
    },
    onPointerCancel: () => { start.current = null; setDrag(null) },
  }

  return (
    <div
      className={cx('ivories', 'ivories-stage', className)}
      data-layout-kind={layout.kind}
      style={height !== undefined ? { height } : undefined}
    >
      <div ref={boxRef} className="ivories-stage-box" data-aspect={aspect}>
        {slots.map((s, i) => (
          <div
            key={keys[i]}
            className={cx('ivories-slot', `ivories-slot-${s.name}`, s.inset && 'ivories-slot-inset')}
            data-ivories-slot={s.name}
            data-source={sourceLabel(s.source)}
            data-corner={s.inset && layout.kind === 'pip' ? layout.corner : undefined}
            aria-label={s.inset ? 'Picture-in-picture inset' : undefined}
            style={s.style}
            {...(s.inset ? insetHandlers : {})}
          >
            <Guarded code={errorCode(s.source)}>
              <SlotContent source={s.source} viewProps={viewProps} registry={cameraRegistry} />
            </Guarded>
          </div>
        ))}
        {layout.kind === 'split' && (
          <SplitDivider ratio={layout.ratio} boxRef={boxRef} onRatio={(ratio) => dispatch({ type: 'setRatio', ratio })} />
        )}
      </div>
    </div>
  )
}

/** Layout container of slots (spec §5.2): single, split or picture-in-picture. */
export const Stage = withProvider(StageInner, 'Stage')
```

(`ref` reaches `StageInner` because `withProvider` spreads every prop onto the view, and React 19 passes `ref` as a prop to function components.)

- [ ] **Step 3: CSS** — append:

```css
.ivories.ivories-stage {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; min-height: 0; overflow: hidden;
  container-type: size;
}
.ivories .ivories-stage-box { position: relative; width: 100%; height: 100%; container-type: size; }
.ivories .ivories-stage-box[data-aspect='16:9'] { width: min(100cqw, calc(100cqh * 16 / 9)); height: min(100cqh, calc(100cqw * 9 / 16)); }
.ivories .ivories-stage-box[data-aspect='9:16'] { width: min(100cqw, calc(100cqh * 9 / 16)); height: min(100cqh, calc(100cqw * 16 / 9)); }
.ivories .ivories-slot { position: absolute; overflow: hidden; }
.ivories .ivories-slot-inset {
  z-index: 2; border: 1px solid var(--ivories-line); border-radius: 0.75rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); cursor: grab; touch-action: none;
}
.ivories .ivories-split-divider {
  position: absolute; left: 0; right: 0; z-index: 3; height: 12px;
  transform: translateY(-50%); cursor: row-resize; touch-action: none; outline: none;
}
.ivories .ivories-split-divider::after {
  content: ''; position: absolute; left: 0; right: 0; top: 5px; height: 2px; background: var(--ivories-line);
}
.ivories .ivories-split-divider:focus-visible::after { background: var(--ivories-accent); }
```

- [ ] **Step 4: Export** — `src/index.ts`: `export { Stage } from './react/views/Stage'` and `export type { StageProps, StageHandle, StageSlotViewProps } from './react/views/Stage'`.

- [ ] **Step 5: Run** `npx vitest run --project ivories && npm run check:css -w packages/ivories && npm test` → green.

- [ ] **Step 6: Commit**

```bash
git add -A packages/ivories
git commit -m "$(cat <<'EOF'
feat(ivories): Stage with split, picture-in-picture and guarded slots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 24: Studio layout toolbar; scenes carry the layout

**Files:**
- Create: `apps/studio/src/studio/stageStore.ts`, `studio/modeSync.ts`, `studio/LayoutToolbar.tsx`
- Test: `studio/modeSync.test.ts`, `studio/LayoutToolbar.test.tsx`
- Modify: `apps/studio/src/App.tsx`, `studio/useSceneActions.ts`

**Interfaces:**
- Consumes: `Stage`, `layoutReducer`, `singleLayout`, `slotsOf`, `sourceAt`, `listVideoInputs`, `SceneV2` plan `layout`/`aspect`.
- Produces:
  - `useStudioStage` (zustand): `{ layout: Layout; aspect: Aspect; dispatch(a: LayoutAction): void; setLayout(l: Layout): void; setAspect(a: Aspect): void; replace(l: Layout, a: Aspect): void }` (initial `singleLayout('falling')`, `'free'`)
  - `primarySlot(l: Layout): SlotName | null` (first slot showing `falling`/`keyboard`), `withPrimaryMode(l: Layout, mode: DisplayMode): Layout`, `modeForView(v: IvoriesView): DisplayMode | null`
  - `LayoutToolbar()`; controls (aria-labels): `Layout`, `Swap slots`, `Inset corner`, `Aspect`, `<Slot> source`, `<Slot> camera`, `<Slot> mirror`, `<Slot> fit` where `<Slot>` is `Main`/`Top`/`Bottom`/`Inset`. Source option values: `falling`, `keyboard`, `notation`, `endless`, `webcam`, `mask-transparent`, `mask-green`, `mask-blue`.

- [ ] **Step 1: Failing tests.** `studio/modeSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { primarySlot, withPrimaryMode } from './modeSync'
import type { Layout } from 'ivories/core'

const cam = { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' } as const

describe('display mode <-> layout (R7)', () => {
  it('rewrites only the primary falling/keyboard slot', () => {
    const l: Layout = { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'ivories', view: 'keyboard' }, ratio: 0.5 }
    expect(primarySlot(l)).toBe('top')
    expect(withPrimaryMode(l, 'keyboard')).toEqual({ ...l, top: { kind: 'ivories', view: 'keyboard' } })
  })

  it('is the same object when nothing changes or no slot shows keys', () => {
    const l: Layout = { kind: 'pip', main: cam, inset: { kind: 'ivories', view: 'notation' }, corner: 'br', size: 0.3, margin: 0.02 }
    expect(primarySlot(l)).toBeNull()
    expect(withPrimaryMode(l, 'roll')).toBe(l)
    const f: Layout = { kind: 'single', main: { kind: 'ivories', view: 'falling' } }
    expect(withPrimaryMode(f, 'roll')).toBe(f)
  })
})
```

`studio/LayoutToolbar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LayoutToolbar } from './LayoutToolbar'
import { useStudioStage } from './stageStore'
import { singleLayout } from 'ivories/core'

vi.mock('ivories/core', async (orig) => ({
  ...(await orig<typeof import('ivories/core')>()),
  listVideoInputs: async () => [{ deviceId: 'cam-1', label: 'Desk cam' }],
}))

beforeEach(() => useStudioStage.setState({ layout: singleLayout('falling'), aspect: 'free' }))

describe('LayoutToolbar (spec §6)', () => {
  it('switches layout kind, swaps, and sets the PIP corner and aspect', () => {
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'split' } })
    expect(useStudioStage.getState().layout).toMatchObject({ kind: 'split', bottom: { kind: 'camera', mode: 'mask' } })
    fireEvent.click(screen.getByRole('button', { name: 'Swap slots' }))
    expect(useStudioStage.getState().layout).toMatchObject({ top: { kind: 'camera' } })
    fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'pip' } })
    fireEvent.change(screen.getByLabelText('Inset corner'), { target: { value: 'tl' } })
    expect(useStudioStage.getState().layout).toMatchObject({ kind: 'pip', corner: 'tl' })
    fireEvent.change(screen.getByLabelText('Aspect'), { target: { value: '9:16' } })
    expect(useStudioStage.getState().aspect).toBe('9:16')
  })

  it('picks a webcam source, its device and mirror', async () => {
    useStudioStage.setState({ layout: { kind: 'split', top: { kind: 'ivories', view: 'falling' }, bottom: { kind: 'camera', mode: 'mask', fill: 'transparent' }, ratio: 0.5 } })
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Bottom source'), { target: { value: 'webcam' } })
    expect(useStudioStage.getState().layout).toMatchObject({ bottom: { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Desk cam' })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Bottom camera'), { target: { value: 'cam-1' } })
    fireEvent.click(screen.getByLabelText('Bottom mirror'))
    expect(useStudioStage.getState().layout).toMatchObject({ bottom: { deviceId: 'cam-1', mirror: false } })
  })

  it('offers a green chroma mask', () => {
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'mask-green' } })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'camera', mode: 'mask', fill: '#00b140' } })
  })
})
```

Run → FAIL.

- [ ] **Step 2: `studio/stageStore.ts`**

```ts
import { create } from 'zustand'
import { layoutReducer, singleLayout } from 'ivories/core'
import type { Aspect, Layout, LayoutAction } from 'ivories/core'

interface StudioStage {
  layout: Layout
  aspect: Aspect
  dispatch(a: LayoutAction): void
  setLayout(l: Layout): void
  setAspect(a: Aspect): void
  replace(l: Layout, a: Aspect): void
}

export const useStudioStage = create<StudioStage>((set, get) => ({
  layout: singleLayout('falling'),
  aspect: 'free',
  dispatch: (a) => set({ layout: layoutReducer(get().layout, a) }),
  setLayout: (layout) => set({ layout }),
  setAspect: (aspect) => set({ aspect }),
  replace: (layout, aspect) => set({ layout, aspect }),
}))
```

- [ ] **Step 3: `studio/modeSync.ts`**

```ts
import { layoutReducer, slotsOf, sourceAt } from 'ivories/core'
import type { DisplayMode, IvoriesView, Layout, SlotName } from 'ivories/core'

export function modeForView(v: IvoriesView): DisplayMode | null {
  return v === 'falling' ? 'roll' : v === 'keyboard' ? 'keyboard' : null
}

/** The first slot showing keys: the one the roll/keyboard toggle drives (R7). */
export function primarySlot(l: Layout): SlotName | null {
  for (const name of slotsOf(l)) {
    const s = sourceAt(l, name)
    if (s?.kind === 'ivories' && modeForView(s.view)) return name
  }
  return null
}

export function withPrimaryMode(l: Layout, mode: DisplayMode): Layout {
  const slot = primarySlot(l)
  if (!slot) return l
  const s = sourceAt(l, slot)
  const view: IvoriesView = mode === 'roll' ? 'falling' : 'keyboard'
  if (s?.kind === 'ivories' && s.view === view) return l
  return layoutReducer(l, { type: 'setSource', slot, source: { kind: 'ivories', view } })
}
```

- [ ] **Step 4: `studio/LayoutToolbar.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { listVideoInputs, slotsOf, sourceAt } from 'ivories/core'
import type { Aspect, Corner, LayoutKind, SlotName, SlotSource } from 'ivories/core'
import { useStudioStage } from './stageStore'
import { modeForView, primarySlot } from './modeSync'
import { useTransport } from '../transport/useTransport'

const SLOT_LABEL: Record<SlotName, string> = { main: 'Main', top: 'Top', bottom: 'Bottom', inset: 'Inset' }
const MASKS: Record<string, string> = { 'mask-transparent': 'transparent', 'mask-green': '#00b140', 'mask-blue': '#0047bb' }
const SOURCE_OPTIONS: [string, string][] = [
  ['falling', 'Falling keys'], ['keyboard', 'Keyboard'], ['notation', 'Notation'], ['endless', 'Endless notation'],
  ['webcam', 'Webcam'], ['mask-transparent', 'Mask (transparent)'], ['mask-green', 'Mask (green)'], ['mask-blue', 'Mask (blue)'],
]
const SELECT = 'rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--ink)]'

function valueOf(s: SlotSource): string {
  if (s.kind === 'ivories') return s.view
  if (s.mode === 'webcam') return 'webcam'
  return Object.entries(MASKS).find(([, fill]) => fill === s.fill)?.[0] ?? 'mask-transparent'
}

function sourceFor(value: string, current: SlotSource): SlotSource {
  if (value === 'webcam') {
    return current.kind === 'camera' && current.mode === 'webcam' ? current : { kind: 'camera', mode: 'webcam', mirror: true, fit: 'cover' }
  }
  if (value in MASKS) return { kind: 'camera', mode: 'mask', fill: MASKS[value] }
  return { kind: 'ivories', view: value as 'falling' | 'keyboard' | 'notation' | 'endless' }
}

/** Layout kind, swap, PIP corner, aspect and per-slot sources (spec §6). */
export function LayoutToolbar() {
  const { layout, aspect, dispatch, setAspect } = useStudioStage()
  const setMode = useTransport((s) => s.setMode)
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([])
  const hasWebcam = slotsOf(layout).some((n) => { const s = sourceAt(layout, n); return s?.kind === 'camera' && s.mode === 'webcam' })

  useEffect(() => {
    if (!hasWebcam) return
    let live = true
    void listVideoInputs().then((c) => { if (live) setCameras(c) })
    return () => { live = false }
  }, [hasWebcam])

  const setSource = (slot: SlotName, value: string) => {
    const current = sourceAt(layout, slot)!
    const source = sourceFor(value, current)
    dispatch({ type: 'setSource', slot, source })
    // The primary keys slot and the roll/keyboard toggle stay one setting (R7).
    if (source.kind === 'ivories' && primarySlot(layout) === slot) {
      const mode = modeForView(source.view)
      if (mode) setMode(mode)
    }
  }

  return (
    <div className="layout-toolbar flex flex-wrap items-center gap-2 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink-dim)]">
      <label className="layout-kind flex items-center gap-1">
        <span className="layout-kind-label">Layout</span>
        <select aria-label="Layout" className={`layout-kind-select ${SELECT}`} value={layout.kind}
          onChange={(e) => dispatch({ type: 'setKind', kind: e.target.value as LayoutKind })}>
          <option value="single">Single</option>
          <option value="split">Split</option>
          <option value="pip">Picture in picture</option>
        </select>
      </label>
      {layout.kind !== 'single' && (
        <button type="button" aria-label="Swap slots" className="btn-layout-swap rounded-md border border-[var(--line)] px-3 py-1"
          onClick={() => dispatch({ type: 'swap' })}>
          Swap
        </button>
      )}
      {layout.kind === 'pip' && (
        <select aria-label="Inset corner" className={`layout-corner-select ${SELECT}`} value={layout.corner}
          onChange={(e) => dispatch({ type: 'setCorner', corner: e.target.value as Corner })}>
          <option value="tl">Top left</option>
          <option value="tr">Top right</option>
          <option value="bl">Bottom left</option>
          <option value="br">Bottom right</option>
        </select>
      )}
      <select aria-label="Aspect" className={`layout-aspect-select ${SELECT}`} value={aspect}
        onChange={(e) => setAspect(e.target.value as Aspect)}>
        <option value="free">Free</option>
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
      </select>
      {slotsOf(layout).map((slot) => {
        const s = sourceAt(layout, slot)!
        const label = SLOT_LABEL[slot]
        return (
          <span key={slot} className="slot-source-group flex items-center gap-1">
            <select aria-label={`${label} source`} className={`slot-source-select ${SELECT}`} value={valueOf(s)}
              onChange={(e) => setSource(slot, e.target.value)}>
              {SOURCE_OPTIONS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
            </select>
            {s.kind === 'camera' && s.mode === 'webcam' && (
              <>
                <select aria-label={`${label} camera`} className={`slot-device-select ${SELECT}`} value={s.deviceId ?? ''}
                  onChange={(e) => dispatch({ type: 'setSource', slot, source: { ...s, deviceId: e.target.value || undefined } })}>
                  <option value="">Default camera</option>
                  {cameras.map((c) => <option key={c.deviceId} value={c.deviceId}>{c.label}</option>)}
                </select>
                <label className="slot-mirror flex items-center gap-1">
                  <input type="checkbox" aria-label={`${label} mirror`} className="slot-mirror-toggle accent-[var(--accent)]"
                    checked={s.mirror} onChange={(e) => dispatch({ type: 'setSource', slot, source: { ...s, mirror: e.target.checked } })} />
                  <span className="slot-mirror-label">Mirror</span>
                </label>
                <select aria-label={`${label} fit`} className={`slot-fit-select ${SELECT}`} value={s.fit}
                  onChange={(e) => dispatch({ type: 'setSource', slot, source: { ...s, fit: e.target.value as 'cover' | 'contain' } })}>
                  <option value="cover">Fill</option>
                  <option value="contain">Fit</option>
                </select>
              </>
            )}
          </span>
        )
      })}
    </div>
  )
}
```

(`{ ...s, deviceId: undefined }` keeps an explicit `undefined` key; that is harmless for `validLayout`, which only copies a string deviceId.)

- [ ] **Step 5: Wire the studio.**
  - `App.tsx`: `const stage = useStudioStage()`; replace the `FallingKeys`/`Keyboard` conditional inside the provider with:

```tsx
          <Stage
            className="studio-stage"
            layout={stage.layout}
            aspect={stage.aspect}
            onLayoutChange={stage.setLayout}
            viewProps={{ onLayout: setKbLayout, input: liveMidi.enabled ? 'midi' : 'none' }}
          />
```

  - keep the primary slot in step with the display mode whatever changed it (TransportBar toggle, a profile, a look, a scene):

```tsx
  useEffect(() => {
    const s = useStudioStage.getState()
    const next = withPrimaryMode(s.layout, t.mode)
    if (next !== s.layout) s.setLayout(next)
  }, [t.mode])
```

  - render `{t.score && <LayoutToolbar />}` directly above `<TransportBar …/>`.
  - `useSceneActions.ts`: `buildScene` passes `layout: useStudioStage.getState().layout, aspect: useStudioStage.getState().aspect` to `sceneFromState`; `applySceneToScore` calls `useStudioStage.getState().replace(plan.layout, plan.aspect)` right after a successful `applyProfileParts` (before returning), so a refused scene changes nothing.
  - `html.ivories-transparent` already covers the page; a `mask-transparent` slot shows the page behind (spec §5.3). Add to `apps/studio/src/index.css` inside the existing transparent rule's selector list: `html.ivories-transparent .studio-stage`.

- [ ] **Step 6: Run** `npm test && npm run build && npm run check` → green (App.test untouched: the default layout is `single`/`falling`).

Manual (`npm run dev -- --port 5183`, Chrome on the LAN URL): split with a webcam bottom, swap, drag the divider, PIP in each corner and dragged between corners, aspect 9:16, save a scene and load it back (layout restored), share it (`#share=` link opens with the same layout and no device id).

- [ ] **Step 7: Commit**

```bash
git add -A apps/studio
git commit -m "$(cat <<'EOF'
feat(studio): layout toolbar and scenes that carry the stage layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 25: Notation presets in `<Ivories>`

**Files:**
- Modify: `packages/ivories/src/react/views/Ivories.tsx`, `src/style.css`
- Test: `packages/ivories/src/react/views/IvoriesNotation.test.tsx`

**Interfaces:**
- Consumes: `Notation` (Task 22).
- Produces: `type IvoriesPreset = 'falling' | 'keyboard' | 'keyboard+notation' | 'endless+falling' | 'endless+keyboard'`; `IvoriesProps.zoom?: number`; DOM `div.ivories-preset-notation` above `div.ivories-preset-main[data-with-notation]`.

- [ ] **Step 1: Failing test** `IvoriesNotation.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, waitFor } from '@testing-library/react'
import { Ivories } from './Ivories'
import { fakeEngine } from '../testEngine.test-helpers'

vi.mock('pepperscore', () => ({ PepperScore: (p: { view?: string }) => <div data-testid="pepperscore" data-view={p.view} /> }))

const xml = readFileSync(join(__dirname, '../../core/io/__fixtures__/clock-contract.musicxml'), 'utf8')

describe('notation presets (spec §4)', () => {
  it.each([
    ['keyboard+notation', 'vertical', '.ivories-keyboard'],
    ['endless+falling', 'endless', '.ivories-falling'],
    ['endless+keyboard', 'endless', '.ivories-keyboard'],
  ] as const)('%s: pepperscore (%s) above the keys, one provider', async (view, pepView, keys) => {
    const { container, getByTestId } = render(<Ivories view={view} musicXml={xml} engine={fakeEngine()} />)
    await waitFor(() => expect(getByTestId('pepperscore').dataset.view).toBe(pepView))
    expect(container.querySelector(`.ivories-preset-main ${keys}`)).not.toBeNull()
    expect(container.querySelector('.ivories-preset-notation .ivories-notation')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Implement.** In `Ivories.tsx`: widen `IvoriesPreset` to the five values, add `zoom?: number` to `IvoriesProps` (destructure it out of the provider props), import `Notation`, and render:

```tsx
  const notation = view === 'keyboard+notation' ? 'vertical' : view.startsWith('endless') ? 'endless' : null
  const keysOnly = view === 'keyboard' || view === 'keyboard+notation' || view === 'endless+keyboard'
  const main = keysOnly
    ? <Keyboard labels={labels} range={range} input={input} />
    : <FallingKeys labels={labels} range={range} lookahead={lookahead} input={input} />
  return (
    <IvoriesProvider {...provider}>
      <div className={cx('ivories', 'ivories-preset', `ivories-preset-${slug(view)}`, className)} style={height !== undefined ? { height } : undefined}>
        {notation && <div className="ivories-preset-notation"><Notation view={notation} zoom={zoom} /></div>}
        <div className="ivories-preset-main" data-with-notation={notation ? '' : undefined}>{main}</div>
        {chrome !== 'none' && <Transport controls={chrome === 'minimal' ? MINIMAL : undefined} />}
      </div>
    </IvoriesProvider>
  )
```

CSS — append:

```css
.ivories .ivories-preset-notation { position: relative; flex: 3 1 0; min-height: 0; }
.ivories .ivories-preset-main[data-with-notation] { flex: 2 1 0; }
.ivories.ivories-preset-keyboard-notation .ivories-preset-main,
.ivories.ivories-preset-endless-keyboard .ivories-preset-main { flex: 0 0 30%; }
```

- [ ] **Step 3: Run** `npx vitest run --project ivories && npm run check:css -w packages/ivories && npm test` → green.

- [ ] **Step 4: Commit**

```bash
git add -A packages/ivories
git commit -m "$(cat <<'EOF'
feat(ivories): keyboard+notation and endless presets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---
## Stage F — Library build, embed fixture, browser smoke

### Task 26: Library build, exports, README, pack check

**Files:**
- Create: `packages/ivories/tsconfig.build.json`, `packages/ivories/scripts/copy-css.mjs`, `packages/ivories/scripts/check-dist.mjs`, `packages/ivories/README.md`, `packages/ivories/LICENSE`
- Modify: `packages/ivories/vite.config.ts` (`build.lib`), `packages/ivories/package.json` (scripts), root `package.json` (`build`)

**Interfaces:**
- Consumes: everything exported from `src/index.ts` and `src/core/index.ts`.
- Produces: `npm run build -w packages/ivories` → `dist/index.js`, `dist/core.js` (+ shared chunks), `dist/style.css`, `dist/types/**/*.d.ts`; `npm pack -w packages/ivories --dry-run` lists only `dist/`, `README.md`, `LICENSE`, `package.json`.

- [ ] **Step 1: Lib build config.** `packages/ivories/vite.config.ts` (whole file):

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

/** Every bare import stays external: peers (react, pepperscore) and runtime deps (smplr, tonal, ...). */
const isExternal = (id: string) =>
  !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0') && !/^[A-Za-z]:[\\/]/.test(id)

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: { index: 'src/index.ts', core: 'src/core/index.ts' }, formats: ['es'] },
    rolldownOptions: { external: isExternal },
    sourcemap: true,
    emptyOutDir: true,
    copyPublicDir: false,
  },
  test: {
    name: 'ivories',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    alias: { pepperscore: fileURLToPath(new URL('./src/react/notation/pepperscore.stub.ts', import.meta.url)) },
  },
})
```

`packages/ivories/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "dist/types",
    "rootDir": "src",
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.build.tsbuildinfo"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.test-helpers.ts", "src/test-setup.ts", "src/react/notation/pepperscore.stub.ts"]
}
```

- [ ] **Step 2: Scripts.** `scripts/copy-css.mjs`:

```js
import { copyFileSync, mkdirSync } from 'node:fs'
mkdirSync(new URL('../dist/', import.meta.url), { recursive: true })
copyFileSync(new URL('../src/style.css', import.meta.url), new URL('../dist/style.css', import.meta.url))
console.log('copied src/style.css -> dist/style.css')
```

`scripts/check-dist.mjs`:

```js
#!/usr/bin/env node
// The published package: entries exist, only allowed bare imports remain,
// no Tailwind leaked into the CSS, and both entries import under plain Node
// (no window at import time, spec §4 SSR).
import { existsSync, readdirSync, readFileSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
const problems = []
for (const f of ['index.js', 'core.js', 'style.css', 'types/index.d.ts', 'types/core/index.d.ts']) {
  if (!existsSync(new URL(f, dist))) problems.push(`missing dist/${f}`)
}
const ALLOWED = [/^react$/, /^react\/jsx-runtime$/, /^react-dom(\/.*)?$/, /^smplr$/, /^@tonejs\/midi$/, /^tonal$/, /^fflate$/, /^@noble\/hashes\//, /^pepperscore$/]
for (const f of readdirSync(dist).filter((n) => n.endsWith('.js'))) {
  const text = readFileSync(new URL(f, dist), 'utf8')
  for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"'./][^"']*)["']/g)) {
    if (!ALLOWED.some((re) => re.test(m[1]))) problems.push(`dist/${f}: unexpected import "${m[1]}"`)
  }
}
const css = readFileSync(new URL('style.css', dist), 'utf8')
if (/tailwind|@apply|@layer/.test(css)) problems.push('dist/style.css contains Tailwind')
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }
await import(new URL('core.js', dist).href)
await import(new URL('index.js', dist).href)
console.log('dist check: entries present, externals allowed, CSS plain, SSR import ok')
```

`packages/ivories/package.json` scripts:

```json
"scripts": {
  "build": "vite build && tsc -p tsconfig.build.json && node scripts/copy-css.mjs && node scripts/css-scope.mjs && node scripts/check-dist.mjs",
  "check": "tsc -p tsconfig.json",
  "check:css": "node scripts/css-scope.mjs",
  "prepack": "npm run build"
}
```

Root `package.json`: `"build": "npm run check:imports && npm run build -w packages/ivories && npm run build -w apps/studio"`.

- [ ] **Step 3: Build and verify**

Run: `npm run build -w packages/ivories`
Expected: ends with `dist check: entries present, externals allowed, CSS plain, SSR import ok`.

Run: `npm pack -w packages/ivories --dry-run 2>&1 | grep -E 'dist/|README|LICENSE|package.json' | head -40`
Expected: only `dist/…`, `README.md`, `LICENSE`, `package.json` (no `src/`, no tests).

Run: `grep -c "import('pepperscore')\|import(\"pepperscore\")" packages/ivories/dist/*.js`
Expected: one match total — the literal dynamic import a host bundler sees.

- [ ] **Step 4: `packages/ivories/LICENSE`** — the standard MIT text with `Copyright (c) 2026 PepperHorn`.

- [ ] **Step 5: `packages/ivories/README.md`**

````markdown
# ivories

Falling keys, a lit 88-key keyboard, notation and camera layouts for React, all on one shared clock. MIT.

```bash
npm install ivories
# notation views also need the optional peer:
npm install pepperscore@^0.2
```

```tsx
import { Ivories } from 'ivories'
import 'ivories/style.css'

<Ivories view="falling" scoreUrl="/songs/minuet.mid" height={420} />
```

Load Poppins on the page (the library sets `font-family: Poppins, system-ui, sans-serif` but never fetches fonts).

## Presets

`<Ivories view>`: `falling`, `keyboard`, `keyboard+notation`, `endless+falling`, `endless+keyboard`. `chrome`: `full` (transport with seek, tempo, metronome), `minimal` (play button), `none`.

## Composing views

```tsx
import { IvoriesProvider, FallingKeys, Notation, Transport, Stage } from 'ivories'

<IvoriesProvider musicXml={xml} onNoteOn={(e) => console.log(e.midi, e.source)}>
  <Notation view="endless" />
  <FallingKeys lookahead={3} labels={{ noteNames: true, chords: true }} />
  <Transport />
</IvoriesProvider>
```

One provider = one score, one clock, one audio engine, one animation-frame loop. A component outside a provider makes its own from its props (`scoreUrl`, `file`, `musicXml`, `midi`, `score`).

## Driving the clock

`clock.now()` is score time in seconds on the score's own tempo map; `rate` scales how fast it advances.

- default `AudioClock` (plays its own audio; runs silently on `performance.now()` until sound is unlocked)
- `new MediaClock(videoEl, { offset })` follows an `<audio>`/`<video>` element; ivories' own audio is off unless `audio`
- `new ManualClock()` for host-driven time (`seek(t)`, `set(t)`, or `play()`)

```tsx
import { MediaClock } from 'ivories/core'
<Ivories view="keyboard" scoreUrl="/a.mid" clock={new MediaClock(video)} chrome="none" />
```

Ref handle on `<Ivories>` and `<IvoriesProvider>`: `{ play, pause, seek, setRate, clock }`.

## Layouts and cameras

`<Stage layout={...} aspect="16:9" onLayoutChange={setLayout} />` renders `single`, `split` (draggable, arrow-key divider) and `pip` (drag the inset; it snaps to a corner). Each slot shows a view or a camera: a live webcam (`getUserMedia`, shared per device) or a mask (`transparent` for OBS alpha, or a chroma colour such as `#00b140`). The pure `layoutReducer` in `ivories/core` handles swap, corner, ratio, size, source and kind changes.

## Live MIDI

`<Keyboard input="midi" />` lights keys from Web MIDI (sustain pedal included) in a distinct colour and fires `onNoteOn/Off` with `source: 'live'`; `liveAudio` on the provider sounds them.

## Errors

Components never throw into the page. `onError(err)` receives `{ code, message, cause }` with `code` one of `score-load`, `score-parse`, `audio-unavailable`, `midi-unavailable`, `camera-unavailable`, `notation-unavailable`, `notation-needs-musicxml`, `render-failed`, and the component shows an inline message.

## Styling

Every rule lives under `.ivories`; theme tokens are `--ivories-*` custom properties (stage, keys, grid, flash, progress, live hue) and `ivories-theme-classic|outline|contrast|transparent` presets.

## SSR

Modules import without touching `window`. Canvas, audio, MIDI, camera and pepperscore are only touched in effects, so it works under Astro `client:visible`.
````

- [ ] **Step 6: Commit**

```bash
git add -A packages/ivories package.json
git commit -m "$(cat <<'EOF'
build(ivories): ESM lib build, declarations, scoped CSS and dist checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 27: Embed fixture route

**Files:**
- Create: `apps/studio/src/embed/EmbedFixture.tsx`, `apps/studio/public/fixtures/demo.mid` (copy of `docs/demo.mid`), `apps/studio/public/fixtures/minuet.musicxml` (copy of `packages/ivories/src/core/io/__fixtures__/musescore4-minuet.musicxml`)
- Test: `apps/studio/src/embed/EmbedFixture.test.tsx`
- Modify: `apps/studio/src/main.tsx`, `packages/ivories/src/react/views/Ivories.tsx` (`notationRef`)

**Interfaces:**
- Consumes: `Ivories`, `IvoriesHandle`, `PepperScoreClockHandle`, `IvoriesPreset`.
- Produces: route `/embed-fixture`; `window.__ivoriesFixture: { handles: Partial<Record<IvoriesPreset, IvoriesHandle>>; notation: Partial<Record<IvoriesPreset, PepperScoreClockHandle>> }`; sections `section.fixture-preset[data-preset]`; `IvoriesProps.notationRef?: Ref<PepperScoreClockHandle>` (passed to `<Notation scoreRef>`).

- [ ] **Step 1: Fixtures**

```bash
mkdir -p apps/studio/public/fixtures
cp docs/demo.mid apps/studio/public/fixtures/demo.mid
cp packages/ivories/src/core/io/__fixtures__/musescore4-minuet.musicxml apps/studio/public/fixtures/minuet.musicxml
```

- [ ] **Step 2: `notationRef` on `<Ivories>`** — add `notationRef?: Ref<PepperScoreClockHandle>` to `IvoriesProps`, destructure it, and render `<Notation view={notation} zoom={zoom} scoreRef={notationRef} />`.

- [ ] **Step 3: Failing test** `EmbedFixture.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EmbedFixture, FIXTURE_PRESETS } from './EmbedFixture'

describe('embed fixture (spec §9)', () => {
  it('embeds every <Ivories view> preset', () => {
    const { container } = render(<EmbedFixture />)
    const shown = [...container.querySelectorAll<HTMLElement>('section.fixture-preset')].map((s) => s.dataset.preset)
    expect(shown).toEqual(FIXTURE_PRESETS.map((p) => p.view))
    expect(shown).toEqual(['falling', 'keyboard', 'keyboard+notation', 'endless+falling', 'endless+keyboard'])
  })
})
```

- [ ] **Step 4: `embed/EmbedFixture.tsx`**

```tsx
import { useEffect } from 'react'
import { Ivories } from 'ivories'
import type { IvoriesHandle, IvoriesPreset, PepperScoreClockHandle } from 'ivories'

export const FIXTURE_PRESETS: { view: IvoriesPreset; src: string }[] = [
  { view: 'falling', src: '/fixtures/demo.mid' },
  { view: 'keyboard', src: '/fixtures/demo.mid' },
  { view: 'keyboard+notation', src: '/fixtures/minuet.musicxml' },
  { view: 'endless+falling', src: '/fixtures/minuet.musicxml' },
  { view: 'endless+keyboard', src: '/fixtures/minuet.musicxml' },
]

interface FixtureRegistry {
  handles: Partial<Record<IvoriesPreset, IvoriesHandle>>
  notation: Partial<Record<IvoriesPreset, PepperScoreClockHandle>>
}
declare global { interface Window { __ivoriesFixture?: FixtureRegistry } }

const registry: FixtureRegistry = { handles: {}, notation: {} }

/** /embed-fixture: every preset embedded the way a host site would (spec §9 Playwright smoke). */
export function EmbedFixture() {
  useEffect(() => { window.__ivoriesFixture = registry }, [])
  return (
    <main className="embed-fixture flex h-full flex-col gap-8 overflow-y-auto bg-[var(--ground)] p-6">
      <h1 className="embed-fixture-title text-lg font-semibold text-[var(--ink)]">ivories embed fixture</h1>
      {FIXTURE_PRESETS.map((p) => (
        <section key={p.view} className="fixture-preset flex flex-col gap-2" data-preset={p.view}>
          <h2 className="fixture-preset-title text-sm text-[var(--ink-dim)]">{p.view}</h2>
          <div className="fixture-preset-frame h-[360px] overflow-hidden rounded-lg border border-[var(--line)]">
            <Ivories
              view={p.view}
              scoreUrl={p.src}
              ref={(h) => { if (h) registry.handles[p.view] = h }}
              notationRef={(h) => { if (h) registry.notation[p.view] = h }}
            />
          </div>
        </section>
      ))}
    </main>
  )
}
```

- [ ] **Step 5: Route** — `main.tsx`:

```tsx
import { EmbedFixture } from './embed/EmbedFixture'

const path = window.location.pathname.replace(/\/+$/, '')
const isDebug = path === '/debug'
const isFixture = path === '/embed-fixture'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDebug ? <DebugRoute /> : isFixture ? <EmbedFixture /> : <App />}
  </StrictMode>,
)
```

- [ ] **Step 6: Run** `npm test && npm run build && npm run check` → green. Open `http://<LAN-IP>:5183/embed-fixture` in `npm run dev -- --port 5183`: five presets render; the three notation presets show "The notation view could not load (it needs pepperscore 0.2 or later)" until pepperscore 0.2 is installed, while their keys keep working.

- [ ] **Step 7: Commit**

```bash
git add -A apps/studio packages/ivories/src/react/views/Ivories.tsx
git commit -m "$(cat <<'EOF'
feat(studio): /embed-fixture page embedding every Ivories preset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: Playwright smoke suite (Chromium, fake camera)

**Files:**
- Create: `playwright.config.ts`, `e2e/studio-layouts.spec.ts`, `e2e/embed-fixture.spec.ts`, `e2e/notation-sync.spec.ts`
- Modify: root `package.json` (`@playwright/test` devDependency, `test:e2e`), `vitest.config.ts` is unaffected (e2e lives outside the projects)

**Interfaces:**
- Consumes: studio DOM (`#file-input`, `.layout-toolbar` controls by aria-label, `.ivories-slot[data-ivories-slot][data-source]`, `.ivories-slot-inset`, `.ivories-stage-box`), `/embed-fixture` (`section[data-preset]`, `window.__ivoriesFixture`).
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Install and configure**

```bash
npm install -D @playwright/test@~1.62.0
npx playwright install chromium
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

const PORT = 5190

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  fullyParallel: false,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    permissions: ['camera'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: {
    command: `npm run dev -w apps/studio -- --host 0.0.0.0 --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
```

Root scripts: `"test:e2e": "playwright test"`.

- [ ] **Step 2: `e2e/studio-layouts.spec.ts`**

```ts
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

async function loadDemo(page: Page) {
  await page.goto('/')
  await page.setInputFiles('#file-input', 'docs/demo.mid')
  await expect(page.locator('.layout-toolbar')).toBeVisible()
}

async function rect(page: Page, selector: string) {
  const b = await page.locator(selector).boundingBox()
  if (!b) throw new Error(`${selector} has no box`)
  return b
}

async function webcamPlaying(page: Page, slot: string) {
  const video = page.locator(`.ivories-slot-${slot} video.ivories-camera-video`)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
  expect(await video.evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0)
}

test('single: one falling-keys slot fills the stage', async ({ page }) => {
  await loadDemo(page)
  await expect(page.locator('.ivories-slot')).toHaveCount(1)
  await expect(page.locator('.ivories-slot-main')).toHaveAttribute('data-source', 'falling')
})

test('split: ivories top, webcam bottom, then swapped', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Layout').selectOption('split')
  await page.getByLabel('Bottom source').selectOption('webcam')
  await webcamPlaying(page, 'bottom')
  const top = await rect(page, '.ivories-slot-top')
  const bottom = await rect(page, '.ivories-slot-bottom')
  expect(top.y).toBeLessThan(bottom.y)
  expect(Math.abs(top.height - bottom.height)).toBeLessThan(2)

  await page.getByRole('button', { name: 'Swap slots' }).click()
  await expect(page.locator('.ivories-slot-top')).toHaveAttribute('data-source', 'webcam')
  await expect(page.locator('.ivories-slot-bottom')).toHaveAttribute('data-source', 'falling')
  await webcamPlaying(page, 'top')
})

test('split divider follows the arrow keys', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Layout').selectOption('split')
  const divider = page.getByRole('separator', { name: 'Split position' })
  await divider.focus()
  await page.keyboard.press('ArrowDown')
  await expect(divider).toHaveAttribute('aria-valuenow', '55')
})

test('pip: the inset sits in each of the four corners, then swaps', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Layout').selectOption('pip')
  await page.getByLabel('Inset source').selectOption('webcam')
  await webcamPlaying(page, 'inset')
  const stage = await rect(page, '.ivories-stage-box')
  for (const [corner, right, below] of [['tl', false, false], ['tr', true, false], ['bl', false, true], ['br', true, true]] as const) {
    await page.getByLabel('Inset corner').selectOption(corner)
    const inset = await rect(page, '.ivories-slot-inset')
    expect(inset.x + inset.width / 2 - stage.x > stage.width / 2).toBe(right)
    expect(inset.y + inset.height / 2 - stage.y > stage.height / 2).toBe(below)
  }
  await page.getByRole('button', { name: 'Swap slots' }).click()
  await expect(page.locator('.ivories-slot-inset')).toHaveAttribute('data-source', 'falling')
  await expect(page.locator('.ivories-slot-main')).toHaveAttribute('data-source', 'webcam')
})

test('pip: dragging the inset snaps it to the nearest corner', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Layout').selectOption('pip')
  const stage = await rect(page, '.ivories-stage-box')
  const inset = await rect(page, '.ivories-slot-inset')
  await page.mouse.move(inset.x + inset.width / 2, inset.y + inset.height / 2)
  await page.mouse.down()
  await page.mouse.move(stage.x + 60, stage.y + 60, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.ivories-slot-inset')).toHaveAttribute('data-corner', 'tl')
})

test('9:16 letterboxes the stage box', async ({ page }) => {
  await loadDemo(page)
  await page.getByLabel('Aspect').selectOption('9:16')
  const box = await rect(page, '.ivories-stage-box')
  expect(box.width / box.height).toBeCloseTo(9 / 16, 2)
})
```

- [ ] **Step 3: `e2e/embed-fixture.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

const PRESETS = ['falling', 'keyboard', 'keyboard+notation', 'endless+falling', 'endless+keyboard']

for (const preset of PRESETS) {
  test(`embed fixture renders ${preset}`, async ({ page }) => {
    await page.goto('/embed-fixture')
    const section = page.locator(`section[data-preset="${preset}"]`)
    const canvas = section.locator('canvas.ivories-canvas').first()
    await expect(canvas).toBeVisible()
    expect((await canvas.boundingBox())!.width).toBeGreaterThan(100)
    await expect(section.locator('.ivories-transport')).toBeVisible()
    await expect(section.locator('.ivories-time')).not.toHaveText(/\/ 0:00$/)   // the score loaded
    if (preset.includes('notation') || preset.startsWith('endless')) {
      await expect(section.locator('.ivories-notation')).toBeVisible()
    }
  })
}
```

- [ ] **Step 4: `e2e/notation-sync.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('notation and falling keys stay in sync after a seek (spec §9)', async ({ page }) => {
  await page.goto('/embed-fixture')
  const section = page.locator('section[data-preset="endless+falling"]')
  await expect(section.locator('.ivories-notation .ivories-notation-score, .ivories-notation [role="alert"]').first()).toBeVisible({ timeout: 15_000 })
  test.skip(await section.locator('.ivories-notation [role="alert"]').isVisible(), 'pepperscore 0.2 is not installed (R9)')

  await page.waitForFunction(() => {
    const f = (window as any).__ivoriesFixture
    return !!(f?.handles['endless+falling'] && f?.notation['endless+falling'])
  })
  const [clock, cursor] = await page.evaluate(() => {
    const f = (window as any).__ivoriesFixture
    f.handles['endless+falling'].seek(5)
    return [f.handles['endless+falling'].clock.now(), f.notation['endless+falling'].currentTime()]
  })
  expect(clock).toBeCloseTo(5, 6)
  // Falling keys read the same provider clock every frame; pepperscore must agree with it.
  expect(Math.abs(cursor - clock)).toBeLessThan(0.05)
})
```

- [ ] **Step 5: Run**

Run: `npm run test:e2e`
Expected: every studio-layout and embed test passes; the notation-sync test is **skipped** with "pepperscore 0.2 is not installed (R9)" until pepperscore 0.2 is installed in the studio, then it must pass.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json
git commit -m "$(cat <<'EOF'
test(e2e): Playwright smoke for layouts, fake camera and embed presets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Stretch

### Task 29 (optional): `useMidiRecorder` — capture live notes for replay

Do this task only if Tasks 1–28 are merged-ready and the user wants the stretch goal (spec §4.2). No file export.

**Files:**
- Create: `packages/ivories/src/core/midi/recorder.ts`, `packages/ivories/src/react/useMidiRecorder.ts`, `apps/studio/src/studio/RecordControl.tsx`
- Test: `core/midi/recorder.test.ts`, `react/useMidiRecorder.test.tsx`
- Modify: `react/context.ts` + `react/IvoriesProvider.tsx` (`live.subscribe`), `core/index.ts`, `src/index.ts`, `apps/studio/src/studio/useSongLoader.ts` (`loadDocument`), `apps/studio/src/App.tsx`

**Interfaces:**
- Consumes: provider live hub (Task 17), `buildTempoMap`, `hashFile`.
- Produces:
  - `interface RecordedNote { midi: number; velocity: number; start: number; end: number }` (seconds from record start)
  - `buildRecordedScore(notes: RecordedNote[], name?: string): ScoreDocument` — single voice `live` (grand piano), tempo 120, ppq 480, 4/4, `sourceFormat: 'midi'`, `id: ''`
  - context `live.subscribe(fn: (e: MidiNoteEvent) => void): () => void`
  - `useMidiRecorder(): { recording: boolean; start(): void; stop(): Promise<ScoreDocument | null> }` (`stop` hashes the notes into `score.id`)
  - studio `loader.loadDocument(score: ScoreDocument): void`

- [ ] **Step 1: Failing tests.** `core/midi/recorder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildRecordedScore } from './recorder'

describe('buildRecordedScore (spec §4.2)', () => {
  it('one track at tempo 120, times in seconds from record start, ticks to match', () => {
    const s = buildRecordedScore([
      { midi: 64, velocity: 80, start: 1, end: 1.5 },
      { midi: 60, velocity: 90, start: 0.25, end: 1 },
      { midi: 62, velocity: 70, start: 2, end: 2 },        // zero length: dropped
    ])
    expect(s.voices).toHaveLength(1)
    expect(s.notes.map((n) => [n.pitch, n.startSec, n.endSec])).toEqual([[60, 0.25, 1], [64, 1, 1.5]])
    expect(s.notes[0].startTicks).toBe(240)            // 0.25 s at 120 bpm, ppq 480
    expect(s.tempoMap[0].bpm).toBe(120)
    expect(s.durationSec).toBe(1.5)
    expect(s.sourceFormat).toBe('midi')
  })
})
```

`react/useMidiRecorder.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { IvoriesProvider } from './IvoriesProvider'
import { useMidiRecorder } from './useMidiRecorder'
import { AudioClock } from '../core/clock/AudioClock'
import { fakeEngine } from './testEngine.test-helpers'

describe('useMidiRecorder (spec §4.2)', () => {
  it('records live notes into a score that can be loaded back', async () => {
    const port = { id: 'k', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array; timeStamp: number }) => void) }
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
    let api: ReturnType<typeof useMidiRecorder> | null = null
    function Probe() { api = useMidiRecorder(); return null }
    render(<IvoriesProvider score={null} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}><Probe /></IvoriesProvider>)
    await waitFor(() => expect(api).not.toBeNull())
    vi.spyOn(performance, 'now').mockReturnValue(10_000)
    act(() => api!.start())
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 60, 100), timeStamp: 10_500 }))
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x80, 60, 0), timeStamp: 11_000 }))
    let score = null as Awaited<ReturnType<typeof api.stop>>
    await act(async () => { score = await api!.stop() })
    expect(score!.notes.map((n) => [n.pitch, n.startSec, n.endSec])).toEqual([[60, 0.5, 1]])
    expect(score!.id).toMatch(/^[0-9a-f]{64}$/)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
```

Run → FAIL.

- [ ] **Step 2: `core/midi/recorder.ts`**

```ts
import { buildTempoMap } from '../model/tempoMap'
import type { NoteEvent, ScoreDocument, Voice } from '../model/types'

export interface RecordedNote { midi: number; velocity: number; start: number; end: number }

const PPQ = 480
const BPM = 120
const TICKS_PER_SEC = (PPQ * BPM) / 60

/** A captured performance as a score: one track, tempo 120 (spec §4.2). `id` is set by the caller. */
export function buildRecordedScore(notes: RecordedNote[], name = 'Recording'): ScoreDocument {
  const voice: Voice = {
    id: 'live', label: 'Live', hue: 35, instrument: 'acoustic_grand_piano', visible: true, audible: true, volume: 1,
  }
  const events: NoteEvent[] = notes
    .filter((n) => n.end > n.start)
    .sort((a, b) => a.start - b.start || a.midi - b.midi)
    .map((n, i) => ({
      id: i, pitch: n.midi, velocity: n.velocity, voiceId: voice.id,
      startTicks: Math.round(n.start * TICKS_PER_SEC),
      durTicks: Math.max(1, Math.round((n.end - n.start) * TICKS_PER_SEC)),
      startSec: n.start, endSec: n.end,
    }))
  return {
    id: '', name, ppq: PPQ, tempoMap: buildTempoMap([{ ticks: 0, bpm: BPM }], PPQ),
    voices: [voice], notes: events,
    durationSec: events.reduce((m, n) => Math.max(m, n.endSec), 0),
    sourceFormat: 'midi', timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }], keySignature: null,
  }
}
```

(Check `buildTempoMap`'s signature in `model/tempoMap.ts`; the existing tests call it as `buildTempoMap([{ ticks: 0, bpm: 120 }], PPQ)`.)

- [ ] **Step 3: Live subscription in the provider.** `context.ts` `live` gains `subscribe(fn: (e: MidiNoteEvent) => void): () => void`. In `IvoriesProvider.tsx` keep `const [liveListeners] = useState(() => new Set<(e: MidiNoteEvent) => void>())`, call every listener at the end of `onLive`, and add `subscribe: (fn) => { liveListeners.add(fn); return () => { liveListeners.delete(fn) } }` to the `live` memo.

- [ ] **Step 4: `react/useMidiRecorder.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { useIvories } from './hooks'
import { buildRecordedScore } from '../core/midi/recorder'
import { hashFile } from '../core/io/hashFile'
import type { RecordedNote } from '../core/midi/recorder'
import type { ScoreDocument } from '../core/model/types'

const nowSec = () => performance.now() / 1000

/** Collects live notes into a Score for replay (spec §4.2). Enables MIDI input while recording. */
export function useMidiRecorder() {
  const iv = useIvories()
  const [recording, setRecording] = useState(false)
  const origin = useRef(0)
  const open = useRef(new Map<number, { velocity: number; start: number }>())
  const done = useRef<RecordedNote[]>([])

  useEffect(() => {
    if (!recording) return
    const release = iv.live.enable()
    const off = iv.live.subscribe((e) => {
      const t = e.time - origin.current
      if (e.on) {
        open.current.set(e.midi, { velocity: e.velocity, start: t })
        return
      }
      const o = open.current.get(e.midi)
      if (!o) return
      open.current.delete(e.midi)
      done.current.push({ midi: e.midi, velocity: o.velocity, start: o.start, end: t })
    })
    return () => { off(); release() }
  }, [recording, iv.live])

  const start = useCallback(() => {
    open.current.clear()
    done.current = []
    origin.current = nowSec()
    setRecording(true)
  }, [])

  const stop = useCallback(async (): Promise<ScoreDocument | null> => {
    setRecording(false)
    const end = nowSec() - origin.current
    for (const [midi, o] of open.current) done.current.push({ midi, velocity: o.velocity, start: o.start, end })
    open.current.clear()
    if (done.current.length === 0) return null
    const score = buildRecordedScore(done.current)
    score.id = await hashFile(new TextEncoder().encode(JSON.stringify(done.current)).buffer as ArrayBuffer)
    return score
  }, [])

  return { recording, start, stop }
}
```

Exports: `core/index.ts` → `export * from './midi/recorder'`; `src/index.ts` → `export { useMidiRecorder } from './react/useMidiRecorder'`.

- [ ] **Step 5: Studio.** `useSongLoader` gains:

```ts
  /** Loads an in-memory score (a recording): same model and audio halves as loadFile, no profile. */
  const loadDocument = useCallback((score: ScoreDocument) => {
    const token = ++loadTokenRef.current
    setError(null)
    useTransport.setState({ tempo: DEFAULT_TEMPO })
    useTransport.getState().loadScore(score)
    onScoreReplaced.current()
    void Promise.all(score.voices.map((v) => engine.loadVoice(v))).then(() => {
      if (loadTokenRef.current === token) engine.retainVoices(score.voices.map((v) => v.id))
    })
  }, [engine])
```

`studio/RecordControl.tsx` (rendered inside the `IvoriesProvider`, so it can use the hook; shown only while live MIDI is enabled):

```tsx
import { useMidiRecorder } from 'ivories'
import type { ScoreDocument } from 'ivories'

export function RecordControl(props: { onRecorded(score: ScoreDocument): void }) {
  const rec = useMidiRecorder()
  return (
    <button
      type="button"
      aria-pressed={rec.recording}
      className={`btn-record absolute right-4 top-4 z-20 rounded-full px-4 py-1.5 text-xs font-semibold ${rec.recording ? 'bg-[#e8384f] text-white' : 'border border-[var(--line)] bg-black/60 text-[var(--ink)]'}`}
      onClick={() => {
        if (!rec.recording) { rec.start(); return }
        void rec.stop().then((s) => { if (s) props.onRecorded(s) })
      }}
    >
      {rec.recording ? 'Stop recording' : 'Record'}
    </button>
  )
}
```

`App.tsx`: inside the provider, after `<Stage …/>`: `{liveMidi.enabled && <RecordControl onRecorded={(s) => { loadAnother(); loader.loadDocument(s) }} />}`.

- [ ] **Step 6: Run** `npm test && npm run build && npm run check` → green. Manual: enable Live MIDI, Record, play a phrase, Stop → the phrase loads and replays on the roll.

- [ ] **Step 7: Commit**

```bash
git add -A packages/ivories apps/studio
git commit -m "$(cat <<'EOF'
feat: useMidiRecorder captures live notes into a replayable score

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

## Out of this plan / gated

Each needs its own plan or an explicit user approval; none is done by an executor of this plan.

- **Backend production gates** (spec §7, per `ph-apps-extensions/deploy/phase0/README-GATES.md`, each a separate user approval): 0.3-A/B schema migration → 0.5 otp-auth deploy → 0.6 gateway + shim → 0.8 user-applied ph-connect policy → 0.8a probes → 0.9 links deploy.
- **`@pepperhorn/app-sdk`** build and npm publish (platform plan 1.6).
- **`@pepperhorn/tickle-ph-plugin`** repo creation and build (3.1–3.2). Its only change from this plan: import the provider interfaces from `ivories/core` (`SceneV2` now, R6) instead of `tickle-me-ivories/platform`.
- **pepperscore 0.2** (separate plan, `ph-vexflow-view` / `pepperscore-clock`): clock prop, `audio={false}`, `onSeek`, handle `seek`/`currentTime`, its onset contract test. Until it is installed in `apps/studio`, `<Notation>` reports `notation-unavailable` and the notation e2e test skips.
- **npm publishes:** `ivories` and `pepperscore@0.2`.
- **`ivories.pepperhorn.com`** DNS and hosting (3.7).
- **becreative demo block** (spec stage F): lives in the becreative repo on its own branch, after `ivories` is published or packed (`npm pack -w packages/ivories`).

## Spec coverage map

| Spec | Tasks |
|---|---|
| §2 monorepo, exports, peers, CSS scope, public-entry rule | 1, 2, 3, 7, 8, 26 |
| §3 core moved, not rewritten | 2 |
| §3.1 Clock, AudioClock, MediaClock, ManualClock, contract ×3, scheduler on Clock | 4, 5, 6, 15 |
| §3.2 provider, self-contained mode, score sources, one sound source / claim, hooks | 10, 11 |
| §4 components, common props, events, ref handle, rendering, SSR | 9, 11, 12, 25, 26 |
| §4.1 live MIDI | 16, 17, 18 |
| §4.2 MIDI capture (stretch) | 29 |
| §4.3 notation via pepperscore, onset contract | 22, 25 |
| §5.1 layout model + reducer | 19 |
| §5.2 `<Stage>` | 23 |
| §5.3 camera slots | 21 |
| §5.4 SceneV2 + V1 upgrade + deviceId rule | 20, 24 |
| §6 studio decomposition, toolbar, behaviour preserved | 13, 14, 18, 24 |
| §8 error handling | 10, 11, 12, 21, 22, 23 |
| §9 testing (unit, component, oracle, Playwright, CSS + import checks) | every task; 26, 28 |
| §7, §10 gated items | Out of this plan |
