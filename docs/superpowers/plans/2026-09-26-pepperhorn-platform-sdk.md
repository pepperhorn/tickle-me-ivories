# PepperHorn platform SDK: implementation plan

> **For agentic workers:** execute with superpowers:subagent-driven-development. Use one fresh
> subagent per task, with a spec-compliance review and then a code-quality review between
> tasks. Tasks marked **[PROD GATE]** touch production ph-apps or ph-connect (data, schema,
> env, extensions, Flows, policies, DNS or deploys). The executing agent **stops and asks the
> human for explicit approval** before the production step, shows the exact change (SQL, env
> diff, tarball hash, policy JSON), and records the approval in the task's handover note. No
> subagent may self-approve a gate, and an approval covers only the step it names.

**Spec:** `docs/superpowers/specs/2026-09-26-pepperhorn-platform-sdk-design.md` (§ references below point there).

**Repos, and the tag each task carries:**

| Tag | Repo | Exists? |
|---|---|---|
| `[tickle]` | `~/tickle-me-ivorys` (pepperhorn/tickle-me-ivories) | yes |
| `[sdk]` | `pepperhorn/app-sdk` → `@pepperhorn/app-sdk` | **new**: the human creates the GitHub repo (agents must not) |
| `[plugin]` | `pepperhorn/tickle-ph-plugin` → `@pepperhorn/tickle-ph-plugin` | **new**: the human creates it |
| `[otp]` | `~/directus-otp-auth` | yes (private) |
| `[ext]` | `~/ph-apps-extensions` | yes |
| `[links]` | `~/pepperhorn-platform` (pepperhorn/pepperhorn-platform monorepo), `apps/links` and `apps/connect/schema` | yes |
| `[module]` `[drumlet]` `[chordee]` `[jamee]` | each app repo | yes |
| `[opensongs]` | pepperhorn/opensongs-json | yes (public) |
| `[connect]` | `~/pepperhorn-platform/apps/connect` (the ph-connect Directus: billing extension, storefront-side endpoints) | yes |
| `[stamp]` | `~/pepperhorn-platform/apps/stamp-pdf` (same monorepo) | yes |
| `[user]` | no repo: a step the user performs by hand; agents only document or verify it | – |

**Invariant for every task (D14):** `ph_uid` never appears in a URL, a client-facing response, a log line, a share payload or a phrn.link row. Server-to-server calls carry it in POST bodies. The only exception is Stripe `metadata.ph_uid`.

**Every phase ships working software.** Default local verification, per repo:

| Repo | Commands |
|---|---|
| tickle | `npm test && npm run build` |
| sdk, plugin | `npm test && npm run build && npm run typecheck` |
| otp | `npm test` (`TEST_DATABASE_URL` set) |
| ext | `npm test` in the extension, then a boot against `docker-compose.v12.yml` (Directus 12.1.1) |

Dev servers always run with `--host 0.0.0.0`. UI work keeps semantic class names alongside Tailwind and uses Poppins.

---

## Phase 0: backend foundation on ph-apps

**Ships:** directus-otp-auth and the `/ph/v1` gateway, live on ph-apps with the `tickle-me-ivories` slug only, plus phrn.link app-share support. No client uses any of it yet. The legacy stack is untouched.

### Task 0.1 `[ext]` Spike: bearer through Directus 12.1.1 (F3, F4)

- **Files:**
  - `ph-apps-extensions/spikes/otp-bearer/README.md` (findings)
  - throwaway compose override
- **Do:**
  1. In the local `docker-compose.v12.yml` (12.1.1), install the packaged directus-otp-auth tarball with `OTP_AUTH_TRANSPORT=bearer`, `OTP_AUTH_APP_SLUGS=spike` and a local `app_users` table.
  2. Probe:
     - (a) `GET /otp-auth/session` with no header must return 401, which proves the mount on 12.1.1;
     - (b) the same with `Authorization: Bearer 00000000-0000-4000-8000-000000000000.abcdefghijklmnop` must be answered by the extension (401 `{ok:false}`), not by Directus core;
     - (c) run a full code → verify → session with the bearer token.
- **Verify:** the README records the status and body for (a) to (c). If (b) or (c) shows the Directus core error shape, F3 is confirmed and Task 0.4's shim is required. Otherwise, mark the shim "not needed" in the spec.

### Task 0.2 `[otp]` Upstream: global person id and link tickets (spec §6.8)

- **Files:**
  - `packages/core/src/{config,verify-code,session,link}.js`
  - `packages/directus/src/{principal-store,routes,store}.js`
  - `schema/003-global-id-and-link.sql`
  - `.env.example`
  - `SPEC.md` (§6, §12 decision rows)
  - tests alongside each
- **Interfaces:**
  - **Env:**
    - `OTP_AUTH_PRINCIPAL_GLOBAL_ID_COLUMN`
    - `OTP_AUTH_PRINCIPAL_LINKED_AT_COLUMN`
    - `OTP_AUTH_LINK_SECRET` (≥32 bytes; required only when the link routes are enabled)
    - `OTP_AUTH_LINK_ISSUER` (this instance's name, e.g. `ph-apps`)
    - `OTP_AUTH_LINK_PEERS` (csv of `name=https://origin`)
  - **`PrincipalStore`:** `findByEmail` → `{…, globalId, linkedAt}`, plus `setGlobalId(id, gid, {onlyIfNull})` and `markLinked(id)`.
  - **Routes** (all bodies are POST; none carries a global id in its response or URL, per D14):
    - `POST /link/ticket` → `{ok, ticket}` (the ticket is opaque)
    - `POST /link/introspect {ticket, aud}`: peer-only, `x-otp-auth-link-sig`, consumes the ticket → `{gid}`
    - `POST /link/redeem {ticket}` → `{ok, linked, queued?}`
  - **Tables:** `auth_link_ticket(ticket_hash text PK, principal_id text, gid uuid, aud text, expires_at timestamptz, consumed_at timestamptz)` and `identity_merge_queue(id uuid PK, principal_id text, local_gid uuid, foreign_gid uuid, iss text, created_at timestamptz)`.
- **Steps (TDD):**
  1. Core `link.js` holds the pure pieces: ticket generation (32 CSPRNG bytes), and body-HMAC sign and verify for introspection using `timingSafeEqual`.
  2. `verifyCode` mints `globalId` when it is null, in the same transaction as the session insert.
  3. Implement redeem's decision table (spec §6.8, step 4) as a pure function with exhaustive tests.
  4. Issuing a ticket calls `markLinked`.
  5. The static gates still pass: no `directus_users` writes, no `Math.random`.
  6. Add a new static and runtime invariant: no route response serialises the global-id column.
- **Verify:**
  - `npm test` is green, with zero skips in CI.
  - An invariant test proves that no route compares emails for linking.
  - A second invariant test scans every route's response for the gid.

### Task 0.3 `[ext]` ph-apps schema migration **[PROD GATE]** (spec §6.5)

- **Files:** `ph-apps-extensions/migrations/2026-09-26-platform-v1.sql` and `…-verify.sql`.
- **Steps:**
  1. Write the SQL from spec §6.5, plus directus-otp-auth `001-init.sql` and `003-global-id-and-link.sql`, as one `BEGIN/COMMIT` file with no `IF NOT EXISTS`.
  2. Before applying anything, run a pre-check: `SELECT lower(trim(email)), count(*) FROM app_users GROUP BY 1 HAVING count(*)>1`. It must return 0 rows; otherwise stop and report.
  3. Apply to the local 12.1.1 stack, loaded from a ph-apps schema snapshot.
  4. **GATE:** show the SQL, then apply to production.
  5. Register the new columns in Directus via the fields API (MCP `fields create`), hidden where internal. Fix the `shortcoder.created_by` relation meta.
- **Verify:**
  - Run `verify.sql` against `information_schema`/`pg_indexes`, not the API.
  - All 9 `app_users` have `ph_uid`.
  - Inserting a duplicate `(app_user, app_slug, kind, external_id)` fails with 23505.

### Task 0.4 `[ext]` Gateway endpoint and shim

- **Files:**
  - `ph-apps-extensions/endpoints/ph/{package.json,src/index.ts,src/session.ts,src/apps.ts,src/routes/{enroll,me,saves,shares,public,files}.ts,src/ratelimit.ts,src/codes.ts,src/errors.ts,src/shortlink.ts,src/schedule.ts}` and tests
  - `ph-apps-extensions/hooks/otp-bearer-shim/src/index.ts` (only if Task 0.1 confirmed F3)
- **Interfaces:**
  - the route table and behaviour rules in spec §6.3;
  - `requireSession(req, appSlug): Promise<{appUserId, appSlug}> (ph_uid read from app_users only where a route needs it)` via loopback with a 15 s cache;
  - `AppConfig` registry;
  - the shared error body.
- **Steps (TDD, with Postgres-backed tests like directus-otp-auth's pg-harness):**
  1. `codes.ts`: base57 via 10× `crypto.randomInt(57)`; base62 slug of 7 characters.
  2. `ratelimit.ts`: table-backed, fixed windows, fails closed.
  3. `session.ts`: loopback client, cache, and slug mismatch → 401.
  4. The routes: enroll, me, saves (`INSERT … ON CONFLICT` upsert, `ifUpdatedAt`, quota), shares (anonymous and owned, resolve, atomic `view_count`, link_edit PATCH, fork, revoke via `revokeKey` hash), public (handles only), files.
  5. `apps.ts` registers `tickle-me-ivories`, with the kinds `scene` and `look` using a temporary permissive validator plus the caps. Task 3.1 swaps in the real schemas.
  6. `shortlink.ts` and `schedule.ts`:
     - the create sync with adopt-on-conflict;
     - **revoke-on-delete:** share `DELETE`, save `DELETE` cascades, and revoked owned shares each `PATCH short_link/<id> {status:'revoked'}` with `revoke_pending` retry (spec §6.7, step 6);
     - a retry cron `*/5`.

     The ph-connect URL and `PH_CONNECT_GATEWAY_TOKEN` come from env; when they are unset, sync is a no-op (`short_link_state='none'`).
  6a. A response-shape test asserts that no route's JSON contains `ph_uid` or `phUid` (D14).
  7. A nightly cleanup of draft users (spec §6.3).
  8. The shim, per spec §6.1.
- **Verify:**
  - Unit and integration tests pass.
  - Locally on 12.1.1, the full curl script `spikes/gateway-e2e.sh` runs: enroll → code (read from the mail catcher) → verify → me → save → list → share → resolve anonymously → view_count increments by exactly N under N parallel resolves → revoke → 404. A token for another slug gets 401 on `/ph/v1/saves?appSlug=tickle-me-ivories`.

### Task 0.5 `[ext]` Deploy directus-otp-auth to ph-apps **[PROD GATE]** (spec §6.1, §6.2)

- **Steps:**
  1. Package with `scripts/package-extension.sh`.
  2. Prepare the env diff from spec §6.1: fresh pepper, `OTP_AUTH_APP_SLUGS=tickle-me-ivories`, transport `bearer`, principal config, `IP_TRUST_PROXY` pinned, `RATE_LIMITER_*`.
  3. Write the `otp-code.liquid` file with the `{% case app %}` block.
  4. Set up the purge schedule Flow.
  5. **GATE:** show the env diff (values masked), the tarball sha256 and the template.
  6. Deploy with `--with-node-modules --verify /otp-auth/session=401`, then restart.
- **Verify:** work through the directus-otp-auth README pre-first-login checklist, items 1–6, on ph-apps, and record each result:
  - `created_ip` holds the real client IP;
  - `archived` is refused and `published` is mailed;
  - lockout at 5 attempts;
  - a revoked session gets 401;
  - the device list is accurate;
  - purge is observed running once.

### Task 0.6 `[ext]` Deploy the gateway and shim **[PROD GATE]**

- **Steps:** build; **GATE** (bundle hash plus env keys `PH_CONNECT_URL` and `PH_CONNECT_GATEWAY_TOKEN`, left empty until Task 0.8); deploy; restart.
- **Verify:**
  - Run `gateway-e2e.sh` against production with the slug `tickle-me-ivories` and a test mailbox, then delete the test rows.
  - Legacy check: drumlet sign-in on the legacy Flow still works, which proves nothing regressed.

### Task 0.7 `[links]` phrn.link `app_share` destinations (spec §6.7)

- **Files:**
  - `apps/links/src/lib/{routes,resolve,config}.ts`
  - their tests
  - `apps/links/.env.example`
  - `apps/links/README.md` (a Destinations row, and the note that `app_share` emits no demand event)
- **Interfaces:**
  - `appShareUrl(entityId: string | null, hosts: Record<string,string>): string | null`
  - `LinksConfig.appShareHosts`
  - `resolveTarget` branch order: `target_url` → `app_share` → `entityPath`
- **Verify:**
  - Tests cover: a valid id → `https://ivories.pepperhorn.com/s/<code>?utm_…`; an unknown slug → `no_target`; a malformed id → `no_target`; a non-https host in config refused at load.
  - `DEMAND_ENTITY_TYPES` is unchanged.

### Task 0.8 `[user]` ph-connect `ph_apps_gateway` policy: USER-APPLIED, not an agent task

- **Status (D13):**
  - The `short_link.entity_type` choice `app_share` is **already live**.
  - The `ph_apps_gateway` role, policy and static token are **created manually by the user** exactly as spec §6.7:
    - CREATE with fields, validation and presets;
    - READ, filtered;
    - UPDATE on `status` only, validated `in [active, revoked]`;
    - nothing else;
    - an IP allowlist restricted to the ph-apps egress IP.
  - The user sets `PH_CONNECT_URL` and `PH_CONNECT_GATEWAY_TOKEN` in the ph-apps env.
- **Agent part:** record the policy as `apps/connect/schema/app-share-link-v1.json` (documentation only, in the `short-link-v1-staging.json` format, marked `"applied_via": "manual (user)"`), and nothing else. No agent touches ph-connect policies.

### Task 0.8a `[ext]` Verify the ph_apps_gateway policy **[PROD GATE: read and write probes on ph-connect]**

- **Files:** `ph-apps-extensions/scripts/verify-ph-connect-policy.sh`. It runs from the ph-apps host, so it leaves from the allowlisted egress IP.
- **Probes** (each against ph-connect with `PH_CONNECT_GATEWAY_TOKEN`; every created row is revoked afterwards):

| # | Probe | Expect |
|---|---|---|
| 1 | create `{slug, entity_type:'app_share', entity_id:'tickle-me-ivories:TESTCODE01'}` | 200, with `status='active'` preset |
| 2 | create with `entity_type:'product'` | 400/403 |
| 3 | create with `target_url` set | 400/403 |
| 4 | read `short_link` unfiltered | only `app_share` rows; no `target_url`, `campaign` or `notes` fields |
| 5 | update probe 1's row `{status:'revoked'}` | 200 |
| 6 | update `{status:'paused'}` | refused (validation) |
| 7 | update `{entity_id:'x'}` | refused (field) |
| 8 | update a non-`app_share` row | refused or not found |
| 9 | delete any row | 403 |
| 10 | read any other collection (`account`, `demand_event`) | 403 |
| 11 | the same token from a non-allowlisted IP (a developer machine) | refused |

- **Verify:**
  - All 11 probes match the table. The script exits non-zero on any mismatch and prints the mismatching probe.
  - Record the output in the phase 0 handover.
  - Any mismatch goes back to the user; agents do not edit the policy.

### Task 0.9 `[links]` Links deploy and end-to-end **[PROD GATE: links deploy]**

- **Steps:** **GATE:** set `APP_SHARE_HOSTS` on the links app, then deploy Task 0.7.
- **Verify:**
  - A production share created through the gateway reaches `short_link_state='synced'`, with `short_link_id` stored.
  - `curl -I https://phrn.link/<slug>` answers 302 to `/s/<code>`.
  - `DELETE /ph/v1/shares/<code>` sets `short_link_state='revoked'`, and the ph-connect row has `status='revoked'`. After the links cache TTL (≤5 min), phrn.link misses with `reason=revoked`.
  - Deleting a save revokes the phrn.link rows of all its shares.
  - A bad token keeps the share working through the app URL: the row goes to `failed` and is then retried; a revoke goes to `revoke_pending` and is then retried.

---

## Phase 1: SDK core, react and ui

**Ships:** `@pepperhorn/app-sdk@0.1.0` on npm, working against the phase 0 production endpoints.

### Task 1.1 `[sdk]` Scaffold

- **Pre-req:** the human creates `pepperhorn/app-sdk` (public, MIT) and the npm scope access.
- **Files:** `package.json` (exports `.`, `./react`, `./ui`; peer deps `zod`, `react`), `tsup.config.ts`, `tsconfig.json`, `vitest.config.ts`, `LICENSE`, `README.md`, and CI (`.github/workflows/ci.yml`).
- **Verify:** `npm run build` emits three ESM entries plus `.d.ts`. A size check confirms `core` has no React import.

### Task 1.2 `[sdk]` `core/client.ts`, `token-store.ts`, `schemas.ts`

- **Interfaces:** spec §3.1 (`PhClientOptions`, `PhError`, `TokenStore`, the schemas).
- **Steps:**
  - Build `http()` with JSON, bearer injection and error-body parsing.
  - Port drumlet's `friendlyError`/`isNetworkError` semantics: 429 → `rate_limited` with `retryAfterSec`; 5xx → generic text; `TypeError` → `network`.
- **Verify:** unit tests over a mocked `fetch` for every `PhErrorCode`. localStorage throwing is tolerated.

### Task 1.3 `[sdk]` `core/auth.ts` and `otp-flow.ts`

- **Interfaces:** `AuthStore` (spec §3.1).
- **Steps:**
  - A module-pattern store.
  - `requestCode` = enroll + `/otp-auth/code`. `verifyCode` = `/otp-auth/verify` + `/ph/v1/me`.
  - `restore` keeps the token on network or 5xx errors (drumlet rule) and clears it only on 401.
  - Persist the in-flight OTP step with a 10-minute TTL.
- **Verify:** unit tests. Then a live smoke script `scripts/smoke-auth.ts` against production with the `tickle-me-ivories` slug: a human enters the code; devices are listed; `revokeDevice` on the current device makes the next `restore` return signed-out.

### Task 1.4 `[sdk]` `core/saves.ts` and `core/shares.ts`

- **Interfaces:** `SavesClient`, `SharesClient`, `parseShareCode` (spec §3.1).
- **Verify:**
  - Unit tests.
  - Live smoke: upsert, list, get, 409 on a stale `ifUpdatedAt`.
  - Anonymous share: resolve signed out, then revoke with `revokeKey`, then resolve returns null.
  - Owned share: set to `private`, then resolve returns null.

### Task 1.5 `[sdk]` `react/*` and `ui/*`

- **Interfaces:** spec §3.2.
- **Verify:** Testing Library tests:
  - `useAuth` shares state across two components;
  - `useShareFromUrl` waits for auth to settle;
  - `useSyncedSaves` debounces at 1200 ms and pull-merges on login (port module's cases);
  - `useOtpForm` handles paste across digits, auto-submit and the resend cooldown.

### Task 1.6 `[sdk]` Release 0.1.0 **[PROD GATE: public npm publish]**

- **Verify:** `npm pack` contents are reviewed (no secrets, no `.env`); publish; install into a scratch Vite app, and a sign-in round trip works.

---

## Phase 2: tickle provider interfaces with offline defaults

**Ships:** tickle with named scenes and looks saved locally, `#share=` links, and the font sanitising fix. There is still no `@pepperhorn` anywhere and it works fully offline. Independent of phases 0–1, so it can run in parallel with them.

### Task 2.1 `[tickle]` Font-family sanitising (must precede any sharing)

- **Files:** `src/settings/profile.ts` (`validTextStyle`), `src/ui/googleFont.ts`, the CSS builder for stage text (`src/ui/StageText.tsx` or `textCss`), and tests.
- **Interface:** `export const FONT_FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$/`, and `isSafeFontFamily(s: string): boolean` exported from `profile.ts`.
- **Verify:**
  - `decodeProfile` with `family: 'x"; background:url(//evil)'` yields the family `Poppins`.
  - `ensureGoogleFont` refuses it, with no `<link>` added.
  - The emitted `font-family` is quoted with a fallback chain.
  - The existing tests still pass.
  - Close the parked finding in the handover.

### Task 2.2 `[tickle]` `src/platform/types.ts` and `registry.ts`

- **Files:** `src/platform/{types,registry,errors}.ts` and tests. `package.json` gains `"exports": {"./platform": "./src/platform/types.ts"}`.
- **Interfaces:** spec §2 verbatim.
- **Verify:**
  - `installPlugin` replaces a provider, and `subscribePlatform` fires.
  - `loadConfiguredPlugins` with no config file (404) leaves the defaults.
  - A cross-origin plugin URL is refused.
  - A plugin that throws leaves the defaults and logs.
  - `grep -r "@pepperhorn" src` is empty (add this as a test in `smoke.test.ts`).

### Task 2.3 `[tickle]` Scene and look codecs

- **Files:** `src/platform/{scene,look,songRef}.ts` and tests.
- **Interfaces:** spec §8.1 and §8.5: `SceneV1`, `LookV1`, `songKey`, `decodeScene`, `decodeLook`, `validSongRef`, `sceneFromState`, `lookFromSettings`, `applyLook`.
- **Verify:**
  - Round trips.
  - Unknown `v` is refused.
  - A `songKey` mismatch is refused.
  - An oversize payload is refused.
  - A malicious look (bad colours, a quoted font, 1000 gradient stops) is cleaned or refused.
  - A shared scene never yields `global.audio` in the apply result.

### Task 2.4 `[tickle]` `LocalStorageProvider` and `HashShareProvider`

- **Files:** `src/platform/local/{LocalStorageProvider,HashShareProvider}.ts` and tests.
- **Verify:**
  - CRUD over the `tmi.saves.*` keys, tolerating a throwing localStorage.
  - Hash share round trip via `CompressionStream` (polyfilled in jsdom with `fflate` in tests only, if needed).
  - More than 8 KiB is refused, and `song.kind==='midi'` is refused.

### Task 2.5 `[tickle]` UI: Scenes and Looks panel, share, and preview banner

- **Files:**
  - `src/ui/ScenesPanel.tsx` and `src/ui/SharePanel.tsx` (`.scenes-panel`, `.scene-row`, `.share-panel`, `.share-url`)
  - `src/ui/SharedPreviewBanner.tsx`
  - `src/App.tsx` wiring: a SettingsSection "Scenes & looks"; `share.match` on mount
- **Behaviour:**
  - Save the current scene, or the current look.
  - List, load and delete.
  - "Copy share link".
  - The preview banner offers Apply, Save a copy and Dismiss, and never applies silently.
  - The existing autosave (`tmi.profile.*`) is unchanged.
- **Verify:**
  - Component tests.
  - Manual run (`npm run dev -- --host 0.0.0.0`): save a scene, reload, load it; open a `#share=` link in a private window and see the banner; apply it.

---

## Phase 3: tickle-ph-plugin, remote scenes and looks, share links, and opensongs

**Ships:** ivories.pepperhorn.com with sign-in, cloud scenes and looks, `/s/<code>` and phrn.link shares, and the opensongs library. The open build is unchanged except that it gains the opensongs library.

### Task 3.1 `[plugin]` Scaffold and `./schema`

- **Pre-req:** the human creates `pepperhorn/tickle-ph-plugin` (public, MIT).
- **Files:** `package.json` (exports `.` and `./schema`; deps `@pepperhorn/app-sdk`, `zod`; devDep `tickle-me-ivories` via git for types), `tsup.config.ts` (a single-file ESM bundle `dist/tickle-ph-plugin.js` with everything inlined, plus `dist/schema.js`), and `src/schema.ts`.
- **Interfaces:** `SceneV1Schema`, `LookV1Schema`, `SongRefSchema` and `CAPS`, matching spec §8.5 and structurally equal to tickle's types. A type test asserts `z.infer<typeof SceneV1Schema>` is assignable to `SceneV1`.
- **Then `[ext]`:** replace the permissive tickle validators in `endpoints/ph/src/apps.ts` with the vendored `dist/schema.js`. Anonymous `midi` → 403 `upload_requires_sign_in`. **[PROD GATE]** to redeploy the gateway.
- **Verify:** schema tests. In the gateway e2e, an invalid scene gets 400, an anonymous MIDI scene gets 403, and a 300 KiB scene gets 413.

### Task 3.2 `[plugin]` Providers

- **Files:** `src/{index,auth,storage,share,errors}.ts` and tests.
- **Interfaces:** `activate(host): TicklePlugin` (spec §4).
- **Verify:**
  - Unit tests with a mocked SDK.
  - `storage.load` rejects a tampered payload via `host.decodeScene`.
  - Signed-in `share()` goes save → `createFromSave`; signed-out `share()` goes `createAnonymous`.
  - `match('/s/AbCdEfGhJk')` returns the code.

### Task 3.3 `[tickle]` Account UI and `/s/` route

- **Files:**
  - `src/ui/AccountMenu.tsx` and `src/ui/SignInDialog.tsx` (`.account-menu`, `.sign-in-dialog`, `.otp-digit`; 8 digits from `auth.codeLength`)
  - `src/main.tsx` (call `loadConfiguredPlugins`)
  - the share flow in `App.tsx`
- **Behaviour:** everything renders only when `platform.auth` is non-null. The share panel shows `shortUrl ?? url` and, for signed-in users, a visibility picker.
- **Verify:**
  - Tests with a fake `AuthProvider`.
  - With no config, there is no account UI and the build output is identical to phase 2 (bundle diff).

### Task 3.4 `[tickle]` opensongs library and adapter

- **Files:**
  - `src/platform/content/{OpenSongsContentProvider,songJsonToScore}.ts` and tests
  - fixtures: `hot-cross-buns` and one 6/8 song with ties, copied as test data at a pinned SHA
  - `src/ui/LibraryPanel.tsx` (`.library-panel`, `.library-item`)
- **Interfaces:** spec §8.2. `OPENSONGS_DEFAULT_REF` is a 40-hex SHA until tags exist.
- **Verify:**
  - Adapter tests: note count, tie merge, a 6/8 onset unit check against the MusicXML duration (resolves spec §8.2's assumption).
  - A branch ref is refused.
  - An invalid id is refused.
  - Manual: load "Hot Cross Buns" from the library, play it, save it as a scene, reload, reopen.

### Task 3.5 `[opensongs]` Release tags **[human approval: public repo]**

- **Do:** tag the current `master` as `v1.0.0`, and document "tags are immutable; new songs → new minor tag" in the README.
- **Verify:** `https://cdn.jsdelivr.net/gh/pepperhorn/opensongs-json@v1.0.0/index.json` returns 200. Then bump `OPENSONGS_DEFAULT_REF` to `v1.0.0` in tickle.

### Task 3.6 `[tickle]` MIDI embedding for signed-in scenes

- **Files:** `src/platform/scene.ts` (the `midi` ref builder, a 128 KiB check, and base64 via `FileReader`/`btoa` chunks) and `App.tsx` (when a signed-in user saves a scene from a dropped MIDI, offer "Include the MIDI file (cloud only)").
- **Verify:** a 100 KB MIDI round-trips through cloud save and share: the recipient plays it without having the file. 129 KiB is refused with the "use local reference" message. A local-ref scene shows the drop-file prompt, and a hash mismatch warns.

### Task 3.7 `[tickle]` + host: deploy ivories.pepperhorn.com **[PROD GATE: DNS and hosting]**

- **Do:**
  - Hosting with an SPA fallback for `/s/*`.
  - A CSP header (spec §9.3).
  - `public/tickle.config.json` and `public/plugins/tickle-ph-plugin.js`, copied from the plugin release by the deploy pipeline, not committed to the open repo.
  - The host is `ivories.pepperhorn.com` (decided). **[user]** adds the DNS record; the agent confirms it resolves before deploying.
- **Verify:** production e2e:
  1. Sign in and save a scene and a look.
  2. Share a scene; the phrn.link URL 302s to `/s/<code>`.
  3. In a private window, preview, apply and fork (after signing in there).
  4. Set the scene to private; the link 404s.
  5. The device list shows both browsers; revoke one.

---

## Phase 4: migrate module, drumlet, chordee2, jamee and dottl

**Ships:** each app on the SDK, one at a time. Legacy Flows are still live for any app not yet migrated.

For each app X, in the order module → drumlet → chordee2 → jamee → dottl (spec §10.2), run the three tasks below. jamee has one more task (4.jamee.d), and dottl has one more task (4.dottl.d).

### Task 4.X.a `[ext]` Register X **[PROD GATE]**

- Append X's slug to `OTP_AUTH_APP_SLUGS`.
- Add the `AppConfig` for X to `apps.ts`, including its payload zod schema:
  - module: the patch schema from `useUserPatchSync`;
  - drumlet: the `preset` schema from its zod types;
  - chordee: `ChordChartSchema`;
  - jamee: `SaveRowSchema`'s payload type plus a file allowlist and `fileRefs`;
  - dottl: its doc schema plus a file allowlist and `fileRefs`.
- Redeploy, then restart.

### Task 4.X.b `[X]` Swap the client

- **Files:**
  - module: `src/state/{useAuth,useUserPatchSync}.ts` and `src/components/{AuthModal,UserMenu}.tsx`
  - drumlet: `src/state/useAuth.ts`, `src/drumlet/drumletBridge.ts` and `src/components/{AuthModal,UserMenu}.tsx`
  - chordee2: `src/lib/auth/*`, `src/lib/{cloudSave,cloudShare}.ts`, `src/lib/library/publicLibraryPlugin.ts` and `src/components/share/ShareResolver.tsx`
  - jamee: `src/state/useAuth.ts`, `src/directus/{client,saves,assets}.ts` and `src/ui/AuthModal.tsx`
  - dottl: `src/state/useAuth.ts` (or its equivalent), `src/directus/{client,docs}.ts` and the file upload module
- Remove every Flow UUID and every `/items/*` call.
- Keep each app's own UI, driven by `useOtpForm` and an 8-digit code (up from 6).
- **Verify:**
  - `grep -rE "flows/trigger|/items/|40f96a57|65da02e3|11dd60ca" src` is empty.
  - The app's own tests pass.
  - Local e2e against production with a test account.

### Task 4.X.c `[X]` Deploy **[PROD GATE for the app's hosting]**

Verify on production: sign-in, CRUD of saves, share and resolve (chordee), file upload with scoped read (jamee, dottl), docs (dottl), sign-out, and revoke-device.

### Task 4.jamee.d `[jamee]` + `[ext]` Make jamee uploads private (D19) **[PROD GATE: permissions and data rewrite]**

- **Precedes** 4.jamee.c.
- **Files:**
  - `ph-apps-extensions/endpoints/ph/src/apps.ts`: jamee `files.fileRefs(payload)` returns the file ids referenced by a jamee project payload.
  - `jamee/src/directus/assets.ts`: replace `${directusBase()}/assets/${id}` with an authorised fetch of `GET /ph/v1/files/:id?appSlug=jamee[&share=<code>]`, turned into an object URL.
  - `ph-apps-extensions/migrations/2026-xx-jamee-file-refs.sql`: a one-off rewrite of the stored `/assets/<id>` URLs inside jamee `app_user_saves.payload` to bare file ids.
- **Steps:**
  1. Inventory the jamee-uploaded files (`directus_files` where `uploaded_by_app_user` is set and the folder is jamee's, or where the file is referenced by jamee saves).
  2. **GATE:** show the rewrite SQL and the row counts, then apply.
  3. **GATE:** remove any **Public** read on `directus_files` (this closes audit open item 1). The App User read is removed in phase 5.2.
- **Verify:**
  - An anonymous `GET /assets/<jamee file id>` → 403.
  - A signed-in non-owner `GET /assets/<id>` with a session token → 403. The legacy hook path is still live until phase 5, so that grant must already be narrowed to `uploaded_by_app_user = $CURRENT_USER` in this gate.
  - The owner through the gateway → 200.
  - A share recipient through `?share=<code>` → 200 only while the share is active and not private.
  - jamee's own tests pass, and its projects render their audio or images after the rewrite.

### Task 4.dottl.d `[dottl]` + `[ext]` `dottl_docs` behind the gateway **[PROD GATE: gateway redeploy]**

- **Do:** decide between a gateway kind `doc` in `app_user_saves` (with a migration of the existing `dottl_docs` rows) and a dedicated `/ph/v1/dottl/docs` route over `dottl_docs`. Record the decision in the handover, then implement it.
  - dottl files use the same scoped-read model as jamee's.
  - `dottl.app` joins `OTP_AUTH_APP_SLUGS` (as `dottl`) in 4.dottl.a.
- **Verify:**
  - `grep -rE "readItem|updateItem|createItem|/files|flows/trigger" dottl/src` is empty.
  - The existing dottl docs open for their owners after migration.

---

## Phase 5: retire the legacy Flows **[PROD GATE on every step]**

**Ships:** a single auth stack.

### Task 5.1 `[ext]` Legacy-traffic evidence

- Script `ph-apps-extensions/scripts/legacy-traffic.sql`: `max(last_access)` on `app_sessions`, recent `otp_codes` rows, and Flow activity (`directus_activity` for the six Flow ids).
- **Verify:** no activity for 14 days, and all five apps from phase 4 (module, drumlet, chordee2, jamee, dottl) are live on the SDK.

### Task 5.2 `[ext]` Retire

Follow spec §10.3, steps 1–6, **one gate per step** and in order, taking a snapshot export before each destructive step.

**Verify after each step:**

- every migrated app's production e2e still passes;
- an anonymous `GET /items/shortcoder`, `/items/app_user_saves` and `/files` still answer 403;
- `/flows/trigger/40f96a57…` answers 404 or 403.

### Task 5.3 `[ext]` Update the architecture doc **[PROD GATE: ph-apps content write]**

Write `internal_architecture` v0.2, covering:

- §1 now describes directus-otp-auth and `ph_uid`;
- the asset-payload route replaces the Flow (F8);
- `app_user_saves` is the user library;
- the changelog entry.

---

## Phase 6: identity linking, content and entitlements (split ownership, D12)

**Ships:** linked identities; app content gated by entitlement; ph-apps selling its own subscriptions and packs; storefront purchases unlocking app content.

The purchase split is decided (spec §5.2). Usage and royalty reporting is **not** in this phase or any other: only the seam in spec §5.3a is designed.

### Task 6.1 `[connect]` ph-connect `account.ph_uid` and otp-auth link config **[PROD GATE: ph-connect]**

- **Do:**
  - Write the schema record `~/pepperhorn-platform/apps/connect/schema/ph-uid-v1.json` and its SQL: `ph_uid uuid` (unique), `ph_uid_linked_at timestamptz`, `stripe_customer_id text`, a backfill with `gen_random_uuid()`, and the CHECK form per N1 if `account` has a draft state.
  - Configure ph-connect's directus-otp-auth: `OTP_AUTH_PRINCIPAL_GLOBAL_ID_COLUMN`, `_LINKED_AT_COLUMN`, `OTP_AUTH_LINK_SECRET` (shared with ph-apps only), `OTP_AUTH_LINK_ISSUER=ph-connect`, `OTP_AUTH_LINK_PEERS=ph-apps=https://apps.pepperhorn.com`.
  - Deploy the upgraded otp-auth there (the phase 0 tarball, plus `003-global-id-and-link.sql`).
- **Verify:**
  - Every `account` row has a unique `ph_uid`.
  - ph-connect login still works (re-run its checklist item 4).
  - `GET /otp-auth/session` on ph-connect has no global id in its body.

### Task 6.2 `[ext]` Enable linking on ph-apps **[PROD GATE]**

- **Do:** set `OTP_AUTH_LINK_SECRET`, `OTP_AUTH_LINK_ISSUER=ph-apps` and `OTP_AUTH_LINK_PEERS=ph-connect=https://connect.pepperhorn.com`.
- **Verify:** e2e with test users:
  - (a) an unlinked pair adopts the issuer's id;
  - (b) a second redeem of the same ticket is refused (the ticket is consumed at introspection);
  - (c) two already-linked, different ids produce an `identity_merge_queue` row, and nothing changes;
  - (d) no email is compared (log review);
  - (e) the ticket in the browser is opaque, and no gid is visible in any URL or response (HAR review).

### Task 6.3 `[sdk]` + storefront: link UX

- **SDK:** add `auth.linkTicket(): Promise<string>` (`POST /otp-auth/link/ticket`) and `auth.redeemLink(ticket)` to `AuthStore`.
- **Storefront:** the `pepperhorn.com/link#ticket=` page is a **separate task in the pepperhorn-platform repo** (`apps/primary`), outside this plan's repos. Hand it off with the interface `POST /otp-auth/link/redeem`.
- **Verify:** unit tests. A manual cross-site link completes.

### Task 6.4 `[ext]` ph-apps commerce: collections, Stripe webhook and checkout **[PROD GATE: schema, env and Stripe config]**

- **Files:**
  - `ph-apps-extensions/migrations/2026-xx-ph-apps-commerce-v1.sql`: `app_products`, `app_subscriptions`, `app_purchases`, `app_licenses`, `app_assets` (per arch doc §2), `app_assets.product_refs`, and `app_users.stripe_customer_id`
  - `endpoints/ph/src/routes/{checkout,stripe-webhook}.ts`
  - `src/stripe/customer.ts`
- **Interfaces:**
  - `ensureCustomer(phUid): Promise<string>`: Stripe search on `metadata['ph_uid']`, then create with `Idempotency-Key: customer:<ph_uid>`, then cache on `app_users`.
  - `POST /ph/v1/checkout` and `POST /ph/v1/stripe/webhook` (spec §6.6).
- **Steps:**
  - Webhook signature verification uses `STRIPE_WEBHOOK_SECRET_PH_APPS`.
  - Events with `metadata.system !== 'ph-apps'` → 200 no-op.
  - Checkout sessions and subscriptions carry `metadata.system='ph-apps'` (and no `ph_uid` anywhere except the customer object).
- **GATE:** show the schema, the Stripe webhook endpoint registration, the product and price rows, and the env keys.
- **Verify:**
  - Stripe test mode: subscribe, which upserts `app_subscriptions` as `active`; cancel, which gives `canceled`.
  - A ph-connect-tagged test event is ignored.
  - Two concurrent first checkouts for one user produce exactly one Stripe customer.

### Task 6.5 `[connect]` Storefront side of the split and the entitlement endpoint **[PROD GATE: ph-connect]**

- **Files:**
  - `~/pepperhorn-platform/apps/connect/extensions/endpoints/billing/`: checkout adds `metadata.system='ph-connect'` and adopts the shared-customer rule (`ensureCustomer` by `account.ph_uid`); the webhook ignores `metadata.system='ph-apps'`
  - a new `endpoints/ph-apps/`: `POST /ph-apps/entitlements {ph_uid}` → `{entitlements: Entitlement[]}` (spec §5.2 shape), covering storefront products mapped to app refs only
- **[user]:** the user creates the `ph_apps_entitlements` role, policy and token (read-only on this endpoint, IP-allowlisted to the ph-apps egress IP). An agent verifies it with a probe script, in the style of Task 0.8a.
- **Verify:**
  - The billing extension's existing tests pass, plus new filter tests.
  - The entitlement token cannot read `short_link`, and the gateway token cannot call entitlements. Revoking either leaves the other working.
  - A GET with `ph_uid` in the query string is rejected (POST only).

### Task 6.6 `[ext]` Content routes and entitlement union **[PROD GATE: deploy]**

- **Do:** implement the routes per spec §6.6:
  - union the local `app_*` entitlements with ph-connect's (POST, 300 s cache per `ph_uid` per source);
  - fail closed on ph-connect refs when it is unreachable;
  - 410 for a revoked licence, from whichever system owns it;
  - `Cache-Control: private, max-age=300`;
  - strip `ph_uid` from responses.

  **No usage events are emitted** (the seam only; spec §5.3a).
- **Verify:** e2e matrix:
  - free: signed out gets 200;
  - user: signed out gets 401, signed in gets 200;
  - purchase via an app subscription gets 200;
  - purchase via a storefront product mapped to an app ref gets 200;
  - not entitled gets 403;
  - an app licence revoked gets 410;
  - a storefront licence voided on ph-connect gets 410 within 300 s;
  - ph-connect down: app-owned 200, storefront-owned 403.

### Task 6.7 `[sdk]` `core/content.ts` and `react/useEntitlements.ts`

- **Interfaces:** `ContentClient`, including `checkout` (spec §5.5).
- **Verify:** unit tests. `canAccess` has a table test over gate × signedIn × entitlements.

### Task 6.8 `[plugin]` + `[tickle]` Gated content in tickle

- **Plugin:** a `ContentProvider` for `ph-asset` refs.
- **Tickle:** the LibraryPanel shows access badges and the CTA (checkout for ph-apps products, and a storefront link for ph-connect products). A shared scene with a `ph-asset` ref resolves for entitled recipients and shows "locked" otherwise.
- **Verify:** e2e with a test product. The share payload holds the ref only (inspect the `shortcoder` row).

---

## Phase 7: third-party access (OAuth 2.0 + PKCE, D15)

**Ships:** an operator-registered third-party client (e.g. forScore) can, with the user's consent, list the user's entitled library and download purchased PDFs stamped by `apps/stamp-pdf`. The user can revoke that client at any time.

**Decided:** OAuth lives in directus-otp-auth (D16), and the pairwise id is `base64url(HMAC(server_secret, ph_uid ‖ client_id))` (D17). Directus's native OAuth server is not used for people.

### Task 7.1 `[otp]` OAuth module in directus-otp-auth

- **Files:**
  - `packages/core/src/oauth/{pkce,codes,tokens,grants,pairwise,scopes}.js`
  - `packages/directus/src/oauth-routes.js`
  - `schema/004-oauth.sql`
  - `.env.example`
  - `SPEC.md` (a new section, and invariants)
  - tests
- **Tables:**
  - `oauth_client(client_id PK, name, logo_uri, redirect_uris jsonb, allowed_scopes text[], secret_hash null, status)`
  - `oauth_grant(id, client_id, principal_id, principal_ph_uid, scopes text[], created_at, revoked_at)`
  - `oauth_code(code_hash PK, grant_id, redirect_uri, code_challenge, expires_at, consumed_at)`
  - `oauth_token(id, grant_id, kind access|refresh, token_hash, expires_at, rotated_from, revoked_at)`
- **Env:** `OTP_AUTH_OAUTH_ENABLED`, `OTP_AUTH_OAUTH_PAIRWISE_SECRET` (≥32 bytes), `OTP_AUTH_OAUTH_ACCESS_TTL=900`, `OTP_AUTH_OAUTH_REFRESH_TTL_DAYS=60`.
- **Routes:**
  - `GET /oauth/authorize`: the consent page, a server-rendered minimal HTML page with an OTP sign-in step when there is no session;
  - `POST /oauth/authorize/decision`;
  - `POST /oauth/token`;
  - `POST /oauth/revoke`;
  - `GET /oauth/userinfo`;
  - `GET /oauth/grants` and `DELETE /oauth/grants/:id` (session-authenticated, for account settings);
  - `POST /oauth/introspect`: server-only, for the content APIs on the same instance; returns `{active, grant_id, scopes, sub}`.
- **Steps (TDD):**
  1. PKCE supports S256 only.
  2. `redirect_uri` must match exactly.
  3. Codes are single-use with a 60 s lifetime.
  4. Refresh rotates on every use, and reuse revokes the grant.
  5. `sub` = the pairwise HMAC (spec §13).
  6. Scopes ⊆ client `allowed_scopes` ⊆ `{library:read, purchases:read, email}`.
  7. Email is present only with the `email` scope.
  8. Access tokens are verified against a live grant on every call.
- **Verify:**
  - Unit tests cover each step.
  - Two clients receive different `sub` values for one user.
  - Revoking the grant makes the access token fail on the next call.
  - The static gate finds no `ph_uid` in any OAuth response.

### Task 7.2 `[otp]` + `[ext]` + `[connect]` Deploy the OAuth module **[PROD GATE per instance]**

- **Where:** enable it on the instance that owns the content being served. ph-connect covers purchases and PDFs; ph-apps covers app-owned content.
- **[user]:** register the first client (forScore) as an operator, with its name, logo, redirect URIs and scopes.
- **Verify:** a full authorisation-code + PKCE round trip with a test client; the consent screen shows the scopes in plain words; Deny returns `error=access_denied`.

### Task 7.3 `[connect]` Third-party content API on ph-connect

- **Files:** `~/pepperhorn-platform/apps/connect/extensions/endpoints/tp/` with `GET /tp/v1/library` and `GET /tp/v1/items/:ref/download`.
- **Behaviour:**
  - The bearer token is checked through `/otp-auth/oauth/introspect`.
  - The entitlement is checked **per request** against ph-connect `licenses` by the grant's `ph_uid`, server-side.
  - `download` gets the stamped PDF from the owner master cache, or triggers `apps/stamp-pdf` with the licence's `stamp_data`, then returns a signed B2/S3 URL (≤ 300 s).
  - A revoked or refunded licence returns **410** `{error:'license_revoked'}`.
  - Each download writes an audit row (client, grant, licence, part).
- **Verify:**
  - An entitled download returns a URL that expires within 5 minutes.
  - Voiding the licence returns 410 on the next call.
  - The scope `library:read` alone cannot download (403).
  - The pairwise `sub` never appears server-side except through the grant.

### Task 7.4 `[stamp]` `apps/stamp-pdf` integration check

- **Do:** confirm the Lambda payload contract in `STAMPING.md` covers the third-party delivery path: same `stamp_data`, with the personalisation taken from the licence and never from the client. Add a test fixture for a third-party-delivered part.
- **Verify:** the sandbox e2e (`SANDBOX_E2E_TESTING.md`) passes with the new fixture.

### Task 7.5 `[ext]` Third-party content API on ph-apps (app-owned content only)

- **Do:** mirror Task 7.3 for `app_assets` payloads and files, with the same per-request entitlement, 410 and signed-URL rules.
- **Verify:** as in Task 7.3.

### Task 7.6 `[sdk]` + apps: connected-apps settings

- **SDK:** `auth.grants(): Promise<{id, clientName, logoUri, scopes, createdAt}[]>` and `auth.revokeGrant(id)`.
- **Tickle and other apps:** a "Connected apps" list next to the device list.
- **Verify:** revoking a grant from the UI stops the client's next API call.

---

## Handover and review cadence

- Each phase ends with `docs/superpowers/handover/2026-MM-DD-platform-phase-N-handover.md` in the repo that did most of the work. It records the rulings, the parked findings, and every **[PROD GATE]** approval (who approved, when, and what was shown).
- The only open question is Q3, the `app_share` demand vocabulary (spec §12). Ask it before Task 0.7 ships. The plan assumes "no".
- Every other question is resolved (spec D1, D12, D16–D20, and §5.3a for Q8).
