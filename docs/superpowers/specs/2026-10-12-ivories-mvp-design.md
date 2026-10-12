# Ivories MVP — Design Spec

**Date:** 2026-10-12
**Status:** Approved in conversation (sections 1–4); user asked to proceed straight to build
**Branch:** `feat/ivories-mvp` (from `feat/platform-sdk` + `master`)
**Builds on:** `2026-09-12-piano-visualizer-design.md`, `2026-09-26-pepperhorn-platform-sdk-design.md`

## 1. Purpose

Turn Tickle Me Ivories from a single app into an **open-source scaffold**: a published React library (`ivories`) plus the studio app built on it. PepperHorn builds proprietary apps on top of the scaffold; the scaffold never depends on PepperHorn services.

Three outcomes:

1. **Embeddable pieces** — falling keys, keyboard-only playback, keyboard + notation, pepperscore endless view + keyboard/falling keys — usable in sites such as becreative the same way `pepperscore` is.
2. **Flexible stage layouts** — split (ivories top / camera bottom and swapped) and PIP (either way round, all four corners), where each camera region is a live webcam or a compositing mask.
3. **Backend go-live** — the already-built ph-apps OTP auth + gateway (platform SDK spec, phase 0) deployed through its gates, with the SDK and tickle plugin, so the studio has sign-in, saved scenes and share links.

### Decisions taken (conversation 2026-10-12)

| Topic | Decision |
|---|---|
| Camera source | Both: each camera slot is a live webcam (`getUserMedia`) **or** a mask (transparent / chroma fill) |
| Notation | Reuse **pepperscore** (Verovio). Add an external-clock API to pepperscore 0.2; tickle does not embed Verovio itself |
| Embed control | Self-contained by default **and** host-controllable (shared clock, media-element sync, manual) |
| Recording | No video recording in MVP. MIDI capture-for-replay is a **stretch** goal |
| Packaging | npm-workspaces monorepo mirroring pepperscore: `packages/ivories` (published, MIT) + `apps/studio` |
| Package name | `ivories` (free on npm, checked 2026-10-12) |
| Live MIDI input | In MVP |
| Backend | No new collections; scenes/looks in `app_user_saves`, shares in `shortcoder`, via existing phase-0 work |

## 2. Repository shape

```
tickle-me-ivories/
  package.json            # workspaces: ["packages/*", "apps/*"], private
  packages/ivories/       # published library, MIT
    src/core/             # framework-free: model, io, audio, clock, render, music, platform types+codecs
    src/react/            # components, provider, hooks, Stage/layouts
    src/index.ts          # "." entry (React components + re-exported types)
    src/core/index.ts     # "./core" entry
    src/style.css         # every rule scoped under .ivories
  apps/studio/            # today's app, rebuilt on `ivories` public exports only
  apps/embed-fixture/     # (may live inside studio as /embed-fixture route) page embedding every component
```

- Library build: Vite lib mode, ESM only, `tsc` for `.d.ts`. Exports: `"."`, `"./core"`, `"./style.css"`, `"./package.json"`.
- Peer deps: `react`, `react-dom` `>=19`. Optional peer: `pepperscore` `>=0.2` (only `<Notation>` needs it; loaded via dynamic `import()` so hosts that never render notation don't need it).
- Runtime deps stay external (smplr, @tonejs/midi, tonal, fflate, zustand, @noble/hashes).
- CSS: plain CSS file, all rules under `.ivories`, theme tokens as CSS custom properties (`--ivories-*`). A check script (like pepperscore's `css-scope.mjs`) fails the build on an unscoped rule. Studio may keep Tailwind for its own chrome; the library does not ship Tailwind.
- **Studio may import only the package's public entry points** (`ivories`, `ivories/core`, `ivories/style.css`). Enforced with a lint/grep check in CI and a TS path setup that does not alias into `packages/ivories/src`.
- `src/platform/types.ts` (provider interfaces) and the scene/look codecs move to `ivories/core` so plugins import them from the package; the root `"./platform"` export is replaced by `ivories/core`.
- The existing `@pepperhorn/tickle-ph-plugin` design is unchanged except its import path for the interfaces.

## 3. Core and the shared clock

`ivories/core` is the existing code moved, not rewritten: `model/`, `io/`, `audio/` (engine, scheduler, metronome), `render/` (pure draw functions, geometry, theme, colours), `music/`, `platform/` (types, codecs, local providers).

### 3.1 Clock

```ts
type ClockEvent = { type: 'play' | 'pause' | 'seek' | 'rate'; time: number }

interface Clock {
  now(): number                 // score seconds (tempo-map time at rate 1, scaled by rate)
  readonly playing: boolean
  readonly rate: number         // tempo multiplier
  play(): void
  pause(): void
  seek(t: number): void
  setRate(r: number): void
  subscribe(fn: (e: ClockEvent) => void): () => void
  dispose(): void
}
```

Implementations:

- **`AudioClock(ctx)`** — the existing transport math (anchor on `AudioContext.currentTime`, `performance.now()` fallback when audio cannot start). Default whenever a component plays its own audio. The existing `useTransport` store becomes a thin React binding over an `AudioClock`.
- **`MediaClock(el: HTMLMediaElement, opts?: { offset?: number })`** — `now()` = `el.currentTime - offset`; play/pause/seek/rate delegate to the element; listens to `play`/`pause`/`seeked`/`ratechange`. Audio engine is muted by default when a MediaClock drives (the media carries the sound); `audio` prop can re-enable.
- **`ManualClock`** — host calls `seek(t)`/`set(t)`; `now()` returns the last set time; `play()` advances on `performance.now()` so hosts can still get motion.

Contract tests run the same suite against all three (seek-while-paused, seek-while-playing, rate change mid-play keeps position continuous, subscribe/unsubscribe, dispose stops timers).

The scheduler consumes a `Clock` rather than the transport directly. Rule: the scheduler only schedules audio when the clock is an `AudioClock` or the host enabled audio; a seek or rate event calls `stopAll()` and re-plans from `now()` (today's behaviour).

### 3.2 Provider and self-contained mode

```tsx
<IvoriesProvider score={score | source} clock={clock?} audio={true} theme look>
  …components…
</IvoriesProvider>
```

- One provider = one score, one clock, one audio engine, one animation-frame loop. Views read `clock.now()` per frame; no view owns a playhead.
- A component rendered **outside** a provider creates an internal provider from its own props (self-contained mode). Score source props match pepperscore: `scoreUrl`, `file`, `musicXml`, `midi` (ArrayBuffer/Uint8Array), `score` (already-parsed `Score`).
- Only one sound source per provider. Multiple providers on a page share one `AudioContext` and use a claim/release so only one plays at a time (same policy as pepperscore's `claimPlayback`).
- Hooks: `useIvories()` (score, clock, engine, settings), `useClock()` (re-renders on clock events, not per frame), `useClockTime(hz)` (throttled time for UI), `useActiveNotes()`.

## 4. Components (`ivories`)

| Component | Renders | Key props |
|---|---|---|
| `<Keyboard>` | 88-key keyboard lit by playback and/or live input | `range` (`'full'` or `[lowMidi, highMidi]`), `input` (`'none' \| 'midi'`), `labels` |
| `<FallingKeys>` | Falling roll + keyboard (today's roll mode) | `range`, `lookahead` (seconds), `labels` |
| `<Notation>` | pepperscore driven by the provider clock | `view` (`'vertical' \| 'endless'`), `zoom` |
| `<Transport>` | play/pause, seek bar, tempo, metronome toggle | `controls` overrides |
| `<Stage>` | Layout container of slots (§5) | `layout`, `onLayoutChange` |
| `<Ivories>` | One-line preset combos | `view` (`'falling' \| 'keyboard' \| 'keyboard+notation' \| 'endless+falling' \| 'endless+keyboard'`), `chrome` |

Common props: `theme`, `look`, `labels` (`noteNames`, `chords`), `height`, `className`, `chrome` (`'full' \| 'minimal' \| 'none'`, same semantics as pepperscore).

Events: `onReady({ score, duration })`, `onNoteOn/onNoteOff({ midi, velocity, time, source: 'score' \| 'live' })`, `onTimeUpdate(t)` (throttled ~10 Hz), `onError(err)`.

Ref handle on `<Ivories>` and provider: `{ play, pause, seek, setRate, clock }`.

Rendering: one `<canvas>` per Keyboard/FallingKeys, sized by `ResizeObserver` with devicePixelRatio, drawn from the provider's shared rAF loop via the existing pure `drawStage`. Keyboard geometry stays the canonical chordl-derived geometry (geometry oracle unchanged); `range` crops by computing geometry for the full keyboard and setting the viewport to the range's white-key span.

SSR: modules import without touching `window`; canvas, `AudioContext`, Web MIDI, `getUserMedia` and pepperscore are only touched in effects. Works under Astro `client:visible`.

### 4.1 Live MIDI input

- `MidiInput` (core): `navigator.requestMIDIAccess()`, all inputs or a chosen device id, note on/off (velocity 0 = off), sustain pedal (CC64) held-note extension for display. Emits `{ midi, velocity, time }`.
- Live notes light the keyboard in a distinct live colour (velocity colour system from spec §7 applies), feed the chord readout, and fire `onNoteOn/Off` with `source: 'live'`.
- Live notes sound through the audio engine (toggle `liveAudio`, default on in studio, off in embeds).
- Spec §8 "rising trails for live input" stays phase 2; MVP live notes light keys only.
- Unsupported browser (Safari without Web MIDI) or permission denied → `onError` with code `midi-unavailable`; the component keeps working for playback.

### 4.2 MIDI capture (stretch)

`useMidiRecorder()` collects live notes into a `Score` (single track, tempo 120, times in seconds from record start) that can be loaded back into the provider and replayed. No file export in MVP.

### 4.3 Notation via pepperscore

pepperscore 0.2 (separate repo `ph-vexflow-view`) gains:

- `clock?: ExternalClock` prop — `{ now(): number; playing: boolean; subscribe(fn): unsubscribe }` (structurally compatible with ivories' `Clock`). When set, pepperscore's rAF cursor reads `clock.now()` (seconds) and maps to score position via its existing `playbackPositionAt(timeline, seconds, bpm)`; its internal play loop is not started.
- `audio?: boolean` (default `true`) — `false` skips sound loading and scheduling entirely.
- `onSeek?(seconds)` — user click on a note/measure in clock mode reports the time instead of seeking internally; ivories calls `clock.seek()`.
- Handle additions: `seek(seconds)`, `currentTime()`.
- Tempo: in clock mode pepperscore uses the score's own tempo (bpm pref ignored), so the seconds mapping matches ivories' tempo map. A contract test in each repo uses the same fixture MusicXML and asserts that note onset seconds agree within 1 ms.

`<Notation>` passes the provider's MusicXML (`score.rawXml`) to pepperscore with `chrome="none"`, `audio={false}`, `clock={adapter}`. MIDI-only scores show an inline "notation needs MusicXML" message (transcription is phase 2). If pepperscore fails to load, `<Notation>` shows an error and sibling views keep playing.

## 5. Layout system

### 5.1 Model

```ts
type IvoriesView = 'keyboard' | 'falling' | 'notation' | 'endless'

type SlotSource =
  | { kind: 'ivories'; view: IvoriesView }
  | { kind: 'camera'; mode: 'webcam'; deviceId?: string; mirror: boolean; fit: 'cover' | 'contain' }
  | { kind: 'camera'; mode: 'mask'; fill: 'transparent' | string }   // string = CSS colour, e.g. '#00b140'

type Corner = 'tl' | 'tr' | 'bl' | 'br'

type Layout =
  | { kind: 'single'; main: SlotSource }
  | { kind: 'split'; top: SlotSource; bottom: SlotSource; ratio: number }             // ratio = top share, 0.15–0.85
  | { kind: 'pip'; main: SlotSource; inset: SlotSource; corner: Corner; size: number; margin: number } // size = inset width / stage width, 0.15–0.5

type Aspect = 'free' | '16:9' | '9:16'
```

Pure reducer in core (`layoutReducer`): `swap`, `setCorner`, `setRatio` (clamped), `setSize` (clamped), `setSource(slot, source)`, `setKind` (converts keeping sources: single→split puts main on top and a mask bottom; split↔pip maps top↔main, bottom↔inset). Unit-tested.

### 5.2 `<Stage>`

- Renders slots as absolutely positioned boxes inside a box locked to `aspect` (letterboxed in the container; `free` fills it).
- Split: draggable divider (pointer events, keyboard-accessible with arrow keys) updates `ratio`.
- PIP: inset is draggable; on release it snaps to the nearest corner. Inset has rounded corners and a subtle border in the theme.
- Swap button (studio toolbar and `swapSlots()` on the Stage handle).
- Ivories slots render the matching component inside the same provider (one clock, so all views stay in sync). Two ivories slots are allowed (e.g. endless notation top, falling keys bottom).

### 5.3 Camera slots

- **Webcam:** `getUserMedia({ video: { deviceId } , audio: false })` requested only when a webcam slot mounts; stream stopped on unmount or source change. `<video playsinline muted>` with `object-fit` from `fit`, CSS mirror transform. Device picker lists `enumerateDevices()` video inputs (labels after permission). One stream per deviceId shared across slots.
- Failure states (denied, no device, in use, insecure origin) → slot placeholder with message and retry button; the layout is unaffected. `onError` code `camera-unavailable`.
- **Mask:** slot is `transparent` (shows whatever is behind the page — OBS browser-source alpha, reusing spec §13 `html.ivories-transparent` behaviour) or a solid chroma fill. Other slots keep their own theme background, so e.g. keyboard on a dark stage over a green camera hole works.

### 5.4 Persistence

The layout is part of a **Scene**. `SceneV2` = `SceneV1` + `layout: Layout` + `aspect: Aspect`. Decoding a V1 scene yields `layout: { kind: 'single', main: { kind: 'ivories', view: <V1 display mode> } }`, `aspect: 'free'`. Webcam `deviceId` is **not** persisted in shares (device ids are per-browser); it is persisted in local saves only. Saves/shares flow through the existing platform providers unchanged.

## 6. Studio app

The studio (`apps/studio`) is today's app rebuilt on the library:

- `App.tsx` (1062 lines) is decomposed: file loading, settings panels, scenes panel, debug route and profile import/export stay in the studio; stage/scheduler/render wiring moves into `IvoriesProvider` + components.
- New toolbar controls: layout kind (single / split / PIP), swap, PIP corner, aspect, per-slot source picker (view or camera webcam/mask, device, mirror), live MIDI device picker, record (stretch).
- All existing behaviour and tests keep passing (themes, labels, chord readout, metronome, count-in, MusicXML, profiles, scenes & looks, share links, `/debug`).
- Platform plugin loading (`/tickle.config.json`) unchanged.

## 7. Backend (ph-apps) and the open/proprietary boundary

| Open (MIT, public) | Proprietary (private repos) |
|---|---|
| `ivories` package, studio app, provider interfaces, local + hash providers, `@pepperhorn/app-sdk`, `@pepperhorn/tickle-ph-plugin` | PepperHorn apps built on `ivories` + `@pepperhorn/app-sdk` |

- The scaffold never imports `@pepperhorn/*`; it works fully offline with local storage + hash shares.
- **No new collections.** Scenes (now with layout) and looks are `app_user_saves` rows (`kind: 'scene' | 'look'`, `app_slug: 'tickle-me-ivories'`); shares are `shortcoder` rows. Collections and fields are as specified in the platform SDK spec §6.5.
- **OTP review (2026-10-12):** chordl has no auth. The live ph-apps OTP is the legacy Directus Flows used by chordee/drumlet, with known holes (code returned in the send response, no verify rate limit, `Math.random` codes, cross-app token reuse, case-sensitive email lookup). The phase-0 replacement (`directus-otp-auth` 8-digit + attempt counting + crypto RNG, `/ph/v1` gateway with table rate limits, app-scoped sessions) fixes all of them. Legacy Flows stay live for chordee/drumlet until platform phases 4–5 migrate them.
- **Production gates** (each a separate user approval, run per `ph-apps-extensions/deploy/phase0/README-GATES.md`): 0.3-A/B schema migration → 0.5 otp-auth deploy → 0.6 gateway + shim → 0.8 user-applied ph-connect policy → 0.8a probes → 0.9 links deploy. Then: app-sdk npm publish (1.6), plugin repo creation + build (3.1–3.2), `ivories.pepperhorn.com` DNS/hosting (3.7), `ivories` and `pepperscore@0.2` npm publishes.

## 8. Error handling

- Components never throw into the host: errors go to `onError({ code, message, cause })` and an inline message inside the component's box. Codes: `score-load`, `score-parse`, `audio-unavailable`, `midi-unavailable`, `camera-unavailable`, `notation-unavailable`, `notation-needs-musicxml`.
- Audio blocked by autoplay policy → silent clock runs (`performance.now()` fallback) and a "tap to enable sound" affordance in `<Transport>`.
- A failing slot never tears down sibling slots (each slot wrapped in an error boundary).

## 9. Testing

- Existing tests move with their modules (392+); `npm test` at root runs all workspaces.
- New unit tests: clock contract suite ×3 implementations; layout reducer; SceneV2 codec incl. V1 upgrade; MidiInput message parsing (fake `MIDIAccess`); scheduler driven by a ManualClock.
- Component tests (jsdom + RTL): self-contained vs provider mode; `onNoteOn` fires from score playback with a ManualClock; error boundaries.
- Geometry oracle (`tests/geometry-check.mjs`) unchanged and still passing.
- Playwright smoke: studio renders each layout (single, split, split-swapped, PIP in 4 corners, PIP swapped) with fake camera (`--use-fake-device-for-media-stream`); embed fixture page renders every `<Ivories view>` preset; notation + falling stay in sync (cursor and roll at same time after seek).
- CSS scope check and public-entry-only import check in the build.
- pepperscore 0.2: its own tests for clock mode, `audio={false}`, `onSeek`, onset-seconds contract.

## 10. Build order

| Stage | Content |
|---|---|
| A | Monorepo split; move core modules into `packages/ivories/src/core`; `Clock` + `AudioClock`; scheduler on Clock; studio compiles against the package |
| B | `IvoriesProvider`, `<Keyboard>`, `<FallingKeys>`, `<Transport>`, `<Ivories>`; studio's stage rebuilt on them; CSS scoping |
| C | `MidiInput` + live keyboard; `MediaClock`, `ManualClock` |
| D | Layout model + reducer, `<Stage>`, camera slots, `SceneV2`, studio toolbar |
| E | pepperscore 0.2 clock API (ph-vexflow-view repo) → `<Notation>`, `keyboard+notation`, `endless+falling`, `endless+keyboard` |
| F | Library build + exports + README; embed fixture; becreative demo block (branch in becreative) |
| ‖ | Backend gates (user-approved), app-sdk, tickle plugin, ivories.pepperhorn.com |
| Stretch | `useMidiRecorder` |

**MVP done:** stages A–F landed and green; studio live at ivories.pepperhorn.com with sign-in and shared scenes; `ivories` installable from npm and embedded in becreative. Anything requiring a production gate the user has not yet approved is reported as pending, not done.

## 11. Out of scope (MVP)

Video recording/export, alpha-preserving export, MIDI-to-notation transcription, practice/wait mode, hit scoring, loop regions, rising live trails, MIDI file export of captures, embedding Verovio directly in ivories.
