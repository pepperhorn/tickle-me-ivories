# Platform go-live runbook: phase 0 gates, app-sdk, tickle-ph-plugin, ivories.pepperhorn.com

Date: 2026-10-13. Status: draft for the user. Read-only research produced this; **nothing in it has been run against production**.

Sources: `~/ph-apps-extensions/deploy/phase0/README-GATES.md` (branch `feat/app-access`, gate package pinned at `e5d684e`/`a05da24`), the platform SDK spec and plan (`docs/superpowers/{specs,plans}/2026-09-26-pepperhorn-platform-sdk*.md`), the SDD ledger `~/tmi-platform-sdk/.superpowers/sdd/2026-09-26-pepperhorn-platform-sdk/progress.md`, read-only `ph-coolify` MCP lookups, `gh`, `npm` and `dig` on 2026-10-13.

Legend: **[AGENT]** an agent can run it from its tool calls. **[HUMAN]** the user runs it in their own terminal or console (tokens, mailed codes, 2FA, SSH/tailnet, DNS panel, approvals). **[AGENT after approval]** the agent runs it only after the user approves that named step in chat. Every production step is still one approval per gate, `PH_GATE_APPROVED=<gate>` naming the gate (README-GATES rules apply unchanged).

---

## 0. What changed since the gate package was written (read this first)

These facts were checked read-only today. They block the phase 0 gates as written.

| Fact (2026-10-13) | Evidence | Consequence |
|---|---|---|
| **The Coolify estate was migrated on 2026-10-03.** ph-apps is now service `aoreoe0bxhko4whbvuniymix` ("…hif8kzgzwxtxjc59vyieazue-new") on the Coolify `localhost` server; the old `hif8kzgzwxtxjc59vyieazue` is **exited**. | `mcp__ph-coolify__list_services`, `get_service` (no reveal) | Every hard-coded target in `deploy/phase0/*.sh` is stale (see §5.1). The gate package must be re-targeted, re-snapshotted, re-pinned and **re-approved** before any gate runs. |
| ph-apps `directus` sub-app is now `lhufufsbw8cgvdhdtndctbex` (was `g11nvpnn3helo8meq3m3bhab`); postgres `xdc4qbymvenwiuen8qdgugy9`, redis `a942sjwd9mgmvioajdpcp4rn`, tailscale `icvxzehqt5xem5t33xhw0g5g`. Images are now pinned by digest (Directus `sha256:27fd2914…`, tailscale `sha256:8c42c457…`). | `get_service` | Container names change (likely `directus-aoreoe0bxhko4whbvuniymix` etc.; confirm with `docker ps` on the host). The Directus **version behind the digest is unconfirmed**: the gate package was rehearsed on 12.1.1 only. README fact M8 (unpinned tailscale) is now resolved. |
| `apps.pepperhorn.com`, `connect.pepperhorn.com`, `pepperhorn.com`, `phrn.link`, drumlet/dottl/module all resolve to **95.217.32.125** (authoritative and 1.1.1.1). README-GATES says 89.233.105.209 (coolify-2). | `dig` | `PH_APPS_HOST` is no longer coolify-2. The hairpin / allowlist decision box (Task 0.8) must be re-measured on the new host. |
| ph-connect is now `vt4necyu23qh26xsvpdtnbbf` (old `logo04wws088k0oo00wgw8o4` exited); tailnet `directus-connect` 100.107.9.20 (old 100.100.209.25). | `list_services`, `tailscale status` | The "never the target" refusal lists in `gate-deploy.sh` must name the new ph-connect ids too. |
| phrn.link is now app `platform-links-new` `0jhknewbzvw3iucc9atia49f` (old `dovjdtikfecbtdsqhgtqi8qj` exited). | `list_applications` | GATE 0.9-B target changes. |
| Tailnet nodes present: `directus-apps` 100.103.147.69, `coolify-hz` 100.82.206.72, `ph-coolify-control`. | `tailscale status` (read-only) | The sidecar name `root@directus-apps` probably still works; confirm it now points at the new container. |
| No phase 0 gate has run. `https://apps.pepperhorn.com/otp-auth/session` → 404, `/ph/v1/me` → 404, `deploy/phase0/gate-runs/` is empty. | `curl`, `ls` | Start at GATE 0.3-A. |
| GATE 0.3-A is **blocked** on the Directus licence entitlement `custom_permission_rules_enabled` (local 12.1.1 is Core tier; step P STOPs without it). | ledger, README-GATES "Step P decision" | User decision (c) obtain the entitlement, or (e) STOP and redesign (`ph_uid` outside a Directus collection). |
| `~/ph-apps-extensions` has **no git remote**. | `git remote -v` | Nothing is backed up off-machine; the approved commits exist only locally. |
| Task 0.7 (`apps/links` app_share) is on `feat/links-app-share` (`8357ab4`), **not merged** to `pepperhorn-platform` main. | `git branch --contains` | GATE 0.9-B needs a PR merged first. |
| `pepperhorn/app-sdk` and `pepperhorn/tickle-ph-plugin` **do not exist** on GitHub; no local dirs. `@pepperhorn/app-sdk` is not on npm. `ivories` is unclaimed on npm. | `gh repo view`, `npm view` | Phase 1 and phase 3 start with repo creation. |
| `gh` is logged in as `pepperhorn` (a **User** account, not an org) with scopes `repo, workflow, gist, read:org`. `npm whoami` → 401 (not logged in). | `gh auth status`, `npm whoami` | The agent technically could create repos, but the plan reserves it for the human. npm publish needs the human's login and 2FA. |
| `ivories.pepperhorn.com` **already has an A record → 208.87.135.48** (Coolify server `ph3`, where only the old, exited apps live). HTTPS fails (self-signed default cert); HTTP → 404 (no app routed). | `dig`, `curl` | DNS exists but points at the wrong server for the post-migration estate. Either move the record to 95.217.32.125 (recommended) or deploy onto `ph3`. |
| DNS for pepperhorn.com is **not Cloudflare**: NS `ns1/ns2/ns3.nameserver.net.au` (Australian registrar DNS, Synergy Wholesale-style reseller panel), SOA `hostmaster.pepperhorn.com`, serial `2026100801`, negative TTL 3600. No repo documents which registrar account owns it. | `dig NS/SOA`; grep of `~/` | DNS edits are a **[HUMAN]** step in the registrar's DNS panel. |
| Hosting pattern for *.pepperhorn.com SPAs: Coolify app, build pack **Dockerfile** (`node:22-alpine` build → `nginx:alpine`, `nginx.conf` with `try_files $uri $uri/ /index.html`), GitHub App source, auto-deploy on push, server `localhost` (95.217.32.125). Example: `module-new` `emrtlpj6ziqyhox6ixi0un9b`, `~/module/Dockerfile`. | `get_application`, `~/module` | ivories.pepperhorn.com should follow it. The `ph-coolify` MCP is the route (create/deploy are writes → approval). |
| The spec §9.3 CSP would **break audio**: smplr fetches samples from `smpldsnds.github.io`, `gleitz.github.io`, `goldst.dev`. | grep of `node_modules/smplr` | `connect-src` must include those origins (see §3.7). |

---

## 1. Phase 0: production gates (ph-apps, ph-connect, phrn.link)

Order is fixed: **0.R → 0.3-A → 0.3-B → 0.5 → 0.6 → 0.8 (user) → 0.9-A → 0.8a → 0.9-B**. Roll back in reverse. Every step below references README-GATES for the full checklist; this runbook adds who runs what and the post-migration deltas.

### Step 0.R Re-target the gate package to the migrated estate (new, local only)

- **Prerequisites:** user says "re-target the gate package".
- **[AGENT]** In `~/ph-apps-extensions` on a new branch off `feat/app-access` (or `feat/platform-gateway`): replace the hard-coded ids in `deploy/phase0/{gate-backup,gate-deploy,gate-prod-checks,gate-secret-floors,gate-set-env,ph-apps-psql}.sh` and README-GATES (36 occurrences of `hif8…`, `g11nvpnn…`, `89.233…`, `dovjdtik…`, `logo04…`, `directus-apps` across six scripts):
  - ph-apps service `aoreoe0bxhko4whbvuniymix`, directus sub-app `lhufufsbw8cgvdhdtndctbex`, container names as confirmed by the human below;
  - ph-connect refusal list: add `vt4necyu23qh26xsvpdtnbbf` and `100.107.9.20` alongside the old values;
  - links app `0jhknewbzvw3iucc9atia49f`;
  - the rendered-compose path `/data/coolify/services/aoreoe0bxhko4whbvuniymix/…`;
  - re-run `test/test-gate-deploy-preflight.sh`, `test/test-gate-set-env.sh`, `scripts/test-verify-ph-connect-policy.sh`; re-run `build-artifacts.sh` and update `ARTIFACTS.sha256`.
- **[HUMAN]** (needs SSH/tailnet; the agent never SSHes to production):
  ```bash
  ssh root@95.217.32.125 'docker ps --format "{{.Names}}\t{{.Image}}" | grep -E "aoreoe0bxhko4whbvuniymix|vt4necyu23qh26xsvpdtnbbf"'
  ssh root@95.217.32.125 'docker exec directus-aoreoe0bxhko4whbvuniymix node -e "console.log(require(\"/directus/package.json\").version)"'   # adjust container name
  ssh root@directus-apps 'hostname; ls /directus/extensions'      # must be the NEW container: lists directus-extension-app-session-auth
  ```
  Paste only the container names and the Directus version into chat (no secrets).
- **[HUMAN]** New live-compose snapshot: Coolify UI → service `…-new` → Edit Compose File → copy to `/tmp/live-compose.yml` (never a `reveal: true` read). **[AGENT]** then saves it as `snapshots/ph-apps-compose-raw.2026-10-13.yml`, rebases `compose/docker-compose.v12.gate-0.5.yml` / `gate-0.6.yml` on it, regenerates the diffs and hashes.
- **If the Directus version is not 12.1.1:** **[AGENT]** re-runs the local rehearsals (`test/rehearse-rollbacks-local.sh`, `test/live-ph-uid-guard-local.sh`, `spikes/gateway-e2e.sh`) on that version before re-approval (F3 shim and the `ph_uid` guard are version-sensitive).
- **[HUMAN]** add a remote and push `~/ph-apps-extensions` (private): `gh repo create pepperhorn/ph-apps-extensions --private --source ~/ph-apps-extensions --push` (or approve the agent to run it).
- **Verify:** all `test/*` pass; `grep -rn 'hif8kzgzwxtxjc59vyieazue' deploy/phase0/*.sh` matches only refusal lists; `build-artifacts.sh --check <new commit>` reproduces; the user approves the new commit as `PH_APPROVED_COMMIT`.
- **Rollback:** local branch only; discard it.

### Gate shell setup (every gate) [HUMAN]

```bash
bash
cd ~/ph-apps-extensions
export PH_APPROVED_COMMIT=<commit approved in 0.R>
export PH_APPS_HOST=root@95.217.32.125            # confirm in 0.R; no default
export PH_PSQL="$PWD/deploy/phase0/ph-apps-psql.sh -q -t -A"
set -o pipefail
read -rs COOLIFY_API_TOKEN; export COOLIFY_API_TOKEN          # read + write + read:sensitive + deploy, ph-apps service
read -rs DIRECTUS_ADMIN_TOKEN; export DIRECTUS_ADMIN_TOKEN PH_ADMIN_TOKEN="$DIRECTUS_ADMIN_TOKEN"
export PH_TEST_MAILBOX=<plus-addressable mailbox you read> PH_LEGACY_EXISTING_EMAIL=<your drumlet account> PH_JAMEE_URL=<jamee URL>
```

Inside Claude Code the token lines can be typed as `! read -rs COOLIFY_API_TOKEN; export COOLIFY_API_TOKEN`. Never paste a token or a mailed code into chat.

### GATE 0.3-A Backup, permissions, schema SQL

- **Prerequisites:** 0.R approved; **entitlement decision recorded** (`custom_permission_rules_enabled` true, or STOP); low-traffic window (Australia/Sydney evening).
- **Commands [HUMAN]** (all `PH_GATE_APPROVED=0.3-A`):
  ```bash
  PH_GATE_APPROVED=0.3-A deploy/phase0/gate-backup.sh
  PH_GATE_APPROVED=0.3-A PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-permissions.sh read
  PH_GATE_APPROVED=0.3-A PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-permissions.sh apply     # only if signal 1 is true
  # SQL 0–4 per migrations/RUNBOOK.md, piped to $PH_PSQL
  # step 5: restart the directus sub-application (Coolify UI, or approved MCP control restart on lhufufsbw8cgvdhdtndctbex)
  PH_GATE_APPROVED=0.3-A PH_BASE=https://apps.pepperhorn.com PH_LEGACY_CASING_PROBE=1 deploy/phase0/gate-prod-checks.sh legacy
  ```
- **[AGENT]** can only read the outputs the human pastes and fill the checklist; it cannot run these (SSH, admin token, TTY prompts).
- **Verify:** README-GATES 0.3-A checklist; `verify: PASS`; legacy smoke all PASS; no 429/`REFUSING` in the log.
- **Rollback [HUMAN]:** RUNBOOK step 7 (`down.sql`, `gate-permissions.sh rollback <tag>`, restart; dump restore last resort).

### GATE 0.3-B Studio field metadata

- **Prerequisites:** 0.3-A passed.
- **[AGENT after approval]** MCP `fields update` (meta only) on ph-apps per `migrations/gate-0.3-b-plan.md` §1–§2; relations read only. Record each field's previous `meta` first.
- **Verify:** `ph_uid`, `ph_uid_linked_at` hidden + readonly; shortcoder internals hidden; no `relations` write.
- **Rollback [AGENT after approval]:** restore each recorded `meta`.

### GATE 0.5 Deploy directus-otp-auth

- **Prerequisites:** 0.3-A/B passed; live compose equals the 0.R snapshot (**[HUMAN]** re-diff); rate-limiter sizing queries run (**[HUMAN]**, `$PH_PSQL`).
- **Commands [HUMAN]:**
  ```bash
  # 1. Coolify UI: replace compose with compose/docker-compose.v12.gate-0.5.yml; post-paste sha256 check
  deploy/phase0/gate-set-env.sh --dry-run
  PH_GATE_APPROVED=0.5 deploy/phase0/gate-set-env.sh
  deploy/phase0/gate-deploy.sh 0.5 --dry-run
  PH_GATE_APPROVED=0.5 deploy/phase0/gate-deploy.sh 0.5
  ssh root@directus-apps 'mkdir -p /directus/templates && cat > /directus/templates/otp-code.liquid && chown 1000:1000 /directus/templates/otp-code.liquid' < deploy/phase0/.stage/0.5/otp-code.liquid
  PH_GATE_APPROVED=0.5 PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-create-purge-flow.sh --cron '*/5 * * * *'
  PH_GATE_APPROVED=0.5 PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-create-purge-flow.sh --set-cron '40 3 * * *'   # after one run is observed
  PH_GATE_APPROVED=0.5 deploy/phase0/gate-secret-floors.sh
  PH_GATE_APPROVED=0.5 PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-prod-checks.sh otp       # human reads the mailed codes
  PH_GATE_APPROVED=0.5 PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-prod-checks.sh legacy
  ```
- **[AGENT]** after the human reports done: `curl -s -o /dev/null -w '%{http_code}' https://apps.pepperhorn.com/otp-auth/session` → `401`; read-only MCP `logs` on the directus sub-app for the `[otp-auth] ready` line and absence of `REFUSING TO SERVE`.
- **Rollback [HUMAN]:** README-GATES 0.5 rollback (remove extension dir, delete Flow, restore the **0.R** snapshot, delete the two variables, full-service restart, legacy smoke).

### GATE 0.6 Deploy the gateway and shim

- **Prerequisites:** 0.5 passed; live compose equals the gate-0.5 target.
- **Commands [HUMAN]:**
  ```bash
  # Coolify UI: replace compose with compose/docker-compose.v12.gate-0.6.yml; post-paste check
  deploy/phase0/gate-deploy.sh 0.6 --dry-run
  PH_GATE_APPROVED=0.6 deploy/phase0/gate-deploy.sh 0.6
  PH_GATE_APPROVED=0.6 PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-prod-checks.sh gateway
  ```
- **[AGENT]** after: `/ph/v1/me` → 401 (`curl`); read-only log check for `gateway mounted at /ph/v1 (phrn.link sync off)`.
- **Gate condition [HUMAN decision]:** B2 list (non-admin read grants on `directus_revisions`/`directus_versions`) taken to the user before 0.6 closes.
- **Rollback [HUMAN]:** remove the two extension dirs over `ssh root@directus-apps`, restore the gate-0.5 compose, full-service restart, legacy smoke.

### Task 0.8 ph-connect `ph_apps_gateway` policy [HUMAN only]

- **[HUMAN]** read-only pre-check, then decide the allowlist (decision box in README-GATES; re-measure: ph-apps and ph-connect are both on 95.217.32.125 now, so the hairpin source is again a same-host/docker address):
  ```bash
  ssh root@95.217.32.125 docker exec <ph-connect directus container> printenv IP_TRUST_PROXY IP_CUSTOM_HEADER
  ```
- **[HUMAN]** in ph-connect Studio: create role + policy + static token exactly per spec §6.7 (`apps/connect/schema/app-share-link-v1.json` on `feat/links-app-share` is the record). Agents never touch ph-connect policies.
- **[HUMAN]** set `PH_CONNECT_URL=https://connect.pepperhorn.com` and `PH_CONNECT_GATEWAY_TOKEN` on the ph-apps service in Coolify UI (token typed there, never in chat).

### GATE 0.9-A Restart ph-apps so the gateway sees `PH_CONNECT_*`

```bash
PH_GATE_APPROVED=0.9-A deploy/phase0/gate-deploy.sh restart          # [HUMAN]
PH_GATE_APPROVED=0.9-A PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-prod-checks.sh legacy
```
- **Verify:** boot log `phrn.link sync on` (**[AGENT]** can read logs via MCP). **Rollback:** blank both values, `gate-deploy.sh restart`.

### GATE 0.8a Verify the policy [HUMAN]

```bash
ssh $PH_APPS_HOST 'docker exec -i -e PH_GATE_APPROVED=0.8a <new ph-apps directus container> sh -s -- --non-app-share-id <active non-app_share short_link id>' \
  < scripts/verify-ph-connect-policy.sh | tee /tmp/0.8a-allowlisted.txt; echo "exit=${PIPESTATUS[0]}"
read -rs PH_CONNECT_GATEWAY_TOKEN; export PH_CONNECT_GATEWAY_TOKEN
PH_GATE_APPROVED=0.8a PH_CONNECT_URL=https://connect.pepperhorn.com sh scripts/verify-ph-connect-policy.sh --from-non-allowlisted --spoof-ip <allowlisted address> \
  | tee /tmp/0.8a-non-allowlisted.txt; echo "exit=${PIPESTATUS[0]}"
unset PH_CONNECT_GATEWAY_TOKEN
```
- **Verify:** both `RESULT: ALL PROBES MATCH`, exit 0; the **[AGENT]** copies the two `/tmp` outputs into the phase 0 handover. **Rollback:** none (self-revoking).

### GATE 0.9-B phrn.link `APP_SHARE_HOSTS` and links deploy

- **Prerequisites:** PR of `feat/links-app-share` (`8357ab4`) merged to `pepperhorn-platform` main (**[AGENT]** can open the PR; **[HUMAN]** merges).
- **[AGENT after approval]** `mcp__ph-coolify__env_vars` set `APP_SHARE_HOSTS=tickle-me-ivories=https://ivories.pepperhorn.com` on `platform-links-new` `0jhknewbzvw3iucc9atia49f`, then `deploy`.
- **Verify [AGENT]:** `curl -sI https://phrn.link/<slug>` → 302 to `https://ivories.pepperhorn.com/s/<code>?utm_…`; a gateway share reaches `short_link_state='synced'` (human runs the share create with a test account).
- **Rollback [AGENT after approval]:** unset `APP_SHARE_HOSTS` or redeploy the previous links commit.

---

## 2. Phase 1: `@pepperhorn/app-sdk` (re-planned)

The spec §3 API stands. What changes is the repo bootstrapping and the target versions (zod 4 via `zod/v4`, React 19, TypeScript ~6.0, vitest 5, matching the tickle monorepo).

| # | Step | Who | Command / action | Verify | Rollback |
|---|---|---|---|---|---|
| 1.0 | Create the repo | **[HUMAN]** (or agent after approval; `gh` token has `repo`) | `gh repo create pepperhorn/app-sdk --public --license mit --description "PepperHorn client SDK" --clone` (into `~/app-sdk`) | `gh repo view pepperhorn/app-sdk` | `gh repo delete pepperhorn/app-sdk` (human) |
| 1.0b | npm identity and scope | **[HUMAN]** | `npm login` (browser/2FA); then `npm whoami` must print the account that owns the `@pepperhorn` scope. If no npm user/org `pepperhorn` exists: create the org `pepperhorn` on npmjs.com (free, public packages). | `npm whoami`; `npm access list packages @pepperhorn` | – |
| 1.1 | Scaffold | **[AGENT]** | tsup (ESM + d.ts, entries `.`, `./react`, `./ui`), vitest 5 + jsdom, `zod >=3.25 <5` and `react >=19` peers, CI `.github/workflows/ci.yml` (`npm ci && npm test && npm run build && npm run typecheck`) | build emits 3 entries; size check: `dist/index.js` has no `react` import | git revert |
| 1.2 | `core/client.ts`, `token-store.ts`, `schemas.ts` | **[AGENT]** | per spec §3.1; 429 → `rate_limited` + `retryAfterSec`, and **session 429 is retry, never sign-out** (gate 0.6 note); map Directus-format 400/401/413/429 bodies by status (0.4a carry) | unit tests over mocked fetch for every `PhErrorCode` | revert |
| 1.3 | `core/auth.ts`, `otp-flow.ts` | **[AGENT]** | code length **8**; `restore` keeps the token on network/5xx/429 | unit tests | revert |
| 1.3-live | Live auth smoke | **[HUMAN]** (mailed code) | `PH_SMOKE_EMAIL=<test mailbox> npx tsx scripts/smoke-auth.ts` (prompts for the code on a TTY) | devices listed; revoking current device → signed-out | delete test user via `gate-prod-checks.sh cleanup <tag>` |
| 1.4 | `core/saves.ts`, `core/shares.ts` | **[AGENT]** + **[HUMAN]** live smoke | `POST /saves` with `ifUpdatedAt` and no row → 409 (0.4b ruling); share code regex `/^\/s\/([A-Za-z0-9]{10})\/?$/` must match the gateway's base57 10-char codes | unit + live smoke (upsert, 409, anon revoke, private → null) | revert |
| 1.5 | `react/*`, `ui/*` | **[AGENT]** | spec §3.2 | Testing Library cases from plan 1.5 | revert |
| 1.6 | Release 0.1.0 | **[AGENT]** prepares; **[HUMAN]** publishes | agent: `npm pack --dry-run` listing reviewed (no `.env`, no tokens); human: `npm publish --access public --otp <2FA code>` | `npm view @pepperhorn/app-sdk version` → `0.1.0`; scratch Vite app sign-in round trip | `npm deprecate` (unpublish only within 72 h) |

**Depends on:** gates 0.5 + 0.6 live (1.3-live and 1.4 live smoke). Steps 1.0–1.5 unit work can run before the gates.

---

## 3. Phase 3: plugin, account UI, `/s/` route, opensongs, hosting (re-planned against the monorepo)

### 3.0 Pre-req decisions (user)

1. **How the plugin gets tickle's types.** The plan's `devDependency tickle-me-ivories via git` + `tickle-me-ivories/platform` no longer works: the root package is private and has no `./platform` export; the types now ship as `ivories/core` from `packages/ivories`. Options:
   - **(A, recommended)** publish `ivories` to npm (name is free; the package already has `files`, `license`, `prepack`) and devDepend `ivories` in the plugin with `import type … from 'ivories/core'`. **[HUMAN]** `npm publish --access public` from `packages/ivories`.
   - (B) devDepend a pinned `npm pack` tarball of `packages/ivories` attached to a GitHub release.
2. **Where ivories.pepperhorn.com runs.** Recommended: Coolify server `localhost` (95.217.32.125) like every `-new` app, which means **moving the DNS A record** off 208.87.135.48.
3. **Deploy branch.** The Coolify app should build `master`. `feat/ivories-mvp` (which contains `feat/platform-sdk`) must be merged to master first.
4. **Plugin bundle injection.** The open repo must not commit `tickle.config.json` or the plugin bundle (spec §2). Recommended: a generic Docker build arg `PLUGIN_BUNDLE_URL` + `PLUGIN_BUNDLE_SHA256` (empty = open build); the Dockerfile downloads the plugin's GitHub release asset, checks the sha256, writes `dist/plugins/<file>.js` and `dist/tickle.config.json`. No `@pepperhorn` string enters `packages/ivories/src` or `apps/studio/src` (the scope tests stay green).

### 3.1 `[plugin]` Scaffold and `./schema`

- **[HUMAN]** `gh repo create pepperhorn/tickle-ph-plugin --public --license mit --clone`.
- **[AGENT]** package exports `.` and `./schema`; deps `@pepperhorn/app-sdk@^0.1`, `zod`; devDep `ivories` (decision 1). tsup: `dist/tickle-ph-plugin.js` (single ESM, SDK + zod inlined) and `dist/schema.js`.
- **Schema is SceneV2-first:** `SceneSchema` accepts `v: 1 | 2` (V2 adds `layout: Layout`, `aspect: Aspect`; `SCENE_VERSION = 2`), `LookV1Schema`, `SongRefSchema`, `CAPS` (scene 256 KiB, look 16 KiB, 64 voices, 2–16 stops — **the client keeps the first 16 stops instead of refusing**, per the phase 2 ruling; the server schema should refuse > 16 to match spec §8.5, or truncate; decide), font regex `FONT_FAMILY_RE`. Type test: `z.infer<typeof SceneV2Schema>` assignable to `SceneV2` from `ivories/core`.
- **[AGENT]** then `[ext]`: replace the permissive `scene`/`look` validators in `~/ph-apps-extensions/endpoints/ph/src/apps.ts` with vendored `dist/schema.js`; gateway e2e: invalid → 400, anonymous midi → 403, 300 KiB → 413.
- **[PROD GATE, HUMAN]** gateway redeploy = a re-run of the 0.6 procedure with a new pin (`gate-deploy.sh 0.6` after re-pinning `ARTIFACTS.sha256`).

### 3.2 `[plugin]` Providers

- **[AGENT]** `src/{index,auth,storage,share,errors}.ts`; `activate(host)` builds `createPepperhornClient({ appSlug: 'tickle-me-ivories', appVersion: host.appVersion })`, `auth.restore()` unawaited. Storage decodes via `host.decodeScene` (returns `SceneV2`) and **rethrows `PayloadVersionError`**; signed-in `share()` = save as `link_view` → `createFromSave`; `match('/s/<code>')`.
- **[AGENT]** Release: tag `v0.1.0`, attach `dist/tickle-ph-plugin.js` to the GitHub release and record its sha256 (`gh release create v0.1.0 dist/tickle-ph-plugin.js` — **[AGENT after approval]**, public repo).

### 3.3 `[tickle]` Account UI and `/s/` route (current paths)

- `apps/studio/src/ui/AccountMenu.tsx`, `apps/studio/src/ui/SignInDialog.tsx` (`.account-menu`, `.sign-in-dialog`, `.otp-digit`; code length from `auth.codeLength`; Poppins; semantic class names alongside Tailwind).
- `apps/studio/src/main.tsx`: **`loadConfiguredPlugins` is not called anywhere yet**. Call it with a `TickleHost` (`appVersion`, `origin: location.origin`, `decodeScene: (u) => decodeScene(u)`, `decodeLook`). Pass the plain decoder: storage loads are not shared, and the share path already applies `{ shared: true }` in `useScenes`.
- `apps/studio/src/ui/useScenes.ts`: re-run `resolveShareFromLocation()` when `subscribePlatform` fires (the plugin installs after first render, so `/s/<code>` would otherwise miss); surface provider `PlatformError`s instead of the generic message (phase 2 carries).
- `apps/studio/src/studio/ScenesSection.tsx` / `ui/SharePanel.tsx`: show `shortUrl ?? url`, visibility picker when signed in; storage falls back to `getDefaults().storage` for local saves.
- **Verify [AGENT]:** tests with a fake `AuthProvider`; with no config file, no account UI and `apps/studio/dist` identical to the pre-change build except hashes (bundle diff).

### 3.4 `[tickle]` opensongs library

- `packages/ivories/src/core/platform/content/{OpenSongsContentProvider,songJsonToScore}.ts` (+ tests, exported from `ivories/core`), fixtures under `packages/ivories/src/core/platform/content/__fixtures__/`, `apps/studio/src/ui/LibraryPanel.tsx`; register the provider in `makeDefaults()` in `apps/studio/src/platform/registry.ts` (currently `content: []`).
- `OPENSONGS_DEFAULT_REF = '3a0a6ff8c5d6beff3a59a2058c094aa43811946b'` (opensongs-json `master` HEAD today; no tags exist).

### 3.5 `[opensongs]` Release tag [HUMAN approval: public repo]

- **[AGENT after approval]** `gh api repos/pepperhorn/opensongs-json/git/refs -f ref=refs/tags/v1.0.0 -f sha=3a0a6ff8c5d6beff3a59a2058c094aa43811946b` (lightweight tag) + README note.
- **Verify [AGENT]:** `curl -sI https://cdn.jsdelivr.net/gh/pepperhorn/opensongs-json@v1.0.0/index.json` → 200; bump the constant to `v1.0.0`.
- **Rollback:** delete the tag only if nothing references it yet.

### 3.6 `[tickle]` MIDI embedding

Unchanged in substance; files are `packages/ivories/src/core/platform/scene.ts` (midi ref builder, 128 KiB check) and the save flow in `apps/studio/src/studio/useSceneActions.ts` / `ScenesSection.tsx` (not `App.tsx`).

### 3.7 Host ivories.pepperhorn.com [PROD GATE: DNS and hosting]

| # | Step | Who | Command / action | Verify | Rollback |
|---|---|---|---|---|---|
| H1 | Dockerfile + nginx.conf in the tickle repo | **[AGENT]** | Root `Dockerfile`: `node:22-alpine` → `npm ci` at root → `npm run build` → copy `apps/studio/dist` → `nginx:alpine`. Optional build args `PLUGIN_BUNDLE_URL`/`PLUGIN_BUNDLE_SHA256` (decision 4). `nginx.conf`: `try_files $uri $uri/ /index.html` (covers `/s/*`), long cache for `/assets/*`, no-cache for `index.html` and `tickle.config.json`, CSP header below. | `docker build .` locally; `docker run -p 8080:80`; `/s/AbCdEfGhJk` returns index.html | revert commit |
| H2 | Merge to master | **[HUMAN]** | merge the PR for `feat/ivories-mvp` (agent opens it) | CI green | revert merge |
| H3 | DNS | **[HUMAN]** | Registrar DNS panel for pepperhorn.com (NS `ns*.nameserver.net.au`): change `ivories` A **208.87.135.48 → 95.217.32.125** (TTL 3600 or lower). No AAAA. | **[AGENT]** `dig +short @ns1.nameserver.net.au ivories.pepperhorn.com` and `dig +short @1.1.1.1 ivories.pepperhorn.com` both → `95.217.32.125` | restore the old A value |
| H4 | Check Coolify's GitHub App can see the repo | **[AGENT]** read-only | `mcp__ph-coolify__github_apps action=list_repos` (source id 1) contains `pepperhorn/tickle-me-ivories`; if not, **[HUMAN]** adds the repo to the GitHub App installation in GitHub settings | repo listed | – |
| H5 | Create the Coolify app | **[AGENT after approval]** | `mcp__ph-coolify__application` create: project new "Tickle Me Ivories" (or existing), server `localhost` `okswskg88cggsw8g80w0cwwk`, destination `x04swkcko8c0s8g4c00sw4cs`, GitHub App source, repo `pepperhorn/tickle-me-ivories`, branch `master`, build pack `dockerfile`, `/Dockerfile`, port 80, fqdn `https://ivories.pepperhorn.com`, health check `/`. Build args for the plugin left **empty** for the first deploy (open build). | app listed; `diagnose_app ivories.pepperhorn.com` healthy | `application delete` (approved) |
| H6 | First deploy (open build) | **[AGENT after approval]** | `mcp__ph-coolify__deploy` | **[AGENT]** `curl -sI https://ivories.pepperhorn.com` → 200 with a valid Let's Encrypt cert; `/s/AbCdEfGhJk` → 200 HTML; `/tickle.config.json` → 404; CSP header present; audio plays (manual) | stop app / redeploy previous |
| H7 | Plugin-enabled deploy | **[AGENT after approval]** | set build args `PLUGIN_BUNDLE_URL=https://github.com/pepperhorn/tickle-ph-plugin/releases/download/v0.1.0/tickle-ph-plugin.js`, `PLUGIN_BUNDLE_SHA256=<release sha>`; redeploy | `/tickle.config.json` 200; account menu appears | clear the args, redeploy |
| H8 | Production e2e | **[HUMAN]** (mailed codes, two browsers) | plan 3.7 steps 1–5: sign in, save scene + look, share → phrn.link 302 → `/s/<code>`, private window preview/apply/fork, set private → 404, device list + revoke | all five pass; record in the phase 3 handover | – |

**CSP (corrects spec §9.3):**

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:;
connect-src 'self' https://apps.pepperhorn.com https://cdn.jsdelivr.net https://fonts.googleapis.com
            https://smpldsnds.github.io https://gleitz.github.io https://goldst.dev;
media-src 'self' blob: data:; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; object-src 'none'
```

(`style-src 'unsafe-inline'` covers Tailwind v4/Vite injected styles in dev only if needed; drop it if the production build has no inline `<style>`. Verify in the browser console for CSP violations before H7.)

---

## 4. Agent vs human summary

- **Agent can run now, no approval needed (local or read-only):** 0.R code re-targeting and tests in `~/ph-apps-extensions`; phase 1 steps 1.1–1.5 once the repo exists; phase 3 code (3.1–3.4, 3.6, H1) in local branches; read-only checks (`curl`, `dig`, `gh repo view`, MCP `list_*`/`get_*`/`logs` without `reveal`).
- **Agent after a named approval:** 0.3-B MCP field meta; 0.9-B env + deploy on `platform-links-new`; plugin GitHub release; opensongs tag; Coolify app create/deploy (H5–H7); opening PRs.
- **Human only:** every SSH/tailnet step and every gate script run (0.3-A, 0.5, 0.6, 0.9-A, 0.8a); Coolify compose edits and snapshot copy; Task 0.8 policy + token; the entitlement decision; `gh repo create` for app-sdk / tickle-ph-plugin (plan rule); `npm login` + `npm publish --otp`; DNS A record change; merges to master/main; mailed-code steps of every smoke.

---

## 5. Stale paths and interfaces in the 2026-09-26 plan and spec

### 5.1 Infrastructure (README-GATES and `deploy/phase0/*.sh`)

| Stale | Current |
|---|---|
| ph-apps service `hif8kzgzwxtxjc59vyieazue` | `aoreoe0bxhko4whbvuniymix` (old one exited) |
| directus sub-app `g11nvpnn3helo8meq3m3bhab`; containers `directus-/postgresql-/redis-/tailscale-hif8…` | sub-app `lhufufsbw8cgvdhdtndctbex`; container names to confirm on the host |
| sidecar uuid `w8kivuho52zu5fdebd37ki9l` | `icvxzehqt5xem5t33xhw0g5g` (tailnet name `directus-apps` still present, 100.103.147.69) |
| coolify-2 89.233.105.209 as ph-apps/ph-connect host; `PH_APPS_HOST=root@<coolify-2>` | Coolify `localhost` server, public 95.217.32.125 |
| ph-connect `logo04wws088k0oo00wgw8o4`, `root@100.100.209.25` | `vt4necyu23qh26xsvpdtnbbf`, `directus-connect` 100.107.9.20 |
| `platform-links` `dovjdtikfecbtdsqhgtqi8qj` | `platform-links-new` `0jhknewbzvw3iucc9atia49f` |
| `snapshots/ph-apps-compose-raw.2026-09-26.yml` as rollback target | needs a 2026-10 snapshot of the new service |
| `/data/coolify/services/hif8…/` rendered compose path | `/data/coolify/services/aoreoe0bxhko4whbvuniymix/` (confirm) |
| Directus "12.1.1" | digest `sha256:27fd2914…`, version unconfirmed |
| "Tailscale sidecar image `:latest` (M8)" | pinned by digest now |
| Spec §9.3 CSP `connect-src` list | must add smplr sample hosts (see §3.7) |

### 5.2 Tickle code paths (plan phases 2–3, spec §2, §4, §8)

| Plan / spec says | Now |
|---|---|
| `src/platform/types.ts` | `packages/ivories/src/core/platform/types.ts`, exported from `ivories/core` |
| `src/platform/registry.ts` | `apps/studio/src/platform/registry.ts` |
| `src/platform/errors.ts` | `packages/ivories/src/core/platform/errors.ts` |
| `src/platform/{scene,look,songRef}.ts` | `packages/ivories/src/core/platform/{scene,look,songRef,codec}.ts` |
| `src/platform/local/{LocalStorageProvider,HashShareProvider}.ts` | `packages/ivories/src/core/platform/local/` |
| `src/platform/content/{OpenSongsContentProvider,songJsonToScore}.ts` | not built; put in `packages/ivories/src/core/platform/content/` |
| `src/settings/profile.ts` (`FONT_FAMILY_RE`, `isSafeFontFamily`) | `packages/ivories/src/core/settings/profile.ts` |
| `src/ui/googleFont.ts`, `src/ui/StageText.tsx` | `packages/ivories/src/react/text/{googleFont.ts,StageText.tsx}` |
| `src/ui/{ScenesPanel,SharePanel,SharedPreviewBanner}.tsx` | `apps/studio/src/ui/` (+ `ui/useScenes.ts`, `studio/ScenesSection.tsx`, `studio/useSceneActions.ts`) |
| `src/ui/{AccountMenu,SignInDialog,LibraryPanel}.tsx` | to create in `apps/studio/src/ui/` |
| `src/main.tsx` (call `loadConfiguredPlugins`) | `apps/studio/src/main.tsx`; **no call exists yet** |
| share flow "in `App.tsx`" | `apps/studio/src/ui/useScenes.ts` (`resolveShareFromLocation`) and `studio/useSceneActions.ts` |
| `public/tickle.config.json`, `public/plugins/tickle-ph-plugin.js` | `apps/studio/public/` (build-time injected, never committed) |
| `package.json "exports": {"./platform": "./src/platform/types.ts"}` | removed; root package is private `tickle-me-ivories` with no exports; `packages/ivories` exports `.`, `./core`, `./style.css` |
| `import type … from 'tickle-me-ivories/platform'` (plugin) | `import type … from 'ivories/core'` |
| devDep `tickle-me-ivories` via git | not installable (workspace subpackage); publish `ivories` or use a tarball |
| header comment of `types.ts` and `types.test.ts` "package.json exposes this file as `./platform`" | stale comments (types now reach consumers as `.d.ts` from `dist/types/core`) |
| `SceneV1` in `SaveInput`, `StorageProvider.load`, `ShareProvider.share/update`, `TickleHost.decodeScene` | `SceneV2` (`v: 2`, adds `layout`, `aspect`); `SceneV1` kept for upgrade; `SCENE_VERSION = 2`; `readEnvelope(…, maxVersion)` |
| `SceneV1Schema` (plugin `./schema`), "`v` literal 1" (spec §8.5) | scene schema must accept `v: 1 \| 2`; look stays `v: 1` |
| `decodeScene(u)` | `decodeScene(u, { shared?: boolean })` |
| "gradient stops 2–16, refuse" | client keeps the first 16 (phase 2 ruling) |
| `grep -r "@pepperhorn" src` smoke test | `packages/ivories/src/core/platform/smoke.test.ts` (scans `packages/ivories/src`) and `apps/studio/src/pepperhornScope.test.ts` |
| `npm run dev -- --host 0.0.0.0` | `npm run dev` (studio script already binds 0.0.0.0) |
| Registry default `content: [OpenSongsContentProvider]` | `content: []` until 3.4 |
| Task 3.7 "[user] adds the DNS record" | record exists but points at 208.87.135.48 (`ph3`); must move to 95.217.32.125 |

---

## 6. Blockers, in order

1. **Migration drift:** gate package targets the exited pre-migration service (step 0.R + re-approval).
2. **Directus licence entitlement** `custom_permission_rules_enabled` for GATE 0.3-A step P (or a STOP/redesign decision).
3. **Repos and npm:** `pepperhorn/app-sdk`, `pepperhorn/tickle-ph-plugin` missing; npm not logged in; `@pepperhorn` npm scope ownership unverified.
4. **Type source for the plugin:** decide (A) publish `ivories` or (B) tarball.
5. **Unmerged work:** `feat/ivories-mvp` → tickle master; `feat/links-app-share` → pepperhorn-platform main; `~/ph-apps-extensions` has no remote.
6. **DNS:** `ivories` A record points at the old server.
