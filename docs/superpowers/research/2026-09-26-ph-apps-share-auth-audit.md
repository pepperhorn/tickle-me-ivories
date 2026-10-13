# ph-apps share-link and user-save audit, for tickle-me-ivories

Date: 2026-09-26. Read-only audit. Nothing was created, updated or deleted in Directus, Coolify or any repo.

Target: `apps.pepperhorn.com`. Coolify service `hif8kzgzwxtxjc59vyieazue` (project `phapps-directus`), image `directus/directus:12.1.1`. The local compose `~/ph-apps-extensions/docker-compose.v12.yml` matches that image.

## Sources and method

- **ph-apps MCP:** all flows (`flows read`), all operations of the six auth and save flows, the schema and fields of `shortcoder`, `app_user_saves`, `app_sessions`, `app_users`, `otp_codes`, `email_templates` and `directus_files.uploaded_by_app_user`, and aggregate row counts.
- **Refused:** the MCP `items` tool refuses `directus_permissions` and `directus_policies` ("Cannot provide a core collection"). **The live ACL could not be read directly.** Permissions below come from:
  - anonymous read-only `GET` probes against the live API (no token);
  - `~/jamee/docs/AUTH.md`, the documented App User policy;
  - client code: `~/chordee2/src/lib/cloudShare.ts`, `cloudSave.ts`, `library/publicLibraryPlugin.ts`, `~/drumlet/src/drumlet/drumletBridge.ts`, `~/jamee/src/directus/{saves,assets}.ts`, `~/dottl/src/directus/docs.ts`, `~/module/src/state/useUserPatchSync.ts`;
  - `~/ph-apps-extensions/hooks/app-session-auth/src/index.ts`, the only custom extension.
- **Prior audit:** `~/pepperhorn-platform/apps/connect/docs/superpowers/specs/2026-09-06-otp-security-assessment-design.md` §5 (findings A–L). I re-checked its findings A, B and G against the live flows today, and they are still present.
- **Coolify env var keys (values masked):** there is no `RATE_LIMITER_*` and no `MAX_PAYLOAD_SIZE`. `FILES_MAX_UPLOAD_SIZE` is set, but its value is masked.

### Live data snapshot (MCP aggregates)

| Collection | Rows |
|---|---|
| `shortcoder` | **0 rows** (no share link has ever been persisted) |
| `app_user_saves` | 1 row: `drumlet / preset / private` |
| `app_sessions` | dottl 2, drumlet 7, jamee 5, module 4. All `active`, none revoked. **No `chordee` session has ever been created.** |
| `otp_codes` | chordee: 1 (unused), dottl: 5, drumlet: 26, jamee: 7, module: 19. `max(attempts) = 0` everywhere. |
| `email_templates` | Published `otp` templates for **drumlet, jamee, dottl only**. There is no chordee template and no module template. |

---

## 1. Anonymous share links (`shortcoder`)

### How they are created

- **Mechanism:** not a Flow, and not a custom endpoint. No shortcoder Flow exists; the full flow list is below. The only extension is the `app-session-auth` hook.
- **Who uses it:** the only client is **chordee** (`~/chordee2/src/lib/cloudShare.ts`, added in chordee2 commit `4a16d6b`). It does a direct `POST https://apps.pepperhorn.com/items/shortcoder`:
  - **Anonymous share** (`createAnonymousShortcode`, `cloudShare.ts:103`): no `Authorization` header. The body is `{code, app_slug:"chordee", kind:"chart", anonymous_payload:<chart>, visibility_at_create:"link_view", view_count:0}`.
  - **Owned share** (`createOwnedShortcode`, `cloudShare.ts:62`): sent with the Bearer session token. It first PATCHes `app_user_saves.visibility`, then reuses an existing code for `(app_slug, kind, chart_external_id, created_by)` or POSTs a new one with `chart_external_id` and `created_by`.
  - Drumlet and jamee **do not** use shortcoder (grep across `drumlet/src`, `jamee/src`, `dottl/src` finds nothing). The collection note says "used by chordee, drumlet, jamee"; that is aspirational.
- **Does it work?** Anonymous create relies on a Public-policy **create** grant on `shortcoder`. I could not confirm whether that grant exists: the MCP refuses `directus_permissions`, and I did not test with a write. Evidence that it never worked end to end:
  - the table has 0 rows;
  - **Public has no read on `shortcoder`.** `GET /items/shortcoder` with no token returns `403 FORBIDDEN: You don't have permission to access collection "shortcoder"`.
  - chordee has never completed an OTP sign-in (see §3), so the owned path has never run either.

### Controls

| Control | Status | Evidence |
|---|---|---|
| Code generation | Client-side: 10 characters from a 57-symbol alphabet using `crypto.getRandomValues`, about 58 bits (`cloudShare.ts:44-55`). The server accepts any string up to 32 characters. | `shortcoder.code` is `varchar(32)` |
| Collision handling | DB `UNIQUE` on `code` (`is_unique:true`). The client retries up to 5 times on 400/409. Uniqueness is global, not per app. | fields read; `cloudShare.ts:84-101` |
| Rate limiting | **None.** No Directus rate limiter env var on the live service or in the compose file, and nothing in Flows. | Coolify env keys; compose |
| Payload size limit | **Only Directus's default JSON body limit.** `MAX_PAYLOAD_SIZE` is not set, so the default of about 1 MB applies. `anonymous_payload` is an unbounded Postgres `json` column. | Coolify env keys; fields |
| Payload validation | **None server-side.** The client validates with zod only when reading (`ChordChartSchema.parse`). | `cloudShare.ts:176` |
| Spam / abuse control | **None.** No captcha, no per-IP cap, no `app_slug` allowlist (any string up to 64 characters), no expiry or cleanup. | schema; flows list |
| Integrity | `created_by` is client-supplied and has a **dangling relation** (`related_collection: null`, no FK). The "mutually exclusive" rule between `chart_external_id` and `anonymous_payload` is only a field note. There are no indexes on `app_slug` or `chart_external_id`. | fields read |

### How codes are resolved

- **Client-side, not via a Flow.** `resolveShortcode` (`cloudShare.ts:182`) does:
  1. `GET /items/shortcoder?filter[code][_eq]=…&filter[app_slug][_eq]=chordee`, with or without a token.
  2. If `anonymous_payload` is set, it returns it.
  3. Otherwise it does `GET /items/app_user_saves?filter[external_id][_eq]=<chart_external_id>` and applies the visibility rules **in the browser**: `private` hides the save from non-owners, `link_edit` lets signed-in users edit, and signed-in non-owners can fork.
- **`view_count` is bumped by the client**, as a read-modify-write `PATCH /items/shortcoder/<id> {view_count: n+1}` (`cloudShare.ts:245`). That needs Public or App User **update** on `shortcoder`, which lets anyone rewrite any row's `anonymous_payload`, `code` and so on unless the grant is field-limited. It is also racy. There is no server-side "resolve" Flow.
- **Today anonymous resolve cannot work:** Public read on `shortcoder` is denied (probe above), and Public read on `app_user_saves` is denied too (`GET /items/app_user_saves` returns 403).
- Owned-share resolve by another signed-in user also fails under the documented App User policy. Its read filter is `app_user._eq=$CURRENT_USER` (`jamee/docs/AUTH.md`, Permissions table), so non-owners cannot see `link_view`, `link_edit` or `public` saves.
- chordee's "Community" library (`publicLibraryPlugin.ts`) handles this silently: it returns `[]` on a non-OK response.

**Bottom line:** shortcoder is a schema with no server logic. The design depends on broad Public or App User grants that either don't exist (read) or would be unsafe if they did (create and update with no validation or rate limit).

---

## 2. Owned saves (`app_user_saves`)

### Schema facts

| Field | Type / constraint |
|---|---|
| `app_user` | FK → `app_users` (real FK) |
| `app_slug` | `varchar(50)` |
| `kind` | `varchar(50)`; dropdown with `allowOther:true` |
| `external_id` | `varchar(128)` |
| `name` | `varchar(128)` |
| `payload` | `json` NOT NULL, unbounded |
| `visibility` | `varchar(32)`, default `private` |
| `forked_from` | `varchar(64)`, string, not an FK |
| `status` | `published` / `archived` |

**There is no unique index on `(app_user, app_slug, kind, external_id)`** (the field note claims one) **and no indexes at all** besides the PK. Upserts are therefore find-then-write and can race into duplicate rows.

### Two parallel access paths exist

**Path A: webhook Flows, used by drumlet** (`drumletBridge.ts:11-13`). All are `POST https://apps.pepperhorn.com/flows/trigger/<id>`, `error_on_reject:true`, `return:"$last"`, and every operation runs with `permissions:"$full"`:

| Flow | Id | Body | Response |
|---|---|---|---|
| Saves — List | `55b04a7b-a384-4d75-ac8c-68439054dcbf` | `{token, app_slug}` | `{success, saves:[{id, external_id, name, kind, payload, visibility, date_created, date_updated}]}`: the caller's `published` rows for that app, max 500 |
| Saves — Upsert | `ffd9c4cc-5e14-46a6-a011-7baebba7f171` | `{token, app_slug, external_id, name, kind, payload}` | `{success, external_id}` |
| Saves — Delete | `e2594d40-dde4-4c93-b42e-88d8bac288c6` | `{token, app_slug, external_id}` | `{success, deleted, external_id}` |

- **Ownership:** each flow runs `find_session` against `app_sessions` (token + `app_slug` + `status=active` + `expires_at>$NOW`), then `check_session` throws if nothing is found. Every read and write is filtered by `app_user = check_session.app_user_id`.
- **App scoping:** a session only works for the `app_slug` it was issued for. That is good isolation.
- **Gaps:**
  - Upsert never writes `visibility` or `forked_from`.
  - Upsert and Delete match on `(app_user, app_slug, external_id)` **without `kind`**.
  - There is no payload size or shape validation.
  - There is no "read someone else's shared save" flow.

**Path B: direct `/items/app_user_saves` with `Authorization: Bearer <app_sessions.token>`, used by chordee, jamee, dottl and module.**

- **Hook:** `~/ph-apps-extensions/hooks/app-session-auth/src/index.ts` runs at `middlewares.before`. For a UUID-shaped Bearer it:
  1. looks up `app_sessions` (active, not expired);
  2. lazily creates a mirror `directus_users` row with `id = app_users.id` and role **App User `b37d2baa-d374-4f47-ae53-bd8519c75a4a`**;
  3. lazily mints a static `directus_users.token`;
  4. swaps the request header to that token;
  5. bumps `last_access`.

  **The hook ignores `app_slug`**, so a session issued to any app authenticates as the user for every collection the policy allows.
- **Policy:** "App User" policy `57a8bd98-9b24-49e6-9df2-02583a93a395`, as documented in `jamee/docs/AUTH.md`. I could not read it live.

  | Action | Filter | Fields / preset |
  |---|---|---|
  | create | — | fields `app_user, app_slug, kind, external_id, name, payload, status, sort`; preset `app_user=$CURRENT_USER` |
  | read | `app_user._eq=$CURRENT_USER` | `*` |
  | update | `app_user._eq=$CURRENT_USER` | fields `name, payload, status, sort` |
  | delete | `app_user._eq=$CURRENT_USER` | — |

- **Ownership:** enforced by the Directus `$CURRENT_USER` filter. That works because the mirror user id equals `app_users.id`.
- **What the documented policy does not allow, but chordee relies on:**
  - writing `visibility` (`patchSaveVisibility`) or `forked_from` (`forkChart`) is outside the create and update field lists;
  - reading other users' shared or public saves.

  Either the policy was widened after AUTH.md was written (unverifiable), or those chordee features fail. Given that chordee has never signed anyone in, they have never been exercised.
- **Cross-app writes:** there is no `app_slug` scoping in the policy. A tickle-me-ivories token could read, overwrite or delete the same user's drumlet, jamee or chordee saves.

### How link_view, link_edit and public reads are served

**Nowhere server-side.** No Flow, endpoint or known permission serves a non-owner read filtered by visibility. Public read of `app_user_saves` is denied (probe), and the documented App User read is owner-only. `link_edit` enforcement is purely a client decision (`canEdit` in `cloudShare.ts:223`). Even if non-owner reads were granted, a non-owner PATCH would be blocked by the owner-only update filter, so `link_edit` cannot work as designed.

---

## 3. OTP auth Flows

All three are `POST https://apps.pepperhorn.com/flows/trigger/<id>` with a JSON body. They are webhook triggers, unauthenticated, and use `accountability:"all"`.

### Send Code — `40f96a57-1ab0-4031-a7f5-9a32ec877d15`

- **Options:** `{method:"POST", return:"$all"}`, with **no `error_on_reject`**.
- **Request:** `{email, app_slug}`.
- **Chain:**
  1. `validate_input` (condition: `email` and `app_slug` not null)
  2. `rate_check` (`otp_codes` rows for the same email + `app_slug` where `date_created >= $NOW(-1 minute)`)
  3. `check_rate_limit` (throws `Rate limited`)
  4. `generate_otp` (`Math.random` 6 digits, 10-minute TTL)
  5. `find_user`
  6. `store_otp` (inserts `otp_codes`)
  7. `get_template` (`email_templates` where `app_slug = body.app_slug`, `template_type=otp`, `status=published`)
  8. `prepare_email` (op `f7d68513-…`; replaces `{{otp_code}}` and `{{expires_minutes}}`, and **hard-codes `{{app_name}}` → `"Drumlet"`**)
  9. `send_email` (mail operation, SES SMTP)
- **Response:** because `return:"$all"`, the HTTP response contains the whole data chain, **including `generate_otp.otp_code`**. This is prior-audit finding A, still live today. Clients ignore the body.

### Verify Code — `65da02e3-4742-4c5a-8bc5-3bb114fb6557`

- **Options:** `{return:"$last", error_on_reject:true}`.
- **Request:** `{email, otp_code, app_slug, app_version?, device_label?}`. `user-agent` and `x-forwarded-for` headers are captured into the session.
- **Chain:**
  1. `validate_input`
  2. `find_otp` (email + `app_slug`, `used=false`, `expires_at>=$NOW`, `attempts<5`, newest first)
  3. `check_otp_exists`
  4. `verify_otp_match` (plain `!==`)
  5. `check_match`: on mismatch, returns `{success:false, message:"Invalid code" | "No valid OTP found"}`; on match, runs `mark_otp_used`
  6. `find_existing_user` (by email, exact match)
  7. `gen_session_token` (`Math.random` UUID, 30-day expiry; lowercases the email)
  8. create `app_users` if new (handle `User<base36>`), then create an `app_sessions` row
- **Response:** `{success:true, token, expires_at, user:{id, email, user_handle, first_name, last_name}, is_new_user}`.
- **Defects (prior findings B, C, J, still live):**
  - `attempts` is **never incremented**. `max(attempts)=0` across all rows, so the 5-try limit is fictitious, and there is no Verify rate limit. A 6-digit code can be brute-forced within its 10-minute window.
  - OTP and session token use `Math.random`.
  - The flow looks users up by exact email but creates them lowercased, so mixed-case emails can create duplicate users.
  - `used_at` is never set.

### Verify Session — `11dd60ca-fc66-4396-9461-858b7bbf2df8`

- **Options:** `{return:"$last", error_on_reject:true}`.
- **Request:** `{token, app_slug}`.
- **Response:** `{valid:true, user:{id, email, user_handle, first_name, last_name}}` or `{valid:false}`.
- The session must match `app_slug`.

### Is `app_slug` registered anywhere?

- **There is no allowlist.** Flows accept any string.
- **An `email_templates` row with `app_slug=<slug>`, `template_type="otp"`, `status="published"` is effectively required.** Without it, `get_template` returns `[]`, `prepare_email` throws on `template.subject`, and **no email is sent**. Because the flow has no `error_on_reject`, the client still receives HTTP 200.
- This is exactly why **chordee sign-in has never worked**: `otp_codes` has 1 unused chordee row, there are 0 chordee sessions, and there is no chordee template.
- Existing templates: drumlet `0ed7e411-1709-4b2c-aa34-e10923a95c65`, jamee `30799fdf-143a-4c24-9e94-92d633211e83`, dottl `e25846f8-14eb-4ff8-bd4a-693607ce5842`.
- **The template's `{{app_name}}` will render as "Drumlet"** unless the template hard-codes its own name, which is what the existing ones do in their subjects.

### CORS

- `CORS_ENABLED=true`, `CORS_ORIGIN=true` (reflects any origin), `CORS_CREDENTIALS=true`, methods `GET,POST,PATCH,DELETE`, headers `Content-Type,Authorization`.
- A live preflight from `Origin: https://tickle-me-ivories.example` returned `204` with `access-control-allow-origin` echoing that origin.
- **No CORS change is needed for a new origin.** `PUT` is not allowed, and neither is any custom header.

### Rate limiting

| Scope | Limit |
|---|---|
| Send | Only the per-(email, `app_slug`) 1-per-minute check inside the flow. The email is not normalised before the check, so case variants bypass it. No per-IP or global cap. |
| Verify | None |
| Directus built-in rate limiter | Not enabled (no `RATE_LIMITER_*` env on the live service) |

---

## 4. File uploads (MIDI)

- **Can a session-token user upload?** Yes, via standard `POST /files`, multipart, Bearer session token. Jamee already does this (`~/jamee/src/directus/assets.ts:7-12`, `uploadFiles`).
- **Upload settings:** `FILES_MAX_UPLOAD_SIZE` is set on the service (value masked). TUS resumable uploads are on (`TUS_ENABLED=true`). Storage is S3.
- **Ownership:** the custom field `directus_files.uploaded_by_app_user` is a uuid FK → `app_users`, `SET NULL` on delete. Per AUTH.md, the App User policy has:

  | Action | Filter / preset | Fields |
  |---|---|---|
  | create | preset `uploaded_by_app_user=$CURRENT_USER` | — |
  | update | `uploaded_by_app_user._eq=$CURRENT_USER` | `title, description, tags, folder` |
  | delete | `uploaded_by_app_user._eq=$CURRENT_USER` | — |

- **Visibility is not enforced.** App User **read on `directus_files` is unfiltered**: any signed-in app user can read any file's metadata and `/assets/<id>`, including other users' uploads. There is no per-file visibility field and no MIME-type restriction.
- **Public access:** Public appears to have *some* read grant on `directus_files`. An anonymous `GET /files?fields=id` fails on a field-level `tus_id` permission error, not the collection-level 403 that `shortcoder` gives. Whether anonymous `/assets/<id>` works for app-user uploads is unverified.
- **For link-shared MIDI:** either rely on unguessable file UUIDs plus a Public read grant (weak), or serve MIDI through the same share endpoint (below).

---

## 5. Gaps for `app_slug = "tickle-me-ivories"`, and recommendation

The slug is 17 characters, which fits `app_slug varchar(50)` and `varchar(64)`.

### (a) Sign in via OTP

1. **Required:** create an `email_templates` row: `app_slug="tickle-me-ivories"`, `template_type="otp"`, `status="published"`, with `subject` and `body_html` using `{{otp_code}}` / `{{expires_minutes}}`. Hard-code the app name, because `{{app_name}}` renders "Drumlet".
2. No CORS work is needed. Clients call the three flows with `app_slug:"tickle-me-ivories"` and send `app_version`.
3. **Strongly recommended before inviting users, since these affect every app:**
   - change Send Code to `return` a fixed `{success:true}` (not `$all`) and set `error_on_reject:true`;
   - increment `otp_codes.attempts` on mismatch and rate-limit Verify;
   - use `crypto.randomInt` / `crypto.randomUUID`;
   - normalise email before every lookup;
   - replace the hard-coded "Drumlet" with a per-template `app_name`.

   These are the prior audit's A, B, C and J, still unfixed.
4. There is no server-side logout (finding D). Tickle's logout can only clear `localStorage`.

### (b) Create anonymous links

Nothing works today. Public read is denied, the create grant is unverified, and there is no resolve logic, validation, rate limit or size cap. **Do not grant Public create, read or update on `shortcoder`**: that would expose unbounded, unvalidated, rewritable JSON storage to the internet. Instead, add server logic, preferably **one endpoint extension** in `~/ph-apps-extensions` (for example `endpoints/share`), which can use `crypto`, services and a real rate limiter, unlike the Flow exec sandbox:

- `POST /share` `{app_slug, kind, payload}`:
  - validate that `app_slug` is in an allowlist and apply per-app payload schema and size caps (for tickle, maybe 64–256 KB);
  - rate-limit per IP;
  - generate the code server-side and retry on the unique violation;
  - write with admin accountability, and set `created_by` from the session if present.
- `GET /share/:code`:
  - return the payload (inline, or from the owned save if its visibility is not `private`);
  - atomically increment `view_count` (`UPDATE … SET view_count = view_count + 1`);
  - use no Directus permissions.

If this has to be Flows only, you need two new webhook flows: Share-Create, with a caller-IP or global throttle read from `$trigger.headers.x-forwarded-for` and a length check, and Share-Resolve. Flows cannot do an atomic increment, and code collision retry is awkward.

### (c) Create, read and update owned saves with visibility

- Rows can go in `app_user_saves` with no schema change: `kind` allows other values, for example `"arrangement"` or `"session"`.
- **Missing pieces:**
  1. Writes to `visibility` and `forked_from`. Either extend the Saves — Upsert flow `ffd9c4cc-…`, or add these to the App User create and update field lists, constrained by validation to the 4 values.
  2. A non-owner read path for `link_view`, `link_edit` and `public`. Use the share endpoint above; a flat App User or Public read grant filtered by `visibility._in` would expose every app's shared payloads to enumeration.
  3. If `link_edit` is wanted, a server-side edit path, because owner-only update blocks non-owners.
  4. A unique index on `(app_user, app_slug, kind, external_id)`, plus indexes on `(app_slug, visibility)` and `external_id`.
  5. Include `kind` in the Upsert and Delete flow match.
- **Prefer the Flow path (Path A) or the endpoint over `/items`,** because they check the session's `app_slug`. The `/items` path lets a tickle token touch the user's other apps' saves.

### (d) Optionally upload MIDI

- Works today via `POST /files` with the session token (ownership via the `uploaded_by_app_user` preset).
- **Not enforced:** read visibility (every app user can read every file), MIME type, and per-app folder. Setting these requires ACL changes, which I could not verify.
- **Recommended alternative:** MIDI files are typically 5–100 KB. Store them base64 inside the save or share payload, with a cap of about 256 KB after the per-app size check. This avoids `directus_files` entirely and inherits the save's visibility rules. Use `directus_files` only if large files become a requirement, and then serve them via the share endpoint rather than widening the `/assets` read grant.

### Recommendation: reuse `app_user_saves` + `shortcoder` or a dedicated tickle collection?

**Reuse both tables, but put a server-side gateway in front of them. Don't add a dedicated collection yet.**

- **Queryability:**
  - Tickle's needs are "list my saves" and "resolve this link". The shared envelope already covers both via `app_slug` and `kind`.
  - A dedicated collection only pays off if you need server-side filtering or search on payload fields (tempo, key, song title) or a public gallery sorted by them. `chordl_boards` shows that pattern: promoted columns plus a full JSON blob. You can migrate to it later by promoting fields out of `payload`.
- **Payload validation:** neither option validates anything by itself. Directus field validation cannot check JSON shape. Validation has to live in a Flow or endpoint either way, so a dedicated table buys nothing here. Put a per-`app_slug` schema and size check in the share/save gateway.
- **Size:** the limits are identical, because both use Postgres `json` with a roughly 1 MB request cap. Enforce the cap in the gateway.
- **Per-app permissions:**
  - This is the real argument *for* a dedicated table. Directus permissions are per collection, so a `tickle_*` collection gets its own clean rules and blast radius.
  - But with the current `/items` model the App User policy is not app-scoped anyway, and the right fix is to go through app-scoped Flows or endpoints. Once all tickle access goes through a gateway that checks `session.app_slug`, per-collection permissions matter much less.
  - Adding a collection also means duplicating the session, visibility and share logic that shortcoder was built to centralise.
- **Caveat:** reusing means tickle inherits the shared-infrastructure defects above. Fix at least Send Code's `$all` return, Verify attempt counting, and the email template before launch. Those fixes benefit every app.

---

## Appendix: full ph-apps flow list (live)

| Id | Name | Trigger |
|---|---|---|
| `40f96a57-1ab0-4031-a7f5-9a32ec877d15` | OTP — Send Code | webhook POST, `return:$all` |
| `65da02e3-4742-4c5a-8bc5-3bb114fb6557` | OTP — Verify Code | webhook POST |
| `11dd60ca-fc66-4396-9461-858b7bbf2df8` | OTP — Verify Session | webhook POST |
| `55b04a7b-a384-4d75-ac8c-68439054dcbf` | Saves — List | webhook POST |
| `ffd9c4cc-5e14-46a6-a011-7baebba7f171` | Saves — Upsert | webhook POST |
| `e2594d40-dde4-4c93-b42e-88d8bac288c6` | Saves — Delete | webhook POST |
| `f5ee0470-2a97-4a79-b11c-f4c2a2824071` | chordl — Render API v1 | webhook POST |
| `18b373a6-abba-4383-871a-9e8eb308a304` | Open in Drumlet | manual |
| `313f9351-1367-45eb-86ba-bfe94fe75c50` | Add YouTube first result to Song(s) | manual, no operations |
| `5e7a0bc1-b1a1-4011-9545-63759b248fc8` | Add YouTube first result to songs.youtube_example | manual |

There is no shortcoder, resolve, revoke or cleanup flow.

## Open verification items (needs admin access to the ACL)

1. Live Public policy grants on `shortcoder` (create and update) and on `directus_files` (read and asset access).
2. Live App User policy `57a8bd98-…`: whether the field lists now include `visibility` and `forked_from`, and whether any non-owner read rule exists.
3. The value of `FILES_MAX_UPLOAD_SIZE`.
