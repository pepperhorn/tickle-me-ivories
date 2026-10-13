# Survey: extracting `@pepperhorn/app-sdk`

Read-only research. No repos were modified. Scope: `~/drumlet`, `~/chordee2`, `~/jamee`,
`~/module`, `~/pepperhorn-platform`, `~/directus-otp-auth`, plus the target
`~/tickle-me-ivorys`.

**Headline finding: this isn't a green-field extraction.** `drumlet/ARCHITECTURE.md` and
`chordee2/ARCHITECTURE.md` already contain an identical, detailed `@pepperhorn/app-sdk`
proposal (MIT, package layout, migration plan — reproduced in §5). `drumlet/TS-MIGRATION.md`
says the SDK extraction was blocked on porting drumlet to TypeScript first ("the SDK can
only support one source of truth"), and `drumlet/src/plugins/runtime.ts` literally has the
comment "The eventual @pepperhorn/app-sdk surface lives here." So the prior art already
answers most of the "where should this go" questions — what's new here is: a second and
third and fourth implementation now exist (jamee, module) that the original two-repo plan
didn't see, they've *diverged* in ways that matter, and there's a brand-new backend
(`directus-otp-auth`) that should change the SDK's auth transport before it's built.

---

## 1. Every client-side auth/save/share implementation found

All four apps talk to the same shared Directus instance, `https://apps.pepperhorn.com`,
using the **same three legacy Flow-trigger UUIDs** (confirming one shared backend):

| Flow | UUID |
|---|---|
| Send/request OTP | `40f96a57-1ab0-4031-a7f5-9a32ec877d15` |
| Verify OTP | `65da02e3-4742-4c5a-8bc5-3bb114fb6557` |
| Verify session | `11dd60ca-fc66-4396-9461-858b7bbf2df8` |

### drumlet (TypeScript)
- `src/state/useAuth.ts` — hook-per-instance state (`useState`/`useCallback`, no Context/singleton).
- `src/components/AuthModal.tsx`, `src/components/UserMenu.tsx` — plain Tailwind, zero UI-library deps.
- Exports: `useAuth(): UseAuthReturn { user, isLoggedIn, isLoading, isNewUser, setIsNewUser, requestOtp, verifyOtp, updateProfile, logout }`, types `AuthUser`, `VerifyOtpResult`.
- Backend calls: `POST {API_BASE}/{FLOW_ID}` with `{ email, app_slug }` / `{ email, otp_code, app_slug }` / `{ token, app_slug }`; profile update is `PATCH /items/app_users/:id` with `Authorization: Bearer <token>`.
- Token storage: `localStorage['drumlet-session-token']`. Also persists the **in-flight OTP step** to `localStorage['drumlet-auth-flow']` (`{step, email, codeSentAt}`, expires after 10 min) so a page refresh mid-OTP resumes at the code-entry step.
- Session verify on mount: yes, `POST /flows/trigger/{FLOW_VERIFY_SESSION}`.
- Sign-out: clears token + user + `isNewUser`.
- **Error handling is the most mature of the four**: `friendlyError()` maps 429→"too many attempts", 5xx→generic safe message (never leaks Directus's raw internal text), 4xx→backend message passed through. `isNetworkError()` distinguishes `TypeError` (offline/DNS/CORS) from HTTP errors and **keeps the stored token** on a transient 5xx or network failure during session-verify — only a definitive `{valid:false}` clears it. Comment explicitly explains why (a server hiccup must not force re-login).
- Saves/library go through **dedicated Flow webhooks**, not direct `/items` calls — see §3.
- Zod: none in `useAuth.ts` itself (the codebase has zod as a dep, used elsewhere per TS-MIGRATION.md's stated policy of validating every network boundary).
- React 19.2, Vite 8, TypeScript 6, zustand not used for auth (component state only).

### chordee2 (TypeScript port of drumlet's auth — the task's "TS port of useAuth")
- `src/lib/auth/useAuth.ts`, `src/lib/auth/AuthContext.tsx` (`AuthProvider`/`useAuthContext`), `src/components/auth/AuthModal.tsx`, `src/components/auth/AccountButton.tsx`.
- Same exported shape as drumlet plus **`token` is exposed on the returned object** (drumlet does not expose it — callers there use a private `getStoredToken()`). Exposing `token` is what lets `cloudSave.ts`, `cloudShare.ts`, `publicLibraryPlugin.ts` and `ShareResolver.tsx` build their own `Authorization` headers directly against `/items/*`.
- Wraps `useAuth` in a React Context (`AuthProvider`) — drumlet does not; each drumlet component that needs auth calls `useAuth()` itself (separate instances, not shared state — a latent bug class if drumlet ever needs auth in two places at once).
- **Error handling is weaker than drumlet's**: no network-vs-HTTP distinction, and the mount-time session-verify's `.catch(() => clearToken())` will **log the user out on a transient network failure**, not just on a genuinely invalid session — a regression drumlet's version deliberately avoids.
- UI: shadcn/Radix (`@/components/ui/{dialog,button,input,label}`) + `lucide-react` icons, not plain Tailwind.
- React 19.2, Astro 6 host, TypeScript 5.9, Zod 3.25, zustand 5 (used for the chart-editor store, not auth), no `@directus/sdk` dependency at all — pure `fetch`.

### jamee
- `src/state/useAuth.ts`, `src/ui/AuthModal.tsx`, `src/state/authModal.ts` (a tiny zustand store just for modal open/close — `useAuthModal`), `src/directus/client.ts`, `src/directus/saves.ts`.
- **Only implementation using the official `@directus/sdk`** for saves (`readItem`/`readItems`/`createItem`/`updateItem`/`deleteItem` against a typed `Schema`), though auth itself is still raw `fetch` against the Flow URLs (`unwrapFlowResponse()` handles Directus's `{data:{...}}` / `{$last:{...}}` envelope variations defensively — none of the others do this).
- **No session verify on mount** — trusts the cached `(token, user)` pair from `localStorage['jamee-session-user']` until the first API call 401s (comment: "App.tsx's project-load catch handler clears auth on 401"). This is a deliberate simplification vs. drumlet/chordee2 hitting `FLOW_VERIFY_SESSION` eagerly.
- `docs/AUTH.md` is an explicit **canonical cross-app doc** ("Canonical doc shared across the three PepperHorn end-user apps... copy verbatim into each repo's docs/") — see §3 for why this matters; it documents an `app-session-auth` Directus hook extension that swaps the client's opaque session UUID for a real static Directus token server-side, which is what makes direct `/items/*` REST calls with `Authorization: Bearer <session-token>` actually work.
- React 19.2, Vite 6, Zustand 5, Zod 3.25, `@directus/sdk` 17.

### module
- `src/state/useAuth.ts`, `src/components/AuthModal.tsx`, `src/components/UserMenu.tsx`, `src/state/useUserPatchSync.ts`.
- **Architecturally distinct from the other three**: a module-level singleton (`let state`, `Set<Listener>`, `setState()` broadcasting to subscribers) rather than per-hook `useState` or React Context. `useAuth()` just subscribes. This means auth state is shared across the whole app without a Provider tree, and there's a non-React escape hatch (`getAuthSnapshot()`) for code outside components. This is the pattern closest to what a real SDK's framework-agnostic core needs (see §5).
- `postFlow<T>()` centralizes the fetch-a-flow boilerplate the other three repeat inline.
- `useUserPatchSync.ts` is a fourth, distinct **save pattern**: offline-first local store + debounced (1.2s) diff-push to `/items/app_user_saves`, plus a pull-merge-on-login reconciliation (newer `createdAt` wins, local-only rows pushed, remote-only rows pulled in). This is the most sophisticated sync strategy found and a strong candidate for the SDK's optional `useSyncedSaves`.
- React 19.0 (oldest pin of the four), Zustand 5, no Zod, no `@directus/sdk`.

### Backend counterpart: `directus-otp-auth` (new, not yet adopted by any of the four apps)
This is a **from-scratch Directus extension replacing the Flow-trigger OTP system** all
four apps currently use (`SPEC.md` line 1173: "Delete the old flows; drop `otp` /
`otp_codes` / `app_sessions`."). Status per its README: "implemented, tested, and live on
one instance — `ph-connect`" (2026-09-08), not yet cut over anywhere else.
- Routes: `POST /code`, `POST /verify`, `GET /session`, `POST /logout`, `POST /logout-all`, `GET /sessions`, `DELETE /sessions/:id`, `POST /purge`.
- **Multi-slug aware by design**: every identity route takes an optional `appSlug` so one Directus instance serving several app slugs doesn't cross-wire sessions in one cookie jar (`INV-17`) — a real bug class the doc walks through in detail (§7/§11a of `SPEC.md`).
- **Transport is configurable**: `OTP_AUTH_TRANSPORT = cookie | bearer | both`. Cookie mode is httpOnly/secure/`sameSite=lax`, cookie name `otp_auth_session__<appSlug>` (per-slug so multiple apps don't clobber each other's `Set-Cookie`). This is materially more secure than today's `localStorage`-token pattern (no XSS-exfiltratable token) and should be the SDK's default transport once this extension is live broadly — a note for whoever builds the SDK, since none of the four surveyed apps target it yet.
- Origin allowlisting (`x-otp-auth-key`, HMAC'd under a server-side pepper) can restrict `/code` and `/verify` per caller — relevant if the SDK is ever embedded in third-party or lower-trust contexts.

---

## 2. drumlet vs. chordee2: differences and which is the better base

| Aspect | drumlet | chordee2 | Better |
|---|---|---|---|
| Error classification | 429/5xx/4xx mapped to safe user messages; network errors kept distinct from HTTP errors | Generic `err?.errors?.[0]?.message` fallback only | **drumlet** |
| Transient-failure resilience | Keeps token on 5xx/network blip during session verify | Clears token (logs the user out) on *any* verify failure, including network | **drumlet** |
| Shared state | Component-local `useState` per call site (no Context) | `AuthContext`/`AuthProvider` — one source of truth app-wide | **chordee2** |
| `token` exposure | Private (`getStoredToken()` only) | Returned from the hook — needed by `cloudSave`/`cloudShare`/library plugins | **chordee2** (a real gap in drumlet if it ever adds cloud saves — see §3) |
| Saves backend access | Custom Flow webhooks (`FLOW_UPSERT/LIST/DELETE`), explicitly avoiding direct `/items` | Direct `/items/app_user_saves` REST + Bearer token | **chordee2** — matches jamee's `docs/AUTH.md` canonical model; drumlet's comment ("hitting items directly... skipped all of that and never triggered the flows") appears to be based on a stale/incorrect understanding, since the `app-session-auth` hook is documented to make direct REST access work correctly. This is a live discrepancy worth resolving before picking a base. |
| UI dependencies | Zero (plain Tailwind + native `<input>`/`<button>`) | Radix + shadcn primitives + `lucide-react` | **drumlet** for a headless/dependency-light SDK; chordee2's is nicer out of the box but harder to make framework-agnostic |
| OTP digit paste/auto-submit UX | Handles paste across multiple digit boxes, auto-focuses, auto-submits | Same logic, slightly terser | tie |
| In-flight flow persistence (survive refresh mid-OTP) | Yes (`drumlet-auth-flow` in localStorage, 10 min TTL) | Yes, same pattern | tie |

**Recommendation:** neither is a drop-in "better base" — take **drumlet's error handling and
resilience**, **chordee2's Context + `token` exposure**, and **module's singleton-store
pattern** (§1) as the actual SDK core, rather than picking one file wholesale. The two
`ARCHITECTURE.md` docs already reached this same "carve out then generalize" conclusion
(§5), they just didn't have jamee/module's variants to compare against yet.

---

## 3. Share/save: shortcodes, saves, visibility, fork

The fullest implementation is **chordee2's `cloudSave.ts` + `cloudShare.ts`**
(`~/chordee2/src/lib/cloudSave.ts`, `~/chordee2/src/lib/cloudShare.ts`,
`~/chordee2/src/components/share/ShareResolver.tsx`). Collections used:
`app_user_saves` (owned saves) and `shortcoder` (share codes).

- **Saves are upserted by `(app_user, app_slug, kind, external_id)`**: `findExisting()` filters on all four before deciding PATCH vs POST. `external_id` is the chart's own stable `meta.id` (a UUID minted client-side at document creation), not the Directus row id — this is what lets a chart be re-saved/re-shared without leaking Directus internals into the app's own document model.
- **Shortcode generation**: 10-char, base57 alphabet (`23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ` — digits/letters minus `0/1/I/O/l` to avoid visual ambiguity), via `crypto.getRandomValues`. Collision handling: try insert, retry up to 5 times on `400`/`409`, otherwise fail loudly.
- **Owned shortcode** (`createOwnedShortcode`): (1) PATCH the source save's `visibility`; (2) reuse an existing shortcode for that `(chart_external_id, created_by)` pair if one exists (re-snapping `visibility_at_create` if it changed); (3) else mint a fresh code. Row shape: `{code, app_slug, kind, chart_external_id, created_by, visibility_at_create, view_count}` — no payload stored, it's resolved live from `app_user_saves` each time.
- **Anonymous shortcode** (`createAnonymousShortcode`): no auth required; the full chart JSON is stored inline as `anonymous_payload` on the `shortcoder` row itself (there's no owning save to point at).
- **Resolving `/c/<code>`**: `resolveShortcode({code, token, userId})` — anonymous payload is read inline; owned payload requires a second lookup into `app_user_saves` by `chart_external_id`, and **a private visibility on the source save returns `null` even to the direct-link holder** (owner revocation takes effect immediately, no caching). Ownership, `canEdit` (`isOwner || (visibility==='link_edit' && loggedIn)`), and `canFork` (`!isOwner && loggedIn && visibility!=='private'`) are all computed here, once, and returned as a flat `ResolvedShare` object — this is a clean seam to standardize in the SDK. View-count bump is fire-and-forget (`.catch(()=>{})`), never blocks the read.
- **`ShareResolver.tsx`** is the mount-once React glue: waits for `auth.isLoading` to settle (so anonymous vs. owner detection is correct), matches `window.location.pathname` against `/^\/c\/([A-Za-z0-9]+)\/?$/`, and calls `openSharedDocument(chart, {readOnly, canFork, activeShare})` on the app's own Zustand store. This app-store coupling is the one piece that must stay app-specific — the SDK should hand back `ResolvedShare` and let the host app decide what to do with it.
- **Fork** (`forkChart`): clones the chart with a fresh `meta.id` (new share root, breaks the link to the old shortcode/visibility) and `forked_from` pointing at the source id, saved as a new **private** row under the forker's account.
- **Public library** (`~/chordee2/src/lib/library/publicLibraryPlugin.ts`): a read-only feed of `visibility=public` saves across all users, joined to `app_user.{first_name,last_name,email}` for attribution, exposed through the plugin registry (see §5/§6) as a `LibraryPlugin` with `fetchCollections`/`onActivate`.

**drumlet has no server-side share/shortcode system at all.** Its "share" is
`src/state/shareCodec.ts` + `src/components/ShareModal.tsx`: a fully client-side, versioned
(`v: 1|2|3`), compact base64url encoding of the sequencer state into the URL hash
(`#s=...`), decoded on load with no network round-trip. This is a legitimate, simpler
alternative worth keeping in the SDK's surface as an **offline/anonymous share mode** —
useful precisely for an app like tickle-me-ivories that wants zero backend dependency.

drumlet's **saves** (`~/drumlet/src/drumlet/drumletBridge.ts`) go through three more
Flow webhooks (`FLOW_UPSERT/LIST/DELETE`, distinct UUIDs from auth) rather than direct
`/items/app_user_saves`, with the explicit rationale in a code comment that flows validate
the session against `app_sessions` and stamp `app_user` server-side — but per jamee's
`docs/AUTH.md` (§1), that validation+stamping is exactly what the `app-session-auth` hook
already does transparently for direct REST calls too, via policy presets
(`app_user_saves.create` preset sets `app_user=$CURRENT_USER`). This looks like avoidable
duplication/drift rather than a real necessity — worth a ruling before the SDK locks in one
access pattern (recommend: direct REST, chordee2/jamee's approach, since it's the
documented canonical model and needs one fewer moving part).

**module's** save layer (`useUserPatchSync.ts`, §1) is the fourth pattern: offline-first
local store, debounced push, pull-merge-on-login by `createdAt`. Good candidate for an
opt-in "sync mode" alongside chordee2's explicit imperative save/list/load/delete API.

**Zod on the save/share payloads**: chordee2 validates every payload coming back off the
wire with `ChordChartSchema.parse(...)` (`~/chordee2/src/lib/schema.ts`, Zod 3.25, ~230
lines of nested chord/measure/section schemas) — the save/share layer itself has no
independent schema for the `app_user_saves`/`shortcoder` **rows** (those are typed as
plain TS interfaces, not Zod), only the `payload` field's app-specific content is
validated. jamee does the opposite: `SaveRowSchema` (Zod) validates the **row** shape but
leaves `payload: z.unknown()` unvalidated. **The SDK should do both** — a Zod schema for
the generic save/shortcode row envelope (`app_user`, `app_slug`, `kind`, `external_id`,
`visibility`, etc.), with `payload`/`anonymous_payload` deliberately left as
`z.unknown()` or a generic type parameter for the host app to validate itself.

---

## 4. UI components: paths, styling, dependencies, headless feasibility

| Component | Path | Styling | Extra deps |
|---|---|---|---|
| drumlet `AuthModal` | `~/drumlet/src/components/AuthModal.tsx` | Raw Tailwind utility classes on native elements | none |
| drumlet `UserMenu` | `~/drumlet/src/components/UserMenu.tsx` | Raw Tailwind | none |
| chordee2 `AuthModal` | `~/chordee2/src/components/auth/AuthModal.tsx` | Tailwind + shadcn `Dialog`/`Button`/`Input`/`Label` | `@radix-ui/react-dialog`, `@radix-ui/react-label`, `class-variance-authority`, `tailwind-merge` |
| chordee2 `AccountButton` (their "UserMenu") | `~/chordee2/src/components/auth/AccountButton.tsx` | Tailwind + `lucide-react` icons | `lucide-react` |
| jamee `AuthModal` | `~/jamee/src/ui/AuthModal.tsx` | Raw Tailwind | none |
| module `AuthModal`/`UserMenu` | `~/module/src/components/{AuthModal,UserMenu}.tsx` | Raw Tailwind | none |

All six already use the **contextual/semantic class-name convention** (`auth-modal`,
`auth-otp-digit`, `account-menu-logout`, `user-menu-signout`, etc.) alongside Tailwind
utilities — i.e. they already follow exactly the pattern this project's own CLAUDE.md
mandates, which is a good sign for reuse: a headless SDK component just needs to keep
emitting those class hooks and let the host supply utility classes.

**Headless feasibility:** yes, cleanly, for three of the four. drumlet/jamee/module's
modals contain zero markup that depends on a component library — they're `<div>`/`<input>`/
`<button>` with Tailwind classes and could be split into a logic layer (step machine,
OTP-digit focus management, resend/backoff) + a render layer without much rework. chordee2's
is the odd one out: its `AuthModal` imports shadcn `Dialog` (built on Radix), so making it
headless means either (a) shipping the SDK's default UI as chordee2-style-but-Radix-free
(drumlet's approach, generalized), with a **separate optional shadcn skin** for apps that
already have shadcn in their tree, or (b) making the SDK genuinely headless (hooks +
ARIA-correct unstyled primitives, no Radix/no Tailwind assumption) and letting every app —
including chordee2 — supply its own presentation, which is more work up front but is the
only option that also serves a Tailwind v4/no-Radix app like tickle-me-ivories cleanly.
Recommend (b), matching the two `ARCHITECTURE.md`'s own two-layer proposal in §5.

---

## 5. Proposed SDK API surface and package layout

drumlet's and chordee2's `ARCHITECTURE.md` (identical text in both, so treat it as one
document already agreed) proposes exactly this shape — reproduced and refined below with
what this survey adds.

```
@pepperhorn/app-sdk/          MIT, TypeScript
  src/
    core/                     framework-agnostic, zero React
      client.ts               fetch wrapper: base URL, app_slug, error normalization
                               (adopt drumlet's friendlyError()/isNetworkError() — the
                               only implementation that gets this right)
      auth.ts                 auth state machine as a plain observable/store
                               (module's Set<Listener> singleton pattern, not a hook —
                               so non-React callers and multiple React trees share one
                               session)
      saves.ts                save/list/load/delete + upsert-by-external_id
      shortcodes.ts           generate/resolve/createOwned/createAnonymous/fork
                               (lift directly from chordee2's cloudShare.ts — it's
                               already framework-agnostic)
      types.ts                AuthUser, VerifyOtpResult, SaveRow<T>, ShortcodeRecord,
                               ResolvedShare<T>, Visibility
      schemas.ts               Zod: row/envelope schemas only (see §3) — payload stays
                               generic (`z.ZodType<T>` param or `z.unknown()`)
      plugins.ts               PluginManifest (drumlet's discriminated union: kind ∈
                               {library,mode,capability}, capabilities: string[],
                               licenseTier), registry, createPluginRuntime
    react/
      useAuth.ts               thin hook over core/auth.ts's store
                               (useSyncExternalStore, not useState — avoids drumlet's
                               "no shared state across call sites" gap)
      AuthContext.tsx           optional Provider (chordee2's pattern) for apps that want
                               it; useAuth() also works standalone via the singleton
      useSaves.ts               imperative (chordee2-style) + useSyncedSaves.ts
                               offline-first debounced variant (module's pattern) as a
                               separate opt-in hook, not forced on everyone
      useShortcode.ts           wraps ShareResolver's mount-once resolve-from-URL logic,
                               parameterized by the host's own route pattern (not
                               hardcoded to /c/<code>)
    ui/                        optional, unstyled-by-default
      AuthModal.tsx, UserMenu.tsx, ShareDialog.tsx — headless (render-prop or
      data-attribute driven), ship with drumlet's plain-Tailwind version as the
      *reference* skin apps can copy-and-restyle rather than import-and-fight
  package.json
  README.md
```

**Build tooling.** None of the six surveyed repos currently build a *library* — they're
all apps (Vite for drumlet/jamee/module, Astro+Vite for chordee2). Two reasonable options:
**tsup** (esbuild-based, trivial multi-entry-point config for `core`/`react`/`ui`, dual
ESM+CJS+`.d.ts` with almost no config) or **Vite library mode** with `vite-plugin-dts`
(more consistent with what every consumer already runs, but multi-entry lib mode + external
`react`/`zod` peer-dep config is more boilerplate than tsup's equivalent). Recommend
**tsup**: it's the standard choice for this exact shape of package (framework-agnostic core
+ optional React subpath + optional UI subpath) and the consuming apps don't need to share
tooling with the SDK's own build — only its output matters to them.

**What must stay app-specific** (per the `ARCHITECTURE.md` "open questions" section,
confirmed by this survey):
- The audio engine, chart/pattern domain model, and any app's own Zustand store — the SDK
  only ever hands back typed data (`ResolvedShare<T>`, `SaveRow<T>`) and the host wires it
  into its own state.
- `ShareResolver`'s route-matching (`/c/<code>` is chordee2's own convention) — parameterize
  it, don't hardcode a path.
- License/entitlement UI (drumlet's own `ARCHITECTURE.md` plugin-licensing section, plugin
  bundle hosting/signed URLs) — real but separate work, not needed for a v1 extraction.
- Whichever save-transport ruling from §3 (Flow webhooks vs. direct REST) needs a decision
  by whoever owns `apps.pepperhorn.com` before the SDK's `saves.ts` is written — building it
  against direct REST when the "correct" answer turns out to be Flow-mediated (or vice
  versa) means rewriting `saves.ts`.
- The SDK should target the **new `directus-otp-auth` extension's** routes/transport
  options once it's rolled out beyond `ph-connect`, not the legacy Flow-trigger UUIDs — but
  since none of the four apps have cut over yet, the pragmatic v1 either supports both
  (`transport: 'flow-legacy' | 'otp-auth-extension'` config) or targets the legacy Flows
  now and adds the new extension as a second backend adapter later. Migration plan §292-297
  of `ARCHITECTURE.md` didn't anticipate this backend replacement — flag it back to whoever
  is driving that cutover.

---

## 6. tickle-me-ivories as a zero-dependency optional plugin host

Confirmed: **tickle-me-ivories currently has no ph-apps dependency whatsoever.**
`package.json` deps are `@fontsource/poppins`, `@tonejs/midi`, `react`, `react-dom`,
`smplr`, `tonal`, `zustand` — nothing Directus/auth-related. Persistence
(`~/tickle-me-ivorys/src/settings/profile.ts`) is 100% local: `saveProfile`/`loadProfile`/
`saveGlobals`/`loadGlobals` read/write `localStorage` directly, wrapped in try/catch
("localStorage can throw (private mode, quota). Persistence is a convenience..."). This is
the ideal shape for an optional-plugin design — there's a real local default to fall back
to, not a stub.

**No `PLUGIN.md` exists anywhere** in any of the six repos (checked `~/chordee2`,
`~/drumlet`, `~/jamee`, `~/module`, plus a home-directory-wide search) — that part of the
brief doesn't have a source to reuse verbatim. What *does* exist, and is the closest thing
to a manifest/capability runtime, is two different plugin systems:

- **drumlet's `src/plugins/runtime.ts`** — a discriminated-union `PluginManifest` (`kind:
  'library'|'mode'|'capability'`, plus `capabilities: string[]`, `commercial: boolean`,
  `licenseTier: 'core'|'pro'`), a static array today, explicitly commented as the future
  `@pepperhorn/app-sdk` surface, with `getCapability(id)`/`getLibraryCollections()`
  accessors keyed by manifest kind.
- **chordee2's `src/lib/plugins/{types,registry}.ts`** — simpler: `PluginMeta` (`id, name,
  version, description, icon, licensing: 'free'|'subscription'|'third-party',
  enabledByDefault`) + a `Map`-based `registerPlugin`/`activatePlugin`/`deactivatePlugin`
  registry with `init`/`activate`/`deactivate` lifecycle hooks and cleanup-function tracking.

**Recommendation for tickle-me-ivories:** don't adopt either wholesale — synthesize a
narrow, capability-scoped interface the *core app* defines and owns (so the app has zero
import from any `@pepperhorn/*` package), which an optional package
(`@pepperhorn/tickle-ph-plugin`, or the app-sdk's React layer directly) implements:

```ts
// defined and exported by tickle-me-ivories itself, e.g. src/plugins/types.ts
export interface StorageProvider {
  loadProfile(songId: string): SongProfile | null
  saveProfile(p: SongProfile): void
  loadGlobals(): GlobalPrefs | null
  saveGlobals(g: GlobalPrefs): void
}
export interface ShareProvider {
  share(doc: ScoreDocument): Promise<{ url: string }>
  resolve(code: string): Promise<ScoreDocument | null>
}
export interface AuthProvider {
  useSession(): { user: { id: string; label: string } | null; isLoading: boolean }
  signIn(): void   // opens whatever UI the provider wants
  signOut(): void
}
export interface TicklePlugin {
  id: string
  name: string
  version: string
  capabilities: Array<'storage' | 'share' | 'auth'>
  storage?: StorageProvider
  share?: ShareProvider
  auth?: AuthProvider
}
```

The app ships a built-in `localStorageProvider` implementing `StorageProvider` (today's
`profile.ts`, unchanged) as the always-on default, and a single optional
`registerPlugin(plugin: TicklePlugin)` call the app exposes at startup (e.g. from
`main.tsx`, gated behind a dynamic `import()` so the plugin's code — and its
`@pepperhorn/app-sdk` dependency — is never even fetched unless a user opts in). If a
plugin registers a `storage` capability, the app's save/load call sites route through it
instead of `localStorage`; same pattern for `share` (an in-app "Share" button that's
inert/hidden with zero plugins registered, and becomes live once a `ShareProvider` is
present) and `auth` (an account menu slot that only renders when an `AuthProvider` is
registered). This is deliberately closer to chordee2's `Map`+lifecycle registry (simpler,
capability-flagged) than drumlet's manifest union, because tickle-me-ivories needs exactly
three narrow slots, not a general mode/library/capability plugin system — reuse the
*shape* of chordee2's capability flags (a plain string array) rather than either registry's
full machinery.

`@pepperhorn/tickle-ph-plugin` would then be a thin adapter: pull in
`@pepperhorn/app-sdk`'s `core/auth.ts` + `core/saves.ts` + `core/shortcodes.ts`, implement
the three provider interfaces above against them, and export a single `TicklePlugin` object
plus (optionally) the SDK's default `AuthModal`/`UserMenu` for the `auth` capability's UI.
Nothing in `tickle-me-ivorys/src` would import from `@pepperhorn/*` — the dependency arrow
points from the plugin into the SDK, and from the app into a small, self-defined interface
file, matching "zero ph-apps dependency, works fully offline" exactly as asked.

---

## File index (all paths absolute, no repo modified)

- Auth: `~/drumlet/src/state/useAuth.ts`, `~/drumlet/src/components/{AuthModal,UserMenu}.tsx`
- Auth: `~/chordee2/src/lib/auth/{useAuth,AuthContext}.tsx`, `~/chordee2/src/components/auth/{AuthModal,AccountButton}.tsx`
- Auth: `~/jamee/src/state/{useAuth,authModal}.ts`, `~/jamee/src/ui/AuthModal.tsx`, `~/jamee/src/directus/{client,saves}.ts`, `~/jamee/docs/AUTH.md`
- Auth: `~/module/src/state/{useAuth,useUserPatchSync}.ts`, `~/module/src/components/{AuthModal,UserMenu}.tsx`
- Save/share: `~/chordee2/src/lib/{cloudSave,cloudShare,schema}.ts`, `~/chordee2/src/components/share/ShareResolver.tsx`, `~/chordee2/src/lib/library/publicLibraryPlugin.ts`
- Save/share: `~/drumlet/src/drumlet/drumletBridge.ts`, `~/drumlet/src/state/shareCodec.ts`, `~/drumlet/src/components/ShareModal.tsx`
- Plugins: `~/drumlet/src/plugins/runtime.ts`, `~/chordee2/src/lib/plugins/{types,registry}.ts`
- Architecture docs: `~/drumlet/ARCHITECTURE.md`, `~/chordee2/ARCHITECTURE.md`, `~/drumlet/TS-MIGRATION.md`
- Backend: `~/directus-otp-auth/README.md`, `~/directus-otp-auth/SPEC.md`
- Target app: `~/tickle-me-ivorys/src/settings/profile.ts`, `~/tickle-me-ivorys/src/App.tsx`, `~/tickle-me-ivorys/package.json`
