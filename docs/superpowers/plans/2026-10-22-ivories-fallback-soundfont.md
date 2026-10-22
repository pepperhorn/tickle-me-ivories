# ivories 0.1.1: configurable fallback soundfont host. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `sounds.fallbackSoundfontUrl` so that, when it is set, every sample request ivories makes goes either to the GM pack host or to that soundfont base URL, and never to `gleitz.github.io` or `smpldsnds.github.io`. Ship it as `ivories` 0.1.1.

**Architecture:** A new module `core/audio/soundfontFallback.ts` builds a smplr `Soundfont` from an explicit `instrumentUrl` (`<base>MusyngKite/<instrument>-mp3.js`) for every instrument id, including `acoustic_grand_piano`. `AudioEngine.factoryFor` passes it to `gmInstrumentFactory` as the `fallback` when `sounds.fallbackSoundfontUrl` is non-blank. Otherwise it passes `defaultMakeInstrument` as it does today. The pack path, the not-in-pack path, the unsafe-name path and the pack-failed path all reach that one `fallback`, so a single switch covers all of them. The engine's own grand-piano retry (`loadVoice`) goes back through the GM factory, so it stays on the same hosts.

**Tech Stack:** TypeScript, smplr 1.0.0 (`Soundfont`), vitest (jsdom), Playwright (Chromium), npm workspaces.

**Spec:** `/home/shaun/becreative-tickle-me/docs/superpowers/specs/2026-10-22-tickle-me-block-design.md`, section "Sound hosts: ivories 0.1.1 first". This plan covers only that section. The becreative work, including moving `TILES_SOUNDFONT` into a shared constant, is out of scope.

## Global Constraints

- Repo `/home/shaun/tickle-me-ivorys`. Package `packages/ivories`, published as `ivories`, currently `0.1.0`. This plan bumps it to `0.1.1`.
- Work on a new branch `feat/ivories-fallback-soundfont` cut from `master`. Open a PR against `master`.
- **Do not run `npm publish`.** The last task stops and asks the user.
- Option name: `fallbackSoundfontUrl?: string` on `SoundsOption` (`packages/ivories/src/core/audio/gmSounds.ts`).
- If the option is unset, or blank after trimming, behaviour must stay byte-for-byte what it is today: `SplendidGrandPiano` for the backup piano and smplr `Soundfont({ instrument })` (gleitz.github.io) for instruments not in the pack. With no `sounds` prop at all, `defaultMakeInstrument` is used exactly as before.
- smplr 1.0.0 has **no base-URL option**. Its only URL option is `instrumentUrl: string`, which is the full URL of one MIDI.js file (`SoundfontConfig` in `node_modules/smplr/dist/index.d.ts:1163`). Without it, smplr builds `https://gleitz.github.io/midi-js-soundfonts/${kit}/${name}-${ogg|mp3}.js` (`gleitzKitUrl`, `index.mjs:3613`). So ivories builds the full URL itself and passes **only** `instrumentUrl`. It must never pass `instrument` or `kit`: with `instrumentUrl` set those are ignored and only produce a `console.warn`. It must also never pass `loadLoopData`, because loop data defaults to a third host.
- File layout: `<base>MusyngKite/<instrument>-mp3.js`. The kit is fixed to `MusyngKite`, which is smplr's default kit and the crftiles default, so the backup sound does not change character. The format is fixed to `mp3`, which every browser decodes. smplr itself would prefer ogg when it is supported. Both kits were verified to return 200 on 2026-10-22: `https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef/MusyngKite/acoustic_grand_piano-mp3.js` and `/FluidR3_GM/acoustic_grand_piano-mp3.js`.
- The reference value hosts will pass is `https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef`, with no trailing slash. It is the same as becreative's `TILES_SOUNDFONT.baseUrl`.
- Contextual class names go alongside Tailwind utilities in any JSX you touch (for example `fixture-case-title text-sm ...`).
- Do not add new public exports from `ivories` or `ivories/core` beyond the new option field. `soundfontFallback.ts` is internal and is not re-exported from `core/index.ts`.

## Review Focus

1. **Base URL spelling.** With a trailing slash, without one, with surrounding whitespace, or relative (`/sf`): each should produce exactly one `/` before `MusyngKite/`, and a relative base should resolve against the page the way `assetBaseUrl` does. Test: Task 1, `resolveFallbackSoundfontBase` cases.
2. **Hostile or odd instrument ids** (`../../x`, `Violin`, `https://evil.test/x`) must not move the request off the configured base. Test: Task 1, `soundfontFileUrl` maps any unsafe id to `acoustic_grand_piano` on the same base.
3. **Both sources failing:** the pack is unreachable and the soundfont 404s. The voice goes silent, nothing throws, and even the retries stay on the two configured hosts. Test: Task 2, "pack and soundfont both down".
4. **Turning the option on or off at runtime** (`setSounds` with or without `fallbackSoundfontUrl`). Loaded voices reload onto the new backup. Removing the option restores `SplendidGrandPiano`. Test: Task 2, `setSounds` cases.
5. **What smplr actually fetches,** as opposed to what ivories passes it: no loop-data request, no default-kit URL, in a real browser. Test: Task 3, Playwright request log.

---

### Task 1: Soundfont fallback factory with explicit URLs

**Files:**
- Create: `packages/ivories/src/core/audio/soundfontFallback.ts`
- Create: `packages/ivories/src/core/audio/soundfontFallback.test.ts`
- Modify: `packages/ivories/src/core/audio/gmSounds.ts`. Export a name check, `export function isSafeSoundName(name: string): boolean` (reuses the existing `SAFE_NAME` regex `/^[a-z0-9_]+$/`), and use it inside `gmInstrumentFactory` instead of `SAFE_NAME.test`.

**Interfaces:**
- Consumes: `InstrumentFactoryFn` and `Instrument` types from `./engine` (type-only import); `GM_PIANO` and `isSafeSoundName` from `./gmSounds`; `Soundfont` from `smplr`.
- Produces:
  - `export const FALLBACK_SOUNDFONT_KIT = 'MusyngKite'`
  - `export function resolveFallbackSoundfontBase(raw: string, pageBase?: string): string` returns an absolute URL with exactly one trailing slash. `pageBase` defaults to `document.baseURI` when `document` exists. If `new URL` throws, return the trimmed and slashed raw value (same rule as `resolveSoundsBase`).
  - `export function soundfontFileUrl(base: string, instrument: string): string` returns `` `${base}${FALLBACK_SOUNDFONT_KIT}/${name}-mp3.js` ``, where `name = isSafeSoundName(instrument) ? instrument : GM_PIANO`. `base` is already resolved.
  - `export function soundfontFallbackFactory(rawBase: string, deps?: { pageBase?: string }): InstrumentFactoryFn`. For every `id`: `Soundfont(ctx, { instrumentUrl: soundfontFileUrl(base, id), destination, loader })`, then `await inst.ready`, then return it. Resolve the base once, when the factory is created.

- [ ] **Step 1: Create the branch**

```bash
cd /home/shaun/tickle-me-ivorys && git checkout master && git pull --ff-only && git checkout -b feat/ivories-fallback-soundfont
```
Expected: `Switched to a new branch 'feat/ivories-fallback-soundfont'`.

- [ ] **Step 2: Write the failing tests**

In `soundfontFallback.test.ts`, mock smplr partially so that `Soundfont` is a spy and every other export is real:

```ts
const sf = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }))
vi.mock('smplr', async (orig) => ({
  ...(await orig<typeof import('smplr')>()),
  Soundfont: vi.fn((_ctx: unknown, o: Record<string, unknown>) => { sf.calls.push(o); return { ready: Promise.resolve(), dispose: vi.fn() } }),
}))
const BASE = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef'
```

Tests and their assertions:
- `resolves the base: trailing slash, whitespace and relative URLs`:
  - `resolveFallbackSoundfontBase(BASE)` and `resolveFallbackSoundfontBase(` ${BASE}/ `)` both return `` `${BASE}/` ``
  - `resolveFallbackSoundfontBase('/sf', 'https://host.test/app/page')` returns `'https://host.test/sf/'`
- `builds <base>MusyngKite/<name>-mp3.js`:
  - `soundfontFileUrl(`${BASE}/`, 'violin')` returns `` `${BASE}/MusyngKite/violin-mp3.js` ``
- `an unsafe instrument id stays on the base as the grand piano`: for each of `'../../x'`, `'Violin'`, `'https://evil.test/x'`, `''`, the result is `` `${BASE}/MusyngKite/acoustic_grand_piano-mp3.js` ``
- `the factory passes only instrumentUrl, destination and loader`: run `soundfontFallbackFactory(BASE)` for `'acoustic_grand_piano'` and for `'violin'`. Check that `sf.calls` contains `{ instrumentUrl: <piano url>, destination: dest, loader: L }` and `{ instrumentUrl: <violin url>, ... }`, and that **no** call has the key `instrument`, `kit`, `loadLoopData` or `loopDataUrl` (`expect(Object.keys(c).sort()).toEqual(['destination', 'instrumentUrl', 'loader'])`).
- `a soundfont whose ready rejects rejects the factory` (the engine's retry depends on this): override the mock once so it returns `{ ready: Promise.reject(new Error('404')) }`, then `await expect(make(...)).rejects.toThrow('404')`.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd /home/shaun/tickle-me-ivorys && npx vitest run packages/ivories/src/core/audio/soundfontFallback.test.ts`
Expected: FAIL, because `./soundfontFallback` cannot be resolved.

- [ ] **Step 4: Implement `isSafeSoundName` in `gmSounds.ts` and the three functions plus the constant in `soundfontFallback.ts`, using the signatures above**

Give each export a one-line doc comment. On the factory, say why only `instrumentUrl` is passed: "smplr derives a gleitz.github.io URL from `instrument`/`kit`, and a loop-data URL from `loadLoopData`".

- [ ] **Step 5: Run the new tests and the existing gmSounds tests and confirm they pass**

Run: `cd /home/shaun/tickle-me-ivorys && npx vitest run packages/ivories/src/core/audio/soundfontFallback.test.ts packages/ivories/src/core/audio/gmSounds.test.ts`
Expected: PASS. In particular, the existing "refuses an unsafe instrument name" test still passes.

- [ ] **Step 6: Commit**

```bash
git add packages/ivories/src/core/audio/soundfontFallback.ts packages/ivories/src/core/audio/soundfontFallback.test.ts packages/ivories/src/core/audio/gmSounds.ts
git commit -m "feat(ivories): soundfont fallback factory with explicit instrumentUrl on a configurable base"
```

---

### Task 2: `sounds.fallbackSoundfontUrl` wired through the engine. Host-confinement tests

**Files:**
- Modify: `packages/ivories/src/core/audio/gmSounds.ts`. Add the field to `SoundsOption`.
- Modify: `packages/ivories/src/core/audio/engine.ts:122-124` (`factoryFor`).
- Modify: `packages/ivories/src/react/IvoriesProvider.tsx:59`. This is a doc comment only. The prop already passes `SoundsOption` through.
- Create: `packages/ivories/src/core/audio/engine.hosts.test.ts`
- Modify: `packages/ivories/src/react/IvoriesProvider.sounds.test.tsx`. Add one passthrough test.

**Interfaces:**
- Consumes: `soundfontFallbackFactory(rawBase, { pageBase })` from Task 1.
- Produces: `SoundsOption.fallbackSoundfontUrl?: string`, with this doc comment: "Base URL of a gleitz-layout MIDI.js soundfont (`<base>/MusyngKite/<instrument>-mp3.js`). When set, instruments not in the pack, and the backup piano when the pack fails, load from here instead of gleitz.github.io / smpldsnds.github.io. A relative URL resolves against the page."
- `AudioEngine.factoryFor(sounds)`: when `sounds` is set and `sounds.fallbackSoundfontUrl?.trim()` is non-empty, the fallback is `soundfontFallbackFactory(sounds.fallbackSoundfontUrl, { pageBase: this.soundsDeps?.pageBase })`. Otherwise it is `defaultMakeInstrument`. Do not change anything else in the engine. `soundsKeyOf` already serialises the whole option, so `setSounds` picks up the new field without further changes.

- [ ] **Step 1: Write the failing engine tests**

In `engine.hosts.test.ts`, mock smplr partially so that `Soundfont` and `SplendidGrandPiano` are spies that record their options. Each returns `{ ready, start: vi.fn(() => () => {}), stop: vi.fn(), dispose: vi.fn() }`, and a per-test map lets `ready` reject for chosen URLs. Reuse the fake AudioContext shape from `engine.test.ts:21-34` and add `decodeAudioData`. Pass `soundsDeps: { fetch: fetchJson, makeSampler }`, where `fetchJson` is a route table like the one in `gmSounds.test.ts:16-24`. Call `resetGmSoundCaches()` in `beforeEach` and silence `console.warn` there.

Shared helper:
```ts
const PACK = 'https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/'
const SF = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef'
/** Every URL ivories fetched or handed to smplr. */
const requested = () => [...fetchJson.mock.calls.map(([u]) => u), ...soundfontCalls.map((o) => o.instrumentUrl as string)]
const expectOnlyConfiguredHosts = () => {
  expect(requested().length).toBeGreaterThan(0)
  for (const u of requested()) expect(u.startsWith(PACK) || u.startsWith(`${SF}/`), u).toBe(true)
  expect(SplendidGrandPiano).not.toHaveBeenCalled()
  for (const o of soundfontCalls) expect(o).not.toHaveProperty('instrument')
}
```

Tests, all with `sounds: { pack: 'core', fallbackSoundfontUrl: SF }` unless stated otherwise:
- `pack down: the piano voice and live keys use the soundfont's acoustic_grand_piano`: route `pack.json` to `new Error('offline')` and the piano json to `503`. Run `loadVoice(voice('v1'))` and then `prepareLive()`. `soundfontCalls.map(c => c.instrumentUrl)` contains `` `${SF}/MusyngKite/acoustic_grand_piano-mp3.js` ``. `expectOnlyConfiguredHosts()`.
- `an instrument not in the pack loads from the configured soundfont`: the index has only the piano, and `voice('v1', { instrument: 'violin' })` gives `` `${SF}/MusyngKite/violin-mp3.js` ``. `expectOnlyConfiguredHosts()`.
- `sounds.instrument missing from the pack falls back to the soundfont piano`: with `instrument: 'harpsichord'` and an index without it, the result is `` `${SF}/MusyngKite/acoustic_grand_piano-mp3.js` ``. `expectOnlyConfiguredHosts()`.
- `a failing soundfont instrument retries, then takes the pack piano, still on the two hosts`: the violin URL's `ready` rejects and the pack is healthy. The voice ends up with an instrument (`engine.ready === true`). `expectOnlyConfiguredHosts()`.
- `pack and soundfont both down: silent voice, no throw, no other host` (Review Focus 3): the pack is offline and every Soundfont `ready` rejects. `await expect(engine.loadVoice(voice('v1'))).resolves.toBeUndefined()`, then `engine.play(...)` does not throw. `expectOnlyConfiguredHosts()`.
- `a blank fallbackSoundfontUrl is unset: the pack-failure piano is SplendidGrandPiano as before`: `fallbackSoundfontUrl: '  '` with the pack down gives `SplendidGrandPiano` called once and no Soundfont call.
- `unset keeps today's paths`: (a) `sounds: { pack: 'core' }` with the pack down calls `SplendidGrandPiano`. (b) With the index lacking violin, `Soundfont` is called with `instrument: 'violin'` and no `instrumentUrl`. (c) With no `sounds` at all, a violin voice gives `Soundfont({ instrument: 'violin', ... })` and no `fetchJson` call.
- `setSounds adds and removes the fallback in place` (Review Focus 4): start with `{ pack: 'core' }` and the pack down, so `SplendidGrandPiano` gets 1 call. Then `await engine.setSounds({ pack: 'core', fallbackSoundfontUrl: SF })` produces a soundfont piano call. Then `await engine.setSounds({ pack: 'core' })` brings `SplendidGrandPiano` to 2 calls.

- [ ] **Step 2: Write the failing provider passthrough test**

In `IvoriesProvider.sounds.test.tsx`, add the test `passes fallbackSoundfontUrl to the engine untouched`: render `<IvoriesProvider sounds={{ pack: 'core', fallbackSoundfontUrl: SF }}>`, then `expect(made.opts.at(-1)).toMatchObject({ sounds: { pack: 'core', fallbackSoundfontUrl: SF } })`. This one fails only at type-check, because the field does not exist yet. That is acceptable. Its value is guarding the plumbing against regressions later.

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd /home/shaun/tickle-me-ivorys && npx vitest run packages/ivories/src/core/audio/engine.hosts.test.ts`
Expected: FAIL. The fallback cases call `SplendidGrandPiano`, or call `Soundfont` with `instrument`, instead of the configured URL. The "unset" cases already pass.

- [ ] **Step 4: Add the field and change `factoryFor` as described in Interfaces. Update the provider prop doc comment to mention the fallback field.**

- [ ] **Step 5: Run the audio and provider tests plus the type check and confirm they pass**

Run: `cd /home/shaun/tickle-me-ivorys && npx vitest run packages/ivories/src/core/audio packages/ivories/src/react/IvoriesProvider.sounds.test.tsx && npm run check -w packages/ivories`
Expected: all PASS, and `tsc` exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/ivories/src/core/audio packages/ivories/src/react/IvoriesProvider.tsx packages/ivories/src/react/IvoriesProvider.sounds.test.tsx
git commit -m "feat(ivories): sounds.fallbackSoundfontUrl keeps every sample request on the configured hosts"
```

---

### Task 3: Real-browser proof. Only the configured hosts are requested

Unit tests prove what ivories hands to smplr. This task proves what Chromium actually requests, including anything smplr adds by itself.

**Files:**
- Modify: `apps/studio/src/embed/EmbedFixture.tsx`
- Modify: `apps/studio/src/embed/EmbedFixture.test.tsx`
- Create: `e2e/sound-hosts.spec.ts`

**Interfaces:**
- Consumes: `SoundsOption.fallbackSoundfontUrl` (Task 2). `test`/`expect` from `e2e/fixtures.ts`: the GM pack is CDP-blocked by default, and blocked requests still emit `request` events.
- Produces: the `/embed-fixture?sound-hosts` flag. It renders **only** a section `data-case="sound-hosts"` and **no** `FIXTURE_PRESETS`, because the presets load the default piano from smpldsnds and would pollute the request log. The section has an `IvoriesProvider` with `sounds={{ pack: 'core', fallbackSoundfontUrl: FIXTURE_SOUNDFONT }}` and `liveAudio`, plus `<Keyboard input="midi" />`. Define `export const FIXTURE_SOUNDFONT = 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef'` in `EmbedFixture.tsx`. Heading text: `live keys, pack blocked, fallback soundfont on jsDelivr`. Class names follow the existing `fixture-case` / `fixture-case-title` / `fixture-case-frame` pattern.

- [ ] **Step 1: Write the failing fixture unit test**

In `EmbedFixture.test.tsx`, add `?sound-hosts renders only the sound-hosts case, no presets`. With `render(<EmbedFixture search="?sound-hosts" />)`, `section.fixture-preset` has length 0 and the `section.fixture-case` cases equal `['sound-hosts']`. The existing three tests must keep passing unchanged.

- [ ] **Step 2: Write the failing e2e spec `e2e/sound-hosts.spec.ts`**

- Before `page.goto`, register `page.route(`${FIXTURE_SOUNDFONT}/**`, r => r.fulfill({ status: 404, body: '' }))`. This keeps the run offline and deterministic. The soundfont fails, the engine retries, and every retry must still stay on the hosts.
- Collect every `request.url()` through `page.on('request')`.
- Run `page.goto('/embed-fixture?sound-hosts')`. Wait for a request equal to `` `${FIXTURE_SOUNDFONT}/MusyngKite/acoustic_grand_piano-mp3.js` `` (`page.waitForRequest`, 30 s). Then wait 1500 ms so the retries settle.
- Assert that every collected URL whose origin is not the page origin starts with `https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/` or `` `${FIXTURE_SOUNDFONT}/` ``. The failure message lists the offenders.
- Assert that no URL contains `gleitz.github.io` or `smpldsnds.github.io`.
- Import `FIXTURE_SOUNDFONT` from the fixture module only if the e2e tsconfig allows it. Otherwise duplicate the literal with a comment pointing at `EmbedFixture.tsx`.

- [ ] **Step 3: Run both tests and confirm they fail**

Run: `cd /home/shaun/tickle-me-ivorys && npx vitest run apps/studio/src/embed/EmbedFixture.test.tsx; npx playwright test e2e/sound-hosts.spec.ts`
Expected: the unit test FAILs (no `sound-hosts` case), and the e2e times out waiting for the soundfont request.

- [ ] **Step 4: Implement the `?sound-hosts` flag in `EmbedFixture.tsx` as described in Interfaces. Wrap the presets map in `!soundHostsOnly && ...`. Add one line to the component's doc comment.**

- [ ] **Step 5: Run the fixture unit test, this spec, and the existing embed and GM specs, and confirm they pass**

Run: `cd /home/shaun/tickle-me-ivorys && npx vitest run apps/studio/src/embed/EmbedFixture.test.tsx && npx playwright test e2e/sound-hosts.spec.ts e2e/embed-fixture.spec.ts e2e/gm-sounds.spec.ts`
Expected: PASS. `gm-sounds` may be skipped with its "network unavailable" reason when offline. That is fine.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/embed/EmbedFixture.tsx apps/studio/src/embed/EmbedFixture.test.tsx e2e/sound-hosts.spec.ts
git commit -m "test(e2e): with fallbackSoundfontUrl set, the browser requests only the pack and soundfont hosts"
```

---

### Task 4: Docs, CHANGELOG and version 0.1.1

**Files:**
- Modify: `packages/ivories/README.md`, section `## GM piano sounds` (currently lines 156-167)
- Create: `packages/ivories/CHANGELOG.md`. There is no changelog anywhere in the repo yet.
- Modify: `packages/ivories/package.json`. Change `"version"` to `"0.1.1"` and add `"CHANGELOG.md"` to `"files"`. npm does not include a CHANGELOG automatically.
- Modify: `package-lock.json`. The `"packages/ivories"` entry's `"version"` (line ~3450) becomes `"0.1.1"`. Regenerate it with `npm install --package-lock-only`. Do not hand-edit it.

- [ ] **Step 1: README.** Extend the option signature line to `sounds: { pack?; assetBaseUrl?; instrument?; fallbackSoundfontUrl?: string }`. Then add a paragraph covering four points:
  1. Today, instruments not in the pack load from smplr's Soundfont on `gleitz.github.io`, and a failed pack falls back to the Splendid Grand Piano on `smpldsnds.github.io`.
  2. `fallbackSoundfontUrl` names a gleitz-layout base (`<base>/MusyngKite/<instrument>-mp3.js`). When it is set, both cases load from it, including the backup piano (`acoustic_grand_piano`), so a strict CSP needs only the pack host and this one.
  3. Give the pinned jsDelivr example:
     ```tsx
     sounds={{ pack: 'core', fallbackSoundfontUrl: 'https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef' }}
     ```
  4. Unset or blank means unchanged behaviour. Without any `sounds` prop, the default piano still comes from smpldsnds.

- [ ] **Step 2: CHANGELOG.** Use Keep a Changelog headings. Add `## 0.1.1 - 2026-10-22` with an `### Added` bullet for `sounds.fallbackSoundfontUrl`, including the host guarantee and "unset: unchanged". Add `## 0.1.0 - <date of the 0.1.0 publish>` with a one-line "Initial release". Get the date from `npm view ivories time --json`. If that is unreachable, use the commit date of `4b70c9f`.

- [ ] **Step 3: Bump the version and refresh the lockfile**

Run: `cd /home/shaun/tickle-me-ivorys && npm version 0.1.1 -w packages/ivories --no-git-tag-version && npm install --package-lock-only && git diff --stat`
Expected: only `packages/ivories/package.json` and `package-lock.json` change. In the lock diff, only the ivories version line changes. Then add `"CHANGELOG.md"` to `files` by hand.

- [ ] **Step 4: Check that the packed tarball contains the changelog**

Run: `cd /home/shaun/tickle-me-ivorys/packages/ivories && npm pack --dry-run 2>&1 | grep -E "CHANGELOG.md|version:"`
Expected: `CHANGELOG.md` is listed and the version is `0.1.1`. This runs `prepack`, which is the full build. It does not publish.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/README.md packages/ivories/CHANGELOG.md packages/ivories/package.json package-lock.json
git commit -m "docs(ivories): fallbackSoundfontUrl; CHANGELOG; 0.1.1"
```

---

### Task 5: Full verification, PR, then stop before publishing

**Files:** none changed, unless verification finds a defect. In that case, fix it in the task that owns the code and re-run this task.

- [ ] **Step 1: Build**

Run: `cd /home/shaun/tickle-me-ivorys && npm run build`
Expected: exits 0, and the output ends with `dist check: entries present, externals allowed, CSS plain, SSR import ok`.

- [ ] **Step 2: Run the repo checks, lint and every unit test**

Run: `cd /home/shaun/tickle-me-ivorys && npm run check && npm run lint && npm test`
Expected: all exit 0, and vitest reports 0 failed for both projects (`ivories`, `studio`).

- [ ] **Step 3: Run the e2e smoke suite**

Run: `cd /home/shaun/tickle-me-ivorys && npm run test:e2e`
Expected: 0 failed. Network-gated specs may be skipped with their stated reason. If a spec fails that this branch did not touch, check it on `master` before concluding anything, and report it rather than fixing it here.

- [ ] **Step 4: Confirm the reference URL is still live** (the plan depends on it)

Run: `curl -sI -o /dev/null -w "%{http_code}\n" https://cdn.jsdelivr.net/gh/gleitz/midi-js-soundfonts@044fab8e1456bfafc5776e86dfd6bb8697149aef/MusyngKite/acoustic_grand_piano-mp3.js`
Expected: `200`.

- [ ] **Step 5: Push and open the PR against master**

```bash
git push -u origin feat/ivories-fallback-soundfont
gh pr create --base master --title "ivories 0.1.1: sounds.fallbackSoundfontUrl" --body "<summary of the option, the host guarantee, tests (unit + e2e request log), unset = unchanged; ends with the attribution line>"
```
Expected: the command prints a PR URL.

- [ ] **Step 6: STOP and ask the user before `npm publish`.** Do not run `npm publish`, `npm version` with tagging, or `git tag`. Report the PR URL, the test and build results, and the exact command the user would run (`npm publish -w packages/ivories`), then wait for their explicit go-ahead.
