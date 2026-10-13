# Step 0.R report: phase 0 gate package re-targeted (2026-10-13)

Repo `~/ph-apps-extensions`, branch **`chore/gate-retarget`** (from `feat/app-access` 9c9b7a2, which contains `feat/platform-gateway` plus app-access; both carry the same latest README-GATES 5f9c830). Pushed to `origin` (private `pepperhorn/ph-apps-extensions`).

- `2247098` Step 0.R: re-target the phase 0 gate package to the post-2026-10-03 estate
- `115abe8` Step 0.R: fix two new preflight test patterns. **Candidate `PH_APPROVED_COMMIT` = `115abe841d6edd5d19bbc8b35940cbb431db482b`** (approval for GATE 0.3-A only; see "Still open" for 0.5).

Nothing touched production. Only read-only checks were used: ph-coolify MCP `get_service`, `service list_containers`, `env_vars list` (masked, no reveal), `get_application`, `list_servers`, `get_version`, plus `curl` of public endpoints, `dig`, Docker Hub tag lookups and `tailscale status`.

## Live findings

| Item | Value |
|---|---|
| ph-apps service | `aoreoe0bxhko4whbvuniymix` ("directus-with-postgresql-hif8kzgzwxtxjc59vyieazue-new"), Coolify server `localhost` = 95.217.32.125, created 2026-10-03 |
| sub-apps | directus `lhufufsbw8cgvdhdtndctbex` (healthy, https://apps.pepperhorn.com); postgresql `xdc4qbymvenwiuen8qdgugy9`; redis `a942sjwd9mgmvioajdpcp4rn`; tailscale `icvxzehqt5xem5t33xhw0g5g` (tailnet `directus-apps` 100.103.147.69) |
| **Directus version** | **12.1.1**. Image `directus/directus@sha256:27fd2914…` is the manifest digest of Docker Hub tags `12.1` and `12.1.1`. This is the version the package was rehearsed on, so **F3 (the otp-bearer shim) and the `ph_uid` guard assumptions are unchanged** and no re-rehearsal is needed. The human still confirms it inside the container. |
| **Licence** | `LICENSE_KEY` and `SERVICE_DIRECTUS_LICENSE_KEY` are **both defined** on the service (masked; presence only). The public `/server/info` shows `license.source=env` with entitlements `production_enabled=true`, `ai_translations_enabled=true`, `display_powered_by=OIG`. `custom_permission_rules_enabled` is **not** in the public view. Recorded as entitlement decision **(c), pending** the [HUMAN] `gate-permissions.sh read`. |
| ph-connect | `vt4necyu23qh26xsvpdtnbbf`, directus `ui9pwddheurn5kh9cvdaj2ws` (12.2.0), tailnet `directus-connect` 100.107.9.20, same host |
| phrn.link | `platform-links-new` `0jhknewbzvw3iucc9atia49f` |
| DNS | apps, connect and phrn.link resolve to 95.217.32.125, with no AAAA records |
| **Coolify API** | The ph-coolify MCP reads `https://coolify-hz.piranha-bitterling.ts.net:8443` (Coolify 4.3.23; servers localhost, coolify-2 and ph3). **`coolify.pepperhorn.com` now resolves to a different host** (tailnet 100.107.150.14 `ph-coolify-control`; public 208.87.135.223) and refuses :443. The scripts' Coolify URL was changed to coolify-hz. The user's `COOLIFY_API_TOKEN` must come from that instance. **Please confirm this is right.** |
| Compose | The MCP now masks `docker_compose_raw` entirely (`***`). **A compose snapshot cannot be captured without `reveal`.** The masked service metadata was saved instead: `deploy/phase0/snapshots/ph-apps-service.2026-10-13.mcp-masked.json`. |

## What changed (deploy/phase0, migrations/RUNBOOK.md, scripts/verify-ph-connect-policy.sh comment)

- **`gate-deploy.sh`:**
  - service, app and Coolify URL are hard-coded to the new ids. The sidecar stays `root@directus-apps`.
  - The refusal list covers ph-connect old and new (`vt4nec…`, `ui9pwdd…`, `logo04…`, `bscswo…`, `100.107.9.20`, `100.100.209.25`, `directus-connect`) and the exited `hif8…`/`g11nvpnn…`.
- **`gate-set-env.sh`:** the allow-list is now `aoreoe0…`, through coolify-hz.
- **`gate-backup.sh`, `ph-apps-psql.sh`, `gate-secret-floors.sh`, `gate-prod-checks.sh`:**
  - container defaults are `*-aoreoe0bxhko4whbvuniymix`, and the guards require that uuid;
  - ph-connect's comparison container is `directus-vt4necyu23qh26xsvpdtnbbf`, and the ph-apps container is refused in that role;
  - `PH_APPS_HOST` is still mandatory with no default. The guidance now names `root@95.217.32.125`.
- **`gate-permissions.sh` (a behaviour fix, flagged):**
  - Signal 1 now reads the admin `GET /license`, ported from app-access 9c9b7a2.
  - The old `/server/info` read could never see the entitlement, so step P would always have STOPped, even on the licensed instance.
- **`build-artifacts.sh`:**
  - Tar modes are now normalised. The 2026-09-26 tarball digests were a umask-0002 build and did not reproduce under umask 0022; the content digests were identical.
  - `ARTIFACTS.sha256` is re-pinned. The pins (6db718a / a05da24) and all content digests are unchanged; only the three tarball lines changed.
- **README-GATES:**
  - new targets table, 0.R facts (migration, DNS, licence, version, M8 resolved), and a [HUMAN] step 0.R confirmation block;
  - snapshot, rollback and preflight rows updated, plus the 0.8 hairpin box, 0.8a containers, 0.9-B app and pins.
- **Env template:** header ids and the IP_TRUST_PROXY note.

## Tests (all offline, all green at 115abe8)

- `test/test-gate-deploy-preflight.sh 115abe8`: ALL PASS. Added: refusal of the new ph-connect sidecar, service and app; refusal of the exited ph-apps service and app; refusal when Coolify JSON has only the old app; trailing N1 flags with the new and old ids.
- `test/test-gate-set-env.sh`: ALL PASS (19). Added allow-list refusals of `vt4nec…` and `hif8…`, and that the dry run names `aoreoe0…`. The temp-file check now ignores `/tmp/claude-*`, where agent-harness noise had caused one flaky miss.
- **new** `test/test-retarget-ids.sh`: ALL PASS (25). It covers:
  - the hard-coded ids;
  - stale ids only inside refusal lists;
  - no `PH_APPS_HOST` default, with every SSH script refusing without it and no ssh attempted;
  - refusal of stale or foreign containers;
  - refusal of wildcard and wrong-gate approvals.
- **new** `test/test-gate-permissions-license.sh`: ALL PASS (18). The old code fails 9 of these checks.
- `scripts/test-verify-ph-connect-policy.sh`: ALL PASS.
- `build-artifacts.sh --check 115abe8`: all digests reproduce.

## Still open before GATE 0.5 (not needed for 0.3-A)

- [HUMAN] Container names, version and the extensions volume, using the commands in README-GATES "Step 0.R".
- [HUMAN] Compose UI copy to `/tmp/live-compose.yml`. Then [AGENT] saves `snapshots/ph-apps-compose-raw.2026-10-13.yml`, re-bases the gate-0.5/0.6 composes (the live image is a digest, not `:12.1.1`), regenerates the diffs and hashes, and asks for a new re-approval. **Until then the 0.5/0.6 target composes are rebased on the pre-migration snapshot and must not be pasted.**
- Confirm that coolify-hz is the Coolify API to use.

## [HUMAN] commands for GATE 0.3-A (your own terminal, after approving 115abe8)

```bash
bash
cd ~/ph-apps-extensions && git fetch && git checkout chore/gate-retarget
# 0.R confirmation first (read-only); paste only names + version into chat
ssh root@95.217.32.125 'docker ps --format "{{.Names}}\t{{.Image}}" | grep -E "aoreoe0bxhko4whbvuniymix|vt4necyu23qh26xsvpdtnbbf"'
ssh root@95.217.32.125 'docker exec directus-aoreoe0bxhko4whbvuniymix node -e "console.log(require(\"/directus/package.json\").version)"'
export PH_APPROVED_COMMIT=115abe841d6edd5d19bbc8b35940cbb431db482b
export PH_APPS_HOST=root@95.217.32.125
export PH_PSQL="$PWD/deploy/phase0/ph-apps-psql.sh -q -t -A"
set -o pipefail
read -rs DIRECTUS_ADMIN_TOKEN; export DIRECTUS_ADMIN_TOKEN PH_ADMIN_TOKEN="$DIRECTUS_ADMIN_TOKEN"
export PH_TEST_MAILBOX=<mailbox> PH_LEGACY_EXISTING_EMAIL=<drumlet account> PH_JAMEE_URL=<jamee URL>
PH_GATE_APPROVED=0.3-A deploy/phase0/gate-backup.sh
PH_GATE_APPROVED=0.3-A PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-permissions.sh read    # confirms (c): signal 1 must be true
PH_GATE_APPROVED=0.3-A PH_BASE=https://apps.pepperhorn.com deploy/phase0/gate-permissions.sh apply   # only if signal 1 = true (its own approval)
# SQL 0-4 per migrations/RUNBOOK.md piped to $PH_PSQL (PH_GATE_APPROVED=0.3-A exported)
# step 5: restart directus sub-app lhufufsbw8cgvdhdtndctbex (Coolify UI, or approved MCP restart_application)
PH_GATE_APPROVED=0.3-A PH_BASE=https://apps.pepperhorn.com PH_LEGACY_CASING_PROBE=1 deploy/phase0/gate-prod-checks.sh legacy
```

If the container names differ from `postgresql-/directus-aoreoe0bxhko4whbvuniymix`, export `PH_APPS_PG_CONTAINER` (it must still contain the uuid), or ask the agent to change the default and re-run the tests. Changing the default changes the commit, so the new commit needs re-approval.
