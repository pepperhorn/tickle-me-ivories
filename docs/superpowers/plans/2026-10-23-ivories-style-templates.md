# ivories 0.3.0: style templates. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned, validated template format (`IvoriesTemplateV1`) and a `template` option that can give ivories the chord cards key style (rounded keys, ink outlines, raised black keys, an ink plate), CRF pitch colours, and fully styleable bar labels, with the default look pixel-identical to 0.2.0. Ship it as ivories 0.3.0 (not published).

**Architecture:** A new framework-free module `core/template/` holds the format types, the CRF palette, the seven built-ins (written in the public format), `decodeTemplate` (untrusted input in, clean template out) and `resolveTemplate` (built-in id or object in, a frozen `ResolvedTemplate` out, cached by identity). Values that map to existing `--ivories-*` tokens are written inline on the `.ivories` root, so `readTheme()` picks them up unchanged. Everything new (radii in chordl units, raised keys, plate, bar ink, colour mode, flash tint, labels) travels to the canvas as `RenderState.template`, which is absent for the default look, so every draw path takes today's code when no template is given. The template lives in `ThemeSettings.template`, so looks, profiles and scenes carry it through their existing `validTheme` validator.

**Tech Stack:** TypeScript 6, React 19, Canvas 2D, vitest 5 (jsdom), Playwright 1.62 (Chromium), npm workspaces, Astro 7 (demo site).

**Spec:** `/home/shaun/tickle-me-ivorys-soundfont/docs/superpowers/specs/2026-10-23-ivories-style-templates-design.md`. Read it with this plan. Mockup of the target look: `.superpowers/brainstorm/10196-1792724454/content/templates-v2.html` (the "Chord cards + CRF" card; its `svgFor` shows plate, key inset, raised lift and lip geometry).

## Global Constraints

- Repo `/home/shaun/tickle-me-ivorys-soundfont`, package `packages/ivories` (`ivories`, now `0.2.0`). Branch `feat/ivories-style-templates` is checked out. **Do not switch branches. Do not run `npm publish`.**
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`).
- Unit tests: from the repo root, `npx vitest run --project ivories <files>` (studio: `--project studio`). Type check: `npm run check -w packages/ivories`. E2E: `npx playwright test <spec> --workers=2` (full parallelism is flaky).
- **No regression in the default look.** With no template (or `template="classic"`), ivories renders pixel-identically to 0.2.0, writes no template tokens inline, and the existing CSS and host overrides behave exactly as today.
- **No new per-frame cost.** Template values resolve once per template or layout change (like `readTheme()`), never per bar per frame. No allocation per bar per frame.
- **No unsafe strings reach CSS or the canvas.** Template colours go through `isCssColor`, fonts through `isSafeFontFamily`, numbers are clamped. That applies to templates from props, looks, profiles and `noteBarLabelStyle`.
- `core/platform/types.ts` stays runtime-free: template **types** live in a new type-only file `core/template/types.ts` that imports nothing; `platform/types.test.ts`'s allowlist gains exactly that file.
- CRF palette (pitch class 0-11), verbatim: `#f86e6e #f58841 #ffbc57 #b8a334 #fff56d #b3f888 #93d154 #6bc6a0 #7ee8df #88a7f8 #cc97e8 #e277b1`. Source comment: chordl `chordl-core/src/themes/crf.ts` `CRF_PITCH_PALETTE`. No chordl dependency.
- Chord cards values, verbatim from the spec: stage `#fbf8f1`, grid ink at about 8% alpha; white keys `#fafafa`, 1px stroke `#333333`, radius 3; black keys `#222222`, 1px stroke `#333333`, radius 2; raised shadow `#231f20` depth 2, lip `#4a4a4a` depth 6 inset 1.5; held: shadow 0.5, lip darker; plate white, 2px ink top and bottom borders, hard 4px ink shadow, padding 6; bars flat, 1.5px ink outline, hard 2px ink shadow down-right on screen, radius 4. Ink is `#231f20`.
- Key radii and raised/plate depths are in chordl units: `px = units * whiteW / 25.3`. Bar radius, outline and shadow are plain px.
- Default bar label style is the house note-text style: white Poppins 600, `rgba(0,0,0,0.35)` stroke 3 (capped at px/4), stroke painted first.
- In JSX you touch, keep contextual class names next to utilities (e.g. `template-card-title text-lg ...`). The demo uses Poppins.
- Runtime exports go to `ivories/core` (the existing convention: the root entry re-exports React plus core **types**). Types reach `ivories` through its `export type * from './core'`.
- Dev server rule: any dev server binds `--host 0.0.0.0`. Kill a server only by the PID `ss -ltnp` reports, never `pkill -f`.

## Review Focus

1. **Older saves and corrupt templates.** A 0.2.0 look or profile (no `template`) loads exactly as before. A look whose `theme.template` has an unknown id, the wrong `kind`, or is over 16 KiB still loads, with the template dropped. Test: Task 3, `validTheme` and `decodeLook` cases.
2. **`theme` prop vs a template that came from a look or settings.** An explicit `theme` prop with no `template` prop must show that preset even when the look carries a template. Both props given: `template` wins. Test: Task 3, `resolveSettings` precedence cases. The studio's theme picker follows the same rule: Task 3, `useSettings.setTheme`.
3. **Keyed matte under a template.** `stageBgOverride` (including `transparent`) beats `chord-cards`' `stage.bg`, and the plate and keys still draw. Test: Task 4 (inline style order) and Task 7 (plate drawn over a transparent stage).
4. **Phone-width and hidden containers.** At `whiteW` about 7px (88 keys on 375px) or a 0x0 container, scaled radii, lip, lift and plate never produce negative heights or NaN. Test: Task 7, `keyBox` and `drawKeyboard` at 375px and 0x0.
5. **Switching templates at runtime.** `classic` to `chord-cards-crf` and back: the inline tokens are removed again, and the renderer re-reads the theme on each change and on no other frame. Test: Task 4, rerender case and the `StageRenderer` cache case.

---

### Task 1: Template format, CRF palette, built-ins and `decodeTemplate`

**Files:**
- Create: `packages/ivories/src/core/template/types.ts` (type-only, imports nothing)
- Create: `packages/ivories/src/core/template/palette.ts`
- Create: `packages/ivories/src/core/template/builtins.ts`
- Create: `packages/ivories/src/core/template/cssTheme.ts`
- Create: `packages/ivories/src/core/template/decode.ts`
- Create: `packages/ivories/src/core/settings/safeValues.ts`. Move `isCssColor` (with `COLOR_SYNTAX` and `MAX_COLOR_CHARS`), `FONT_FAMILY_RE` and `isSafeFontFamily` here from `core/settings/profile.ts`. `profile.ts` imports and re-exports them, so no call site changes. This breaks the cycle `profile.ts` -> `template/decode.ts` -> `profile.ts` that Task 3 would otherwise create.
- Modify: `packages/ivories/src/core/platform/codec.ts`. Widen the kind parameter of `readEnvelope`, `invalidPayload` and `PayloadVersionError` to `PayloadKind = 'scene' | 'look' | 'ivories-template'`. Messages say "template" for `'ivories-template'` (e.g. `This template is not valid: …`).
- Modify: `packages/ivories/src/core/platform/types.test.ts`. Add `'template/types.ts'` to the "resolves only through" allowlist (Task 3 makes `settings/types.ts` import it).
- Test: `packages/ivories/src/core/template/palette.test.ts`, `packages/ivories/src/core/template/decode.test.ts`

**Interfaces:**
- Produces (`template/types.ts`):
  ```ts
  export type BuiltinTemplateId = 'classic' | 'classic-crf' | 'chord-cards' | 'chord-cards-crf' | 'outline' | 'contrast' | 'transparent'
  export interface TemplateStage { bg?: string; gridLine?: string; gridLineC4?: string; beatLine?: string; barLine?: string; middleCMark?: string; progressTrack?: string; progressFill?: string }
  export interface TemplateRaisedKeys { enabled: boolean; shadowColor: string; shadowDepth: number; lipColor: string; lipDepth: number }
  export interface TemplateKeyPlate { enabled: boolean; fill: string; borderColor: string; borderWidth: number; shadowColor: string; shadowDepth: number; padding: number }
  export interface TemplateKeys { white?: string; black?: string; border?: string; borderWidth?: number; gap?: number; whiteRadius?: number; blackRadius?: number; outline?: string; raised?: Partial<TemplateRaisedKeys>; plate?: Partial<TemplateKeyPlate> }
  export type BarShading = 'velocity' | 'flat'
  export interface TemplateBars { radius?: number; outlineColor?: string; outlineWidth?: number; shadowColor?: string; shadowDepth?: number; shading?: BarShading }
  export type ColourMode = 'hand' | 'pitch'
  export interface TemplateColour { mode?: ColourMode; palette?: string[] }
  export type FlashTint = 'white' | 'note'
  export type BarLabelFormat = 'pitch' | 'pitch-octave' | 'solfege' | 'solfege-octave'
  export interface BarLabelFont { family: string; weight: number; scale: number; color: string; strokeColor: string; strokeWidth: number; case: 'upper' | 'lower' }
  export interface BarLabelStyle { show: boolean; format: BarLabelFormat; accidentals: 'glyph' | 'ascii'; font: BarLabelFont }
  export interface BarLabelStyleInput { show?: boolean; format?: BarLabelFormat; accidentals?: 'glyph' | 'ascii'; font?: Partial<BarLabelFont> }
  export interface IvoriesTemplateV1 {
    v: 1; kind: 'ivories-template'; id: string; name: string; extends?: BuiltinTemplateId
    stage?: TemplateStage; keys?: TemplateKeys; bars?: TemplateBars; colour?: TemplateColour
    flash?: { tint?: FlashTint }; labels?: BarLabelStyleInput; chrome?: Record<string, string>
  }
  export type TemplateRef = BuiltinTemplateId | IvoriesTemplateV1
  ```
- Produces (`palette.ts`): `export const CRF_PITCH_PALETTE: readonly string[]` (frozen, the 12 values above).
- Produces (`builtins.ts`): `export const BUILTIN_TEMPLATE_IDS: readonly BuiltinTemplateId[]` (table order of the spec); `export const BUILTIN_TEMPLATES: Readonly<Record<BuiltinTemplateId, IvoriesTemplateV1>>` (deep-frozen); `export function isBuiltinTemplateId(v: unknown): v is BuiltinTemplateId`.
- Produces (`cssTheme.ts`, internal, never re-exported from `core/index.ts`): `export const CSS_THEME_OF: Readonly<Record<BuiltinTemplateId, ThemeName>>`.
- Produces (`decode.ts`): `export const MAX_TEMPLATE_BYTES = 16 * 1024`; `export const TEMPLATE_RANGES` (the clamp table below, `as const`, also read by Task 9's schema test); `export function decodeTemplate(u: unknown): IvoriesTemplateV1` (throws `PlatformError`); `export function validBarLabelStyle(u: unknown): BarLabelStyleInput` (never throws, drops bad fields); `export function validTemplateRef(u: unknown): TemplateRef | undefined` (a built-in id passes, an object goes through `decodeTemplate`, anything else or a throw gives `undefined`).

- [ ] **Step 1: Move the safe-value checks**

Create `safeValues.ts` with the moved code; make `profile.ts` `import { isCssColor, isSafeFontFamily, FONT_FAMILY_RE } from './safeValues'` and `export { isCssColor, isSafeFontFamily, FONT_FAMILY_RE } from './safeValues'`.

Run: `npx vitest run --project ivories packages/ivories/src/core/settings packages/ivories/src/react/text`
Expected: PASS (no behaviour change).

- [ ] **Step 2: Write the failing palette and decode tests**

`palette.test.ts`, `pins the 12 CRF colours in pitch-class order`: `expect([...CRF_PITCH_PALETTE]).toEqual(['#f86e6e', '#f58841', '#ffbc57', '#b8a334', '#fff56d', '#b3f888', '#93d154', '#6bc6a0', '#7ee8df', '#88a7f8', '#cc97e8', '#e277b1'])` and `Object.isFrozen(CRF_PITCH_PALETTE)` is true.

`decode.test.ts` (use `const t = (o = {}) => ({ v: 1, kind: 'ivories-template', id: 'mine', name: 'Mine', ...o })`):
- `every built-in decodes to itself`: for each id, `decodeTemplate(BUILTIN_TEMPLATES[id])` deep-equals `BUILTIN_TEMPLATES[id]`, and `BUILTIN_TEMPLATES[id].id === id`.
- `the built-ins carry the spec values`: `BUILTIN_TEMPLATES['chord-cards'].keys` matches `{ white: '#fafafa', black: '#222222', outline: '#333333', whiteRadius: 3, blackRadius: 2 }` (`toMatchObject`), its `raised` is `{ enabled: true, shadowColor: '#231f20', shadowDepth: 2, lipColor: '#4a4a4a', lipDepth: 6 }`, `plate` is `{ enabled: true, fill: '#ffffff', borderColor: '#231f20', borderWidth: 2, shadowColor: '#231f20', shadowDepth: 4, padding: 6 }`, `bars` is `{ radius: 4, outlineColor: '#231f20', outlineWidth: 1.5, shadowColor: '#231f20', shadowDepth: 2, shading: 'flat' }`, `stage.bg === '#fbf8f1'`; `chord-cards-crf` is `{ extends: 'chord-cards', colour: { mode: 'pitch' }, flash: { tint: 'note' } }` plus id and name; `classic-crf` is the same over `extends: 'classic'`; `classic`, `outline`, `contrast`, `transparent` have no `stage`, `keys`, `bars`, `colour`, `flash` or `labels` blocks.
- `the envelope: wrong v or kind throws an invalid PlatformError, a newer v a PayloadVersionError`: `decodeTemplate(t({ v: 2 }))` throws with `isPayloadVersionError(e)`; `t({ kind: 'look' })`, `t({ v: 0 })`, `'not json'`, `null`, `[]` throw with `isPlatformError(e) && e.code === 'invalid'`.
- `over 16 KiB throws too_large before any field is read`: `t({ name: 'x'.repeat(17000) })` throws with `code === 'too_large'`.
- `id must be [a-z0-9-]{1,48}`: `t({ id: 'Bad Id' })`, `t({ id: '' })`, `t({ id: 'a'.repeat(49) })` throw `invalid`; `t({ id: 'my-look-2' })` decodes.
- `name: a non-string becomes the id, a long one is cut to 64 chars`.
- `unknown keys are dropped at every level`: `t({ evil: 1, stage: { bg: '#000', x: 1 }, keys: { raised: { enabled: true, y: 2 } } })` decodes to an object without `evil`, `stage.x` or `keys.raised.y`.
- `a colour that is not a colour is dropped (resolution falls back to the base)`: `t({ stage: { bg: 'url(x)', gridLine: '#123' } }).stage` decodes to `{ gridLine: '#123' }`.
- `numbers are clamped to their ranges`: `keys: { borderWidth: 99, gap: -3, whiteRadius: 20, blackRadius: -1, raised: { shadowDepth: 50, lipDepth: 50 }, plate: { borderWidth: 50, shadowDepth: 50, padding: 50 } }`, `bars: { radius: 99, outlineWidth: 9, shadowDepth: 99 }` decode to `4, 0, 8, 0, 6, 12, 6, 12, 16, 12, 4, 8`; a non-number (`'3'`, `NaN`) is dropped.
- `enums: an unknown value is dropped`: `bars.shading: 'glossy'`, `colour.mode: 'rainbow'`, `flash.tint: 'red'`, `extends: 'chord-card'` are absent after decoding.
- `a palette that is not exactly 12 hex colours is dropped (CRF applies)`: 11 entries, 13 entries, one entry `'red'`, one entry `'url(x)'` each decode with no `colour.palette`; 12 `#rrggbb`/`#rgb` entries are kept.
- `labels: font family through isSafeFontFamily, weight 100-900 to the nearest 100, scale 0.5-1.5, strokeWidth 0-8`: `labels: { font: { family: "Nunito'; x", weight: 651, scale: 3, strokeWidth: 20, color: 'nope', case: 'title' }, format: 'solfege', accidentals: 'ascii', show: false }` decodes to `{ show: false, format: 'solfege', accidentals: 'ascii', font: { weight: 700, scale: 1.5, strokeWidth: 8 } }`.
- `chrome keeps only colour strings, at most 32 keys`: `{ chrome: { bg: '#000', bad: 'url(x)', n: 3 } }` decodes to `{ chrome: { bg: '#000' } }`.
- `validTemplateRef`: `'chord-cards-crf'` passes through; `'nope'`, `3`, `t({ kind: 'look' })` give `undefined`; a valid object gives its decoded copy (not the same reference).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/core/template`
Expected: FAIL (modules do not exist).

- [ ] **Step 4: Implement `types.ts`, `palette.ts`, `builtins.ts`, `decode.ts` and widen `codec.ts`**

Built-in data (names are display names): `classic` "Classic", `classic-crf` "Classic + CRF colours", `chord-cards` "Chord cards", `chord-cards-crf` "Chord cards + CRF colours", `outline` "Outline", `contrast` "High contrast", `transparent` "Transparent". `chord-cards`, in full:
- `stage`: `{ bg: '#fbf8f1', gridLine: 'rgba(35,31,32,0.08)', gridLineC4: 'rgba(35,31,32,0.18)', beatLine: 'rgba(35,31,32,0.08)', barLine: 'rgba(35,31,32,0.2)', middleCMark: 'rgba(35,31,32,0.55)', progressTrack: 'rgba(35,31,32,0.08)', progressFill: '#231f20' }`
- `keys`: `{ white: '#fafafa', black: '#222222', border: 'transparent', borderWidth: 1, gap: 1, whiteRadius: 3, blackRadius: 2, outline: '#333333', raised: {…as tested}, plate: {…as tested} }`
- `bars`: as tested; `colour: { mode: 'hand' }`; `flash: { tint: 'white' }`.

`TEMPLATE_RANGES`:
- keys: `borderWidth [0,4]`, `gap [0,4]`, `whiteRadius [0,8]`, `blackRadius [0,8]`
- raised: `shadowDepth [0,6]`, `lipDepth [0,12]`
- plate: `borderWidth [0,6]`, `shadowDepth [0,12]`, `padding [0,16]`
- bars: `radius [0,12]`, `outlineWidth [0,4]`, `shadowDepth [0,8]`
- labels: `weight [100,900]` (rounded to 100), `scale [0.5,1.5]`, `strokeWidth [0,8]`

`CSS_THEME_OF` maps `classic`, `classic-crf`, `chord-cards` and `chord-cards-crf` to `'classic'`, and `outline`, `contrast` and `transparent` to themselves. `decodeTemplate` = `readEnvelope(u, 'ivories-template', MAX_TEMPLATE_BYTES)`, then each block is built key by key, never spread (the `decodeProfile` pattern). Palette entries must match `/^#([0-9a-f]{3}|[0-9a-f]{6})$/i` (hex only, so the flash tint can parse them).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --project ivories packages/ivories/src/core/template packages/ivories/src/core/platform packages/ivories/src/core/settings`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ivories/src/core/template packages/ivories/src/core/settings/safeValues.ts packages/ivories/src/core/settings/profile.ts packages/ivories/src/core/platform/codec.ts packages/ivories/src/core/platform/types.test.ts
git commit -m "feat(ivories): template format, CRF palette, built-in templates and decodeTemplate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `resolveTemplate` and label resolution

**Files:**
- Create: `packages/ivories/src/core/template/resolve.ts`
- Test: `packages/ivories/src/core/template/resolve.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `BUILTIN_TEMPLATES`, `CSS_THEME_OF`, `isBuiltinTemplateId`, `decodeTemplate`, `validBarLabelStyle`, `CRF_PITCH_PALETTE`; `hexToRgb` from `core/render/colors.ts`; `ThemeName` from `core/settings/types.ts`; `NoteBarLabels` (type) from `core/render/barLabels.ts`.
- Produces:
  ```ts
  export interface ResolvedTemplate {
    id: string; name: string
    cssTheme: ThemeName                            // root class ivories-theme-<cssTheme>
    tokens: Readonly<Record<string, string>>       // '--ivories-*' -> value, written inline; {} for classic and the presets
    keys: { whiteRadius: number | null; blackRadius: number | null; raised: TemplateRaisedKeys; plate: TemplateKeyPlate }
    bars: { outlineColor: string; outlineWidth: number; shadowColor: string; shadowDepth: number; shading: BarShading }
    colour: { mode: ColourMode; palette: readonly string[]; paletteRgb: readonly string[]; paletteCoreRgb: readonly string[] } // 'r, g, b'
    flash: { tint: FlashTint }
    labels: BarLabelStyle
  }
  export const DEFAULT_BAR_LABEL_STYLE: BarLabelStyle  // { show: true, format: 'pitch', accidentals: 'glyph', font: { family: 'Poppins', weight: 600, scale: 1, color: '#ffffff', strokeColor: 'rgba(0,0,0,0.35)', strokeWidth: 3, case: 'upper' } }
  export function resolveTemplate(ref?: TemplateRef | null): ResolvedTemplate
  export function isClassicLook(t: ResolvedTemplate): boolean   // true when the draw paths can take today's code
  export function resolveBarLabels(base: BarLabelStyle, shorthand?: NoteBarLabels, style?: BarLabelStyleInput): BarLabelStyle
  ```

- [ ] **Step 1: Write the failing tests**

- `no template and 'classic' resolve to the same frozen object with no tokens`: `resolveTemplate()`, `resolveTemplate(null)` and `resolveTemplate('classic')` are `toBe` the same object; `tokens` is `{}`; `cssTheme === 'classic'`; `keys.whiteRadius === null && keys.blackRadius === null`; `raised.enabled === false`; `plate.enabled === false`; `bars` is `{ outlineColor: 'transparent', outlineWidth: 0, shadowColor: 'transparent', shadowDepth: 0, shading: 'velocity' }`; `colour.mode === 'hand'`; `flash.tint === 'white'`; `labels` equals `DEFAULT_BAR_LABEL_STYLE`; `isClassicLook(...)` is true; `Object.isFrozen` is true.
- `the legacy presets resolve to their CSS class and no tokens`: for `outline`, `contrast` and `transparent`, `cssTheme === id`, `tokens` is `{}` and `isClassicLook` is true.
- `chord-cards writes its stage and key values as --ivories-* tokens`: `resolveTemplate('chord-cards').tokens` equals exactly `{ '--ivories-stage-bg': '#fbf8f1', '--ivories-grid-line': 'rgba(35,31,32,0.08)', '--ivories-grid-line-c4': 'rgba(35,31,32,0.18)', '--ivories-beat-line': 'rgba(35,31,32,0.08)', '--ivories-bar-line': 'rgba(35,31,32,0.2)', '--ivories-middle-c-mark': 'rgba(35,31,32,0.55)', '--ivories-progress-track': 'rgba(35,31,32,0.08)', '--ivories-progress-fill': '#231f20', '--ivories-key-white': '#fafafa', '--ivories-key-black': '#222222', '--ivories-key-border': 'transparent', '--ivories-key-border-width': '1px', '--ivories-key-gap': '1px', '--ivories-key-outline': '#333333', '--ivories-bar-radius': '4px' }`; `cssTheme === 'classic'`; `keys.whiteRadius === 3`; `isClassicLook` is false.
- `chord-cards-crf inherits chord-cards and switches colour and flash`: same `tokens` as `chord-cards`, `colour.mode === 'pitch'`, `colour.palette` equals `CRF_PITCH_PALETTE`, `colour.paletteRgb[0] === '248, 110, 110'`, `colour.paletteCoreRgb[0]` is the 50% mix with white (`'252, 183, 183'`), `flash.tint === 'note'`.
- `a custom template deep-merges over its extends`: `{…, extends: 'chord-cards', keys: { raised: { shadowDepth: 3 } }, stage: { bg: '#000000' } }` keeps `raised.enabled === true` and `raised.lipColor === '#4a4a4a'`, sets `raised.shadowDepth === 3` and `tokens['--ivories-stage-bg'] === '#000000'`, and keeps `tokens['--ivories-key-white'] === '#fafafa'`.
- `no extends means classic`: `{…, colour: { mode: 'pitch' } }` resolves with `tokens` `{}` and `cssTheme === 'classic'`.
- `extends a preset: the class stays, the overrides go inline`: `{…, extends: 'outline', keys: { white: '#111111' } }` gives `cssTheme === 'outline'` and `tokens` exactly `{ '--ivories-key-white': '#111111' }`.
- `an object decodeTemplate rejects resolves to classic`: `resolveTemplate({ v: 1, kind: 'look' } as never)` is `toBe(resolveTemplate())`.
- `the same object resolves to the same result (cached by identity)`: two calls with one object are `toBe`-equal; an unknown string id gives classic.
- `a custom palette is used, and its rgb precomputed`.
- `resolveBarLabels`: with no shorthand and no style the result `toBe(base)`; `'none'` gives `show: false`; `'pitch-octave'` gives `format: 'pitch-octave', show: true`; `style` wins over the shorthand (`('pitch', { format: 'solfege' })` gives `'solfege'`); `style.font` merges per field (`{ font: { family: 'Nunito' } }` keeps `weight: 600`); an unsafe family in `style` is ignored (it goes through `validBarLabelStyle`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/core/template/resolve.test.ts`
Expected: FAIL (`resolve.ts` does not exist).

- [ ] **Step 3: Implement `resolve.ts`**

Resolution: decode an object ref (`decodeTemplate`, catch -> classic), walk the `extends` chain of built-ins (at most two deep), deep-merge the blocks over the classic defaults (`raised`/`plate` defaults are `chord-cards`' values with `enabled: false`), and map `stage.*` and `keys.{white,black,border,borderWidth,gap,outline}` and `bars.radius` to tokens. Px tokens get a `px` suffix. Freeze the result. Cache built-ins in a `Map` by id and objects in a `WeakMap`. `isClassicLook(t)` is `t.keys.whiteRadius === null && t.keys.blackRadius === null && !t.keys.raised.enabled && !t.keys.plate.enabled && t.bars.outlineWidth === 0 && t.bars.shadowDepth === 0 && t.bars.shading === 'velocity' && t.colour.mode === 'hand' && t.flash.tint === 'white'`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project ivories packages/ivories/src/core/template`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/src/core/template/resolve.ts packages/ivories/src/core/template/resolve.test.ts
git commit -m "feat(ivories): resolveTemplate (extends, deep merge, inline tokens) and bar label resolution" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The template in settings, looks, profiles and `resolveSettings`

**Files:**
- Modify: `packages/ivories/src/core/settings/types.ts`. `ThemeSettings` gains `template?: TemplateRef` (type import from `../template/types`), documented as "wins over `name` when set".
- Modify: `packages/ivories/src/core/settings/profile.ts` `validTheme`. It adds `template` only when `validTemplateRef(v.template)` returns a value. An invalid template drops just that field, never the theme block.
- Modify: `packages/ivories/src/core/settings/resolve.ts`
- Modify: `apps/studio/src/settings/useSettings.ts` `setTheme`. A patch that has `name` but no `template` key drops `template`.
- Test: `packages/ivories/src/core/settings/profile.test.ts`, `packages/ivories/src/core/platform/look.test.ts`, `packages/ivories/src/core/settings/resolve.test.ts` (create), `apps/studio/src/settings/useSettings.test.ts`

**Interfaces:**
- Consumes: `validTemplateRef` (Task 1).
- Produces: `resolveSettings(o: { settings?: Partial<Settings>; look?: LookV1; theme?: ThemeName; template?: TemplateRef }): Settings`. `LookV1` is unchanged in shape: its template is `look.theme.template`, because `LookV1.theme` is `ThemeSettings`.

- [ ] **Step 1: Write the failing tests**

- `profile.test.ts`, `validTheme keeps a valid template and drops a bad one`: `validTheme({ name: 'classic', stageBgOverride: null })` still deep-equals `{ name: 'classic', stageBgOverride: null }` (no `template` key); with `template: 'chord-cards-crf'` it keeps it; with `template: 'nope'`, `template: { v: 1, kind: 'look' }` or a 17 KiB template object it returns the theme without `template` (not null).
- `profile.test.ts`, `a profile round-trips an inline template`: `decodeProfile(encodeProfile(p))` where `p.theme.template` is a valid custom object yields a deep-equal template.
- `look.test.ts`, `lookFromSettings carries the template and decodeLook keeps it`: `decodeLook(lookFromSettings({ ...DEFAULT_SETTINGS, theme: { name: 'classic', stageBgOverride: null, template: 'chord-cards' } }, 'roll', 3)).theme.template === 'chord-cards'`.
- `look.test.ts`, `a 0.2.0 look and a look with a corrupt template both load`: a look without `template` decodes deep-equal to before; one with `theme.template: { v: 1, kind: 'ivories-template', id: 'BAD' }` decodes with no `theme.template`.
- `resolve.test.ts`:
  - `the template prop lands in theme.template`: `resolveSettings({ template: 'classic-crf' }).theme.template === 'classic-crf'`.
  - `template beats theme when both are given`: `resolveSettings({ theme: 'contrast', template: 'chord-cards' }).theme` is `{ name: 'contrast', stageBgOverride: null, template: 'chord-cards' }` (StageView renders the template).
  - `an explicit theme prop clears a template from a look or settings`: with `look` whose `theme.template` is `'chord-cards'` and `theme: 'contrast'`, the result has no `theme.template`. The same holds with `settings: { theme: { name: 'classic', stageBgOverride: null, template: 'chord-cards' } }`.
  - `a look's template applies when no prop overrides it`.
- `useSettings.test.ts`, `picking a theme preset drops a template that came from a look`: after `setTheme({ template: 'chord-cards' })` then `setTheme({ name: 'contrast' })`, `theme.template` is `undefined`; `setTheme({ stageBgOverride: '#00b140' })` keeps it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/core/settings packages/ivories/src/core/platform/look.test.ts && npx vitest run --project studio apps/studio/src/settings/useSettings.test.ts`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement**

In `resolveSettings`, after the existing `o.theme` line: `if (o.theme && !o.template) delete s.theme.template`, then `if (o.template) s.theme = { ...s.theme, template: o.template }`. The template prop is trusted like `theme` (it is validated again in `resolveTemplate`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: the Step 2 commands, then `npm run check -w packages/ivories`.
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/src/core/settings packages/ivories/src/core/platform/look.test.ts apps/studio/src/settings
git commit -m "feat(ivories): ThemeSettings.template carried by looks and profiles; template beats theme in resolveSettings" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Template tokens on the root, and the template in render state

**Files:**
- Modify: `packages/ivories/src/core/render/pianoRoll.ts`. `RenderState` gains `template?: ResolvedTemplate`, documented as "absent: today's look; set only when !isClassicLook".
- Modify: `packages/ivories/src/core/render/stageRenderer.ts`. `StageInput` gains `template?: ResolvedTemplate`. `themeFor` also re-reads when the template object changes (identity compare, next to `key` and `layout`). `rs.template` is set only when `input.template && !isClassicLook(input.template)`.
- Modify: `packages/ivories/src/react/IvoriesProvider.tsx`. New prop `template?: TemplateRef`, passed to `resolveSettings` and added to its `useMemo` deps.
- Modify: `packages/ivories/src/react/withProvider.tsx`. Add `'template'` to `PROVIDER_KEYS` and forward it to the view, like `'theme'`.
- Modify: `packages/ivories/src/react/views/StageView.tsx`. New `StageViewProps.template?: TemplateRef`. `const ref = p.template ?? (p.theme ? undefined : iv.settings.theme.template)`; `const tpl = useMemo(() => resolveTemplate(ref), [ref])`. Root class `ivories-theme-${ref ? tpl.cssTheme : themeName}`. Root `data-ivories-template={ref ? tpl.id : undefined}`. `style` spreads `tpl.tokens` **before** the `stageBgOverride` entry, so the override wins. `tpl` goes into `live.current` and from there into `renderer.draw({ …, template: tpl })`.
- Test: `packages/ivories/src/react/views/StageView.test.tsx`, `packages/ivories/src/core/render/stageRenderer.test.ts`

**Interfaces:**
- Consumes: `resolveTemplate`, `isClassicLook`, `ResolvedTemplate` (Task 2); `TemplateRef` (Task 1).
- Produces: `RenderState.template?: ResolvedTemplate` (read by Tasks 5-8); `StageInput.template?: ResolvedTemplate`; provider and view prop `template?: TemplateRef`.

- [ ] **Step 1: Write the failing tests**

`StageView.test.tsx`:
- `no template: no template tokens inline, classic class, no data attribute`: `<Keyboard score={doc()} engine={fakeEngine()} />`. Root has `ivories-theme-classic`, `root.style.getPropertyValue('--ivories-key-white') === ''` and no `data-ivories-template`.
- `template="chord-cards-crf" writes its tokens inline on the root`: `--ivories-stage-bg` is `#fbf8f1`, `--ivories-key-outline` is `#333333`, the class is `ivories-theme-classic`, and `data-ivories-template="chord-cards-crf"`.
- `stageBgOverride beats the template's stage.bg`: `template="chord-cards" settings={{ theme: { name: 'classic', stageBgOverride: '#00b140' } }}` gives `--ivories-stage-bg` `#00b140`.
- `a template extending a preset keeps the preset class`: an inline template `extends: 'outline'` gives `ivories-theme-outline`.
- `switching back to classic removes the tokens`: `rerender` from `template="chord-cards-crf"` to no template, then `--ivories-key-white` is `''`.
- `the template from a look applies, and a per-view theme prop overrides it`: provider `look` with `theme.template: 'chord-cards'` gives the tokens; adding `theme="contrast"` on the view gives `ivories-theme-contrast` and no tokens.

`stageRenderer.test.ts`:
- `re-reads the theme when the template changes, never per frame`: count `readThemeFrom` calls over 5 frames with `template: resolveTemplate('classic')`, then 5 with `resolveTemplate('chord-cards')`, then 5 back on classic. Expect `reads === 3`.
- `the default template draws exactly as no template` (the spec's renderer guard): one score with a note held at t, drawn with `stubCtx()` once with `template: undefined` and once with `template: resolveTemplate('classic')`, for falling, keyboard-only and rising vertical/horizontal inputs. `calls`, `fillStyles`, `gradientStops` and `texts` are `toEqual` between the two.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/react/views/StageView.test.tsx packages/ivories/src/core/render/stageRenderer.test.ts`
Expected: FAIL (no `template` prop or input).

- [ ] **Step 3: Implement the changes listed under Files**

- [ ] **Step 4: Run the tests to verify they pass**

Run: the Step 2 command, then `npx vitest run --project ivories packages/ivories/src/react` and `npm run check -w packages/ivories`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/src/core/render/pianoRoll.ts packages/ivories/src/core/render/stageRenderer.ts packages/ivories/src/core/render/stageRenderer.test.ts packages/ivories/src/react
git commit -m "feat(ivories): template prop; resolved tokens inline on the root; template in render state" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Colour mode (pitch/hand), flat shading and the flash tint

**Files:**
- Create: `packages/ivories/src/core/render/noteStyle.ts`
- Modify: `packages/ivories/src/core/render/colors.ts`. Add `export function rgbOf(color: string): [number, number, number]` for `#hex`, `rgb(r, g, b)` and `hsl(h s% l%)` (`noteColor`'s output); junk gives `[255, 255, 255]`.
- Modify: `packages/ivories/src/core/render/pianoRoll.ts` (`drawRoll` bar fill, `flashKey`, `drawImpact`)
- Modify: `packages/ivories/src/core/render/rising.ts` (score bars and trail bars)
- Modify: `packages/ivories/src/core/render/keyboard.ts` (pressed and live key fills)
- Test: `packages/ivories/src/core/render/noteStyle.test.ts`, `packages/ivories/src/core/render/pianoRoll.test.ts`, `packages/ivories/src/core/render/rising.test.ts`, `packages/ivories/src/core/render/keyboard.test.ts`, `packages/ivories/src/core/render/colors.test.ts`

**Interfaces:**
- Consumes: `RenderState.template` (Task 4), `ResolvedTemplate.colour/bars/flash` (Task 2).
- Produces (`noteStyle.ts`):
  - `export function noteFill(state: RenderState, hue: number, pitch: number, velocity: number): string`. Pitch mode: `palette[pitch mod 12]`. Otherwise `noteColor(hue, velocity, state.velocity)`, exactly today's call.
  - `export function barGradient(state: RenderState): boolean`. True only with no template, or hand mode with `shading: 'velocity'`. When false a bar is one solid `noteFill`.
  - `export function flashRgb(state: RenderState, hue: number, pitch: number, velocity: number): { core: string; warm: string }`. With tint `'white'` (or no template) it returns `{ core: theme.flashCoreRgb, warm: theme.flashWarmRgb }`. With `'note'` in pitch mode it returns `paletteCoreRgb`/`paletteRgb` for the pitch class; in hand mode `warm` is `rgbOf(noteFill(...))` and `core` is that colour mixed 50% with white.
  - `flashKey` gains a last parameter `rgb: { core: string; warm: string }` used in place of `theme.flashCoreRgb`/`theme.flashWarmRgb`. The stop offsets and alphas, the radius, the timing and the intensity are unchanged.
  - Live keys and trail bars use hue `theme.liveHue` with `noteFill`, so pitch mode gives them their pitch colour and hand mode keeps `--ivories-live-hue`.

- [ ] **Step 1: Write the failing tests**

- `noteStyle.test.ts`:
  - `no template: noteFill is today's noteColor and bars keep the gradient`.
  - `pitch mode: the CRF colour by pitch class, flat, whatever the velocity`: `noteFill` for pitch 60 vel 20 and pitch 72 vel 120 are both `'#f86e6e'`, pitch 66 gives `'#93d154'`, and `barGradient` is false.
  - `hand + flat: one colour, the velocity scheme's at that velocity`: with an inline template `{ bars: { shading: 'flat' } }`, `noteFill` equals `noteColor(207, 90, DEFAULT_SCHEME)` and `barGradient` is false.
  - `flashRgb`: white tint returns the theme's strings unchanged; `chord-cards-crf` with pitch 60 gives `{ core: '252, 183, 183', warm: '248, 110, 110' }`.
- `colors.test.ts`, `rgbOf parses hex, rgb() and noteColor's hsl()`: `rgbOf('#f86e6e')` is `[248, 110, 110]`, `rgbOf('rgb(1, 2, 3)')` is `[1, 2, 3]`, and `rgbOf('hsl(0 100% 50%)')` is `[255, 0, 0]`.
- `pianoRoll.test.ts`:
  - `pitch mode bars are solid palette fills with no gradient stops`: `drawRoll` with `state([note(60, 0, 1)])` plus `template: resolveTemplate('chord-cards-crf')` at t=0.5. `fillStyles` contains `'#f86e6e'` and `gradientStops` contains none of the bar's colours.
  - `the note-tinted flash uses the pitch colour in its stops`: `drawImpact` at age 0.01. `gradientStops` contains `'rgba(252, 183, 183, …'` and `'rgba(248, 110, 110, …'` (prefix match).
  - `the white flash is unchanged`: with no template, the stops are exactly today's.
- `keyboard.test.ts`, `pressed and live keys take the pitch colour in pitch mode`: held pitch 62 gives `fillStyles` containing `'#ffbc57'`; live pitch 64 gives `'#fff56d'`. With no template, live keys still use `noteColor(theme.liveHue, …)`.
- `rising.test.ts`, `pitch mode: score and trail bars are flat palette fills`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/core/render`
Expected: FAIL on the new cases.

- [ ] **Step 3: Implement `noteStyle.ts` and `rgbOf`, and route every bar, key and flash fill through them**

In `drawRoll` and in rising's `drawBar`, use the existing two-stop gradient when `barGradient(state)` is true, else `ctx.fillStyle = noteFill(...)`. `noteFill` is a palette lookup or today's `noteColor`, so it adds no per-bar allocation.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project ivories packages/ivories/src/core/render`
Expected: PASS, including Task 4's default-equality guard.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/src/core/render
git commit -m "feat(ivories): pitch colour mode, flat shading and note-tinted hit flash" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bar outline and hard shadow

**Files:**
- Create: `packages/ivories/src/core/render/bars.ts`
- Modify: `packages/ivories/src/core/render/pianoRoll.ts` (`drawRoll`), `packages/ivories/src/core/render/rising.ts` (`drawBar`, both score and trail bars)
- Test: `packages/ivories/src/core/render/bars.test.ts`

**Interfaces:**
- Consumes: `noteFill`/`barGradient` (Task 5); `roundRect`, `strokeRoundRect` (`shapes.ts`); `RenderState.orientation`.
- Produces:
  - `export function screenShadowOffset(o: Orientation | undefined, d: number): { dx: number; dy: number }`. Vertical gives `{ dx: d, dy: d }`. Horizontal gives `{ dx: -d, dy: -d }`: under `X = H - y, Y = W - x` that is down-right on screen.
  - `export function drawNoteBar(ctx: CanvasRenderingContext2D, state: RenderState, x: number, top: number, w: number, h: number, fill: string | CanvasGradient): void`. With no template, or `shadowDepth === 0` and `outlineWidth === 0`, it is exactly `ctx.fillStyle = fill; roundRect(ctx, x, top, w, h, theme.barRadius)`. Otherwise it paints in this order: a shadow `roundRect` in `bars.shadowColor` at `(x + dx, top + dy)`, then the bar, then `strokeRoundRect` in `bars.outlineColor` at `lineWidth = outlineWidth`.

- [ ] **Step 1: Write the failing tests**

- `screenShadowOffset is down-right on screen in both orientations`: check `screenShadowOffset(undefined, 2)` and `('horizontal', 2)`. Also assert through `toScreen`: for a horizontal layout, `toScreen(o, L, x + dx, y + dy)` minus `toScreen(o, L, x, y)` is `{ x: 2, y: 2 }`.
- `no template: one fill and one roundRect, nothing else`: compare `calls` with today's two entries.
- `chord-cards: shadow first in ink, then the bar, then a 1.5px ink outline`: the order in `fillStyles` is `'#231f20'` then the bar colour, and `calls` ends with `'stroke(0)'`.
- `pianoRoll.test.ts` and `rising.test.ts`, `bars under chord-cards-crf draw shadow + fill + outline per bar`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/core/render/bars.test.ts packages/ivories/src/core/render/pianoRoll.test.ts packages/ivories/src/core/render/rising.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `bars.ts` and call `drawNoteBar` from `drawRoll` and rising's `drawBar`**

`labelBar` still runs after the bar, so a label sits on top of its outline.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project ivories packages/ivories/src/core/render`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/src/core/render
git commit -m "feat(ivories): template bar outline and hard shadow, down-right on screen in both orientations" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Chord cards keys: scaled radii, raised black keys and the plate

**Files:**
- Modify: `packages/ivories/src/core/render/keyboard.ts`
- Test: `packages/ivories/src/core/render/keyboard.test.ts`

**Interfaces:**
- Consumes: `RenderState.template.keys` (Task 2), `noteFill` (Task 5), `roundRect`/`strokeRoundRect`.
- Produces:
  - `export const CHORDL_WHITE_W = 25.3`
  - `export function chordlUnit(layout: KeyboardLayout): number`, returning `layout.whiteW / CHORDL_WHITE_W`.
  - `export function keyBox(layout: KeyboardLayout, t?: ResolvedTemplate): { top: number; whiteH: number; blackH: number }`. With no template or the plate off it returns `{ top: hitY, whiteH: keyboardH, blackH: layout.blackH }`. With the plate on, `u = chordlUnit(layout)`, `top = hitY + padding*u`, `whiteH = max(1, keyboardH - padding*u - (borderWidth + shadowDepth)*u)` and `blackH = layout.blackH * whiteH / keyboardH`.
  - Private helpers: `drawPlate(ctx, state)`, drawn before the white keys, and `drawRaisedBlackKey(ctx, state, k, box, fill, held)`.

Geometry (canonical frame, so "toward the player" is +y in both orientations, and the horizontal reflection carries it to the keyboard's front side):
- **Plate** (when `plate.enabled`): a `shadowColor` rect at `[0, stageH - shadowDepth*u, stageW, shadowDepth*u]`. Over it, a `fill` rect `[0, hitY, stageW, stageH - hitY - shadowDepth*u]`. Then `borderColor` rects `borderWidth*u` high at the plate's top (y = hitY) and bottom (y = stageH - shadowDepth*u - borderWidth*u). The plate starts at `hitY`, so bars still meet the hit line at the same moment.
- **Radii**: a white key uses `whiteRadius*u` when it is not null, else `theme.keyRadius`; a black key uses `blackRadius*u` the same way.
- **Raised black key** (when `raised.enabled`), with `lift = (held ? 0.25 : 1) * shadowDepth*u`. Draw a `shadowColor` roundRect at `(k.x, top + lift, k.w, blackH)`. Then the key: its fill, plus its outline when outlined. Then the lip: a roundRect at `x = k.x + 1.5u`, `w = k.w - 3u`, `h = lipDepth*u`, bottom 2u above the key bottom, radius `1.5u`. The lip is `lipColor` when idle and `'rgba(0,0,0,0.18)'` when held or live (the held key "sinks"). Skip the lip when `k.w - 3u <= 0` or `blackH <= (lipDepth + 2)*u`. The raised style draws no `blackKeyTop` strip.
- Middle C marks and the "C4" label use `box.top`/`box.whiteH` in place of `hitY`/`keyboardH`.

- [ ] **Step 1: Write the failing tests**

- `chordlUnit: radius 3 is 3px on a 25.3px white key and 6px on 50.6px`: a layout whose `whiteW` is 50.6 gives `3 * chordlUnit(L) === 6`.
- `keyBox without a plate is today's box`; `keyBox with the chord-cards plate`: on `computeLayout(1300, 700)`, `top === hitY + 6u` and `whiteH === keyboardH - 12u` (`padding 6`, `borderWidth 2`, `shadowDepth 4`).
- `keyBox never goes negative or NaN at phone width or 0x0`: `computeLayout(375, 300)` and `computeLayout(1, 1)` with chord-cards give finite values, `whiteH >= 1` and `blackH > 0`.
- `chord-cards draws the plate before the keys`: `fillStyles` starts with `'#231f20'`, then `'#ffffff'` (plate fill), then `'#231f20'` (borders), before the first `'#fafafa'`.
- `an idle raised black key: ink shadow, key fill, light lip`: the order `'#231f20'`, `'#222222'`, `'#4a4a4a'` appears in `fillStyles` for a black key.
- `a held raised black key sinks: darker lip, its fill the note colour`: with pitch 61 held under chord-cards-crf, the order is `'#231f20'`, `'#f58841'`, `'rgba(0,0,0,0.18)'`, and no `theme.blackKeyTop` fill.
- `no template: drawKeyboard output is unchanged` (the Task 4 guard covers it; add one direct comparison of `fillStyles` with today's expected sequence for a held black key, including `blackKeyTop`).
- `the plate draws over a transparent stage`: `theme.stageBg = 'transparent'` with chord-cards still gives the plate fills.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/core/render/keyboard.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement as specified under Interfaces**

The template-off path must stay today's code with today's values, so a guard `const t = state.template` decides per draw, never per key per allocation.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project ivories packages/ivories/src/core/render`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/src/core/render/keyboard.ts packages/ivories/src/core/render/keyboard.test.ts
git commit -m "feat(ivories): chord cards keys: scaled radii, raised black keys that sink when held, ink plate" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Bar label format and paint (core)

**Files:**
- Modify: `packages/ivories/src/core/render/barLabels.ts`
- Modify: `packages/ivories/src/core/render/pianoRoll.ts`. `RenderState` gains `barLabelPaint?: BarLabelPaint`; `labelBar` passes `state.barLabelPaint` to `barLabelPx` and `drawBarLabel`.
- Modify: `packages/ivories/src/core/render/stageRenderer.ts`. `StageInput.barLabelPaint?: BarLabelPaint` is passed through.
- Test: `packages/ivories/src/core/render/barLabels.test.ts`

**Interfaces:**
- Consumes: `BarLabelStyle` (Task 1), `DEFAULT_BAR_LABEL_STYLE` (Task 2).
- Produces:
  - `export interface BarLabelPaint { family: string /* CSS font-family list */; weight: number; scale: number; color: string; strokeColor: string; strokeWidth: number }`
  - `export const DEFAULT_BAR_LABEL_PAINT: BarLabelPaint = { family: 'Poppins, sans-serif', weight: 600, scale: 1, color: '#ffffff', strokeColor: 'rgba(0, 0, 0, 0.35)', strokeWidth: 3 }`. These are today's literal strings, so the default output is byte-identical.
  - `export function noteBarLabel(n, key, mode: NoteBarLabels | BarLabelStyle): string | null`. A `BarLabelStyle` with `show: false` gives null.
  - `export const SOLFEGE: Record<string, string>`: `{ C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' }`.
  - `NoteBarLabelCache.get(n, key, mode: NoteBarLabels | BarLabelStyle)` resets when `key` or `mode` changes by identity.
  - `export function barLabelPx(text, across, along, orientation, scale = 1): number`. `px = min(MAX_LABEL_PX, across * 0.7) * scale`, then the floor and fit tests run on the scaled `px`.
  - `export function drawBarLabel(ctx, text, cx, cy, px, orientation, paint: BarLabelPaint = DEFAULT_BAR_LABEL_PAINT): void`. `ctx.font = `${paint.weight} ${px.toFixed(1)}px ${paint.family}``. Stroke first with `lineWidth = min(paint.strokeWidth, px / 4)`, skipped when `strokeWidth === 0`, then the fill.

- [ ] **Step 1: Write the failing tests**

- `the default style formats exactly as 'pitch' and 'pitch-octave' did`: for pitches 60, 66 and 70, with keys C and F and the spelling `'Gb'`, `noteBarLabel(n, k, { ...DEFAULT_BAR_LABEL_STYLE })` equals `noteBarLabel(n, k, 'pitch')`, and the same holds with `format: 'pitch-octave'`.
- `solfège is fixed do with the glyph/ascii accidental rule`: pitch 60 is `'Do'`, 67 is `'Sol'`, 71 is `'Si'`; 66 in C is `'Fa♯'`; 70 in F is `'Si♭'`; ascii gives `'Fa#'` and `'Sib'`; `'solfege-octave'` for 60 is `'Do4'` and for spelling `'Cb'` pitch 59 is `'Do♭4'`.
- `accidentals: 'ascii' keeps tonal's spelling`: pitch 66 in C is `'F#'`; `'C##'` stays `'C##'`.
- `case: lower`: `'f♯'`, `'b♭4'` and `'do'`; upper solfège is title case (`'Sol'`).
- `show: false gives no label`.
- `the cache re-labels when the style object changes`.
- `barLabelPx multiplies by scale and fits with the scaled size`: `barLabelPx('C', 20, 200, undefined, 1)` is 14, at scale 1.5 it is 21, and at 0.5 it is 7. `barLabelPx('C', 18, 200, undefined, 0.5)` is 0 (6.3 is under the 7px floor). A label that fits at 1 but not at 1.5: `barLabelPx('C', 20, 18, undefined, 1)` is 14, but at 1.5 it is 0 (21 is more than `room - 2 = 16`).
- `drawBarLabel with the default paint sets today's font and colours`: record `ctx.font`, `strokeStyle`, `fillStyle` and `lineWidth` with a small recording ctx (extend `stubCtx`'s `set` trap to keep `font`, `strokeStyle` and `lineWidth` in a `sets` list). Expect `'600 14.0px Poppins, sans-serif'`, `'rgba(0, 0, 0, 0.35)'`, `'#ffffff'` and `3`.
- `a custom paint: family, weight, colours, no stroke at strokeWidth 0`: with `strokeWidth: 0`, `calls` has no `strokeText`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/core/render/barLabels.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Formatting order: choose the spelling (today's rule), then map the letter (solfège when the format is `solfege*`), then add the accidentals (glyph via `displayAccidentals` on the accidental part, or ascii as is), then apply the case to the letter or syllable part only, then add the octave for the `*-octave` formats. Extend `stubCtx` in `pianoRoll.test-helpers.ts` with the `sets` list (backward compatible).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project ivories packages/ivories/src/core/render`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/src/core/render
git commit -m "feat(ivories): bar label formats (solfège, ascii accidentals, case) and paint (font, colours, scale)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: React label props, font loading, exports, JSON Schema and README

**Files:**
- Create: `packages/ivories/src/react/text/useCanvasFont.ts`
- Create: `packages/ivories/src/template.schema.json` (hand-written, draft 2020-12)
- Modify: `packages/ivories/src/react/views/StageView.tsx`. New `noteBarLabelStyle?: BarLabelStyleInput` prop. `labels = useMemo(() => resolveBarLabels(tpl.labels, p.noteBarLabels, p.noteBarLabelStyle), …)`. `labelCtx.current.mode = labels`. `barLabel` is `undefined` when `!labels.show`. `barLabelPaint` is built in a `useMemo` from `labels.font` plus `useCanvasFont(labels.font.family, labels.font.weight)`, and passed to `renderer.draw`.
- Modify: `packages/ivories/src/react/views/Ivories.tsx`. `IvoriesProps.noteBarLabelStyle` is forwarded to `FallingKeys` and `RisingKeys`. `template` arrives through `IvoriesProviderProps` (Task 4).
- Modify: `packages/ivories/src/react/views/Stage.tsx`. The slot view props gain `noteBarLabelStyle`, forwarded like `noteBarLabels`.
- Modify: `packages/ivories/src/core/index.ts`. Add `export * from './template/types'`, `'./template/palette'`, `'./template/builtins'`, `'./template/decode'` and `'./template/resolve'` (not `./template/cssTheme`).
- Modify: `packages/ivories/package.json`. Add `"./template.schema.json": "./dist/template.schema.json"` to `exports`.
- Modify: `packages/ivories/scripts/copy-css.mjs`, which also copies `src/template.schema.json` to `dist/`. Modify `packages/ivories/scripts/check-dist.mjs`, which adds `'template.schema.json'` to the required entries.
- Modify: `packages/ivories/README.md`. A new `## Templates` section after `## Note names on the bars` covers the built-in table, the `template` prop on `<Ivories>`/`<IvoriesProvider>`/views, a custom template example extending `chord-cards`, colour mode, the `theme` vs `template` rule, the `!important` override note, the schema path `ivories/template.schema.json` and the validation rules. Extend `## Note names on the bars` with `noteBarLabelStyle` and solfège. Under `## Styling`, add a line saying a non-classic template writes tokens inline.
- Test: `packages/ivories/src/react/text/useCanvasFont.test.ts`, `packages/ivories/src/react/views/StageView.test.tsx`, `packages/ivories/src/react/views/Ivories.test.tsx`, `packages/ivories/src/core/template/schema.test.ts`

**Interfaces:**
- Consumes: `resolveBarLabels`, `ResolvedTemplate.labels` (Task 2); `BarLabelPaint`, `DEFAULT_BAR_LABEL_PAINT`, `StageInput.barLabelPaint` (Task 8); `ensureGoogleFont` (`react/text/googleFont.ts`); `isSafeFontFamily`.
- Produces: `export function useCanvasFont(family: string, weight: number): string`. For `'Poppins'` it returns `'Poppins, sans-serif'` at once (the host loads Poppins, as today). An unsafe family also gets that value. For any other family it calls `ensureGoogleFont(family, [weight])` and returns `'sans-serif'` until `document.fonts.load(`${weight} 16px "${family}"`)` settles, then `"${family}", sans-serif`, a one-time swap; the next rAF frame redraws. Without `document.fonts` (jsdom) it returns the quoted family at once. Ignore a settle that arrives after the family changed or the view unmounted.

- [ ] **Step 1: Write the failing tests**

- `useCanvasFont.test.ts` (renderHook):
  - `Poppins needs no load`: returns `'Poppins, sans-serif'` and adds no `<link>`.
  - `another family: sans-serif until fonts.load resolves, then the family, once`: stub `document.fonts = { load: vi.fn(() => promise) }`. It returns `'sans-serif'` and a `link[data-google-font="Nunito"]` exists; after resolving, it returns `'"Nunito", sans-serif'`; `load` was called with `'700 16px "Nunito"'`.
  - `an unsafe family falls back to Poppins and loads nothing`.
- `StageView.test.tsx`:
  - `noteBarLabels="none" draws no labels` (spy `renderer.draw` via `StageRenderer.prototype.draw` and assert `barLabel` is undefined).
  - `noteBarLabelStyle reaches the renderer as paint`: with `noteBarLabelStyle={{ font: { color: '#000000', scale: 1.2 } }}`, `barLabelPaint` has `color === '#000000'` and `scale === 1.2`.
  - `no label props: the default paint`: `barLabelPaint` deep-equals `DEFAULT_BAR_LABEL_PAINT`.
- `Ivories.test.tsx`, `template and noteBarLabelStyle pass through the preset`: `<Ivories template="chord-cards-crf" noteBarLabelStyle={{ format: 'solfege' }} … />` puts `data-ivories-template="chord-cards-crf"` on `.ivories-falling`.
- `schema.test.ts` (`// @vitest-environment node`): the schema parses as JSON; `properties.extends.enum` equals `BUILTIN_TEMPLATE_IDS`; `required` is `['v', 'kind', 'id', 'name']`; `properties.id.pattern` is `'^[a-z0-9-]{1,48}$'`; `properties.colour.properties.palette` has `minItems === maxItems === 12`; every key of `BUILTIN_TEMPLATES['chord-cards']`'s blocks appears in the schema's matching `properties`; `additionalProperties` is false on each block; and the numeric `minimum`/`maximum` values equal Task 1's clamp ranges (import them from `decode.ts` as an exported `TEMPLATE_RANGES` const).
- `package.test.ts`, `exports the template schema`: `pkg.exports['./template.schema.json'] === './dist/template.schema.json'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project ivories packages/ivories/src/react packages/ivories/src/core/template/schema.test.ts packages/ivories/src/package.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the hook, the props, the exports, the schema, the build copy and the README**

- [ ] **Step 4: Run the tests and the package build**

Run: `npx vitest run --project ivories && npm run check -w packages/ivories && npm run build -w packages/ivories && npm run check:imports`
Expected: every test passes, and the build ends with `dist check: entries present, externals allowed, CSS plain, SSR import ok`. `ls packages/ivories/dist/template.schema.json` exists.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories
git commit -m "feat(ivories): noteBarLabelStyle, label font loading without flicker, template exports, template.schema.json, docs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: E2E: default unchanged, chord cards + CRF in every view

**Files:**
- Modify: `apps/studio/src/embed/EmbedFixture.tsx`. Add `export const TEMPLATE_CASES` behind a `?templates` flag, documented in the component comment, with these sections (`data-case`, all `scoreUrl: '/fixtures/demo.mid'`, `chrome: 'none'`, frame `h-[360px]`):
  - `tpl-default` (falling, no template) and `tpl-classic` (falling, `template: 'classic'`)
  - `tpl-cc-falling` (falling, `chord-cards-crf`)
  - `tpl-cc-rising` (rising, `chord-cards-crf`) and `tpl-cc-rising-h` (rising, horizontal, `chord-cards-crf`)
  - `tpl-cc-keyboard` (keyboard, `chord-cards-crf`)

  Handles are registered in `registry.cases`.
- Create: `e2e/templates.spec.ts`
- Test: `apps/studio/src/embed/EmbedFixture.test.tsx` (the `?templates` sections render)

**Interfaces:**
- Consumes: the `template` prop and `data-ivories-template` (Task 4); `window.__ivoriesFixture.cases`; the `signature` and screenshot conventions of `e2e/rising.spec.ts` (`SHOTS = '/tmp/ivories-e2e'`, `SUPER_SHOTS = .superpowers/shots`).
- Produces: nothing used by later tasks.

- [ ] **Step 1: Write the failing fixture unit test and the e2e spec**

`EmbedFixture.test.tsx`, `?templates renders the six template cases`: `render(<EmbedFixture search="?templates" />)` gives six `section[data-case^="tpl-"]`.

`templates.spec.ts` (import `test, expect` from `./fixtures`; cold-load timeout 20 s like `rising.spec.ts`):
- `the default look is unchanged: no template and template="classic" draw the same pixels`. Wait for both canvases, pause both handles, `seek(2)` both, wait two animation frames, then expect `signature(default) === signature(classic)`. Also check that the `tpl-default` root has no inline `--ivories-key-white` (`el.style.getPropertyValue(...) === ''`).
- `chord-cards-crf, falling: paper stage, plate, pitch-coloured bars`. The root has `data-ivories-template="chord-cards-crf"`. After `seek(2)` the canvas pixel at (10, 10) CSS px is within ±3 of `rgb(251, 248, 241)`. At least one pixel in the roll area is within ±6 of a CRF palette colour. Screenshot `tpl-cc-falling.png` to `SHOTS` and `SUPER_SHOTS`.
- `chord-cards-crf, rising vertical and horizontal: same checks, horizontal keyboard on the left`. For horizontal, reuse `edges()` from `rising.spec.ts` (copy the helper) and expect the left edge (plate and keys) brighter than the stage. Screenshots `tpl-cc-rising.png`, `tpl-cc-rising-h.png`.
- `chord-cards-crf, keyboard only: plate and raised keys draw`. The keyboard-band pixel near the bottom edge (the plate's ink shadow) is within ±8 of `rgb(35, 31, 32)`. Screenshot `tpl-cc-keyboard.png`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project studio apps/studio/src/embed/EmbedFixture.test.tsx && npx playwright test e2e/templates.spec.ts --workers=2`
Expected: FAIL (no `?templates` cases).

- [ ] **Step 3: Add the fixture cases**

- [ ] **Step 4: Run the new and the existing e2e suites**

Run: `npx vitest run --project studio apps/studio/src/embed/EmbedFixture.test.tsx && npx playwright test e2e/templates.spec.ts e2e/rising.spec.ts e2e/embed-fixture.spec.ts e2e/count-in.spec.ts --workers=2`
Expected: PASS. Open the four screenshots in `.superpowers/shots/` and check them by eye against the mockup. Look for rounded outlined keys, black keys with a lip and an ink shadow toward the front (right side of the left-edge keyboard when horizontal), a white plate with ink borders, and flat CRF bars with ink outlines and down-right shadows.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/embed e2e/templates.spec.ts
git commit -m "test(e2e): default look unchanged; chord-cards-crf in falling, rising (both orientations) and keyboard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Release prep (0.3.0, not published) and the demo templates page

**Files:**
- Modify: `packages/ivories/package.json` (`"version": "0.3.0"`)
- Modify: `packages/ivories/CHANGELOG.md`. Add a `## 0.3.0 - 2026-10-23` section, with an "Added" list: templates, built-ins, `template` prop, CRF palette, pitch colour mode, flat shading, note-tinted flash, chord cards keys, `noteBarLabelStyle`, solfège, `decodeTemplate`/`resolveTemplate`/`BUILTIN_TEMPLATES`/`CRF_PITCH_PALETTE`, `ivories/template.schema.json`, `ThemeSettings.template` in looks and profiles. Add a "Changed" line: an explicit `theme` prop now clears a template from a look.
- Demo (`/home/shaun/score-demo`, not a git repo, so no commit):
  - Modify: `package.json`, setting the dependency `"ivories": "file:/tmp/ivories-pack/ivories-0.3.0.tgz"`
  - Modify: `src/components/IvoriesDemo.tsx`. `Variant` gains `template?: TemplateRef`, `noteBarLabels?: NoteBarLabels` and `noteBarLabelStyle?: BarLabelStyleInput` (types from `'ivories'`), passed to `<Ivories>`.
  - Create: `src/pages/tickle-me/templates.astro` (title "Templates"; lede "One option changes the whole look; templates are plain data."). Variants at `height: 360`: one `falling` per built-in in `BUILTIN_TEMPLATE_IDS` order, titled with the built-in's `name` and captioned with its id. Then `rising` horizontal `chord-cards-crf`. Then the label example: `falling`, `chord-cards-crf`, `noteBarLabelStyle: { format: 'solfege-octave', font: { family: 'Nunito', weight: 700, scale: 1.2 } }`, titled "Label styling: solfège in Nunito".
  - Modify: `src/layouts/Base.astro` (nav entry `{ href: '/tickle-me/templates', label: 'Templates' }`) and `src/pages/index.astro` (an `overview-card` for Templates, same markup as its neighbours).

**Interfaces:**
- Consumes: the published-shape package from Tasks 1-10.
- Produces: `/tmp/ivories-pack/ivories-0.3.0.tgz` and the demo page at `http://<host>:4331/tickle-me/templates`.

- [ ] **Step 1: Bump the version and write the changelog**

- [ ] **Step 2: Full verification**

Run: `npm test && npm run check -w packages/ivories && npm run check && npx playwright test --workers=2`
Expected: every unit suite passes; the e2e suite passes (rerun a single failing spec once with `--workers=1` before treating it as real).

- [ ] **Step 3: Commit**

```bash
git add packages/ivories/package.json packages/ivories/CHANGELOG.md package-lock.json
git commit -m "chore(ivories): 0.3.0: style templates (not published)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Pack the tarball**

Run: `mkdir -p /tmp/ivories-pack && cd /home/shaun/tickle-me-ivorys-soundfont/packages/ivories && npm pack --pack-destination /tmp/ivories-pack && tar -tzf /tmp/ivories-pack/ivories-0.3.0.tgz | grep -E 'template.schema.json|dist/core.js'`
Expected: both `package/dist/template.schema.json` and `package/dist/core.js` are listed.

- [ ] **Step 5: Build the demo page**

Make the demo edits listed under Files, then run: `cd /home/shaun/score-demo && npm install && npm run build`
Expected: the build succeeds and `dist/tickle-me/templates/index.html` exists.

- [ ] **Step 6: Serve the demo on :4331**

Run: `ss -ltnp | grep ':4331'`. If a process is listening, `kill <pid>` using that PID only. Then start `cd /home/shaun/score-demo && npx -y serve@14 dist -l tcp://0.0.0.0:4331` in the background.
Expected: `curl -s -o /dev/null -w '%{http_code}' http://localhost:4331/tickle-me/templates` prints `200`. Open the page and check that every built-in renders and the solfège example shows Nunito labels after one swap.

- [ ] **Step 7: Stop and report**

Do not publish. Report the tarball path, the demo URL, and that `npm publish` is waiting for the user.
