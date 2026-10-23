# Ivories style templates

Date: 2026-10-23. Branch `feat/ivories-style-templates`, stacked on
`feat/ivories-fallback-soundfont` (PR #3, ivories 0.2.0).

## Intent

Ivories should be able to look like the chord cards: rounded keys, ink
outlines, black keys that read as raised, the keyboard sitting on an ink plate
with a hard shadow. Notes should be able to take the CRF pitch colours, the
same 12-colour key used across chord cards, tiles, doremino and crf-new.
Either look should work alone or combined.

The look is chosen with an option when the component loads. A look is plain
data in a published format, so anyone can write their own template, not just
pick from the built-ins.

The user's main target is **chord cards + CRF colours**.

## Goals

1. **A template format.** It's a versioned, validated, JSON-safe object
   describing the stage's look. The built-ins are written in the same format
   as a custom template.
2. **A `template` option on the component.** It takes a built-in id or a
   template object.
3. **Built-in templates:**
   | Id | Description |
   |---|---|
   | `classic` | Today's look, unchanged. |
   | `classic-crf` | Classic keys and stage, notes coloured by pitch. |
   | `chord-cards` | The chord cards key style (below), notes coloured by hand. |
   | `chord-cards-crf` | The chord cards key style with pitch colours. |
   | `outline`, `contrast`, `transparent` | Today's presets, re-expressed as templates. |
4. **Colour mode is separate from key style.** A template's `colour.mode` is
   `hand` (today: each voice's own hue, shaded by the velocity scheme in
   `Settings.velocity`) or `pitch` (a 12-colour palette by pitch class). Any
   key style can use either mode. `pitch` defaults to the CRF palette; a
   template may supply its own 12 colours.
5. **Note labels on the bars are optional and fully styleable** (details
   below).
6. **The landing animation (the hit flash) stays in every template.**

## Non-goals

- Restyling pepperscore or the notation panel.
- Restyling the transport and chrome in this pass. The format reserves an
  optional `chrome` block, but this pass neither uses nor validates it beyond
  "an object of CSS colour strings". *(My call.)*
- A visual template editor UI.
- Adding the template option to the becreative Tickle Me block or crf-admin.
  That's a later follow-up.
- Changing how keys on the keyboard are labelled (the DOM overlay's
  `text.labels`). This pass covers labels on the falling/rising bars.

## Anti-goals

- **No regression in the default look.** With no template given, ivories
  renders pixel-identically to today. The existing e2e screenshots must not
  change.
- **No new per-frame cost of note.** Template values resolve once per layout
  or template change, as `readTheme()` does today, never per bar per frame.
- **No unsafe strings reach CSS or the canvas.** Fonts and colours from a
  custom template are untrusted and are validated like a look import.

## The chord cards key style

This matches chord cards (chordl's "exact" geometry, chordcards'
`crf-default` theme), plus the raised black keys the user asked for. Chord
cards themselves have flat black keys today; the raised look is new.

- **Stage:** paper `#fbf8f1`. Grid lines are ink at about 8% alpha.
- **White keys:**
  - fill `#fafafa`
  - 1px stroke `#333333`
  - corner radius 3 (in chordl units of a 25.3-wide white key, so it scales
    with key width)
  - all four corners rounded
- **Black keys:**
  - fill `#222222`
  - 1px stroke `#333333`
  - radius 2 *(chordl uses 1; 2 reads better at stage size, my call)*
  - geometry unchanged from ivories today
- **Raised black keys:**
  - A hard, unblurred ink (`#231f20`) shadow offset 2px toward the player.
  - A lighter front lip about 6px deep (`#4a4a4a`) inset from the key's sides
    by about 1.5px.
  - A held black key "sinks": the shadow drops to about 0.5px and the lip
    darkens.

  Offsets scale with key width. "Toward the player" follows orientation (see
  Constraints).
- **Plate:** the keyboard sits on a full-width white plate with:
  - 2px ink borders at the top and bottom, no side borders
  - a hard 4px ink shadow below
  - about 6px of padding above the keys
- **Bars:** `shading: 'flat'` (one solid colour per bar, no in-bar gradient) with:
  - a 1.5px ink outline
  - a hard 2px ink shadow, offset down and right in screen space
  - radius 4
- **Pressed keys:** filled with the note's colour (as today). In pitch mode
  that's the pitch colour.

The mockup the user approved is at
`.superpowers/brainstorm/*/content/templates-v2.html` (the "Chord cards + CRF"
card).

## CRF pitch palette

The palette is pitch class 0–11, sharps and flats sharing a colour:

```
C #f86e6e  C♯ #f58841  D #ffbc57  D♯ #b8a334  E #fff56d  F #b3f888
F♯ #93d154 G #6bc6a0  G♯ #7ee8df  A #88a7f8  A♯ #cc97e8  B #e277b1
```

The canonical source is chordl `chordl-core/src/themes/crf.ts`
`CRF_PITCH_PALETTE`. Ivories carries its own constant (no chordl dependency),
with a comment naming the source and a unit test pinning the 12 values.

In `pitch` mode:
- Bars and pressed keys use the palette colour flat. Velocity is not shown.
  *(My call, matches the cards.)*
- The hit flash is tinted by the note's pitch colour instead of white/warm.
  The flash's shape, timing and intensity are unchanged. *(My call.)*
- Live MIDI input notes also take their pitch colour.

## Note bar labels

Today the labels are hard-coded:
- white Poppins 600
- `rgba(0,0,0,0.35)` stroke
- content set by `noteBarLabels: 'pitch' | 'pitch-octave' | 'none'`

They become a `labels` block. A template sets the defaults, and the
component's props override them.

```ts
labels: {
  show: boolean                         // default true
  format: 'pitch' | 'pitch-octave' | 'solfege' | 'solfege-octave'
  accidentals: 'glyph' | 'ascii'        // F♯ vs F#; default glyph
  font: {
    family: string                      // Google Fonts family; default 'Poppins'
    weight: number                      // 100-900; default 600
    scale: number                       // 0.5-1.5 multiplier on the auto size; default 1
    color: string                       // default '#ffffff'
    strokeColor: string                 // default 'rgba(0,0,0,0.35)'
    strokeWidth: number                 // px, 0 = no outline; default 3 (still capped by px/4)
    case: 'upper' | 'lower'             // default upper (solfège: 'Do' vs 'do' handled as title/lower)
  }
}
```

- **`solfege`** is fixed do: Do Re Mi Fa Sol La Si. Accidentals are added with
  the same glyph/ascii rule ("Fa♯"). Movable do and scale degrees are out of
  scope. *(My call, can be added later as more `format` values.)*
- **Sizing:** keep the current auto-fit (`barLabelPx`) and multiply by
  `scale`. The fit test uses the scaled size, so a label that no longer fits
  is skipped, as today.
- **Fonts** load with the existing `react/text/googleFont.ts` loader. The
  canvas must not draw a label in a fallback font and then flick: wait for
  `document.fonts.load()` of that family and weight, then redraw. Until it
  loads, draw labels in the fallback `sans-serif` (a one-time swap is
  acceptable).
- **Props:** `noteBarLabels` stays as a shorthand for `labels.format` / `show`
  (`'none'` means `show: false`), so 0.2.0 callers keep working. A new
  `noteBarLabelStyle` prop takes a partial `labels` block.

## The template format

```ts
interface IvoriesTemplateV1 {
  v: 1
  kind: 'ivories-template'
  id: string                 // [a-z0-9-]{1,48}
  name: string               // display name, ≤ 64 chars
  extends?: BuiltinTemplateId // start from a built-in, then override
  stage?: {                  // each maps 1:1 to an existing --ivories-* token
    bg, gridLine, gridLineC4, beatLine, barLine, middleCMark, progressTrack, progressFill
  }
  keys?: {
    white, black, border, borderWidth, gap,
    whiteRadius, blackRadius, // in units of white-key width / 25.3 (chordl units), see below
    outline,
    raised?: { enabled, shadowColor, shadowDepth, lipColor, lipDepth },
    plate?:  { enabled, fill, borderColor, borderWidth, shadowColor, shadowDepth, padding },
  }
  bars?: {
    radius, outlineColor, outlineWidth, shadowColor, shadowDepth,
    shading: 'velocity' | 'flat',
  }
  colour?: {
    mode: 'hand' | 'pitch'
    palette?: string[12]     // pitch mode; default CRF
  }
  flash?: { tint: 'white' | 'note' }
  labels?: Partial<labels block above>
  chrome?: Record<string, string>   // reserved, not applied this pass
}
```

- **Validation.** A template is untrusted input. `decodeTemplate(u)` follows
  the `decodeLook` pattern:
  - size limit 16 KiB
  - unknown keys dropped
  - every colour through `isCssColor`, falling back to the base template's
    value
  - the font through `isSafeFontFamily`
  - numbers clamped to ranges
  - a palette that isn't exactly 12 valid colours falls back to CRF

  An invalid envelope (wrong `v`/`kind`) throws a `PlatformError` like
  `decodeLook`.
- **Resolution.** The resolver starts from `extends` (or `classic`), deep
  merges the template's blocks, and produces a fully resolved template. The
  renderer reads only the resolved form. Resolution runs once per template or
  layout change.
- **CSS tokens:** see "Settled after the builder check", item 5.
- **The existing theme names** (`classic`, `outline`, `contrast`,
  `transparent`) become built-in templates. `theme` prop, `Settings.theme.name`
  and saved looks/profiles that name them keep working unchanged. `template`
  wins over `theme` when both are given.
- **Looks and scenes:**
  - `LookV1` gains an optional `template` field (a built-in id or an inline
    template). It's optional so saved looks stay valid, and it's decoded with
    `decodeTemplate`.
  - Looks without it behave as today.

## API

```tsx
<Ivories template="chord-cards-crf" />
<Ivories template={myTemplate} />                // IvoriesTemplateV1 object
<Ivories template="chord-cards" noteBarLabels="pitch-octave"
         noteBarLabelStyle={{ font: { family: 'Nunito', weight: 700 } }} />
<IvoriesProvider template="classic-crf">…</IvoriesProvider>
```

Exports:
- `BUILTIN_TEMPLATES`
- `CRF_PITCH_PALETTE`
- `decodeTemplate`
- `resolveTemplate`
- the types `IvoriesTemplateV1` and `ResolvedTemplate`

A JSON Schema file for the format ships in the package (`template.schema.json`)
so template authors get editor validation.

## Constraints

- **All views:**
  - keyboard only
  - falling (vertical)
  - rising piano roll, vertical and horizontal
  - the keyboard in keyboard+score

  "Toward the player" for the raised-key shadow and lip is the direction the
  key's front faces: down in vertical layouts, the matching side in
  horizontal. The plate's hard shadow follows the same rule.
- **Scaling.** Radii and raised/plate depths scale with white-key width so the
  look holds from a phone to a wide stage.
- **Rendering.** Canvas 2D, Poppins default, the house note-text style for the
  default labels (white, `rgba(0,0,0,0.35)` stroke 3, paint stroke first).
- **Defaults.** No template means `classic` with today's tokens.
  `pitch-octave`/`pitch`/`none` behave exactly as today.
- **Tests:**
  - unit tests for decode/resolve, palette, label formatting (solfège,
    accidentals, case) and label sizing with scale
  - a renderer test that the default template draws as before
  - e2e screenshots added for `chord-cards-crf` in falling and piano-roll
    views
- **Release.** This is a minor release: ivories 0.3.0 after 0.2.0 is
  published.
- **Demo.** The local demo site (`/home/shaun/score-demo`) gets a
  `/tickle-me/templates` page showing each built-in template, plus a label
  styling example.

## Settled after the builder check (my calls)

1. **Velocity colours stay a user setting.** `Settings.velocity` (lightness
   or gradient, edited in the VelocityEditor, saved in prefs, profiles and
   looks) keeps driving `hand` mode exactly as today. A template doesn't
   carry velocity colours. In `pitch` mode velocity isn't shown.
2. **Voice hues aren't touched.** Each voice's `hue`, including saved
   per-song hues, stays the source in `hand` mode. Templates have no hue
   list.
3. **The template lives in settings.**
   - `ThemeSettings` gains an optional `template` field (a built-in id or an
     inline `IvoriesTemplateV1`). `name` stays for the legacy presets.
   - `lookFromSettings` and profiles carry it, and both codecs decode it with
     `decodeTemplate`.
   - The `template` prop slots into `resolveSettings` at the same precedence
     as the `theme` prop does today. When both are set, `template` beats
     `theme`.
4. **Flat shading in hand mode:**
   - Each bar is one solid colour: the velocity scheme's colour at that
     note's velocity, without today's in-bar gradient.
   - Pressed keys and live notes are coloured the same way.
5. **How template tokens reach the page:**
   - The resolved template's stage, key and bar values are written as
     `--ivories-*` custom properties inline on the `.ivories` root element,
     and `readTheme()` reads them as it does today.
   - With no template (and `classic`), nothing is written inline, so the
     current CSS and any host overrides behave exactly as today.
   - Under a non-classic template, a host overrides a token with
     `!important` or by passing a custom template.

   This replaces the earlier "host CSS wins" line.
6. **`stageBgOverride` beats the template's `stage.bg`.** Keyed workflows
   keep a clean matte. The plate and keys still draw.
7. **Live input in `hand` mode keeps `--ivories-live-hue`.** In `pitch` mode
   live notes take their pitch colour.

## Left to the builder

- How template values travel to the canvas: extend `readTheme()` / `Theme`, or
  a parallel resolved-template object passed in render state.
- The exact names in the `stage`/`keys`/`bars` blocks, as long as each stage
  value maps to an existing `--ivories-*` token.
- Whether the outline/contrast/transparent presets move from CSS into
  template objects or stay as CSS classes the built-ins point at. Either way,
  output must be unchanged.
- How the flash tint is implemented for `note` (the colour stops in
  `flashKey`).
- The JSON Schema's generation (hand-written or from types).
