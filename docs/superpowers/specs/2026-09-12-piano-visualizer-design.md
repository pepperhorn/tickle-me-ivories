# Tickle Me Ivorys — Design Spec

**Date:** 2026-09-12
**Status:** Approved for planning
**Scope:** v1 application design

## 1. Purpose

A browser app that displays a full 88-key piano keyboard and visualises music on it, from two sources:

- **Live MIDI input** — keys pressed on a connected controller light up, coloured by velocity.
- **File playback** — a MIDI or MusicXML file drives the display and audio.

The app is a visualiser and player. It is architected so that practice features (wait-for-note, hit scoring) can be added in phase 2 without reworking the note model or the clock, but none of that ships in v1.

### Success criteria

1. A dense file (Rush E scale, 10k+ notes) plays at 60 fps with audio that does not audibly drift from the visuals.
2. Live controller input lights the correct key within one frame, with velocity legible from colour alone.
3. Reopening a previously loaded file restores its voice colours, tempo setting and display mode with no user action.
4. Usable fullscreen in phone landscape.

## 2. Decisions taken

| Question | Decision |
|---|---|
| Product scope | Visualiser/player now; practice features are phase 2 but the model must accommodate them |
| Audio | smplr for file playback, live input sounding, and a metronome |
| Notation | Verovio, MusicXML only in v1; MIDI transcription deferred to phase 2 |
| Voice model | Auto-detected from tracks/channels/parts, user-renameable and recolourable |
| Roll renderer | Canvas 2D, windowed draw |
| Persistence | Settings + song reference (content hash), autosaved, exportable as JSON |
| Live velocity colour | Both schemes ship; user-selectable |
| Master BPM | Both tempo-scale % and absolute-BPM override, toggleable |
| Hand split | Auto-split single-track MIDI at a movable pitch point |
| Multi-instrument MIDI | All tracks become voices; each voice picks its own smplr instrument |
| Screen targets | Desktop-first, must work fullscreen in phone landscape |
| Visual style | SheetMusicBoss / Synthesia "Rush E" treatment: black field, octave grid, bars sustaining into tinted keys, white impact flash on strike |
| Clock | AudioContext master clock + lookahead scheduler |
| Stack | Vite + React + TypeScript + Tailwind + Zustand |

### Known platform constraints

- **Web MIDI is Chromium-only.** Firefox and Safari have no Web MIDI API. Live input is Chrome/Edge/Opera only; file playback works everywhere.
- **Verovio cannot import MIDI.** Its importers are MEI, MusicXML, Humdrum, ABC, PAE, DARMS and MuseData. Notation mode is therefore MusicXML-only in v1.
- **AudioContext requires a user gesture** before it will produce sound.

## 3. Architecture

Four layers, one direction of flow:

```
INPUT                MODEL              TRANSPORT           RENDER
-----                -----              ---------           ------
.mid  --parseMidi--+
.xml/.mxl -parseXml-+-> ScoreDocument --> scheduler --> smplr (audio)
                   |    (notes, voices,       |
Web MIDI ----------+     tempo map)      AudioContext
  (live)                                  .currentTime
                                               |
                                               +--> keyboard canvas
                                               +--> piano-roll canvas
                                               +--> Verovio cursor
```

`AudioContext.currentTime` is the single source of truth for time.

- The **scheduler** ticks on a ~25 ms interval, walks the time-sorted note array, and hands smplr every note starting within the next ~150 ms with an exact `time` argument. Web Audio then plays them sample-accurately regardless of main-thread jitter.
- The **draw loop** runs on `requestAnimationFrame`, reads the same clock, and derives everything visible as a **pure function of `t`**: which keys are lit, which rectangles are falling, where the notation cursor sits.

Because the display is derived rather than event-driven, seeking, pausing and tempo changes cannot cause visual desync — there is no accumulated visual state to correct.

### Clock math

```
playheadSec = audioCtx.currentTime - originSec     (while playing)
playheadSec = pausedAtSec                          (while paused)
```

Seeking sets `originSec = audioCtx.currentTime - targetSec`. Changing tempo captures the current position in **ticks**, recomputes every note's seconds from the tempo map under the new setting, then sets `originSec` so that the same musical position is preserved. The playhead never jumps.

## 4. Data model

Musical time (ticks) is the truth; seconds are derived. This is what allows the BPM control to re-time the piece repeatedly without degrading the source data.

```ts
type VoiceId = string;

interface NoteEvent {
  id: number;
  pitch: number;          // MIDI 0-127; 21-108 are on the keyboard
  startTicks: number;
  durTicks: number;
  startSec: number;       // derived from tempoMap + tempo setting
  endSec: number;
  velocity: number;       // 0-127
  voiceId: VoiceId;
}

interface Voice {
  id: VoiceId;
  label: string;                  // "Right hand", user-editable
  source:
    | { kind: 'midi-track'; index: number; channel: number }
    | { kind: 'xml-part'; partId: string; staff: number };
  hue: number;                    // 0-360
  instrument: string;             // smplr instrument identifier
  visible: boolean;
  audible: boolean;
  volume: number;                 // 0-1
}

interface TempoEvent { ticks: number; sec: number; bpm: number; }
interface TimeSigEvent { ticks: number; numerator: number; denominator: number; }

interface ScoreDocument {
  id: string;                     // SHA-256 of file bytes; the profile key
  name: string;
  ppq: number;
  tempoMap: TempoEvent[];
  timeSignatures: TimeSigEvent[];
  voices: Voice[];
  notes: NoteEvent[];             // sorted ascending by startSec
  durationSec: number;
  sourceFormat: 'midi' | 'musicxml';
  rawXml?: string;                // retained verbatim for Verovio
}
```

**Invariants**

- `notes` is always sorted by `startSec`. Both the scheduler cursor and the renderer's window search depend on it.
- Every `NoteEvent.voiceId` resolves to a member of `voices`.
- `tempoMap` is sorted by `ticks` and always contains an entry at tick 0.

## 5. Modules

```
src/
  main.tsx
  App.tsx
  model/
    types.ts             the interfaces above
    tempoMap.ts          ticksToSec / secToTicks; scale% and absolute-BPM modes
  io/
    loadFile.ts          dispatch by extension, with content sniffing fallback
    parseMidi.ts         @tonejs/midi -> ScoreDocument
    parseMusicXml.ts     XML (and .mxl unzip) -> ScoreDocument, retains raw text
    handSplit.ts         single-track MIDI -> two voices at a movable split point
    hashFile.ts          SHA-256 of the ArrayBuffer via SubtleCrypto
  audio/
    engine.ts            AudioContext ownership, smplr instrument cache
    scheduler.ts         lookahead loop; clock injected for testability
    metronome.ts         click derived from tempoMap + timeSignatures
  transport/
    useTransport.ts      play / pause / seek / tempo; origin math
  midi-input/
    useMidiInput.ts      Web MIDI -> Map<pitch, { velocity, tStart }>
  render/
    geometry.ts          pitch -> x / width for 52 white + 36 black keys
    keyboard.ts          canvas draw
    pianoRoll.ts         canvas draw, windowed
    colors.ts            (hue, velocity) -> css colour
    useCanvasStage.ts    rAF loop, devicePixelRatio, resize observer
  notation/
    VerovioPanel.tsx     MusicXML only in v1
  state/
    useSettingsStore.ts  zustand, persisted
    useScoreStore.ts     current ScoreDocument
  profile/
    schema.ts            versioned profile shape + validation
    exportImport.ts      download / file-pick / drag-drop
  ui/
    TransportBar.tsx  SettingsMenu.tsx  VoiceRow.tsx
    FileDropZone.tsx  ModeSwitch.tsx    Toast.tsx
```

Each module has one job and a narrow interface. `render/*` is pure drawing given `(ctx, state, t)` and holds no state of its own; `audio/scheduler.ts` takes its clock as a parameter so it can be driven by a fake clock in tests.

## 6. Input paths

### 6.1 MIDI file

Parsed with `@tonejs/midi`. Each track (excluding channel 10 drums from the keyboard, though still listed as a voice) becomes a `Voice`. If the file has exactly one pitched track, `handSplit.ts` splits it into two voices at a default of middle C (MIDI 60), exposed as a draggable split-point control. Tempo and time-signature meta events build the `tempoMap`.

### 6.2 MusicXML file

`.xml`, `.musicxml` and `.mxl` (zipped, unpacked with `fflate`). Each `part` + `staff` combination becomes a `Voice`. Note durations come from `<duration>` against `<divisions>`; ties are merged into single `NoteEvent`s; `<sound tempo>` and metronome directions build the `tempoMap`. The raw XML text is retained on the document so Verovio can render the original engraving rather than a round-trip.

### 6.3 Live MIDI input

`navigator.requestMIDIAccess()`. `noteon` with velocity > 0 adds to an active-note map; `noteon` with velocity 0 and `noteoff` remove. The keyboard renderer reads that map each frame. When "sound local input" is enabled, each `noteon` also triggers smplr immediately (no lookahead — latency matters more than jitter here). Device selection and hot-plug (`statechange`) are handled in the hook.

## 7. Colour system

**File playback.** Each voice owns a hue. Velocity drives lightness within that hue — soft notes light, hard notes dark and saturated:

```
lightness = lerp(Lmax, Lmin, velocity / 127)    // Lmax 78%, Lmin 38% by default
color     = hsl(voice.hue, saturation, lightness)
```

`Lmax`, `Lmin` and saturation are settings. The mapping is monotonic by construction, which is asserted in tests.

**Live input.** Two schemes ship, selectable in settings:

1. *Single-hue lightness ramp* — same formula as above against a dedicated live-input hue. Consistent with the file-playback language.
2. *Multi-stop gradient* — editable stops (default blue to green to yellow to red) interpolated across the velocity range. More immediately readable as attack strength.

**Default palette.** Voice hues are assigned evenly around the wheel (`i * 360 / n`, offset to start at a pleasant blue) so any voice count stays distinguishable without manual assignment.

## 8. Rendering

**One canvas, two passes.** The roll and the keyboard share a single DPR-aware canvas redrawn each rAF, not two stacked canvases. This is required by the visual style in §8.1: note bars must be able to overlap the key surface as they land, and the impact bloom must spill both upward into the roll and downward across the keys. Two canvases would clip both effects at the seam.

**Geometry.** `geometry.ts` computes, once per layout change, the x position and width of all 88 keys. All renderers and hit-testing share this one map.

The 52 white keys tile the width exactly: `whiteW = width / 52`. Black keys are **not** centred on the boundaries between white keys — a real piano is built so the white-key *tails* behind the black keys are equal width, three equal tails across C–D–E and four across F–G–A–B. That construction reduces to a fixed offset of each black key's centre from the white-key boundary, in units of the black-key width `b`:

| key | offset from boundary |
|---|---|
| C# | `-b/6` |
| D# | `+b/6` |
| F# | `-b/4` |
| G# | `0` (the only one actually on a boundary) |
| A# | `+b/4` |

The offsets are expressed **as multiples of `b`, not as a fixed table**, so the rule holds for any black-key width. This is deliberate: it is the same construction chordl uses in `chordl-core/src/engine/svg-constants.ts`, but parameterised, so the two apps agree on the rule while choosing their own proportions.

Corroborated three ways:

1. Derived from the equal-tails construction.
2. Measured off all 36 black keys in `docs/reference-sheetmusicboss.png` — agrees to within **0.32 px on a 23.5 px white key**.
3. Already present in chordl's `BLACK_KEY_OFFSETS`, whose C#, D#, F# and A# entries match the construction to 0.0033 units.

chordl's G# entry is the one exception: `16.25` where the construction gives `16.50`, out by 1.09% of a white key. Worth a fix upstream; this app uses the constructed value. **G# sitting exactly on the G/A boundary is invariant across every credible source** — DIN 8996 and BDO Normzeichnung 12 both give it as exactly 0, as do all four black-key placement patterns found in production instruments. It is the one position with no legitimate variation.

**Sources.** The dimensional standards are all withdrawn but agree: DIN 8996:1985 *Klaviatur für Pianos und Flügel; Maße* (withdrawn, no replacement), JIS S 8507:1992 (withdrawn 2025), and the BDO/VOD *Orgelspieltischnormen 2000* Normzeichnung 12 "Pianoteilung", a dimensioned drawing of exactly this layout. DIN gives C/D/E tails of 15.93 mm and F/G/A/B tails of 14.97 mm against a 23.6 mm pitch and 11.5 mm sharp — the equal-tails construction exactly. There is no ISO piano keyboard standard.

Production instruments do vary — equal-tails is the provable optimum (max tail spread `B/12`), but B/8, B/6 and B/4 patterns all ship. Equal-tails is what the standards, chordl and the reference all use.

**Black key width is `0.5652 * whiteW` (13/23), matching chordl.** This is deliberately wider than a real instrument: DIN 8996 gives a black-key body of 11.5 mm against a 23.586 mm white-key pitch (**0.488**), and the BDO layout slot including clearance is 12.70/23.6 (**0.538**). Narrow black keys read badly at phone scale, so both chordl and the SheetMusicBoss reference draw them wider than life; matching chordl keeps the two apps consistent and costs at most 0.25 px against the measured reference.

> The often-quoted "13.7 mm black key width" is wrong and must not be reintroduced. 13.7 mm is `octave / 12` — the semitone *action spacing* at the rear of the keybed (165.1/12 = 13.76). Black key tops are 9.0–10.5 mm and bodies 11.0–12.5 mm (JIS S 8507, DIN 8996).

**Vertical proportions are derived from key width, never from the viewport:** `keyboardH = min(whiteW * 5.8, stageH * 0.55)`, black key length `0.655 * keyboardH`.

**5.8 : 1 is a chosen value, not a measured one.** It is shorter than both the reference frame (measured **6.31 : 1**) and the standard (DIN 8996's 145 mm natural against a 23.586 mm pitch, **6.15 : 1**), trading key length for roll height — the falling notes are the main event, and on a phone in landscape every pixel the keyboard gives back is a pixel of lead time. Adjustable in the debug rig (§13) if it wants revisiting.

What is *not* negotiable is that the ratio derives from key **width**. Taking it from stage height instead is the defect this replaced.

The black-key length ratio has two independent confirmations at **0.655**: JIS S 8507's 95 mm sharp against DIN's 145 mm natural gives 0.6552, and the reference frame measures 0.6554. Taking height from the viewport instead is a real trap — an earlier prototype used `clamp(stageH * 0.28, 46, 150)`, which yields a correct-looking **6.68 : 1** in phone landscape but **19.50 : 1** in phone portrait, where keys are two and a half times too long. The cap at 55% of stage height only engages on very short windows and leaves the aspect alone otherwise.

**Windowed draw.** The roll binary-searches the sorted note array for the first note with `endSec >= t`, then iterates forward while `startSec <= t + fallSeconds`, drawing only that slice. Cost scales with notes *on screen*, not notes in the file, so a 10k-note piece draws no slower than a 200-note one. `fallSeconds` is a settings slider, default 3 s.

**Keyboard zoom.** On load, the keyboard auto-fits to the piece's pitch range so simple pieces get large readable keys. Overridable to full-88 or a manual range.

The fitted range is then widened so it never cuts through the middle of a black-key group — a keyboard ending between C# and D#, or between F# and G#, reads as broken. chordl already solves this in `chordl-core/src/resolver/auto-layout.ts` (`ensureFullBlackKeyGroups`): extend the start down to C when it lands on D, to F when it lands on G or A; extend the end up to E when it lands on D, to B when it lands on G or A. Port that rule rather than reinventing it. Because the phone-landscape full-88 case yields ~16 px keys, **middle C always carries a distinct dark border and a `C4` label** so orientation never depends on counting keys.

**Highlights.** Lit keys are derived each frame: file notes where `startSec <= t < endSec` on a visible voice, unioned with the live-input active map. No highlight state is stored or toggled.

**Shared geometry with chordl.** chordl (`/home/shaun/chordl`) is the house source for piano-keyboard geometry, exported from `@pepperhorn/chordl-core`. This app does not depend on the package — chordl's two presets are SVG chord-card illustrations at 2.83 : 1 (compact) and 4.74 : 1 (exact/full), far squatter than a performance keyboard needs — but it shares chordl's black-key **rule** and its black-key **width ratio**. If the rule is ever corrected in one place it should be corrected in both.

### 8.1 Visual style

The target look is the SheetMusicBoss / Synthesia "Rush E" treatment: black field, coloured bars falling onto the keys, and a bright flare at the moment of impact.

**Draw order,** back to front:

1. Black field.
2. Octave grid — a 1 px vertical line at every C boundary, `rgba(255,255,255,0.06)`; the C4 line is drawn at `0.14` so middle C reads as the orientation anchor in the roll as well as on the keys.
3. White-key note bars.
4. Black-key note bars, on top, so accidentals are never hidden behind the naturals beside them.
5. Keyboard: unpressed keys, then pressed keys tinted in their voice colour.
6. Impact layer — bloom, beam and sparks, drawn with `globalCompositeOperation = 'lighter'` inside a `save()`/`restore()` pair.
7. Progress line — a 3 px bar along the very bottom edge, filling left to right with playback position.

**Note bars.** Rounded rectangles, corner radius `min(4, width / 3)`, filled with a vertical gradient running from the note's velocity colour to roughly 8% lighter at the leading (lower) edge, plus a 1 px lighter top edge. Black-key bars are drawn at the black key's narrower width so every bar lines up with the key it will strike.

**Sustain into the key.** A bar does not stop at the hit line. While `startSec <= t < endSec` the bar is drawn continuing down over the key it occupies, and the key itself is tinted in the same velocity colour — white keys tinted full height, black keys tinted with a brighter top edge. The bar and the lit key read as one object, which is what makes the strike feel physical.

**Impact flash.** Spawned at note onset and decaying over `FLASH_MS = 220`:

```
age = t - note.startSec
a   = max(0, 1 - age / FLASH_MS) ** 2          // eased decay
i   = a * lerp(0.45, 1.0, velocity / 127)      // soft notes still register
```

At intensity `i`, centred on the key's horizontal midpoint at the hit line:

- **Bloom** — radial gradient, radius `2.2 * keyWidth * i`, white at `0.9 * i` fading to transparent.
- **Beam** — the topmost ~18 px of the key and the lowest ~24 px of the bar washed toward white, so the strike point goes white-hot rather than merely glowing.
- **Sparks** — 5 short rays at roughly ±20° and ±50° from vertical, length `1.6 * keyWidth * i`, 1 px, white, fading with `i`.

**The flash stays a pure function of `t`.** Intensity is computed from `t - note.startSec` on notes already inside the draw window — nothing is spawned, stored, or ticked. This preserves the §3 invariant: scrubbing backwards, pausing mid-flash and changing tempo all produce exactly the right flash state, with no particle pool to reset. Live-input flashes use the same function against the active map's `tStart`.

**Cost.** The impact layer only touches notes whose onset is within 220 ms of `t` — a handful even in the densest passages — so it does not change the windowed-draw performance characteristic.

All three effects are settings: impact flash on/off and intensity, grid lines on/off.

## 9. Settings dropdown

- **Master BPM** — mode toggle between *Scale %* (25–300, respects the file's tempo map, so ritardandos survive) and *Absolute BPM* (constant, flattens the map). Effective BPM at the playhead is always displayed.
- **Voices** — per voice: colour swatch with hue picker, editable label, smplr instrument select, visible and audible toggles, volume.
- **Velocity mapping** — scheme selector, lightness range, gradient stop editor.
- **Display** — mode (Keyboard / Falling roll / Notation), fall speed, keyboard zoom, note names on keys, middle-C marker, impact flash on/off and intensity, octave grid lines on/off.
- **Audio** — master volume, metronome on/off and volume, MIDI input device, sound-local-input toggle.
- **Profile** — Export, Import, Reset to defaults.

## 10. Persistence

Settings autosave to `localStorage` keyed by the file's content hash, so reopening a piece restores its colours, tempo setting and display mode with no user action. Global preferences (velocity scheme, default fall speed, audio levels) are stored separately and apply to every file.

**Export Profile** downloads `<song>.tmi.json`:

```jsonc
{
  "schemaVersion": 1,
  "song": { "id": "<sha256>", "name": "rush-e.mid", "format": "midi" },
  "voices": [{ "id": "t0", "label": "Right hand", "hue": 210,
               "instrument": "acoustic_grand_piano",
               "visible": true, "audible": true, "volume": 1 }],
  "tempo": { "mode": "scale", "scale": 1.0, "absoluteBpm": null },
  "display": { "mode": "roll", "fallSeconds": 3, "zoom": "fit",
               "showNoteNames": false },
  "global": {
    "velocityScheme": { "kind": "lightness", "lMax": 78, "lMin": 38 },
    "masterVolume": 0.8, "metronome": false
  }
}
```

Song-scoped keys (`voices`, `tempo`, `display`) always apply on import. The
`global` block is a snapshot of the app-wide preferences at export time; import
offers to apply it or leave the current globals alone, so sharing a profile for
its colours does not silently rewrite someone's audio settings.

**Import** accepts the file via picker or drag-and-drop onto the window. Song data is referenced by hash rather than embedded, so importing a profile on a machine without the source file prompts you to re-pick it; the profile then reattaches by hash.

## 11. Error handling

| Condition | Behaviour |
|---|---|
| Unparseable or corrupt file | Toast naming the reason; the previously loaded score stays intact |
| `.mxl` that is not a valid zip | Treated as a parse failure, same path |
| No Web MIDI (Firefox, Safari) | Device picker hidden, replaced by a one-line explanation; file playback unaffected |
| AudioContext suspended | "Click to enable audio" overlay; browsers require a gesture before any sound |
| smplr sample load failure | Retry once, then fall back to a basic oscillator voice so visuals are never blocked by audio |
| Unknown profile `schemaVersion` | Refuse the import and keep current settings, rather than half-applying it |
| Notation mode with a MIDI file | Tab disabled with "requires MusicXML in this version" |
| Note outside 21–108 | Kept in the model and audible; drawn clamped at the keyboard edge with an off-range marker |

## 12. UI conventions

- **Typography:** Poppins throughout, loaded via `@fontsource/poppins` (self-hosted, so the app works offline).
- **Styling:** Tailwind utilities, with a contextual semantic class name on every element alongside them — `className="voice-row flex items-center gap-3"`, `className="btn-play rounded-full px-4 py-2"` — so elements are identifiable in the DOM inspector and available as hooks for tests and style overrides.
- **Dev server:** bound to `0.0.0.0` (`npm run dev -- --host 0.0.0.0`) so the phone-landscape layout can be tested on a real device on the LAN.
- **Transport bar:** play/pause, a scrub bar showing elapsed and total time that seeks on drag, the effective-BPM readout, mode switch, and the settings dropdown trigger. It collapses to icon-only in phone landscape.

## 13. Debug mode

`tools/strike-lab.html` is a standalone, dependency-free rig that renders the roll and keyboard with every visual constant exposed as a live control: flash decay, bloom radius and alpha, velocity floor, spark count/length/spread, fall window, bar radius, velocity lightness endpoints, saturation, and the keyboard scale constants (key aspect, black-key width and length, true-vs-naive black-key offsets). A **Constants** button dumps the current values as JSON.

This is not throwaway. It ships as the app's **admin/debug mode**, reached by a route the normal UI does not link to, and it is where visual constants are set: tune in the rig, export the JSON, paste into `render/flash.ts` and `render/geometry.ts`. Its defaults and the spec's published constants must stay in step — if they diverge, the rig is right and the spec needs updating.

It also carries the naive-geometry toggle, which reproduces the boundary-centred bug on demand. That stays in permanently: it is the fastest way to confirm the keyboard is still drawn to scale after any layout change.

## 14. Testing

**Unit (Vitest)**

- `tempoMap` — ticks/seconds round-trip; scale% preserves relative tempo changes; absolute-BPM mode flattens the map; a tempo change mid-playback preserves musical position.
- `handSplit` — split point assignment, boundary pitches, multi-track files bypass it.
- `colors` — velocity-to-lightness is monotonic across the full range in both schemes.
- `flashIntensity(age, velocity)` — 0 before onset, peaks at onset, reaches 0 at `FLASH_MS`, never negative, monotonic in velocity. Being a pure function, the whole impact effect is unit-testable without a canvas.
- `geometry` — 52 white plus 36 black keys; whites tile the width with no gap or overhang; black-key centres match the measured reference offsets within 0.5 px; G# is the only black key on a boundary; white tails are equal within each group; keyboard height holds the true-scale aspect. Seeded by `tests/geometry-check.mjs`, which runs against centres measured from `docs/reference-sheetmusicboss.png`.
- `profile/schema` — export/import round-trip; unknown version rejected.
- `parseMidi` / `parseMusicXml` — small fixtures covering ties, multi-staff parts, tempo changes, drum channel.

**Scheduler** — driven by an injected fake clock, no AudioContext. Asserts each note is scheduled exactly once, within the lookahead window, and that seeking re-seats the cursor correctly.

**Render** — draw functions called against a recording stub `CanvasRenderingContext2D`; assert the culling window draws only on-screen notes and that off-screen notes cost nothing.

**End-to-end (Playwright)** — load a fixture file, press play, screenshot at a fixed time offset, assert no console errors.

## 15. Scope

**v1**

88-key keyboard at true piano scale · live MIDI input with velocity colour · MIDI and MusicXML loading · keyboard-highlight mode · falling-roll mode · Verovio notation mode for MusicXML · settings dropdown · profile JSON save/load · admin/debug mode (§13).

**Phase 2 (designed for, not built)**

MIDI-to-notation transcription (quantise, spell, split, beam) · practice/wait mode and hit scoring · loop regions · rising trails for live input · recording and video export.
