# Ivories Rising Roll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One fresh subagent per task, a spec-compliance review and then a code-quality review between tasks.

**Goal:** Add console logging of every reported error, a `<RisingKeys>` view (notes emitted at the keyboard that drift away, for score and live input), a free-running live clock with a BPM control, a horizontal (traditional piano-roll) orientation for falling and rising views, layout/scene/preset support for both, and piano playback from the pepperscore-sounds GM sample packs.

**Architecture:** All drawing stays in the canonical vertical frame (keyboard along the bottom, `computeLayout` untouched); a horizontal view lays that frame out on the swapped box and maps it to the screen with one canvas transform, so the chordl geometry and the oracle never change. Rising notes are placed by beats, not seconds: a `BeatClock` turns clock seconds into beats (the score's tempo map and time signatures, or a live BPM), and a pure `drawRisingStage` draws score notes plus a provider-held live "trail" (note on/off stamped in provider clock time). The provider gains a ManualClock-based live clock (used only with no score and no host clock), a `bpm` value with `setBpm`, and a `sounds` option that makes the engine load its piano from the GM pack through smplr's `Sampler`.

**Tech Stack:** npm workspaces, React 19, TypeScript 6, Vite 8, Vitest 5 (jsdom), @testing-library/react, smplr 1.0.0 (`Sampler`, `SplendidGrandPiano`, `Soundfont`), Tailwind v4 (studio only), plain scoped CSS in `@layer ivories` (library), @playwright/test 1.62 (Chromium).

**Spec:** `docs/superpowers/specs/2026-10-13-ivories-rising-roll-design.md` (§ references below point there). It builds on `docs/superpowers/specs/2026-10-12-ivories-mvp-design.md`; the previous plan is `docs/superpowers/plans/2026-10-12-ivories-mvp.md` and its rulings are in `docs/superpowers/handover/2026-10-13-ivories-mvp-handover.md` (all still binding).

**Baseline (recorded 2026-10-13 on `feat/ivories-mvp` at `7e5f78a`):** `npm test` → 86 test files, **947 passed, 1 skipped** (948). Every task only adds tests; no task may lower the passed count.

## Global Constraints

- **Work only in `/home/shaun/ivories-mvp`** (branch `feat/ivories-mvp`). Never touch other repos; never push or publish.
- **Moves and behaviour changes are separate tasks.** A move task uses `git mv` and import rewrites only; its test count must equal the count before it (680 passed / 1 skipped for Tasks 1–2).
- **Verify with builds, not `npx tsc --noEmit` at the root.** Use `npm run build` (studio `tsc -b && vite build`) and `npm run check -w packages/ivories`. The root has no tsconfig of its own.
- **Studio imports only public entry points:** `ivories`, `ivories/core`, `ivories/style.css`. No path alias into `packages/ivories/src` in any tsconfig or Vite config. Workspace resolution uses the custom export condition `"source"` (package.json `exports`), enabled in the studio's Vite `resolve.conditions` and tsconfig `customConditions`. Enforced by `scripts/check-public-imports.mjs`.
- **The scaffold never imports `@pepperhorn/*`** and works offline (local storage + hash shares).
- **Clock time (controller ruling, clarifies spec §3.1):** `Clock.now()` returns **score-time seconds**: the position on the score's own tempo map at rate 1. `rate` changes only how fast score-time advances (rate 0.5 for 1 wall-second advances `now()` by 0.5); `seek(t)` takes score-time. Negative times (count-in) are legal and passed through unclamped; pepperscore hides its playhead for them. Library providers never retime a score, so for every embed the provider timeline *is* the score's own tempo map. The studio's TempoSetting (ticks are the truth, `retimeScore`) is a studio-only retiming of the document it hands the provider; `<Notation>` converts provider time to own-tempo time through ticks (`toOwnTempoSec`) so pepperscore always receives own-tempo seconds.
- **Library CSS:** plain CSS in `packages/ivories/src/style.css`, every selector starts with `.ivories`, every library class name is prefixed `ivories-`, tokens are `--ivories-*` custom properties, keyframes prefixed `ivories-`, no `html`/`body`/`:root`, no viewport units, no `position: fixed`, no `@font-face`. Checked by `packages/ivories/scripts/css-scope.mjs`. The library ships no Tailwind and no element `id`s (several instances can share a page).
- **Studio CSS:** Tailwind utilities, and every element carries a contextual semantic class name alongside them (`className="layout-toolbar flex items-center gap-2"`). Non-negotiable.
- **Typography:** Poppins everywhere (studio bundles it via `@fontsource/poppins`; library CSS declares `font-family: Poppins, system-ui, sans-serif` and leaves loading to the host).
- **Dev server:** always bound to `0.0.0.0` (`vite --host 0.0.0.0`; `npm run dev` at the root forwards extra args, e.g. `npm run dev -- --port 5183`).
- **SSR-safe imports:** no module touches `window`, `document`, `navigator`, `AudioContext`, `requestMIDIAccess`, `getUserMedia` or pepperscore at import time; only inside effects or methods.
- **Components never throw into the host:** errors go to `onError(err)` with `err.code` one of `score-load`, `score-parse`, `audio-unavailable`, `midi-unavailable`, `camera-unavailable`, `notation-unavailable`, `notation-needs-musicxml` (plus `render-failed`, see resolution R11), and an inline message inside the component's box.
- **Per-voice volume never folds into velocity; `LOOKAHEAD_SEC` (0.15) stays below smplr's 200 ms lookahead; every seek/tempo/rate change is paired with `engine.stopAll()`** (now guaranteed by `PlaybackDriver` on the clock's `seek`/`rate`/`pause` events).
- **The draw path stays a pure function of `t`;** caches keyed by identity (layout, range, voices, theme, key) and `readTheme` runs once per layout/theme change, never per frame.
- **Keyboard geometry constants are fixed** (`aspect` 5.8, `blackWRatio` 0.5652, `blackLenRatio` 0.655, black offsets C# −b/6, D# +b/6, F# −b/4, G# 0, A# +b/4). `node tests/geometry-check.mjs` must keep printing `all passed`.
- **Commits:** every task ends with one commit; the message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

Additions for this plan (same force as the list above):

- **Handover rulings stay binding**, in particular: CSS goes *inside* the single `@layer ivories { … }` block (never appended after it); `audio-unavailable` and `midi-unavailable` never set `status.error`; providers never retime self-loaded scores; `<Stage>`'s `slotViewProps` stays.
- **Root `npm run check`** (geometry oracle + public imports + CSS scope) must pass at the end of every task that touches `packages/ivories/src/style.css`, `packages/ivories/src/core/render/*` or studio imports.
- **`computeLayout`, `BLACK_OFFSET`, `DEFAULT_GEOMETRY` and `tests/geometry-check.mjs` are not edited by any task.** Horizontal geometry is derived from them (R-H below).

## Review Focus

1. **Count-in, backward seek and score-start in the rising view** (negative `t`; a seek back past live notes; a note that has not started yet): nothing is drawn below the keyboard, no NaN reaches the canvas, and held live notes restart at the seek position while finished ones are dropped. Tests: Task 3 (`risingSpan` returns null for a future onset; count-in draws no bars) and Task 4 (`a seek drops finished trail notes and restarts held ones`).
2. **A horizontal view in a hidden or zero-size box** (collapsed tab, `display:none`, `client:visible`): canonical dimensions are clamped before the swap, geometry stays finite, drawing resumes when sized. Test: Task 2 (`horizontal at 0x0 stays finite`).
3. **Bad BPM input** (empty field, `0`, `5`, `1e9`, `NaN`, a half-typed `1`): the provider value is never outside 20–300, never `NaN`, and a half-typed value is not committed until it is valid. Tests: Task 4 (`setBpm clamps … NaN is ignored`) and Task 5 (`typing an invalid BPM never commits it`).
4. **The GM pack is unreachable** (offline, CDN blocked, 404, corrupt JSON, one undecodable sample): the piano falls back to today's smplr piano without throwing, a later load retries (the failure is not cached), and one bad sample does not sink the rest. Test: Task 7 (`falls back … and retries`, `skips one undecodable sample`).
5. **A score arriving during a live session** (the studio's "Play live" then a file, or a host flipping `score` from `null`): the provider switches from the live clock to the score clock without unmounting its children, and the live trail (stamped on the old clock) is cleared. Test: Task 4 (`a score arriving ends the live clock and clears the trail; children stay mounted`).

## Spec gaps and resolutions (apply exactly; reviewers check against these)

- **R-H Horizontal mapping.** "Keyboard on the left edge, low notes at the bottom, time to the right" is the canonical frame under `X = H − y, Y = W − x` (W×H = the canonical frame, i.e. the screen box swapped). That is a reflection in the anti-diagonal, not a quarter turn (a quarter turn puts low notes at the top). It is applied once per frame with `ctx.transform(0, -1, -1, 0, H, W)` inside `save()/restore()`. Text drawn on the canvas (the `C4` label) applies the same matrix locally so it reads upright. DOM overlays (note labels, chord readout) map their anchors with `toScreen`. `onLayout` keeps reporting the canonical layout. `<Keyboard>` does not get the prop (spec scope: falling and rising only).
- **R-B Beats.** For distance on the rising roll a score "beat" is a quarter note (`ticks / ppq`, through `secToTicks` with the provider's `tempo`, so a studio-retimed score still lines up). Grid lines fall on the time signature's beat unit (`4/denominator` quarters) from each signature change, bar lines on every `numerator`-th beat; before tick 0 (count-in) the first signature extends backwards. Live (no score): `beat = sec × bpm / 60`, bar every `beatsPerBar` beats from clock 0. `visibleBeats` is clamped to 1–64 (default 8).
- **R-T Live trail.** The provider keeps `live.trail: ValueStore<readonly TrailNote[]>`; a note-on/off is stamped with `clock.now()` *when it is handled* (the MIDI `timeStamp` is on `performance.now()`, a different time base). `LiveNote.time` and `MidiNoteEvent.time` keep their `performance.now()` meaning (the recorder depends on it). The trail is capped at 512 notes (oldest dropped), cleared when the provider's clock instance changes, and on a clock `seek` finished notes are dropped and held notes restart at the seek time.
- **R-L Live clock activation.** A free-running `ManualClock` is used only when there is **no host `clock`** and **no score source** (controlled `score` is `null`, or no `score`/`scoreUrl`/`file`/`musicXml`/`midi` prop), and either the provider has `liveClock` or a mounted `<RisingKeys>` asks for it (`requestLiveClock()`, ref-counted). It starts on the first live note-on, or at mount with `autoStart`. It never schedules audio (`audio` defaults to `false` with it) and so never claims page playback. The provider's `FrameLoop` reads the clock through a ref and is created once, so switching clocks never unmounts children.
- **R-P BPM.** `bpm` provider prop (default 100) seeds and, when it changes, overrides an internal value; `setBpm(n)` (context, `useLiveBpm()`) clamps to 20–300 and rounds to an integer, ignores non-finite input and calls `onBpmChange(bpm)`. Changing BPM never rewrites trail times.
- **R-G GM sounds.** pepperscore's packs are **not** MIDI.js files: `soundfonts/fluidr3/<name>.json` is `{ name, samples: { "<midi>": "<bare base64 mp3>" } }` (13 samples, every 5 semitones from 36), indexed by `pack.json` `{ pack, fluidr3: string[] }`. smplr's `Soundfont({ instrumentUrl })` requires the `MIDI.Soundfont.` text format and cannot read them, and `Sampler` string buffers would corrupt base64 (its URL clean-up collapses `//`). So the engine fetches the JSON, decodes each sample with `decodeAudioData`, and builds `Sampler(ctx, { buffers: { 36: AudioBuffer, … }, destination })`. URL scheme (from pepperscore `lib/assets.ts`/`lib/sounds.ts`, verified live: 200, `application/json`, `access-control-allow-origin: *`):
  - base: `assetBaseUrl` (trimmed, trailing `/` added, resolved against `document.baseURI`) or `https://cdn.jsdelivr.net/npm/pepperscore-sounds-${pack}@0.1.0/` (`pack` `'core'` default, or `'complete'`);
  - index: `${base}pack.json`;
  - samples: `${base}soundfonts/fluidr3/${name}.json`, e.g. `https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/soundfonts/fluidr3/acoustic_grand_piano.json`.
  "The piano voice" = any voice (and the live bus) whose instrument is `acoustic_grand_piano`; it loads `sounds.instrument ?? 'acoustic_grand_piano'`. Any other voice instrument listed in `pack.json` also loads from the pack. An instrument not in a reachable index, an unsafe name (not `/^[a-z0-9_]+$/`), or any failure falls back to today's path (`SplendidGrandPiano` / `Soundfont`). Index and decoded buffers are cached (per base, per AudioContext + URL); failures are not cached. When `sounds` is unset nothing changes.
- **R-S Studio live session.** The studio's settings, MIDI controls and toolbar exist only with a score loaded today, so "a rising slot with no score" is unreachable. Resolution: the empty stage gains a **Play live** button that enables live MIDI, sets the layout to `single`/`rising`, resumes audio (it is a gesture) and starts a *live session*: the drop zone overlay is hidden, the `LayoutToolbar` shows, and a `live-session-bar` shows the live MIDI controls and a **Load a score** button (ends the session, drop zone returns). The studio passes its `AudioClock` to the provider only while a score is loaded (so the provider's live clock runs in the session) and `bpm`/`onBpmChange` from its live-MIDI store. The BPM field appears in the toolbar when there is no score and a slot shows `rising`, and in the Live MIDI settings section (hidden in the session bar to avoid two BPM fields on screen).
- **R-M Mode sync.** `modeForView('rising')` is `'roll'`: a rising slot can be the primary keys slot; the roll toggle leaves it rising, the keyboard toggle turns it into `keyboard` (and back to `falling`). Switching a slot between `falling` and `rising` keeps its `orientation`.
- **R-V Validators.** `IvoriesView` gains `'rising'`. `orientation` is kept only on `falling`/`rising` slots and only when it is `'vertical'` or `'horizontal'`; anything else is dropped (the slot is kept). SceneV2 stays `v: 2`.
- **R-E Error logging.** `console.warn('[ivories] <code>: <message>', cause)` runs inside the provider's single `report` path (every `reportError`, every code, including boundary `render-failed` and camera errors), de-duplicated per provider by `code|message`, before `onError`. `onError` behaviour is unchanged.
- **R-F Live hit flash.** Live notes flash at the keyboard edge exactly like score notes (spec: "same … hit flash"); `drawImpact` takes the trail as an optional extra list.

---

## File Structure (changes)

```
packages/ivories/src/
  core/layout/types.ts            Orientation type (T2); 'rising' view + SlotSource.orientation (T6)
  core/layout/validate.ts         rising + orientation whitelist (T6)
  core/render/orientation.ts      NEW canonicalSize, toScreen, fromScreen, applyOrientation, pitchAtScreen (T2)
  core/render/beats.ts            NEW BeatClock (live/score), clampBpm, clampVisibleBeats, constants (T3)
  core/render/rising.ts           NEW risingSpan, risingNotes, drawRisingStage (T3)
  core/midi/trail.ts              NEW TrailNote, trailNoteOn/Off/Reseat, MAX_TRAIL_NOTES (T3)
  core/render/pianoRoll.ts        RenderState.orientation; export drawBackground/drawProgress/drawImpact(live) (T2, T3)
  core/render/keyboard.ts         upright C4 label in horizontal (T2)
  core/render/theme.ts            beatLine / barLine tokens (T3)
  core/render/stageRenderer.ts    orientation + rising input, beatClockFor cache (T2, T3)
  core/audio/gmSounds.ts          NEW GM pack URLs, index/buffer loaders, gmInstrumentFactory (T7)
  core/audio/engine.ts            Instrument incl. Sampler, sounds option, exported defaultMakeInstrument (T7)
  core/index.ts                   exports for the new core modules (T2, T3, T7)
  react/IvoriesProvider.tsx       console logging (T1); live clock, bpm, trail, FrameLoop ref (T4); sounds (T7)
  react/context.ts                bpm, setBpm, requestLiveClock, live.trail (T4)
  react/withProvider.tsx          PROVIDER_KEYS += bpm, liveClock, autoStart, onBpmChange (T4), sounds (T7)
  react/hooks.ts                  useLiveBpm (T5)
  react/views/StageView.tsx       orientation (T2); rising kind, live-clock request, data-bpm (T5)
  react/views/FallingKeys.tsx     orientation prop (T2)
  react/views/RisingKeys.tsx      NEW (T5)
  react/views/Transport.tsx       BPM field (T5)
  react/views/Stage.tsx           rising slot, orientation pass-through (T6)
  react/views/Ivories.tsx         view 'rising', orientation, visibleBeats, beatsPerBar (T6)
  react/text/StageText.tsx        labelPosition (orientation-aware) (T2)
  react/text/ChordReadout.tsx     chordPosition (orientation-aware) (T2)
  index.ts                        RisingKeys, useLiveBpm exports (T5)
  style.css                       beat/bar tokens (T3), BPM field rules (T5)
apps/studio/src/
  studio/liveMidi.ts              bpm, session (T8)
  studio/LiveBpmField.tsx         NEW (T8)
  studio/LiveSessionBar.tsx       NEW (T8)
  studio/LiveMidiSettings.tsx     BPM row, showBpm prop (T8)
  studio/LayoutToolbar.tsx        rising option, orientation select, BPM field (T8)
  studio/modeSync.ts              rising = roll, orientation kept (T8)
  App.tsx                         Play live, session, provider clock/liveClock/bpm (T8)
  embed/EmbedFixture.tsx          rising/horizontal cases (T9)
e2e/
  fakeMidi.ts                     NEW fake MIDIAccess injection (T9)
  rising.spec.ts                  NEW embed rising/horizontal/BPM (T9)
  studio-live.spec.ts             NEW studio Play live + BPM + orientation (T9)
packages/ivories/README.md        rising, orientation, live clock/BPM, GM sounds, console logging (T10)
```

---

### Task 1: Every reported error also goes to the console (de-duplicated)

**Files:**
- Modify: `packages/ivories/src/react/IvoriesProvider.tsx` (the `report` callback, ~lines 70–76)
- Test: `packages/ivories/src/react/IvoriesProvider.test.tsx` (append a `describe`)

**Interfaces:**
- Consumes: `IvoriesError` (`core/errors.ts`): `code`, `message`, `cause`.
- Produces: no API change. Every `reportError(e)` through a provider logs `console.warn('[ivories] ' + e.code + ': ' + e.message, e.cause)` once per provider per `code|message` (R-E).

- [ ] **Step 1: Write the failing tests**

Add to the imports at the top of `packages/ivories/src/react/IvoriesProvider.test.tsx`:

```tsx
import { IvoriesError } from '../core/errors'
```

Append at the end of the file:

```tsx
describe('errors also reach the console (rising-roll spec §2, R-E)', () => {
  it('logs a reported error once as console.warn with code, message and cause', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const onError = vi.fn()
      render(<IvoriesProvider midi={new Uint8Array([1, 2, 3])} engine={fakeEngine()} onError={onError}><ScoreName /></IvoriesProvider>)
      await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'score-parse' })))
      const err = onError.mock.calls[0][0] as IvoriesError
      expect(warn).toHaveBeenCalledWith(`[ivories] score-parse: ${err.message}`, err.cause)
    } finally {
      warn.mockRestore()
    }
  })

  it('de-duplicates per provider by code and message; onError still sees every report', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      let iv: ReturnType<typeof useIvories> | null = null
      function Grab() { iv = useIvories(); return null }
      const onError = vi.fn()
      render(<IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })} onError={onError}><Grab /></IvoriesProvider>)
      await waitFor(() => expect(iv).not.toBeNull())
      act(() => {
        iv!.reportError(new IvoriesError('midi-unavailable', 'MIDI input is unavailable.'))
        iv!.reportError(new IvoriesError('midi-unavailable', 'MIDI input is unavailable.'))
        iv!.reportError(new IvoriesError('midi-unavailable', 'MIDI access was denied or failed.'))
      })
      expect(onError).toHaveBeenCalledTimes(3)
      const midiLogs = warn.mock.calls.filter(([m]) => String(m).startsWith('[ivories] midi-unavailable'))
      expect(midiLogs.map(([m]) => m)).toEqual([
        '[ivories] midi-unavailable: MIDI input is unavailable.',
        '[ivories] midi-unavailable: MIDI access was denied or failed.',
      ])
    } finally {
      warn.mockRestore()
    }
  })

  it('a second provider logs its own copy of the same error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const grabbed: ReturnType<typeof useIvories>[] = []
      function Grab() { const iv = useIvories(); if (!grabbed.includes(iv)) grabbed.push(iv); return null }
      render(<>
        <IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}><Grab /></IvoriesProvider>
        <IvoriesProvider score={scoreDoc()} engine={fakeEngine()} clock={new AudioClock({ currentTime: 0 })}><Grab /></IvoriesProvider>
      </>)
      await waitFor(() => expect(new Set(grabbed.map((g) => g.reportError)).size).toBe(2))
      const reporters = [...new Set(grabbed.map((g) => g.reportError))]
      act(() => { for (const r of reporters) r(new IvoriesError('render-failed', 'This view stopped working.')) })
      expect(warn.mock.calls.filter(([m]) => m === '[ivories] render-failed: This view stopped working.')).toHaveLength(2)
    } finally {
      warn.mockRestore()
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/ivories/src/react/IvoriesProvider.test.tsx -t "console"`
Expected: FAIL — `console.warn` was never called.

- [ ] **Step 3: Implement**

In `packages/ivories/src/react/IvoriesProvider.tsx` replace:

```tsx
  // audio-unavailable and midi-unavailable never become status.error: the score
  // still loads and plays (silently, or without live keys), spec §4.1.
  const report = useCallback((e: IvoriesError) => {
    if (e.code !== 'audio-unavailable' && e.code !== 'midi-unavailable') status.set({ loading: false, error: e })
    const onError = latest.current.onError
    if (onError) safeCall(onError, e)
  }, [status])
```

with:

```tsx
  // Every reported error also reaches the console, once per code+message for
  // this provider (rising-roll spec §2): a host without onError still sees why
  // audio or MIDI went quiet, and a repeating failure cannot flood the log.
  const [logged] = useState(() => new Set<string>())
  // audio-unavailable and midi-unavailable never become status.error: the score
  // still loads and plays (silently, or without live keys), spec §4.1.
  const report = useCallback((e: IvoriesError) => {
    const key = `${e.code}|${e.message}`
    if (!logged.has(key)) {
      logged.add(key)
      console.warn(`[ivories] ${e.code}: ${e.message}`, e.cause)
    }
    if (e.code !== 'audio-unavailable' && e.code !== 'midi-unavailable') status.set({ loading: false, error: e })
    const onError = latest.current.onError
    if (onError) safeCall(onError, e)
  }, [status, logged])
```

- [ ] **Step 4: Run the tests to verify they pass, then the whole suite**

Run: `npx vitest run packages/ivories/src/react/IvoriesProvider.test.tsx` → PASS.
Run: `npm test` → 950 passed, 1 skipped.

- [ ] **Step 5: Commit**

```bash
git add packages/ivories/src/react/IvoriesProvider.tsx packages/ivories/src/react/IvoriesProvider.test.tsx
git commit -m "feat(ivories): log every reported error to the console once per provider

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Horizontal orientation for the canvas views (core transform + FallingKeys)

**Files:**
- Modify: `packages/ivories/src/core/layout/types.ts` (add `Orientation`)
- Create: `packages/ivories/src/core/render/orientation.ts`
- Test: `packages/ivories/src/core/render/orientation.test.ts`
- Modify: `packages/ivories/src/core/render/pianoRoll.ts` (`RenderState.orientation`)
- Modify: `packages/ivories/src/core/render/keyboard.ts` (C4 label block)
- Test: `packages/ivories/src/core/render/keyboard.test.ts` (append)
- Modify: `packages/ivories/src/core/render/stageRenderer.ts` (`StageInput.orientation`, `draw`)
- Test: `packages/ivories/src/core/render/stageRenderer.test.ts` (append)
- Modify: `packages/ivories/src/core/index.ts` (export orientation)
- Modify: `packages/ivories/src/react/text/StageText.tsx` (`labelPosition`, `orientation` prop)
- Test: `packages/ivories/src/react/text/StageText.test.tsx` (append)
- Modify: `packages/ivories/src/react/text/ChordReadout.tsx` (`chordPosition`, `orientation` prop)
- Test: `packages/ivories/src/react/text/ChordReadout.test.tsx` (append)
- Modify: `packages/ivories/src/react/views/StageView.tsx`, `packages/ivories/src/react/views/FallingKeys.tsx`
- Test: `packages/ivories/src/react/views/StageView.test.tsx` (append)

**Interfaces:**
- Consumes: `computeLayout`, `pitchAt`, `KeyboardLayout`, `KeyRect` (`core/render/geometry.ts`, unchanged).
- Produces:
  - `type Orientation = 'vertical' | 'horizontal'` exported from `core/layout/types.ts` (and so from `ivories/core` and `ivories` types).
  - `core/render/orientation.ts`: `canonicalSize(o: Orientation | undefined, w: number, h: number): [number, number]`; `canonicalExtent(layout: KeyboardLayout): { w: number; h: number }`; `toScreen(o: Orientation | undefined, layout: KeyboardLayout, x: number, y: number): { x: number; y: number }`; `fromScreen(o, layout, sx, sy): { x: number; y: number }`; `applyOrientation(ctx: CanvasRenderingContext2D, o: Orientation | undefined, layout: KeyboardLayout): void`; `pitchAtScreen(layout: KeyboardLayout, o: Orientation | undefined, sx: number, sy: number): number`.
  - `RenderState.orientation?: Orientation`; `StageInput.orientation?: Orientation`.
  - `labelPosition(layout, k: KeyRect, placement: TextSettings['labelPlacement'], size: number, orientation?: Orientation): CSSProperties` (StageText.tsx); `chordPosition(placement, layout, size, orientation?): CSSProperties` (ChordReadout.tsx); `StageText`/`ChordReadout` accept `orientation?: Orientation`.
  - `FallingKeysProps.orientation?: Orientation`; view roots carry `data-orientation="vertical|horizontal"`.

- [ ] **Step 1: Add the type**

In `packages/ivories/src/core/layout/types.ts`, after the `IvoriesView` line add:

```ts
/** Falling/rising views: keyboard along the bottom (vertical) or up the left edge (horizontal piano roll). */
export type Orientation = 'vertical' | 'horizontal'
```

- [ ] **Step 2: Write the failing orientation tests**

Create `packages/ivories/src/core/render/orientation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeLayout } from './geometry'
import { applyOrientation, canonicalSize, fromScreen, pitchAtScreen, toScreen } from './orientation'
import type { KeyRect, KeyboardLayout } from './geometry'

const W = 1220   // screen width
const H = 600    // screen height
const [cw, ch] = canonicalSize('horizontal', W, H)
const layout = computeLayout(cw, ch)

/** A key's screen rectangle under the horizontal map. */
function screenRect(l: KeyboardLayout, k: KeyRect) {
  const a = toScreen('horizontal', l, k.x, l.hitY)
  const b = toScreen('horizontal', l, k.x + k.w, l.hitY + (k.black ? l.blackH : l.keyboardH))
  return { left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) }
}

describe('horizontal orientation (rising-roll spec §2 Orientation, R-H)', () => {
  it('lays the canonical geometry out on the swapped box', () => {
    expect([cw, ch]).toEqual([600, 1220])
    expect(layout.stageW).toBe(600)
    expect(layout.hitY + layout.keyboardH).toBe(1220)
    expect(canonicalSize('vertical', W, H)).toEqual([W, H])
    expect(canonicalSize(undefined, W, H)).toEqual([W, H])
  })

  it('keeps the chordl ratios (it is the same computeLayout)', () => {
    expect(layout.keyboardH / layout.whiteW).toBeCloseTo(5.8, 9)
    expect(layout.blackW / layout.whiteW).toBeCloseTo(0.5652, 9)
    expect(layout.blackH / layout.keyboardH).toBeCloseTo(0.655, 9)
  })

  it('stands the keyboard on the left edge with low notes at the bottom; white keys tile the height', () => {
    const whites = layout.keys.filter((k) => !k.black)
    const a0 = screenRect(layout, whites[0])
    expect(a0.left).toBeCloseTo(0, 9)
    expect(a0.right).toBeCloseTo(layout.keyboardH, 9)
    expect(a0.bottom).toBeCloseTo(H, 9)
    expect(screenRect(layout, whites.at(-1)!).top).toBeCloseTo(0, 9)
    for (let i = 1; i < whites.length; i++) {
      expect(screenRect(layout, whites[i]).bottom).toBeCloseTo(screenRect(layout, whites[i - 1]).top, 9)
    }
    // Black keys sit on the roll side of the keyboard (their tails face the stage).
    const cs = screenRect(layout, layout.byPitch.get(22)!)
    expect(cs.right).toBeCloseTo(layout.keyboardH, 9)
    expect(cs.left).toBeCloseTo(layout.keyboardH - layout.blackH, 9)
  })

  it('fromScreen inverts toScreen; pitchAtScreen hit-tests the rotated keys', () => {
    const p = toScreen('horizontal', layout, 123.4, 567.8)
    const back = fromScreen('horizontal', layout, p.x, p.y)
    expect(back.x).toBeCloseTo(123.4, 9)
    expect(back.y).toBeCloseTo(567.8, 9)
    expect(pitchAtScreen(layout, 'horizontal', layout.keyboardH * 0.2, H - layout.whiteW / 2)).toBe(21)
    expect(pitchAtScreen(layout, 'horizontal', layout.keyboardH + 5, H / 2)).toBe(-1)
  })

  it('vertical is the identity', () => {
    const v = computeLayout(W, H)
    expect(toScreen('vertical', v, 10, 20)).toEqual({ x: 10, y: 20 })
    expect(fromScreen(undefined, v, 10, 20)).toEqual({ x: 10, y: 20 })
  })

  it('applyOrientation sets the reflection transform only for horizontal', () => {
    const calls: number[][] = []
    const ctx = { transform: (...a: number[]) => { calls.push(a) } } as unknown as CanvasRenderingContext2D
    applyOrientation(ctx, 'vertical', layout)
    expect(calls).toEqual([])
    applyOrientation(ctx, 'horizontal', layout)
    expect(calls).toEqual([[0, -1, -1, 0, 1220, 600]])
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run packages/ivories/src/core/render/orientation.test.ts`
Expected: FAIL — `Cannot find module './orientation'`.

- [ ] **Step 4: Implement `orientation.ts`**

Create `packages/ivories/src/core/render/orientation.ts`:

```ts
import { pitchAt } from './geometry'
import type { KeyboardLayout } from './geometry'
import type { Orientation } from '../layout/types'

/**
 * Every view draws in one canonical frame: keyboard along the bottom, low notes
 * on the left, the roll above it. A horizontal view lays that frame out on the
 * screen box SWAPPED (W x H canonical = screen H x W) and maps it with
 *   X = H - y,  Y = W - x
 * so the keyboard stands on the left edge, low notes at the bottom, and time
 * runs to the right. That is a reflection in the anti-diagonal (a quarter turn
 * would put the low notes at the top) and it is its own inverse up to the swap.
 * Key geometry is still computeLayout's, so the chordl ratios and the geometry
 * oracle are untouched (R-H).
 */
export function canonicalSize(o: Orientation | undefined, w: number, h: number): [number, number] {
  return o === 'horizontal' ? [h, w] : [w, h]
}

/** The canonical frame a layout was computed for. */
export function canonicalExtent(layout: KeyboardLayout): { w: number; h: number } {
  return { w: layout.stageW, h: layout.hitY + layout.keyboardH }
}

/** Canonical point -> screen point (CSS pixels inside the view). */
export function toScreen(o: Orientation | undefined, layout: KeyboardLayout, x: number, y: number): { x: number; y: number } {
  if (o !== 'horizontal') return { x, y }
  const { w, h } = canonicalExtent(layout)
  return { x: h - y, y: w - x }
}

/** Screen point -> canonical point, for hosts hit-testing a horizontal view. */
export function fromScreen(o: Orientation | undefined, layout: KeyboardLayout, sx: number, sy: number): { x: number; y: number } {
  if (o !== 'horizontal') return { x: sx, y: sy }
  const { w, h } = canonicalExtent(layout)
  return { x: w - sy, y: h - sx }
}

/** Applies the horizontal map to a 2D context (call inside save()/restore()). */
export function applyOrientation(ctx: CanvasRenderingContext2D, o: Orientation | undefined, layout: KeyboardLayout): void {
  if (o !== 'horizontal') return
  const { w, h } = canonicalExtent(layout)
  ctx.transform(0, -1, -1, 0, h, w)
}

/** pitchAt for a screen point in either orientation; -1 off the keys. */
export function pitchAtScreen(layout: KeyboardLayout, o: Orientation | undefined, sx: number, sy: number): number {
  const p = fromScreen(o, layout, sx, sy)
  return pitchAt(layout, p.x, p.y)
}
```

Run: `npx vitest run packages/ivories/src/core/render/orientation.test.ts` → PASS.

- [ ] **Step 5: Write the failing renderer, keyboard-label and overlay tests**

Append to `packages/ivories/src/core/render/keyboard.test.ts` (it already imports `describe`, `it`, `expect`, `drawKeyboard`, `stubCtx` and `state`; add any missing import of those three helpers from `./keyboard` and `./pianoRoll.test-helpers`):

```ts
describe('drawKeyboard in a horizontal view (R-H)', () => {
  it('draws the C4 label upright through a local counter-transform', () => {
    const { ctx, calls, texts } = stubCtx()
    drawKeyboard(ctx, { ...state([]), orientation: 'horizontal' }, new Map())
    expect(texts).toContain('C4')
    expect(calls).toContain('translate(2)')
    expect(calls).toContain('transform(6)')
  })

  it('a vertical view never transforms', () => {
    const { ctx, calls } = stubCtx()
    drawKeyboard(ctx, state([]), new Map())
    expect(calls).not.toContain('transform(6)')
  })
})
```

Append to `packages/ivories/src/core/render/stageRenderer.test.ts`:

```ts
describe('StageRenderer orientation (R-H, Review Focus 2)', () => {
  it('horizontal: canonical geometry on the swapped box, drawn under the reflection', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx, calls } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input({ orientation: 'horizontal' }))
    expect(f.layout.stageW).toBe(400)
    expect(f.layout.hitY + f.layout.keyboardH).toBe(800)
    expect(calls[0]).toBe('save(0)')
    expect(calls).toContain('transform(6)')
    expect(calls.at(-1)).toBe('restore(0)')
  })

  it('vertical: same geometry as before and no transform', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx, calls } = stubCtx()
    const f = r.draw(ctx, 800, 400, 0, input())
    expect(f.layout.stageW).toBe(800)
    expect(calls).not.toContain('transform(6)')
  })

  it('horizontal at 0x0 stays finite', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx } = stubCtx()
    const f = r.draw(ctx, 0, 0, 0, input({ orientation: 'horizontal' }))
    for (const k of f.layout.keys) expect(Number.isFinite(k.x) && Number.isFinite(k.w)).toBe(true)
    expect(Number.isFinite(f.layout.hitY)).toBe(true)
  })
})
```

Append to `packages/ivories/src/react/text/StageText.test.tsx` (add `labelPosition` to the existing `import { StageText, labelText, samePitches, textCss } from './StageText'`; `computeLayout` is already imported; the inner `layout` shadows the module-level one on purpose):

```tsx
describe('labelPosition (R-H)', () => {
  const layout = computeLayout(400, 1000)   // canonical frame of a 1000 x 400 horizontal view
  const k = layout.byPitch.get(60)!

  it('vertical: centred over the key, above the hit line (unchanged)', () => {
    expect(labelPosition(layout, k, 'above', 10)).toEqual({
      left: `${k.x + k.w / 2}px`, top: `${layout.hitY - 15}px`, transform: 'translateX(-50%)',
    })
  })

  it('horizontal: just right of the keyboard edge, centred on the key row', () => {
    const p = labelPosition(layout, k, 'above', 10, 'horizontal')
    expect(Number.parseFloat(String(p.left))).toBeCloseTo(layout.keyboardH + 9, 6)
    expect(Number.parseFloat(String(p.top))).toBeCloseTo(layout.stageW - (k.x + k.w / 2), 6)
    expect(p.transform).toBe('translateY(-50%)')
  })

  it('horizontal below: on the key face near the outer end', () => {
    const p = labelPosition(layout, k, 'below', 10, 'horizontal')
    expect(Number.parseFloat(String(p.left))).toBeCloseTo(4, 6)
  })
})
```

Append to `packages/ivories/src/react/text/ChordReadout.test.tsx` (add `chordPosition` to the existing `import { ChordReadout, chordDisplayText } from './ChordReadout'`; `computeLayout` is already imported):

```tsx
describe('chordPosition (R-H)', () => {
  const layout = computeLayout(400, 1000)

  it('vertical above-keys is unchanged', () => {
    expect(chordPosition('above-keys', layout, 20)).toEqual({ left: '50%', top: `${layout.hitY - 52}px`, transform: 'translateX(-50%)' })
  })

  it('horizontal keeps the readout off the keyboard on the left', () => {
    expect(chordPosition('above-keys', layout, 20, 'horizontal')).toEqual({
      left: `${layout.keyboardH + 12}px`, top: '50%', transform: 'translateY(-50%)',
    })
    expect(chordPosition('stage-left', layout, 20, 'horizontal')).toEqual({ left: `${layout.keyboardH + 12}px`, top: '12px' })
  })
})
```

Append to `packages/ivories/src/react/views/StageView.test.tsx`, inside the existing `describe('Keyboard and FallingKeys (spec §4)', …)` block:

```tsx
  it('FallingKeys orientation="horizontal" draws under the reflection and marks its root', async () => {
    const stub = stubCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stub.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const { container } = render(<FallingKeys score={doc()} engine={fakeEngine()} orientation="horizontal" />)
    await waitFor(() => expect(stub.calls).toContain('transform(6)'))
    expect(container.querySelector('.ivories-falling')!.getAttribute('data-orientation')).toBe('horizontal')
  })
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run packages/ivories/src/core/render packages/ivories/src/react/text packages/ivories/src/react/views/StageView.test.tsx`
Expected: FAIL — `orientation` unknown on the state/input/props, `labelPosition`/`chordPosition` not exported, no `transform(6)` call.

- [ ] **Step 7: Implement the core changes**

In `packages/ivories/src/core/render/pianoRoll.ts`, add `import type { Orientation } from '../layout/types'` and, inside `RenderState` after the `live?` field:

```ts
  /** Horizontal views draw this same canonical frame under a reflection (R-H);
      only canvas text needs to know, to stay upright. */
  orientation?: Orientation
```

In `packages/ivories/src/core/render/keyboard.ts` replace the label block:

```ts
      if (layout.whiteW >= MIN_WHITE_W_FOR_LABEL) {
        ctx.save()
        ctx.fillStyle = theme.middleCMark
        ctx.font = `600 ${Math.round(layout.whiteW * 0.42)}px Poppins, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillText('C4', k.x + k.w / 2, hitY + keyboardH - layout.whiteW * 0.3)
        ctx.restore()
      }
```

with:

```ts
      if (layout.whiteW >= MIN_WHITE_W_FOR_LABEL) {
        ctx.save()
        ctx.fillStyle = theme.middleCMark
        ctx.font = `600 ${Math.round(layout.whiteW * 0.42)}px Poppins, sans-serif`
        ctx.textAlign = 'center'
        if (state.orientation === 'horizontal') {
          // The stage is drawn under the horizontal reflection; applying the same
          // matrix again here cancels it, so the label reads upright (R-H).
          ctx.translate(k.x + k.w / 2, hitY + keyboardH - layout.whiteW * 0.6)
          ctx.transform(0, -1, -1, 0, 0, 0)
          ctx.textBaseline = 'middle'
          ctx.fillText('C4', 0, 0)
        } else {
          ctx.textBaseline = 'alphabetic'
          ctx.fillText('C4', k.x + k.w / 2, hitY + keyboardH - layout.whiteW * 0.3)
        }
        ctx.restore()
      }
```

In `packages/ivories/src/core/render/stageRenderer.ts`:
- add imports `import { applyOrientation, canonicalSize } from './orientation'` and `import type { Orientation } from '../layout/types'`;
- in `StageInput` add after `live?`:

```ts
  /** 'horizontal' draws the keyboard up the left edge (R-H). Default vertical. */
  orientation?: Orientation
```

- replace the body of `draw` with:

```ts
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, input: StageInput): StageFrame {
    const st = input.settings
    const [first, last] = input.range ?? this.rangeFor(input.score, st.display.zoom)
    // A hidden container reports 0x0; clamp so geometry never divides by zero.
    // Horizontal views compute the canonical geometry on the swapped box (R-H).
    const [cw, ch] = canonicalSize(input.orientation, Math.max(1, w), Math.max(1, h))
    const layout = this.layoutFor(cw, ch, first, last)
    const rs: RenderState = {
      notes: input.score?.notes ?? [],
      voices: this.voicesFor(input.score),
      layout,
      velocity: st.velocity,
      fallSeconds: input.fallSeconds,
      maxNoteDur: input.maxNoteDur,
      showRoll: input.showRoll,
      showGrid: input.showRoll && st.display.showGrid,
      showFlash: st.display.showFlash,
      flashScale: st.display.flashScale,
      showMiddleC: st.display.showMiddleC,
      theme: this.themeFor(st.theme.name, st.theme.stageBgOverride, layout),
      live: input.live,
      orientation: input.orientation,
    }
    const dur = input.score?.durationSec ?? 0
    const progress = dur > 0 ? t / dur : 0
    ctx.save()
    try {
      applyOrientation(ctx, input.orientation, layout)
      const held = drawStage(ctx, rs, t, progress)
      return { layout, held }
    } finally {
      ctx.restore()
    }
  }
```

In `packages/ivories/src/core/index.ts`, after `export * from './render/stageRenderer'` add:

```ts
export * from './render/orientation'
```

- [ ] **Step 8: Implement the overlays and the view**

In `packages/ivories/src/react/text/StageText.tsx`:
- add imports `import { toScreen } from '../../core/render/orientation'`, `import type { KeyRect } from '../../core/render/geometry'` (merge with the existing `KeyboardLayout` type import) and `import type { Orientation } from '../../core/layout/types'`;
- add above `export function StageText`:

```tsx
/**
 * Where one note label sits. Vertical: centred over its key, above the hit
 * line or over the key face. Horizontal (R-H): the same anchors mapped to the
 * screen, with the text running right from the keyboard edge (or key end).
 */
export function labelPosition(
  layout: KeyboardLayout, k: KeyRect, placement: TextSettingsType['labelPlacement'], size: number,
  orientation?: Orientation,
): CSSProperties {
  const cx = k.x + k.w / 2
  if (orientation === 'horizontal') {
    const y = placement === 'above' ? layout.hitY - size * 0.9 : layout.hitY + layout.keyboardH - size * 0.4
    const p = toScreen('horizontal', layout, cx, y)
    return { left: `${p.x}px`, top: `${p.y}px`, transform: 'translateY(-50%)' }
  }
  // Above: just clear of the hit line, in the stage area. Below: over the
  // key face, clear of the black keys' lower edge.
  const top = placement === 'above'
    ? layout.hitY - size * 1.5
    : layout.hitY + layout.keyboardH - size * 1.6
  return { left: `${cx}px`, top: `${top}px`, transform: 'translateX(-50%)' }
}
```

- add `orientation?: Orientation` to the `StageText` props type and destructure it (`const { layout, pitches, text, keyContext, orientation } = props`);
- inside the `pitches.map`, delete the `const top = …` lines and the `left`/`top`/`transform` style entries, and spread the helper instead:

```tsx
            style={{
              ...css,
              position: 'absolute',
              ...labelPosition(layout, k, text.labelPlacement, size, orientation),
              whiteSpace: 'nowrap',
              lineHeight: 1,
            }}
```

In `packages/ivories/src/react/text/ChordReadout.tsx`:
- add `import type { Orientation } from '../../core/layout/types'`;
- replace the `position` function with:

```tsx
export function chordPosition(
  placement: TextSettingsType['chordPlacement'], layout: KeyboardLayout, size: number,
  orientation?: Orientation,
): CSSProperties {
  if (orientation === 'horizontal') {
    // The keyboard occupies the left keyboardH pixels: keep the readout on the stage.
    const left = `${layout.keyboardH + size * 0.6}px`
    switch (placement) {
      case 'stage-centre':
        return { left: `calc(${layout.keyboardH}px + (100% - ${layout.keyboardH}px) / 2)`, top: `${size * 0.6}px`, transform: 'translateX(-50%)' }
      case 'above-keys':
        return { left, top: '50%', transform: 'translateY(-50%)' }
      default:
        return { left, top: `${size * 0.6}px` }
    }
  }
  switch (placement) {
    case 'stage-centre':
      return { left: '50%', top: `${size * 0.6}px`, transform: 'translateX(-50%)' }
    case 'above-keys':
      return { left: '50%', top: `${layout.hitY - size * 2.6}px`, transform: 'translateX(-50%)' }
    default:
      return { left: `${size * 0.6}px`, top: `${size * 0.6}px` }
  }
}
```

- add `orientation?: Orientation` to the `ChordReadout` props, destructure it, and change the style spread to `...chordPosition(text.chordPlacement, layout, size, orientation),`.

In `packages/ivories/src/react/views/StageView.tsx`:
- add `import type { Orientation } from '../../core/layout/types'`;
- change the signature to:

```tsx
export function StageView(p: StageViewProps & { kind: 'keyboard' | 'falling'; lookahead?: number; input?: 'none' | 'midi'; orientation?: Orientation }) {
```

- in the `renderer.draw(…)` input object add `orientation: props.orientation,` after `live: liveMap,`;
- on the root `<div>` add `data-orientation={p.orientation ?? 'vertical'}` after `data-ivories-view={p.kind}`;
- pass `orientation={p.orientation}` to both `<StageText …/>` and `<ChordReadout …/>`.

In `packages/ivories/src/react/views/FallingKeys.tsx`:
- add `import type { Orientation } from '../../core/layout/types'`;
- add to `FallingKeysProps`:

```ts
  /** 'horizontal': a traditional piano roll, keyboard up the left edge, notes arriving from the right. */
  orientation?: Orientation
```

- [ ] **Step 9: Run the tests, the oracle and the checks**

Run: `npx vitest run packages/ivories/src/core/render packages/ivories/src/react` → PASS.
Run: `npm run check` → `all passed` from the geometry oracle, imports and CSS checks pass.
Run: `npm run check -w packages/ivories` → no type errors.
Run: `npm test` → all pass; passed = Task 1's 950 + the `it` blocks added in this task; 1 skipped.

- [ ] **Step 10: Commit**

```bash
git add packages/ivories/src
git commit -m "feat(ivories): horizontal orientation for falling views (canonical frame + reflection)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rising draw path in core (beats, live trail, `drawRisingStage`)

**Files:**
- Create: `packages/ivories/src/core/render/beats.ts`, test `beats.test.ts`
- Create: `packages/ivories/src/core/midi/trail.ts`, test `trail.test.ts`
- Modify: `packages/ivories/src/core/render/theme.ts` (+ `theme.test.ts` append)
- Modify: `packages/ivories/src/style.css` (two tokens inside `@layer ivories`)
- Modify: `packages/ivories/src/core/render/pianoRoll.ts` (export `drawBackground`, `drawProgress`, `drawImpact` with live list)
- Create: `packages/ivories/src/core/render/rising.ts`, test `rising.test.ts`
- Modify: `packages/ivories/src/core/render/stageRenderer.ts` (+ test append)
- Modify: `packages/ivories/src/core/index.ts`

**Interfaces:**
- Consumes: `secToTicks`, `ticksToSec` (`core/model/tempoMap.ts`); `normaliseTimeSignatures` (`core/model/timeSignatures.ts`); `lowerBoundByStart` (`core/model/search.ts`); `noteColor`, `flashIntensity` (`core/render/colors.ts`); `drawKeyboard`; `roundRect`; `applyOrientation`/`canonicalSize` (Task 2).
- Produces:
  - `beats.ts`: `DEFAULT_LIVE_BPM = 100`, `MIN_LIVE_BPM = 20`, `MAX_LIVE_BPM = 300`, `DEFAULT_VISIBLE_BEATS = 8`, `DEFAULT_BEATS_PER_BAR = 4`; `clampBpm(bpm: number): number`; `clampVisibleBeats(v: number): number`; `interface BeatLine { beat: number; bar: boolean }`; `interface BeatClock { beatAt(sec: number): number; secAt(beat: number): number; lines(fromBeat: number, toBeat: number): BeatLine[] }`; `liveBeatClock(bpm: number, beatsPerBar?: number): BeatClock`; `scoreBeatClock(score: ScoreDocument, tempo: TempoSetting): BeatClock`.
  - `trail.ts`: `interface TrailNote { midi: number; velocity: number; startSec: number; endSec: number | null }`; `MAX_TRAIL_NOTES = 512`; `trailNoteOn(list: readonly TrailNote[], midi: number, velocity: number, at: number): readonly TrailNote[]`; `trailNoteOff(list, midi, at): readonly TrailNote[]`; `trailReseat(list, at): readonly TrailNote[]`.
  - `Theme.beatLine: string`, `Theme.barLine: string` (tokens `--ivories-beat-line`, `--ivories-bar-line`).
  - `pianoRoll.ts`: `drawBackground(ctx, state: RenderState): void`; `drawProgress(ctx, state: RenderState, progress: number): void`; `drawImpact(ctx, state: RenderState, t: number, vis: NoteEvent[], live?: readonly TrailNote[]): void`.
  - `rising.ts`: `interface RisingState extends RenderState { beats: BeatClock; visibleBeats: number; trail: readonly TrailNote[]; showBeatGrid: boolean }`; `interface BarSpan { top: number; bottom: number }`; `risingSpan(t: number, nowBeat: number, beats: BeatClock, startSec: number, endSec: number | null, hitY: number, beatPx: number): BarSpan | null`; `risingNotes(notes: NoteEvent[], fromSec: number, t: number, maxNoteDur: number): NoteEvent[]`; `drawRisingStage(ctx, state: RisingState, t: number, progress: number): Map<number, NoteEvent>`.
  - `stageRenderer.ts`: `interface RisingInput { bpm: number; beatsPerBar: number; tempo: TempoSetting; visibleBeats: number; trail: readonly TrailNote[]; grid: boolean }`; `StageInput.rising?: RisingInput | null`; `StageRenderer.beatClockFor(score: ScoreDocument | null, r: RisingInput): BeatClock`.

- [ ] **Step 1: Write the failing beats tests**

Create `packages/ivories/src/core/render/beats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clampBpm, clampVisibleBeats, liveBeatClock, scoreBeatClock } from './beats'
import { buildTempoMap } from '../model/tempoMap'
import type { ScoreDocument, TempoSetting, TimeSigEvent } from '../model/types'

const PPQ = 480
const SCALE_1: TempoSetting = { mode: 'scale', scale: 1 }
const score = (sigs: TimeSigEvent[], tempi = [{ ticks: 0, bpm: 120 }]): ScoreDocument => ({
  id: 's', name: 's', ppq: PPQ, tempoMap: buildTempoMap(tempi, PPQ), voices: [], notes: [],
  durationSec: 10, sourceFormat: 'midi', timeSignatures: sigs, keySignature: null,
})
const bars = (lines: { beat: number; bar: boolean }[]) => lines.filter((l) => l.bar).map((l) => l.beat)

describe('liveBeatClock (R-B)', () => {
  it('maps seconds to beats at the BPM, both ways', () => {
    const c = liveBeatClock(120)
    expect(c.beatAt(1)).toBe(2)
    expect(c.secAt(2)).toBe(1)
  })

  it('a beat line on every beat, a bar line every beatsPerBar from clock 0', () => {
    const c = liveBeatClock(120, 4)
    const lines = c.lines(-0.5, 8.2)
    expect(lines.map((l) => l.beat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(bars(lines)).toEqual([0, 4, 8])
    expect(bars(liveBeatClock(120, 3).lines(0, 6))).toEqual([0, 3, 6])
    expect(c.lines(1.5, 3).map((l) => l.beat)).toEqual([2, 3])
  })

  it('negative beats (before the first note) keep the bar pattern', () => {
    expect(bars(liveBeatClock(60, 4).lines(-5, 0))).toEqual([-4, 0])
  })
})

describe('clampBpm / clampVisibleBeats (Review Focus 3)', () => {
  it('clamps to 20-300, rounds, and maps non-finite input to the default', () => {
    expect(clampBpm(10)).toBe(20)
    expect(clampBpm(1e9)).toBe(300)
    expect(clampBpm(99.6)).toBe(100)
    expect(clampBpm(Number.NaN)).toBe(100)
    expect(clampVisibleBeats(0)).toBe(1)
    expect(clampVisibleBeats(500)).toBe(64)
    expect(clampVisibleBeats(Number.NaN)).toBe(8)
  })
})

describe('scoreBeatClock (R-B)', () => {
  it('beats are quarter notes on the tempo map', () => {
    const c = scoreBeatClock(score([{ ticks: 0, numerator: 4, denominator: 4 }]), SCALE_1)
    expect(c.beatAt(1)).toBeCloseTo(2, 9)
    expect(c.secAt(4)).toBeCloseTo(2, 9)
  })

  it('follows a tempo change', () => {
    const c = scoreBeatClock(score([], [{ ticks: 0, bpm: 120 }, { ticks: 2 * PPQ, bpm: 60 }]), SCALE_1)
    expect(c.beatAt(1)).toBeCloseTo(2, 9)
    expect(c.beatAt(2)).toBeCloseTo(3, 9)
  })

  it('a retimed (studio) score still lines up: scale 2 doubles beats per second', () => {
    expect(scoreBeatClock(score([]), { mode: 'scale', scale: 2 }).beatAt(0.5)).toBeCloseTo(2, 9)
  })

  it('bar lines from the time signature: 4/4, 3/4, and 6/8 (eighth-note beat lines)', () => {
    expect(bars(scoreBeatClock(score([{ ticks: 0, numerator: 4, denominator: 4 }]), SCALE_1).lines(0, 8))).toEqual([0, 4, 8])
    expect(bars(scoreBeatClock(score([{ ticks: 0, numerator: 3, denominator: 4 }]), SCALE_1).lines(0, 6))).toEqual([0, 3, 6])
    const six = scoreBeatClock(score([{ ticks: 0, numerator: 6, denominator: 8 }]), SCALE_1).lines(0, 3)
    expect(six.map((l) => l.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3])
    expect(bars(six)).toEqual([0, 3])
  })

  it('a signature change restarts the bar count at the change', () => {
    const c = scoreBeatClock(score([
      { ticks: 0, numerator: 4, denominator: 4 },
      { ticks: 4 * PPQ, numerator: 3, denominator: 4 },
    ]), SCALE_1)
    expect(bars(c.lines(0, 10))).toEqual([0, 4, 7, 10])
  })

  it('the count-in (negative beats) extends the first signature backwards', () => {
    const c = scoreBeatClock(score([{ ticks: 0, numerator: 4, denominator: 4 }]), SCALE_1)
    const lines = c.lines(-2, 0)
    expect(lines.map((l) => l.beat)).toEqual([-2, -1, 0])
    expect(bars(lines)).toEqual([0])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/ivories/src/core/render/beats.test.ts`
Expected: FAIL — `Cannot find module './beats'`.

- [ ] **Step 3: Implement `beats.ts`**

Create `packages/ivories/src/core/render/beats.ts`:

```ts
import { secToTicks, ticksToSec } from '../model/tempoMap'
import { normaliseTimeSignatures } from '../model/timeSignatures'
import type { ScoreDocument, TempoSetting } from '../model/types'

export const DEFAULT_LIVE_BPM = 100
export const MIN_LIVE_BPM = 20
export const MAX_LIVE_BPM = 300
export const DEFAULT_VISIBLE_BEATS = 8
export const DEFAULT_BEATS_PER_BAR = 4
/** A pathological window (64 beats of 1/64 notes) still draws a bounded grid. */
const MAX_LINES = 512

/** Live BPM: an integer in 20-300; anything non-finite is the default (Review Focus 3). */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_LIVE_BPM
  return Math.round(Math.min(MAX_LIVE_BPM, Math.max(MIN_LIVE_BPM, bpm)))
}

export function clampVisibleBeats(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_VISIBLE_BEATS
  return Math.min(64, Math.max(1, v))
}

export interface BeatLine { beat: number; bar: boolean }

/**
 * Clock seconds <-> beats for the rising roll (R-B). For a score a beat is a
 * quarter note (ticks / ppq) on the provider's tempo; live, it is 60 / bpm s.
 */
export interface BeatClock {
  beatAt(sec: number): number
  secAt(beat: number): number
  /** Grid lines with fromBeat <= beat <= toBeat, ascending; `bar` marks bar starts. */
  lines(fromBeat: number, toBeat: number): BeatLine[]
}

const mod = (a: number, n: number) => ((a % n) + n) % n

export function liveBeatClock(bpm: number, beatsPerBar: number = DEFAULT_BEATS_PER_BAR): BeatClock {
  const b = clampBpm(bpm)
  const perBar = Number.isFinite(beatsPerBar) && beatsPerBar >= 1 ? Math.round(beatsPerBar) : DEFAULT_BEATS_PER_BAR
  return {
    beatAt: (sec) => (sec * b) / 60,
    secAt: (beat) => (beat * 60) / b,
    lines(fromBeat, toBeat) {
      const out: BeatLine[] = []
      for (let k = Math.ceil(fromBeat - 1e-9); k <= toBeat + 1e-9 && out.length < MAX_LINES; k++) {
        out.push({ beat: k, bar: mod(k, perBar) === 0 })
      }
      return out
    },
  }
}

export function scoreBeatClock(score: ScoreDocument, tempo: TempoSetting): BeatClock {
  const { tempoMap, ppq } = score
  const sigs = normaliseTimeSignatures(score.timeSignatures)
  return {
    beatAt: (sec) => secToTicks(tempoMap, ppq, sec, tempo) / ppq,
    secAt: (beat) => ticksToSec(tempoMap, ppq, beat * ppq, tempo),
    lines(fromBeat, toBeat) {
      const out: BeatLine[] = []
      const fromT = fromBeat * ppq
      const toT = toBeat * ppq
      for (let i = 0; i < sigs.length && out.length < MAX_LINES; i++) {
        const s = sigs[i]
        // The first signature also covers the count-in before tick 0.
        const segStart = i === 0 ? -Infinity : s.ticks
        const segEnd = i + 1 < sigs.length ? sigs[i + 1].ticks : Infinity
        const lo = Math.max(fromT, segStart)
        const hi = Math.min(toT, segEnd)
        if (lo > hi) continue
        const beatTicks = (ppq * 4) / s.denominator
        for (let k = Math.ceil((lo - s.ticks) / beatTicks - 1e-9); out.length < MAX_LINES; k++) {
          const tick = s.ticks + k * beatTicks
          if (tick > hi + 1e-6 || tick >= segEnd) break
          out.push({ beat: tick / ppq, bar: mod(k, s.numerator) === 0 })
        }
      }
      return out
    },
  }
}
```

Run: `npx vitest run packages/ivories/src/core/render/beats.test.ts` → PASS.

- [ ] **Step 4: Write the failing trail tests**

Create `packages/ivories/src/core/midi/trail.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MAX_TRAIL_NOTES, trailNoteOff, trailNoteOn, trailReseat } from './trail'

describe('live trail (R-T)', () => {
  it('a note-on opens a held note; its note-off closes it', () => {
    const a = trailNoteOn([], 60, 90, 1)
    expect(a).toEqual([{ midi: 60, velocity: 90, startSec: 1, endSec: null }])
    expect(trailNoteOff(a, 60, 1.5)).toEqual([{ midi: 60, velocity: 90, startSec: 1, endSec: 1.5 }])
  })

  it('a repeated note-on closes the still-held copy first', () => {
    const a = trailNoteOn(trailNoteOn([], 60, 90, 1), 60, 70, 2)
    expect(a).toEqual([
      { midi: 60, velocity: 90, startSec: 1, endSec: 2 },
      { midi: 60, velocity: 70, startSec: 2, endSec: null },
    ])
  })

  it('an off for a key that is not held returns the same list', () => {
    const a = trailNoteOn([], 60, 90, 1)
    expect(trailNoteOff(a, 62, 2)).toBe(a)
  })

  it('an off never ends a note before it started (a backward clock)', () => {
    expect(trailNoteOff(trailNoteOn([], 60, 90, 5), 60, 4)[0].endSec).toBe(5)
  })

  it('keeps at most MAX_TRAIL_NOTES, dropping the oldest', () => {
    let list = trailNoteOn([], 21, 1, 0)
    for (let i = 1; i <= MAX_TRAIL_NOTES; i++) list = trailNoteOn(list, 21 + (i % 80), 1, i)
    expect(list).toHaveLength(MAX_TRAIL_NOTES)
    expect(list[0].startSec).toBe(1)
  })

  it('reseat (after a seek) drops finished notes and restarts held ones at the new time', () => {
    const list = trailNoteOff(trailNoteOn(trailNoteOn([], 60, 90, 1), 64, 80, 1.2), 60, 1.5)
    expect(trailReseat(list, 10)).toEqual([{ midi: 64, velocity: 80, startSec: 10, endSec: null }])
  })
})
```

Run: `npx vitest run packages/ivories/src/core/midi/trail.test.ts` → FAIL (module missing).

- [ ] **Step 5: Implement `trail.ts`**

Create `packages/ivories/src/core/midi/trail.ts`:

```ts
/**
 * A live note on the PROVIDER CLOCK, for the rising roll (R-T). `endSec` is
 * null while the key is held. Not LiveNote.time, which is performance.now().
 */
export interface TrailNote { midi: number; velocity: number; startSec: number; endSec: number | null }

/** The rising roll shows at most this many recent live notes. */
export const MAX_TRAIL_NOTES = 512

const close = (n: TrailNote, at: number): TrailNote => ({ ...n, endSec: Math.max(n.startSec, at) })

export function trailNoteOn(list: readonly TrailNote[], midi: number, velocity: number, at: number): readonly TrailNote[] {
  const out = list.map((n) => (n.midi === midi && n.endSec === null ? close(n, at) : n))
  out.push({ midi, velocity, startSec: at, endSec: null })
  return out.length > MAX_TRAIL_NOTES ? out.slice(out.length - MAX_TRAIL_NOTES) : out
}

export function trailNoteOff(list: readonly TrailNote[], midi: number, at: number): readonly TrailNote[] {
  let changed = false
  const out = list.map((n) => {
    if (n.midi !== midi || n.endSec !== null) return n
    changed = true
    return close(n, at)
  })
  return changed ? out : list
}

/** After a seek: finished notes are dropped, held ones restart at the new position. */
export function trailReseat(list: readonly TrailNote[], at: number): readonly TrailNote[] {
  return list.filter((n) => n.endSec === null).map((n) => ({ ...n, startSec: at }))
}
```

Run: `npx vitest run packages/ivories/src/core/midi/trail.test.ts` → PASS.

- [ ] **Step 6: Theme tokens (failing test, then implementation)**

Append inside the `describe('readTheme', …)` block of `packages/ivories/src/core/render/theme.test.ts` (the file's module-level `reader(tokens)` helper and `el` constant are reused):

```ts
  it('reads the rising-roll beat and bar line tokens, with defaults', () => {
    const t = readTheme(el, reader({ '--ivories-beat-line': 'rgb(1, 2, 3)', '--ivories-bar-line': 'rgb(4, 5, 6)' }))
    expect(t.beatLine).toBe('rgb(1, 2, 3)')
    expect(t.barLine).toBe('rgb(4, 5, 6)')
    expect(DEFAULT_THEME.beatLine).toBe('rgba(255,255,255,0.06)')
    expect(DEFAULT_THEME.barLine).toBe('rgba(255,255,255,0.18)')
  })
```

Run it → FAIL. Then in `packages/ivories/src/core/render/theme.ts`:
- in `interface Theme` after `gridLineDash: number[]` add:

```ts
  /** Rising roll: a line on every beat, a stronger one on every bar. */
  beatLine: string
  barLine: string
```

- in `DEFAULT_THEME` after `gridLineDash: [],` add `beatLine: 'rgba(255,255,255,0.06)',` and `barLine: 'rgba(255,255,255,0.18)',`;
- in `readTheme`'s return after `gridLineDash: …,` add:

```ts
    beatLine: str('--ivories-beat-line', DEFAULT_THEME.beatLine),
    barLine: str('--ivories-bar-line', DEFAULT_THEME.barLine),
```

In `packages/ivories/src/style.css`, inside the first `.ivories { … }` rule (within `@layer ivories`), after `--ivories-grid-line-style: solid;` add:

```css
    /* Rising roll grid: every beat, and stronger on every bar. */
    --ivories-beat-line: rgba(255, 255, 255, 0.06);
    --ivories-bar-line: rgba(255, 255, 255, 0.18);
```

Run the theme test → PASS; `npm run check:css -w packages/ivories` → passes.

- [ ] **Step 7: Write the failing rising tests**

Create `packages/ivories/src/core/render/rising.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { drawRisingStage, risingNotes, risingSpan } from './rising'
import { liveBeatClock, scoreBeatClock } from './beats'
import { noteColor } from './colors'
import { DEFAULT_THEME } from './theme'
import { state } from './pianoRoll.test-helpers'
import { buildTempoMap } from '../model/tempoMap'
import type { RisingState } from './rising'
import type { NoteEvent, ScoreDocument } from '../model/types'

const n = (id: number, pitch: number, startSec: number, dur: number): NoteEvent => ({
  id, pitch, startTicks: 0, durTicks: 480, startSec, endSec: startSec + dur, velocity: 100, voiceId: 'v',
})

/** Records bars (roundRect with the gradient stops in force) and grid lines (moveTo). */
function recorder() {
  const rects: { x: number; y: number; w: number; h: number; stops: string[] }[] = []
  const moves: { x: number; y: number; stroke: string }[] = []
  let fill: unknown = null
  let stroke = ''
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, p: string) {
      if (p === 'createLinearGradient' || p === 'createRadialGradient') {
        return () => { const g = { stops: [] as string[], addColorStop(_o: number, c: string) { g.stops.push(c) } }; return g }
      }
      if (p === 'roundRect') {
        return (x: number, y: number, w: number, h: number) => {
          rects.push({ x, y, w, h, stops: (fill as { stops?: string[] } | null)?.stops ?? [] })
        }
      }
      if (p === 'moveTo') return (x: number, y: number) => { moves.push({ x, y, stroke }) }
      if (p.startsWith('global')) return 'source-over'
      return () => {}
    },
    set(_t, p: string, v) {
      if (p === 'fillStyle') fill = v
      if (p === 'strokeStyle') stroke = String(v)
      return true
    },
  })
  return { ctx, rects, moves }
}

const rising = (patch: Partial<RisingState> = {}): RisingState => ({
  ...state([]), showFlash: false, beats: liveBeatClock(120), visibleBeats: 8, trail: [], showBeatGrid: true, ...patch,
})

describe('risingSpan (rising-roll spec §2 Rising view, §4)', () => {
  const beats = liveBeatClock(120)   // 2 beats per second
  const span = (t: number, start: number, end: number | null) =>
    risingSpan(t, beats.beatAt(t), beats, start, end, 400, 50)

  it('a note appears at the keyboard edge at its onset', () => {
    expect(span(1, 1, null)).toEqual({ top: 400, bottom: 400 })
  })

  it('a held note grows from the keyboard (bottom stays on the edge)', () => {
    expect(span(1, 0, null)).toEqual({ top: 300, bottom: 400 })
    expect(span(1, 0, 5)).toEqual({ top: 300, bottom: 400 })
  })

  it('on release it detaches and drifts away, one beat = beatPx', () => {
    expect(span(2, 0, 1)).toEqual({ top: 200, bottom: 300 })
  })

  it('a note that has not started is not drawn (count-in, seek back: Review Focus 1)', () => {
    expect(span(2, 3, null)).toBeNull()
  })

  it('a note past the far edge is gone', () => {
    expect(span(5.01, 0, 1)).toBeNull()
  })

  it('a BPM change re-spaces, never re-times: the same seconds sit half as far apart at half the BPM', () => {
    const slow = liveBeatClock(60)
    expect(risingSpan(2, slow.beatAt(2), slow, 0, 1, 400, 50)).toEqual({ top: 300, bottom: 350 })
  })
})

describe('risingNotes', () => {
  it('keeps notes started by t that end inside the window, from a binary-searched start', () => {
    const notes = [n(0, 60, 0, 0.2), n(1, 62, 2, 0.5), n(2, 64, 4, 1), n(3, 65, 9, 1)]
    expect(risingNotes(notes, 1, 5, 1).map((x) => x.id)).toEqual([1, 2])
  })
})

describe('drawRisingStage', () => {
  const layoutOf = () => state([]).layout

  it('a held live note is a bar in the live hue whose bottom sits on the keyboard edge', () => {
    const { ctx, rects } = recorder()
    const trail = [{ midi: 60, velocity: 100, startSec: 0, endSec: null }]
    drawRisingStage(ctx, rising({ trail }), 1, 0)
    const { hitY, byPitch } = layoutOf()
    const beatPx = hitY / 8
    const k = byPitch.get(60)!
    const bar = rects.find((r) => r.x === k.x + 1)!
    expect(bar.y).toBeCloseTo(hitY - 2 * beatPx, 6)
    expect(bar.y + bar.h).toBeCloseTo(hitY, 6)
    expect(bar.stops[0]).toBe(noteColor(DEFAULT_THEME.liveHue, 100, state([]).velocity))
  })

  it('a finished score note has detached and drifted (onset edge is the far edge)', () => {
    const { ctx, rects } = recorder()
    drawRisingStage(ctx, rising({ ...state([n(0, 64, 0, 0.5)]), showFlash: false, beats: liveBeatClock(120), visibleBeats: 8, trail: [], showBeatGrid: true }), 1, 0)
    const { hitY, byPitch } = layoutOf()
    const beatPx = hitY / 8
    const bar = rects.find((r) => r.x === byPitch.get(64)!.x + 1)!
    expect(bar.y).toBeCloseTo(hitY - 2 * beatPx, 6)
    expect(bar.y + bar.h).toBeCloseTo(hitY - beatPx, 6)
    expect(bar.stops[0]).toBe(noteColor(207, 100, state([]).velocity))
  })

  it('draws a line on every beat in view and the bar colour on bar starts', () => {
    const { ctx, moves } = recorder()
    drawRisingStage(ctx, rising(), 1, 0)   // now = beat 2, window beats -6..2
    const grid = moves.filter((m) => m.x === 0)
    expect(grid).toHaveLength(9)
    const { hitY } = layoutOf()
    expect(grid.at(-1)!.y).toBeCloseTo(hitY, 6)
    expect(grid.filter((m) => m.stroke === DEFAULT_THEME.barLine)).toHaveLength(2)   // beats -4 and 0
  })

  it('no grid when the beat grid is off', () => {
    const { ctx, moves } = recorder()
    drawRisingStage(ctx, rising({ showBeatGrid: false }), 1, 0)
    expect(moves.filter((m) => m.x === 0)).toHaveLength(0)
  })

  it('count-in (negative t) with a score clock draws no bars and no NaN', () => {
    const score: ScoreDocument = {
      id: 's', name: 's', ppq: 480, tempoMap: buildTempoMap([{ ticks: 0, bpm: 120 }], 480), voices: [], notes: [],
      durationSec: 4, sourceFormat: 'midi', timeSignatures: [], keySignature: null,
    }
    const { ctx, rects, moves } = recorder()
    const held = drawRisingStage(ctx, rising({ ...state([n(0, 60, 0, 1)]), showFlash: false, beats: scoreBeatClock(score, { mode: 'scale', scale: 1 }), visibleBeats: 8, trail: [], showBeatGrid: true }), -1, 0)
    expect(rects).toHaveLength(0)
    expect(held.size).toBe(0)
    for (const m of moves) expect(Number.isFinite(m.y)).toBe(true)
  })

  it('lights the keyboard from the score notes sounding at t', () => {
    const { ctx } = recorder()
    const held = drawRisingStage(ctx, rising({ ...state([n(0, 60, 0, 2)]), showFlash: false, beats: liveBeatClock(120), visibleBeats: 8, trail: [], showBeatGrid: true }), 1, 0)
    expect([...held.keys()]).toEqual([60])
  })
})
```

Append to `packages/ivories/src/core/render/stageRenderer.test.ts`:

```ts
describe('StageRenderer rising input', () => {
  const rising = { bpm: 120, beatsPerBar: 4, tempo: { mode: 'scale', scale: 1 } as const, visibleBeats: 8, trail: [], grid: true }

  it('caches the live beat clock by bpm and beats per bar', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const a = r.beatClockFor(null, rising)
    expect(r.beatClockFor(null, { ...rising })).toBe(a)
    expect(r.beatClockFor(null, { ...rising, bpm: 60 })).not.toBe(a)
  })

  it('draws the rising roll (no octave grid lines from the falling path) under the orientation', () => {
    const r = new StageRenderer(() => DEFAULT_THEME)
    const { ctx, calls } = stubCtx()
    const f = r.draw(ctx, 800, 400, 1, input({ rising, orientation: 'horizontal' }))
    expect(f.layout.stageW).toBe(400)
    expect(calls).toContain('transform(6)')
    // The falling path's octave grid uses setLineDash; the rising path never does.
    expect(calls).not.toContain('setLineDash(1)')
  })
})
```

Run: `npx vitest run packages/ivories/src/core/render` → FAIL (`./rising` missing, `beatClockFor` missing).

- [ ] **Step 8: Refactor `pianoRoll.ts` exports (no behaviour change)**

In `packages/ivories/src/core/render/pianoRoll.ts`:
- add `import type { TrailNote } from '../midi/trail'`;
- replace the whole `drawImpact` function with:

```ts
/** One key's hit flash at intensity i (0 = nothing). */
function flashKey(ctx: CanvasRenderingContext2D, state: RenderState, pitch: number, i: number): void {
  if (i <= 0.003) return
  const { layout, theme } = state
  const k = layout.byPitch.get(pitch)
  if (!k) return

  const cx = k.x + k.w / 2
  const cy = layout.hitY
  const R = Math.max(2, 2.2 * layout.whiteW * i)

  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R)
  rg.addColorStop(0, `rgba(${theme.flashCoreRgb}, ${(0.9 * i).toFixed(3)})`)
  rg.addColorStop(0.35, `rgba(${theme.flashWarmRgb}, ${(0.34 * i).toFixed(3)})`)
  rg.addColorStop(1, `rgba(${theme.flashCoreRgb}, 0)`)
  ctx.fillStyle = rg
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill()

  const bg = ctx.createLinearGradient(0, cy - 26, 0, cy + 20)
  bg.addColorStop(0, `rgba(${theme.flashCoreRgb}, 0)`)
  bg.addColorStop(0.5, `rgba(${theme.flashCoreRgb}, ${(0.85 * i).toFixed(3)})`)
  bg.addColorStop(1, `rgba(${theme.flashCoreRgb}, 0)`)
  ctx.fillStyle = bg
  ctx.fillRect(cx - k.w * 0.45, cy - 26, k.w * 0.9, 46)

  const len = 1.6 * layout.whiteW * i
  ctx.strokeStyle = `rgba(${theme.flashCoreRgb}, ${(0.7 * i).toFixed(3)})`
  ctx.lineWidth = 1
  ctx.lineCap = 'round'
  ctx.beginPath()
  for (let s = 0; s < 5; s++) {
    const ang = ((-50 + 100 * (s / 4)) * Math.PI) / 180
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len)
  }
  ctx.stroke()
}

/** Hit flashes for score notes and (rising roll, R-F) live trail notes. */
export function drawImpact(
  ctx: CanvasRenderingContext2D, state: RenderState, t: number, vis: NoteEvent[],
  live: readonly TrailNote[] = [],
): void {
  const { voices } = state
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (const n of vis) {
    const v = voices.get(n.voiceId)
    if (!v || !v.visible || v.percussion) continue   // percussion never lights keys (§6.1)
    flashKey(ctx, state, n.pitch, flashIntensity(t - n.startSec, n.velocity) * state.flashScale)
  }
  for (const n of live) flashKey(ctx, state, n.midi, flashIntensity(t - n.startSec, n.velocity) * state.flashScale)
  ctx.restore()
}

/** The stage fill, or a clear for a transparent stage (spec §13.1). */
export function drawBackground(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { layout, theme } = state
  const stageH = layout.hitY + layout.keyboardH
  // Spec §13.1: a transparent stage CLEARS instead of filling, so an OBS
  // browser source composites live video through the page. Alpha, not chroma
  // key -- the impact layer draws with 'lighter', and an additive white bloom
  // over green keys as desaturated fringing at the brightest moment of a note.
  if (isTransparent(theme.stageBg)) {
    ctx.clearRect(0, 0, layout.stageW, stageH)
  } else {
    ctx.fillStyle = theme.stageBg
    ctx.fillRect(0, 0, layout.stageW, stageH)
  }
}

/** The 3px progress strip along the bottom of the canonical frame. */
export function drawProgress(ctx: CanvasRenderingContext2D, state: RenderState, progress: number): void {
  const { layout, theme } = state
  const stageH = layout.hitY + layout.keyboardH
  ctx.fillStyle = theme.progressTrack
  ctx.fillRect(0, stageH - 3, layout.stageW, 3)
  ctx.fillStyle = theme.progressFill
  ctx.fillRect(0, stageH - 3, layout.stageW * Math.min(1, Math.max(0, progress)), 3)
}
```

- in `drawStage`, replace the transparent/fill block (from the `// Spec §13.1` comment through the closing `}` of the `else`) with `drawBackground(ctx, state)`, and replace the four progress lines before `return held` with `drawProgress(ctx, state, progress)`; delete the now-unused `stageW`/`stageH` locals in `drawStage` only if nothing else in it reads them (the grid block reads `layout.hitY` only; keep `const { layout, theme } = state`).

Run: `npx vitest run packages/ivories/src/core/render/pianoRoll.test.ts` → PASS (unchanged behaviour).

- [ ] **Step 9: Implement `rising.ts`**

Create `packages/ivories/src/core/render/rising.ts`:

```ts
import { drawKeyboard } from './keyboard'
import { drawBackground, drawImpact, drawProgress, heldNotes } from './pianoRoll'
import { noteColor } from './colors'
import { roundRect } from './shapes'
import { lowerBoundByStart } from '../model/search'
import type { RenderState } from './pianoRoll'
import type { BeatClock } from './beats'
import type { KeyRect } from './geometry'
import type { NoteEvent } from '../model/types'
import type { TrailNote } from '../midi/trail'

export interface RisingState extends RenderState {
  beats: BeatClock
  visibleBeats: number
  trail: readonly TrailNote[]
  showBeatGrid: boolean
}

export interface BarSpan { top: number; bottom: number }

/**
 * Where a note sits on the rising roll, in the canonical frame (spec §2 Rising
 * view): its onset edge is `top`, its release edge `bottom`. A held note grows
 * from the keyboard edge (bottom = hitY); once released it detaches and drifts.
 * Distance is beats x beatPx, so a BPM change re-spaces but never re-times.
 * Null before the onset (count-in, a seek back) or once past the far edge.
 */
export function risingSpan(
  t: number, nowBeat: number, beats: BeatClock, startSec: number, endSec: number | null, hitY: number, beatPx: number,
): BarSpan | null {
  if (startSec > t) return null
  const top = hitY - (nowBeat - beats.beatAt(startSec)) * beatPx
  const end = endSec === null ? t : Math.min(endSec, t)
  const bottom = hitY - (nowBeat - beats.beatAt(end)) * beatPx
  if (bottom <= 0) return null
  return { top, bottom }
}

/** Score notes started by t that are still on the roll (end at or after fromSec). */
export function risingNotes(notes: NoteEvent[], fromSec: number, t: number, maxNoteDur: number): NoteEvent[] {
  const out: NoteEvent[] = []
  for (let i = lowerBoundByStart(notes, fromSec - maxNoteDur); i < notes.length; i++) {
    const n = notes[i]
    if (n.startSec > t) break
    if (n.endSec >= fromSec) out.push(n)
  }
  return out
}

function drawBar(
  ctx: CanvasRenderingContext2D, k: KeyRect, span: BarSpan, onset: string, tail: string, radius: number,
): void {
  const h = Math.max(1, span.bottom - span.top)
  const g = ctx.createLinearGradient(0, span.top, 0, span.top + h)
  // The onset edge is the far (top) edge here, so the full colour sits there.
  g.addColorStop(0, onset)
  g.addColorStop(1, tail)
  ctx.fillStyle = g
  roundRect(ctx, k.x + (k.black ? 0.5 : 1), span.top, k.w - (k.black ? 1 : 2), h, radius)
}

/**
 * The rising roll frame (pure function of t): stage, beat grid, score bars,
 * live trail bars, keyboard, hit flash, progress. Returns the held score set
 * the keyboard was lit from, like drawStage.
 */
export function drawRisingStage(
  ctx: CanvasRenderingContext2D, state: RisingState, t: number, progress: number,
): Map<number, NoteEvent> {
  const { layout, voices, theme, beats } = state
  const hitY = layout.hitY
  const visibleBeats = Math.max(1, state.visibleBeats)
  const beatPx = hitY / visibleBeats
  const nowBeat = beats.beatAt(t)

  drawBackground(ctx, state)

  if (state.showBeatGrid && hitY > 0) {
    ctx.save()
    ctx.lineWidth = theme.gridLineWidth
    for (const line of beats.lines(nowBeat - visibleBeats, nowBeat)) {
      const y = hitY - (nowBeat - line.beat) * beatPx
      ctx.strokeStyle = line.bar ? theme.barLine : theme.beatLine
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(layout.stageW, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  const vis = risingNotes(state.notes, beats.secAt(nowBeat - visibleBeats), t, state.maxNoteDur)

  if (state.showRoll) {
    // White-key bars first, then black-key bars on top (as on the falling roll).
    for (let pass = 0; pass < 2; pass++) {
      for (const n of vis) {
        const k = layout.byPitch.get(n.pitch)
        const v = voices.get(n.voiceId)
        if (!k || !v || !v.visible) continue
        if ((k.black ? 0 : 1) === pass) continue
        const span = risingSpan(t, nowBeat, beats, n.startSec, n.endSec, hitY, beatPx)
        if (span) {
          drawBar(ctx, k, span, noteColor(v.hue, n.velocity, state.velocity),
            noteColor(v.hue, Math.max(1, n.velocity - 14), state.velocity), theme.barRadius)
        }
      }
      for (const n of state.trail) {
        const k = layout.byPitch.get(n.midi)
        if (!k || (k.black ? 0 : 1) === pass) continue
        const span = risingSpan(t, nowBeat, beats, n.startSec, n.endSec, hitY, beatPx)
        if (span) {
          drawBar(ctx, k, span, noteColor(theme.liveHue, n.velocity, state.velocity),
            noteColor(theme.liveHue, Math.max(1, n.velocity - 14), state.velocity), theme.barRadius)
        }
      }
    }
  }

  const held = heldNotes(
    vis.filter((n) => {
      const v = voices.get(n.voiceId)
      return v?.visible !== false && !v?.percussion
    }), t,
  )
  drawKeyboard(ctx, state, held)
  if (state.showFlash) drawImpact(ctx, state, t, vis, state.trail)
  drawProgress(ctx, state, progress)
  return held
}
```

- [ ] **Step 10: Route rising input through `StageRenderer`**

In `packages/ivories/src/core/render/stageRenderer.ts`:
- add imports:

```ts
import { drawRisingStage } from './rising'
import { clampVisibleBeats, liveBeatClock, scoreBeatClock } from './beats'
import type { BeatClock } from './beats'
import type { TempoSetting } from '../model/types'
import type { TrailNote } from '../midi/trail'
```

(merge `TempoSetting` into the existing `../model/types` type import);
- add above `StageInput`:

```ts
/** What the rising roll needs beyond the falling inputs (R-B, R-T). */
export interface RisingInput {
  /** Live BPM (used only without a score). */
  bpm: number
  /** Live bar length in beats (used only without a score). */
  beatsPerBar: number
  /** The provider's TempoSetting, so a retimed score's beats line up. */
  tempo: TempoSetting
  visibleBeats: number
  trail: readonly TrailNote[]
  grid: boolean
}
```

- in `StageInput` add after `orientation?`:

```ts
  /** Draw the rising roll instead of the falling one. */
  rising?: RisingInput | null
```

- add a private field next to the other caches:

```ts
  private beatCache: { score: ScoreDocument | null; tempo: TempoSetting | null; bpm: number; bpb: number; clock: BeatClock } | null = null
```

- in `draw`, replace `const held = drawStage(ctx, rs, t, progress)` with:

```ts
      const r = input.rising
      const held = r
        ? drawRisingStage(ctx, {
            ...rs,
            beats: this.beatClockFor(input.score, r),
            visibleBeats: clampVisibleBeats(r.visibleBeats),
            trail: r.trail,
            showBeatGrid: r.grid,
          }, t, progress)
        : drawStage(ctx, rs, t, progress)
```

- add the method after `rangeFor`:

```ts
  /** The beat clock: the score's tempo map and metre, or the live BPM (R-B). Cached by identity/value. */
  beatClockFor(score: ScoreDocument | null, r: RisingInput): BeatClock {
    const c = this.beatCache
    if (score) {
      if (c && c.score === score && c.tempo === r.tempo) return c.clock
      const clock = scoreBeatClock(score, r.tempo)
      this.beatCache = { score, tempo: r.tempo, bpm: 0, bpb: 0, clock }
      return clock
    }
    if (c && c.score === null && c.bpm === r.bpm && c.bpb === r.beatsPerBar) return c.clock
    const clock = liveBeatClock(r.bpm, r.beatsPerBar)
    this.beatCache = { score: null, tempo: null, bpm: r.bpm, bpb: r.beatsPerBar, clock }
    return clock
  }
```

In `packages/ivories/src/core/index.ts` add after the orientation export:

```ts
export * from './render/beats'
export * from './render/rising'
export * from './midi/trail'
```

- [ ] **Step 11: Run everything**

Run: `npx vitest run packages/ivories/src/core` → PASS.
Run: `npm run check` → passes (`all passed`).
Run: `npm run check -w packages/ivories` → no type errors.
Run: `npm test` → all pass; passed = the previous task's count + the `it` blocks added in this task; 1 skipped.

- [ ] **Step 12: Commit**

```bash
git add packages/ivories/src
git commit -m "feat(ivories): rising roll draw path (beat clock, live trail, drawRisingStage)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Live clock, BPM and the live trail in the provider

**Files:**
- Modify: `packages/ivories/src/react/context.ts`
- Modify: `packages/ivories/src/react/IvoriesProvider.tsx`
- Modify: `packages/ivories/src/react/withProvider.tsx` (`PROVIDER_KEYS`)
- Test: `packages/ivories/src/react/IvoriesProvider.live.test.tsx` (new)

**Interfaces:**
- Consumes: `ManualClock` (`core/clock/ManualClock.ts`); `clampBpm`, `DEFAULT_LIVE_BPM` (Task 3 `beats.ts`); `TrailNote`, `trailNoteOn`, `trailNoteOff`, `trailReseat` (Task 3 `trail.ts`).
- Produces:
  - Provider props: `bpm?: number`, `liveClock?: boolean`, `autoStart?: boolean`; event `onBpmChange?(bpm: number): void` (in `IvoriesEvents`).
  - `IvoriesContextValue` gains `bpm: number`, `setBpm(bpm: number): void`, `requestLiveClock(): () => void` (stable identity), and `live.trail: ValueStore<readonly TrailNote[]>`.
  - Behaviour per R-L, R-P, R-T; with `liveAudio`, a live note-on on a suspended engine calls `engine.resume()` first. `PROVIDER_KEYS` gains `'bpm'`, `'liveClock'`, `'autoStart'`, `'onBpmChange'`.

- [ ] **Step 1: Write the failing tests**

Create `packages/ivories/src/react/IvoriesProvider.live.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { render, waitFor, act } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { IvoriesProvider } from './IvoriesProvider'
import { useIvories } from './hooks'
import { AudioClock } from '../core/clock/AudioClock'
import { ManualClock } from '../core/clock/ManualClock'
import { parseMidi } from '../core/io/parseMidi'
import { fakeEngine } from './testEngine.test-helpers'
import { Keyboard } from './views/Keyboard'

const scoreDoc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

function stubMidi() {
  const port = { id: 'k', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) }
  vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
  return port
}

let iv: ReturnType<typeof useIvories> | null = null
function Grab() { iv = useIvories(); return null }
let mounts = 0
function Counter() { useEffect(() => { mounts++ }, []); return null }
function Requester() {
  const { requestLiveClock } = useIvories()
  useEffect(() => requestLiveClock(), [requestLiveClock])
  return null
}
const on = (port: ReturnType<typeof stubMidi>, midi: number, vel = 90) => port.onmidimessage!({ data: Uint8Array.of(0x90, midi, vel) })
const off = (port: ReturnType<typeof stubMidi>, midi: number) => port.onmidimessage!({ data: Uint8Array.of(0x80, midi, 0) })

beforeEach(() => { iv = null; mounts = 0 })
afterEach(() => { vi.unstubAllGlobals() })

describe('live clock (rising-roll spec §2 Live clock, R-L)', () => {
  it('liveClock with no score runs a ManualClock that waits for the first live note and never schedules audio', async () => {
    const port = stubMidi()
    render(<IvoriesProvider liveClock engine={fakeEngine()}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    expect(iv!.clock.playing).toBe(false)
    expect(iv!.audio).toBe(false)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 60))
    expect(iv!.clock.playing).toBe(true)
    const [n] = iv!.live.trail.get()
    expect(n).toMatchObject({ midi: 60, velocity: 90, endSec: null })
    expect(n.startSec).toBeGreaterThanOrEqual(0)
    expect(n.startSec).toBeLessThan(0.05)
    await new Promise((r) => setTimeout(r, 30))
    act(() => off(port, 60))
    const [m] = iv!.live.trail.get()
    expect(m.endSec!).toBeGreaterThan(m.startSec)
  })

  it('with liveAudio, a live key resumes a suspended engine and sounds', async () => {
    const port = stubMidi()
    const engine = fakeEngine()
    ;(engine as unknown as { running: boolean }).running = false
    render(<IvoriesProvider liveClock liveAudio engine={engine}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 60))
    expect(engine.resume).toHaveBeenCalled()
    expect(engine.noteOn).toHaveBeenCalledWith(60, 90)
  })

  it('autoStart starts the live clock at mount', async () => {
    render(<IvoriesProvider liveClock autoStart engine={fakeEngine()}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    await waitFor(() => expect(iv!.clock.playing).toBe(true))
  })

  it('a host clock always wins; a score keeps the own AudioClock', async () => {
    const host = new AudioClock({ currentTime: 0 })
    const a = render(<IvoriesProvider liveClock clock={host} engine={fakeEngine()}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBe(host))
    a.unmount()
    iv = null
    render(<IvoriesProvider liveClock score={scoreDoc()} engine={fakeEngine()}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
  })

  it('a child asking for the live clock switches to it without remounting children; releasing switches back', async () => {
    const engine = fakeEngine()
    const tree = (kids: ReactNode) => <IvoriesProvider engine={engine}><Counter />{kids}<Grab /></IvoriesProvider>
    const { rerender } = render(tree(<Requester />))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    rerender(tree(null))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
    expect(mounts).toBe(1)
  })

  it('a score arriving ends the live clock and clears the trail; children stay mounted (Review Focus 5)', async () => {
    const port = stubMidi()
    const engine = fakeEngine()
    const tree = (score: ReturnType<typeof scoreDoc> | null) => (
      <IvoriesProvider liveClock score={score} engine={engine}><Keyboard input="midi" /><Counter /><Grab /></IvoriesProvider>
    )
    const { rerender } = render(tree(null))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 60))
    expect(iv!.live.trail.get()).toHaveLength(1)
    rerender(tree(scoreDoc()))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
    expect(iv!.live.trail.get()).toEqual([])
    expect(mounts).toBe(1)
  })
})

describe('live trail on the provider clock (R-T)', () => {
  it('a seek drops finished trail notes and restarts held ones at the new position (Review Focus 1)', async () => {
    const port = stubMidi()
    const host = new ManualClock()
    render(<IvoriesProvider score={scoreDoc()} clock={host} engine={fakeEngine()}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => { on(port, 60); on(port, 62, 80); off(port, 62) })
    expect(iv!.live.trail.get()).toHaveLength(2)
    act(() => host.seek(5))
    expect(iv!.live.trail.get()).toEqual([{ midi: 60, velocity: 90, startSec: 5, endSec: null }])
  })

  it('stamps notes with clock time, not the MIDI timestamp', async () => {
    const port = stubMidi()
    const host = new ManualClock()
    host.seek(12)
    render(<IvoriesProvider score={scoreDoc()} clock={host} engine={fakeEngine()}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 64))
    expect(iv!.live.trail.get()[0].startSec).toBe(12)
    expect(iv!.live.held.get().get(64)!.time).not.toBe(12)   // LiveNote.time stays on performance.now()
  })
})

describe('bpm (R-P, Review Focus 3)', () => {
  it('defaults to 100, follows the prop, and setBpm clamps, rounds, ignores NaN and reports', async () => {
    const engine = fakeEngine()
    const onBpmChange = vi.fn()
    const { rerender } = render(<IvoriesProvider engine={engine} onBpmChange={onBpmChange}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv).not.toBeNull())
    expect(iv!.bpm).toBe(100)
    act(() => iv!.setBpm(500))
    expect(iv!.bpm).toBe(300)
    expect(onBpmChange).toHaveBeenLastCalledWith(300)
    act(() => iv!.setBpm(Number.NaN))
    expect(iv!.bpm).toBe(300)
    expect(onBpmChange).toHaveBeenCalledTimes(1)
    act(() => iv!.setBpm(87.4))
    expect(iv!.bpm).toBe(87)
    rerender(<IvoriesProvider engine={engine} bpm={132} onBpmChange={onBpmChange}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv!.bpm).toBe(132))
    rerender(<IvoriesProvider engine={engine} bpm={5} onBpmChange={onBpmChange}><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv!.bpm).toBe(20))
  })

  it('changing the BPM never re-times the trail', async () => {
    const port = stubMidi()
    render(<IvoriesProvider liveClock engine={fakeEngine()}><Keyboard input="midi" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    act(() => on(port, 60))
    const before = iv!.live.trail.get()
    act(() => iv!.setBpm(60))
    expect(iv!.live.trail.get()).toBe(before)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/ivories/src/react/IvoriesProvider.live.test.tsx`
Expected: FAIL — `iv.clock` is never a `ManualClock`; `iv.live.trail`, `iv.bpm`, `requestLiveClock` are undefined.

- [ ] **Step 3: Extend the context type**

In `packages/ivories/src/react/context.ts`:
- add `import type { TrailNote } from '../core/midi/trail'`;
- in `IvoriesContextValue`, after `reportError(e: IvoriesError): void` add:

```ts
  /** Live BPM (no score): speed and grid of the rising roll (R-P). */
  bpm: number
  /** Clamped to 20-300 and rounded; non-finite values are ignored; calls onBpmChange. */
  setBpm(bpm: number): void
  /** A rising view without a score asks for the free-running live clock; returns the release (R-L). Stable. */
  requestLiveClock(): () => void
```

- inside `live: { … }` after `held`, add:

```ts
    /** Live notes stamped on this provider's clock, for the rising roll (R-T). */
    trail: ValueStore<readonly TrailNote[]>
```

- [ ] **Step 4: Implement in the provider**

In `packages/ivories/src/react/IvoriesProvider.tsx`:

(a) imports — add:

```ts
import { ManualClock } from '../core/clock/ManualClock'
import { DEFAULT_LIVE_BPM, clampBpm } from '../core/render/beats'
import { trailNoteOff, trailNoteOn, trailReseat } from '../core/midi/trail'
import type { TrailNote } from '../core/midi/trail'
```

(b) `IvoriesEvents` — add after `onError?`:

```ts
  /** The live BPM changed through setBpm / useLiveBpm / the Transport field. */
  onBpmChange?(bpm: number): void
```

(c) `IvoriesProviderProps` — add after `midiDeviceId?`:

```ts
  /** Live mode (no score): beats per minute for the rising roll's speed and grid. Default 100 (20-300). */
  bpm?: number
  /** With no score and no host clock, run a free-running clock for live input. A <RisingKeys> without a score asks for one itself. */
  liveClock?: boolean
  /** The live clock starts at mount instead of on the first live note. */
  autoStart?: boolean
```

(d) replace `const clock = props.clock ?? ownClock` with:

```ts
  // ---- live clock (R-L): no host clock, no score source, and someone wants it ----
  const [liveClockUsers, setLiveClockUsers] = useState(0)
  const requestLiveClock = useCallback(() => {
    setLiveClockUsers((n) => n + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setLiveClockUsers((n) => n - 1)
    }
  }, [])
  const hasScoreSource = props.score !== undefined
    ? props.score !== null
    : props.scoreUrl !== undefined || props.file !== undefined || props.musicXml !== undefined || props.midi !== undefined
  const wantsLiveClock = !props.clock && !hasScoreSource && (props.liveClock === true || liveClockUsers > 0)
  const liveClock = useDisposable(() => (wantsLiveClock ? new ManualClock() : null), (c) => c.dispose(), [wantsLiveClock])
  const clock = props.clock ?? liveClock ?? ownClock
  const liveClockRef = useRef(liveClock); liveClockRef.current = liveClock
  const autoStart = props.autoStart === true
  useEffect(() => { if (liveClock && autoStart) liveClock.play() }, [liveClock, autoStart])
```

(e) replace the `audio` line:

```ts
  const audio = props.audio ?? (!props.clock || props.clock instanceof AudioClock)
```

with:

```ts
  // The live clock never schedules (there is no score) and never claims the page (R-L).
  const audio = props.audio ?? (props.clock ? props.clock instanceof AudioClock : liveClock === null)
```

(f) replace the frame-loop line:

```ts
  const frames = useDisposable(() => (clock ? new FrameLoop(() => clock.now()) : null), (f) => f.dispose(), [clock])
```

with:

```ts
  // Created once and reading the clock through a ref: switching between the live
  // clock and a score clock must never null the context and unmount the views (R-L).
  const clockRef = useRef(clock); clockRef.current = clock
  const frames = useDisposable(() => new FrameLoop(() => clockRef.current?.now() ?? 0), (f) => f.dispose(), [])
```

(g) BPM — add right after the `// ---- settings ----` block (after `const audio = …`):

```ts
  // ---- live BPM (R-P): the prop seeds and overrides; setBpm changes it in between ----
  const [bpm, setBpmState] = useState(() => clampBpm(props.bpm ?? DEFAULT_LIVE_BPM))
  const bpmProp = props.bpm
  useEffect(() => { if (bpmProp !== undefined) setBpmState(clampBpm(bpmProp)) }, [bpmProp])
  const setBpm = useCallback((next: number) => {
    if (!Number.isFinite(next)) return
    const v = clampBpm(next)
    setBpmState(v)
    const cb = latest.current.onBpmChange
    if (cb) safeCall(cb, v)
  }, [])
```

(h) trail — in the live MIDI section, right after `const [liveHeld] = useState(…)`, add:

```ts
  // Live notes on THIS clock (R-T): a new clock makes them meaningless, a seek re-seats them.
  const [trail] = useState(() => new ValueStore<readonly TrailNote[]>([]))
  useEffect(() => {
    trail.set([])
    if (!clock) return
    return clock.subscribe((e) => { if (e.type === 'seek') trail.set(trailReseat(trail.get(), e.time)) })
  }, [clock, trail])
```

(i) in `onLive`, insert at the very top of the callback body (before `const next = new Map(liveHeld.get())`):

```ts
    // The live clock starts on the first key (R-L); the trail is stamped in clock time (R-T).
    const lc = liveClockRef.current
    if (e.on && lc && !lc.playing) lc.play()
    const at = clockRef.current?.now() ?? 0
    trail.set(e.on ? trailNoteOn(trail.get(), e.midi, e.velocity, at) : trailNoteOff(trail.get(), e.midi, at))
```

and change its dependency array from `[liveHeld, active, liveListeners]` to `[liveHeld, active, liveListeners, trail]`.

In the same callback, inside its existing `try { … }`, replace

```ts
      if (e.on) { if (ev.liveAudio) eng?.noteOn(e.midi, e.velocity) }
```

with

```ts
      if (e.on && ev.liveAudio) {
        // MIDI is not a user gesture, but after any gesture on the page resume()
        // succeeds: the first key unlocks a suspended context (the live clock
        // never runs startPlayback, so nothing else would).
        if (eng && !eng.running) void eng.resume().catch(() => {})
        eng?.noteOn(e.midi, e.velocity)
      }
```

(j) `liveHub` — change to:

```ts
  const liveHub = useMemo(() => ({
    held: liveHeld,
    trail,
    enable: enableLive,
    subscribe: (fn: (e: MidiNoteEvent) => void) => { liveListeners.add(fn); return () => { liveListeners.delete(fn) } },
  }), [liveHeld, trail, enableLive, liveListeners])
```

(k) the context `value` — replace with:

```ts
  const value = useMemo<IvoriesContextValue | null>(() => (clock && engine && frames
    ? { score, tempo, clock, engine, settings, fallSeconds, maxNoteDur, audio, frames, active, status, setAudio, reportError: report, live: liveHub, bpm, setBpm, requestLiveClock }
    : null), [score, tempo, clock, engine, settings, fallSeconds, maxNoteDur, audio, frames, active, status, setAudio, report, liveHub, bpm, setBpm, requestLiveClock])
```

In `packages/ivories/src/react/withProvider.tsx`, change `PROVIDER_KEYS` to:

```ts
export const PROVIDER_KEYS = [
  'score', 'scoreUrl', 'file', 'musicXml', 'midi', 'clock', 'engine', 'audio', 'tempo',
  'theme', 'look', 'settings', 'fallSeconds', 'liveAudio', 'midiDeviceId',
  'bpm', 'liveClock', 'autoStart',
  'onReady', 'onNoteOn', 'onNoteOff', 'onTimeUpdate', 'onError', 'onBpmChange',
] as const
```

- [ ] **Step 5: Run the new tests, then the provider and view suites**

Run: `npx vitest run packages/ivories/src/react/IvoriesProvider.live.test.tsx` → PASS.
Run: `npx vitest run packages/ivories/src/react` → PASS (the existing provider, live MIDI, StrictMode and view tests are unchanged).
Run: `npm run check -w packages/ivories` → no type errors.
Run: `npm test` → all pass; passed = previous + the `it` blocks added here; 1 skipped.

- [ ] **Step 6: Commit**

```bash
git add packages/ivories/src/react
git commit -m "feat(ivories): provider live clock, live BPM and live note trail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `<RisingKeys>`, the Transport BPM field and `useLiveBpm()`

**Files:**
- Create: `packages/ivories/src/react/views/RisingKeys.tsx`
- Test: `packages/ivories/src/react/views/RisingKeys.test.tsx` (new)
- Modify: `packages/ivories/src/react/views/StageView.tsx`
- Modify: `packages/ivories/src/react/views/Transport.tsx` (full replacement below)
- Test: `packages/ivories/src/react/views/Transport.test.tsx` (append)
- Modify: `packages/ivories/src/react/hooks.ts` (`useLiveBpm`)
- Modify: `packages/ivories/src/index.ts`
- Modify: `packages/ivories/src/style.css` (BPM rules inside `@layer ivories`)

**Interfaces:**
- Consumes: Task 3 `RisingInput`, `DEFAULT_VISIBLE_BEATS`, `DEFAULT_BEATS_PER_BAR`, `MIN_LIVE_BPM`, `MAX_LIVE_BPM`; Task 4 context `bpm`, `setBpm`, `requestLiveClock`, `live.trail`; Task 2 `orientation`.
- Produces:
  - `RisingKeys` (self-contained via `withProvider`) with `RisingKeysProps extends StageViewProps { input?: 'none' | 'midi'; orientation?: Orientation; visibleBeats?: number; beatsPerBar?: number; beatGrid?: boolean }`; root classes `ivories ivories-view ivories-rising`, attributes `data-ivories-view="rising"`, `data-orientation`, `data-bpm` (rising only), `data-t`.
  - `useLiveBpm(): { bpm: number; setBpm(bpm: number): void }` exported from `ivories`.
  - `TransportControls.bpm?: boolean` (default true); the field (`label.ivories-bpm`, `input.ivories-bpm-input[aria-label="BPM"]`) shows only when the provider has no score.

- [ ] **Step 1: Write the failing tests**

Create `packages/ivories/src/react/views/RisingKeys.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, waitFor, act, fireEvent, screen } from '@testing-library/react'
import { Midi } from '@tonejs/midi'
import { RisingKeys } from './RisingKeys'
import { IvoriesProvider } from '../IvoriesProvider'
import { useIvories } from '../hooks'
import { AudioClock } from '../../core/clock/AudioClock'
import { ManualClock } from '../../core/clock/ManualClock'
import { parseMidi } from '../../core/io/parseMidi'
import { fakeEngine } from '../testEngine.test-helpers'
import { stubCtx } from '../../core/render/pianoRoll.test-helpers'

const doc = () => {
  const m = new Midi(); m.header.setTempo(120)
  m.addTrack().addNote({ midi: 60, time: 0, duration: 1, velocity: 0.8 })
  return parseMidi(new Uint8Array(m.toArray()).buffer as ArrayBuffer, 'a.mid', { mode: 'scale', scale: 1 })
}

let iv: ReturnType<typeof useIvories> | null = null
function Grab() { iv = useIvories(); return null }

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); iv = null })

describe('RisingKeys (rising-roll spec §2 Rising view)', () => {
  it('without a score it asks the provider for the live clock and carries the BPM', async () => {
    const { container } = render(<IvoriesProvider engine={fakeEngine()} bpm={132}><RisingKeys /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    const root = container.querySelector('.ivories-view.ivories-rising')!
    expect(root.getAttribute('data-ivories-view')).toBe('rising')
    expect(root.getAttribute('data-bpm')).toBe('132')
    expect(root.getAttribute('data-orientation')).toBe('vertical')
  })

  it('self-contained: outside a provider it builds one and hands it bpm', async () => {
    const { container } = render(<RisingKeys engine={fakeEngine()} bpm={90} />)
    await waitFor(() => expect(container.querySelector('.ivories-rising')?.getAttribute('data-bpm')).toBe('90'))
  })

  it('with a score the clock stays the score clock', async () => {
    render(<IvoriesProvider score={doc()} engine={fakeEngine()}><RisingKeys /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
  })

  it('unmounting the last rising view releases the live clock', async () => {
    function Toggle() {
      const [show, setShow] = useState(true)
      return <>{show && <RisingKeys />}<button type="button" onClick={() => setShow(false)}>hide</button></>
    }
    render(<IvoriesProvider engine={fakeEngine()}><Toggle /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    fireEvent.click(screen.getByText('hide'))
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(AudioClock))
  })

  it('a live note starts the clock and the view draws on (data-t advances), under the horizontal transform', async () => {
    const port = { id: 'k', name: 'Keys', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) }
    vi.stubGlobal('navigator', { ...navigator, requestMIDIAccess: async () => ({ inputs: { forEach: (cb: (p: typeof port) => void) => cb(port) }, onstatechange: null }) })
    const stub = stubCtx()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      (() => stub.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    )
    const { container } = render(<IvoriesProvider engine={fakeEngine()}><RisingKeys input="midi" orientation="horizontal" /><Grab /></IvoriesProvider>)
    await waitFor(() => expect(iv?.clock).toBeInstanceOf(ManualClock))
    await waitFor(() => expect(port.onmidimessage).not.toBeNull())
    const root = () => container.querySelector<HTMLElement>('.ivories-rising')!
    await waitFor(() => expect(root().dataset.t).toBe('0'))
    act(() => port.onmidimessage!({ data: Uint8Array.of(0x90, 60, 100) }))
    await waitFor(() => expect(Number(root().dataset.t)).toBeGreaterThan(0))
    expect(stub.calls).toContain('transform(6)')
    expect(root().getAttribute('data-orientation')).toBe('horizontal')
  })
})
```

Append to `packages/ivories/src/react/views/Transport.test.tsx` (change its first import to `import { describe, it, expect, vi } from 'vitest'`):

```tsx
describe('Transport BPM field (rising-roll spec §2 BPM wiring)', () => {
  it('shows with no score and sets the provider BPM', async () => {
    const onBpmChange = vi.fn()
    render(<IvoriesProvider engine={fakeEngine()} liveClock onBpmChange={onBpmChange}><Transport /></IvoriesProvider>)
    const field = await screen.findByLabelText('BPM') as HTMLInputElement
    expect(field.value).toBe('100')
    fireEvent.change(field, { target: { value: '120' } })
    expect(onBpmChange).toHaveBeenLastCalledWith(120)
    await waitFor(() => expect(field.value).toBe('120'))
  })

  it('typing an invalid BPM never commits it; blur restores the current value (Review Focus 3)', async () => {
    const onBpmChange = vi.fn()
    render(<IvoriesProvider engine={fakeEngine()} liveClock onBpmChange={onBpmChange}><Transport /></IvoriesProvider>)
    const field = await screen.findByLabelText('BPM') as HTMLInputElement
    for (const v of ['', '5', '1', '1e9', '301']) fireEvent.change(field, { target: { value: v } })
    expect(onBpmChange).not.toHaveBeenCalled()
    fireEvent.blur(field)
    expect(field.value).toBe('100')
  })

  it('is hidden with a score, and by controls.bpm=false', async () => {
    setup()
    await screen.findByRole('button', { name: 'Play' })
    expect(screen.queryByLabelText('BPM')).toBeNull()
  })

  it('controls.bpm=false hides it in live mode too', async () => {
    render(<IvoriesProvider engine={fakeEngine()} liveClock><Transport controls={{ bpm: false }} /></IvoriesProvider>)
    await screen.findByRole('button', { name: 'Play' })
    expect(screen.queryByLabelText('BPM')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/ivories/src/react/views/RisingKeys.test.tsx packages/ivories/src/react/views/Transport.test.tsx`
Expected: FAIL — `./RisingKeys` missing; no BPM field.

- [ ] **Step 3: Add `useLiveBpm`**

Append to `packages/ivories/src/react/hooks.ts`:

```ts
/** The provider's live BPM and its setter (rising roll without a score, R-P). */
export function useLiveBpm(): { bpm: number; setBpm(bpm: number): void } {
  const { bpm, setBpm } = useIvories()
  return { bpm, setBpm }
}
```

- [ ] **Step 4: Teach `StageView` the rising kind**

In `packages/ivories/src/react/views/StageView.tsx`:
- add `import { DEFAULT_BEATS_PER_BAR, DEFAULT_VISIBLE_BEATS } from '../../core/render/beats'`;
- replace the signature line from Task 2 with:

```tsx
export interface StageViewKindProps {
  kind: 'keyboard' | 'falling' | 'rising'
  lookahead?: number
  input?: 'none' | 'midi'
  orientation?: Orientation
  visibleBeats?: number
  beatsPerBar?: number
  beatGrid?: boolean
}

export function StageView(p: StageViewProps & StageViewKindProps) {
```

- after the `useEffect(() => (wantsMidi ? iv.live.enable() : undefined), …)` line add:

```tsx
  // A rising view with no score runs on the provider's live clock (R-L).
  const risingView = p.kind === 'rising'
  useEffect(() => (risingView ? iv.requestLiveClock() : undefined), [risingView, iv.requestLiveClock])
```

- in `step`, replace the `renderer.draw(…)` call with:

```tsx
      const frame = renderer.draw(ctx, w, h, t, {
        score: c.score,
        settings,
        fallSeconds: props.kind === 'falling' ? (props.lookahead ?? c.fallSeconds) : c.fallSeconds,
        maxNoteDur: c.maxNoteDur,
        showRoll: props.kind !== 'keyboard',
        range: rangeFromProp(props.range),
        live: liveMap,
        orientation: props.orientation,
        rising: props.kind === 'rising'
          ? {
              bpm: c.bpm,
              beatsPerBar: props.beatsPerBar ?? DEFAULT_BEATS_PER_BAR,
              tempo: c.tempo,
              visibleBeats: props.visibleBeats ?? DEFAULT_VISIBLE_BEATS,
              trail: c.live.trail.get(),
              grid: props.beatGrid ?? true,
            }
          : null,
      })
```

- on the root `<div>` add `data-bpm={p.kind === 'rising' ? iv.bpm : undefined}` after `data-orientation`.

- [ ] **Step 5: Create `RisingKeys.tsx`**

```tsx
import { StageView } from './StageView'
import { Guarded } from '../IvoriesBoundary'
import { withProvider } from '../withProvider'
import type { StageViewProps } from './StageView'
import type { Orientation } from '../../core/layout/types'

export interface RisingKeysProps extends StageViewProps {
  /** Live MIDI input: 'midi' lights, sounds (with liveAudio) and draws live notes rising from the keys. */
  input?: 'none' | 'midi'
  /** 'horizontal': keyboard up the left edge, notes leave it to the right. Default vertical. */
  orientation?: Orientation
  /** Beats visible between the keyboard and the far edge (default 8, 1-64). */
  visibleBeats?: number
  /** Live mode (no score): beats per bar for the stronger grid line (default 4). */
  beatsPerBar?: number
  /** Beat and bar grid lines (default true). */
  beatGrid?: boolean
}

function RisingKeysView(props: RisingKeysProps) {
  return <Guarded><StageView {...props} kind="rising" /></Guarded>
}

/**
 * Notes emitted at the keyboard that drift away from it (rising-roll spec §2).
 * Score notes on the score's clock, live notes on the provider clock; without a
 * score it runs on the provider's free-running live clock at `bpm`.
 */
export const RisingKeys = withProvider(RisingKeysView, 'RisingKeys')
```

- [ ] **Step 6: Replace `Transport.tsx`**

Replace the whole of `packages/ivories/src/react/views/Transport.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { useClock, useClockTime, useIvories, useLiveBpm } from '../hooks'
import { withProvider } from '../withProvider'
import { Guarded } from '../IvoriesBoundary'
import { formatTime } from '../format'
import { cx } from '../cx'
import { cancelPendingStart, resumeAudio, startPlayback } from '../startPlayback'
import { MAX_LIVE_BPM, MIN_LIVE_BPM } from '../../core/render/beats'

export interface TransportControls { play?: boolean; seek?: boolean; tempo?: boolean; metronome?: boolean; bpm?: boolean }

/** Live BPM (no score). A half-typed or out-of-range value shows but is not committed (Review Focus 3). */
function BpmField() {
  const { bpm, setBpm } = useLiveBpm()
  const [draft, setDraft] = useState(String(bpm))
  useEffect(() => { setDraft(String(bpm)) }, [bpm])
  return (
    <label className="ivories-bpm">
      <span className="ivories-bpm-label">BPM</span>
      <input
        type="number" aria-label="BPM" className="ivories-bpm-input"
        min={MIN_LIVE_BPM} max={MAX_LIVE_BPM} step={1} value={draft}
        onChange={(e) => {
          const v = e.target.value
          setDraft(v)
          const n = Number(v)
          if (v.trim() !== '' && Number.isFinite(n) && n >= MIN_LIVE_BPM && n <= MAX_LIVE_BPM) setBpm(n)
        }}
        onBlur={() => setDraft(String(bpm))}
      />
    </label>
  )
}

function TransportView({ controls, className }: { controls?: TransportControls; className?: string }) {
  const iv = useIvories()
  const { clock, playing, rate } = useClock()
  const t = useClockTime(10)
  const c = { play: true, seek: true, tempo: true, metronome: true, bpm: true, ...controls }
  const duration = iv.score?.durationSec ?? 0
  const toggle = () => {
    if (playing) { cancelPendingStart(clock); clock.pause(); return }
    startPlayback(iv)
  }
  // Spec §8: blocked audio -> the clock runs silently and we offer a tap.
  const needsTap = iv.audio && playing && !iv.engine.running

  return (
    <div className={cx('ivories', 'ivories-transport', className)} role="group" aria-label="Playback">
      {c.play && (
        <button type="button" className="ivories-btn ivories-btn-play" onClick={toggle}>
          {playing ? 'Pause' : 'Play'}
        </button>
      )}
      {c.seek && (
        <input
          type="range" aria-label="Seek" className="ivories-seek"
          min={0} max={Math.max(duration, 0.001)} step={0.01}
          value={Math.min(Math.max(0, t), duration)}
          onChange={(e) => clock.seek(Number(e.target.value))}
        />
      )}
      <span className="ivories-time">{formatTime(t)} / {formatTime(duration)}</span>
      {c.bpm && !iv.score && <BpmField />}
      {c.tempo && (
        <label className="ivories-tempo">
          <span className="ivories-tempo-label">Tempo</span>
          <input
            type="range" aria-label="Tempo" className="ivories-tempo-input"
            min={0.25} max={2} step={0.05} value={rate}
            onChange={(e) => clock.setRate(Number(e.target.value))}
          />
          <span className="ivories-tempo-value">{Math.round(rate * 100)}%</span>
        </label>
      )}
      {c.metronome && (
        <label className="ivories-metronome">
          <input
            type="checkbox" aria-label="Metronome" className="ivories-metronome-input"
            checked={iv.settings.audio.metronome}
            onChange={(e) => iv.setAudio({ metronome: e.target.checked })}
          />
          <span className="ivories-metronome-label">Metronome</span>
        </label>
      )}
      {needsTap && (
        <button type="button" className="ivories-btn ivories-btn-enable-sound" onClick={() => resumeAudio(iv)}>
          Tap to enable sound
        </button>
      )}
    </div>
  )
}

/** Play/pause, seek bar, tempo (clock rate), metronome toggle, and the live BPM with no score. */
export const Transport = withProvider(
  (p: { controls?: TransportControls; className?: string }) => <Guarded><TransportView {...p} /></Guarded>,
  'Transport',
)
```

- [ ] **Step 7: CSS and exports**

In `packages/ivories/src/style.css`, inside `@layer ivories`, directly after the `.ivories .ivories-tempo-input { … }` line add:

```css
  .ivories .ivories-bpm { display: inline-flex; align-items: center; gap: 0.375rem; color: var(--ivories-ink-dim); }
  .ivories .ivories-bpm-input {
    width: 4.5rem;
    border: 1px solid var(--ivories-line);
    border-radius: 0.375rem;
    padding: 0.125rem 0.375rem;
    background: transparent;
    color: var(--ivories-ink);
    font: inherit;
    font-variant-numeric: tabular-nums;
  }
```

In `packages/ivories/src/index.ts`:
- change the hooks export to `export { useIvories, useIvoriesOptional, useClock, useClockTime, useActiveNotes, useLiveBpm } from './react/hooks'`;
- after the `FallingKeys` export lines add:

```ts
export { RisingKeys } from './react/views/RisingKeys'
export type { RisingKeysProps } from './react/views/RisingKeys'
```

- [ ] **Step 8: Run**

Run: `npx vitest run packages/ivories/src/react` → PASS.
Run: `npm run check` → passes; `npm run check -w packages/ivories` → no type errors.
Run: `npm test` → all pass; passed = previous + the `it` blocks added here; 1 skipped.

- [ ] **Step 9: Commit**

```bash
git add packages/ivories/src
git commit -m "feat(ivories): RisingKeys view, Transport BPM field and useLiveBpm

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Layout model, validators, `<Stage>` slots and `<Ivories>` presets

**Files:**
- Modify: `packages/ivories/src/core/layout/types.ts`
- Modify: `packages/ivories/src/core/layout/validate.ts`
- Test: `packages/ivories/src/core/layout/validate.test.ts` (append)
- Test: `packages/ivories/src/core/platform/sceneV2.test.ts` (append)
- Modify: `packages/ivories/src/react/views/Stage.tsx`
- Test: `packages/ivories/src/react/views/Stage.test.tsx` (append)
- Modify: `packages/ivories/src/react/views/Ivories.tsx` (full replacement below)
- Test: `packages/ivories/src/react/views/Ivories.test.tsx` (append)

**Interfaces:**
- Consumes: `Orientation` (Task 2), `RisingKeys` (Task 5).
- Produces:
  - `IvoriesView = 'keyboard' | 'falling' | 'rising' | 'notation' | 'endless'`; `SlotSource` ivories variant `{ kind: 'ivories'; view: IvoriesView; orientation?: Orientation }`.
  - `validSource` keeps `orientation` only for `falling`/`rising` and only `'vertical' | 'horizontal'` (R-V).
  - `StageSlotViewProps.visibleBeats?: number`; `<Stage>` renders `<RisingKeys>` for `rising`, and passes `source.orientation` to falling/rising.
  - `IvoriesPreset` gains `'rising'`; `IvoriesProps` gains `orientation?: Orientation`, `visibleBeats?: number`, `beatsPerBar?: number`; minimal chrome hides the BPM field.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe` in `packages/ivories/src/core/layout/validate.test.ts`:

```ts
  it('accepts a rising slot and keeps orientation only on falling/rising, only when valid (R-V)', () => {
    const single = (main: unknown) => validLayout({ kind: 'single', main })
    expect(single({ kind: 'ivories', view: 'rising', orientation: 'horizontal' }))
      .toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising', orientation: 'horizontal' } })
    expect(single({ kind: 'ivories', view: 'falling', orientation: 'vertical' }))
      .toEqual({ kind: 'single', main: { kind: 'ivories', view: 'falling', orientation: 'vertical' } })
    expect(single({ kind: 'ivories', view: 'keyboard', orientation: 'horizontal' }))
      .toEqual({ kind: 'single', main: { kind: 'ivories', view: 'keyboard' } })
    expect(single({ kind: 'ivories', view: 'rising', orientation: 'diagonal;background:url(x)' }))
      .toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising' } })
  })
```

Append inside the `describe('SceneV2 (spec §5.4)', …)` block of `packages/ivories/src/core/platform/sceneV2.test.ts`:

```ts
  it('round-trips a rising, horizontal slot, shared or not, and stays v2 (R-V)', () => {
    const layout: Layout = {
      kind: 'split', ratio: 0.5,
      top: { kind: 'ivories', view: 'rising', orientation: 'horizontal' },
      bottom: { kind: 'ivories', view: 'keyboard' },
    }
    const s = sceneFromState({ song, profile: profile(), layout })
    const back = decodeScene(JSON.stringify(s))
    expect(back.v).toBe(2)
    expect(back.layout).toEqual(layout)
    expect(decodeScene(JSON.stringify(s), { shared: true }).layout).toEqual(layout)
  })
```

Append inside `describe('Stage (spec §5.2)', …)` in `packages/ivories/src/react/views/Stage.test.tsx`:

```tsx
  it('a rising slot renders RisingKeys; orientation reaches falling and rising views', async () => {
    const layout: Layout = {
      kind: 'split', ratio: 0.5,
      top: { kind: 'ivories', view: 'rising', orientation: 'horizontal' },
      bottom: { kind: 'ivories', view: 'falling', orientation: 'horizontal' },
    }
    const { container } = inProvider(<Stage layout={layout} />)
    await waitFor(() => expect(slots(container)).toEqual(['top:rising', 'bottom:falling']))
    expect(container.querySelector('.ivories-slot-top .ivories-rising')!.getAttribute('data-orientation')).toBe('horizontal')
    expect(container.querySelector('.ivories-slot-bottom .ivories-falling')!.getAttribute('data-orientation')).toBe('horizontal')
  })
```

Append inside `describe('Ivories presets (spec §4)', …)` in `packages/ivories/src/react/views/Ivories.test.tsx`:

```tsx
  it('view="rising" with no score: RisingKeys with its orientation, and the transport offers BPM', async () => {
    const { container } = render(<Ivories view="rising" orientation="horizontal" engine={fakeEngine()} bpm={110} />)
    await waitFor(() => expect(container.querySelector('.ivories-rising')).not.toBeNull())
    expect(container.querySelector('.ivories-rising')!.getAttribute('data-orientation')).toBe('horizontal')
    expect((container.querySelector('.ivories-bpm-input') as HTMLInputElement).value).toBe('110')
  })

  it('orientation applies to the falling main view; a loaded score hides the BPM field', async () => {
    const { container } = render(<Ivories view="falling" orientation="horizontal" midi={bytes()} engine={fakeEngine()} />)
    await waitFor(() => expect(container.querySelector('.ivories-falling')?.getAttribute('data-orientation')).toBe('horizontal'))
    await waitFor(() => expect(container.querySelector('.ivories-time')!.textContent).not.toMatch(/\/ 0:00$/))
    expect(container.querySelector('.ivories-bpm')).toBeNull()
  })

  it('chrome="minimal" hides the BPM field', async () => {
    const { container } = render(<Ivories view="rising" chrome="minimal" engine={fakeEngine()} />)
    await waitFor(() => expect(container.querySelector('.ivories-btn-play')).not.toBeNull())
    expect(container.querySelector('.ivories-bpm')).toBeNull()
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/ivories/src/core/layout packages/ivories/src/core/platform packages/ivories/src/react/views`
Expected: FAIL — `rising` refused by `validSource`, unknown preset, TS errors on `orientation`.

- [ ] **Step 3: Types and validator**

In `packages/ivories/src/core/layout/types.ts` change:

```ts
export type IvoriesView = 'keyboard' | 'falling' | 'notation' | 'endless'
```

to:

```ts
export type IvoriesView = 'keyboard' | 'falling' | 'rising' | 'notation' | 'endless'
```

and the ivories `SlotSource` member to:

```ts
  | { kind: 'ivories'; view: IvoriesView; orientation?: Orientation }   // orientation: falling/rising only (R-V)
```

In `packages/ivories/src/core/layout/validate.ts`:
- change `const VIEWS: readonly IvoriesView[] = ['keyboard', 'falling', 'notation', 'endless']` to include `'rising'` after `'falling'`;
- replace the ivories branch of `validSource`:

```ts
  if (u.kind === 'ivories') {
    return VIEWS.includes(u.view as IvoriesView) ? { kind: 'ivories', view: u.view as IvoriesView } : null
  }
```

with:

```ts
  if (u.kind === 'ivories') {
    if (!VIEWS.includes(u.view as IvoriesView)) return null
    const view = u.view as IvoriesView
    const out: Extract<SlotSource, { kind: 'ivories' }> = { kind: 'ivories', view }
    // Only the roll views have an orientation; anything else is dropped, the slot kept (R-V).
    if ((view === 'falling' || view === 'rising') && (u.orientation === 'vertical' || u.orientation === 'horizontal')) {
      out.orientation = u.orientation
    }
    return out
  }
```

- [ ] **Step 4: `<Stage>`**

In `packages/ivories/src/react/views/Stage.tsx`:
- add `import { RisingKeys } from './RisingKeys'` after the `FallingKeys` import;
- in `StageSlotViewProps` add after `lookahead?: number`:

```ts
  /** Rising slots: beats visible above the keys (default 8). */
  visibleBeats?: number
```

- replace the `switch (source.view)` in `SlotContent` with:

```tsx
  switch (source.view) {
    case 'keyboard': return <Keyboard labels={v.labels} range={v.range} input={v.input} onLayout={v.onLayout} />
    case 'falling': return <FallingKeys labels={v.labels} range={v.range} lookahead={v.lookahead} input={v.input} onLayout={v.onLayout} orientation={source.orientation} />
    case 'rising': return <RisingKeys labels={v.labels} range={v.range} visibleBeats={v.visibleBeats} input={v.input} onLayout={v.onLayout} orientation={source.orientation} />
    case 'notation': return <Notation view="vertical" zoom={v.zoom} />
    case 'endless': return <Notation view="endless" zoom={v.zoom} />
  }
```

- [ ] **Step 5: Replace `Ivories.tsx`**

Replace the whole of `packages/ivories/src/react/views/Ivories.tsx` with:

```tsx
import { IvoriesProvider } from '../IvoriesProvider'
import { Keyboard } from './Keyboard'
import { FallingKeys } from './FallingKeys'
import { RisingKeys } from './RisingKeys'
import { Transport } from './Transport'
import { Notation } from '../notation/Notation'
import { cx } from '../cx'
import type { PepperScoreClockHandle } from '../notation/loadPepperscore'
import type { Ref } from 'react'
import type { IvoriesProviderProps } from '../IvoriesProvider'
import type { TransportControls } from './Transport'
import type { LabelsProp } from './labels'
import type { Orientation } from '../../core/layout/types'

export type IvoriesPreset = 'falling' | 'rising' | 'keyboard' | 'keyboard+notation' | 'endless+falling' | 'endless+keyboard'
/** Same semantics as pepperscore: full controls, a play button, or none. */
export type Chrome = 'full' | 'minimal' | 'none'

export interface IvoriesProps extends IvoriesProviderProps {
  view?: IvoriesPreset
  chrome?: Chrome
  labels?: LabelsProp
  height?: number | string
  className?: string
  range?: 'full' | [number, number]
  lookahead?: number
  input?: 'none' | 'midi'
  /** Notation zoom for the notation presets. */
  zoom?: number
  /** Handle of the pepperscore clock-driven notation, for the notation presets. */
  notationRef?: Ref<PepperScoreClockHandle>
  /** The main roll view's orientation (falling and rising presets). Default vertical. */
  orientation?: Orientation
  /** Rising preset: beats visible above the keys (default 8). */
  visibleBeats?: number
  /** Rising preset, live mode: beats per bar for the grid (default 4). */
  beatsPerBar?: number
}

const MINIMAL: TransportControls = { seek: false, tempo: false, metronome: false, bpm: false }
const slug = (v: string) => v.replace(/\+/g, '-')

/** One-line preset combos (spec §4). Always its own provider; `ref` is the provider handle. */
export function Ivories(props: IvoriesProps) {
  const {
    view = 'falling', chrome = 'full', labels, height, className, range, lookahead, input, zoom, notationRef,
    orientation, visibleBeats, beatsPerBar, ...provider
  } = props
  const notation = view === 'keyboard+notation' ? 'vertical' : view.startsWith('endless') ? 'endless' : null
  const keysOnly = view === 'keyboard' || view === 'keyboard+notation' || view === 'endless+keyboard'
  const main = view === 'rising'
    ? <RisingKeys labels={labels} range={range} input={input} orientation={orientation} visibleBeats={visibleBeats} beatsPerBar={beatsPerBar} />
    : keysOnly
      ? <Keyboard labels={labels} range={range} input={input} />
      : <FallingKeys labels={labels} range={range} lookahead={lookahead} input={input} orientation={orientation} />
  return (
    <IvoriesProvider {...provider}>
      <div className={cx('ivories', 'ivories-preset', `ivories-preset-${slug(view)}`, className)} style={height !== undefined ? { height } : undefined}>
        {notation && <div className="ivories-preset-notation"><Notation view={notation} zoom={zoom} scoreRef={notationRef} /></div>}
        <div className="ivories-preset-main" data-with-notation={notation ? '' : undefined}>{main}</div>
        {chrome !== 'none' && <Transport controls={chrome === 'minimal' ? MINIMAL : undefined} />}
      </div>
    </IvoriesProvider>
  )
}
```

- [ ] **Step 6: Run (library and studio both type-check)**

Run: `npx vitest run packages/ivories` → PASS.
Run: `npm run check -w packages/ivories` → no type errors.
Run: `npm run build` → studio `tsc -b` still compiles (its `modeForView` and `LayoutToolbar` are widened in Task 8; nothing here breaks them).
Run: `npm test` → all pass; passed = previous + the `it` blocks added here; 1 skipped.

- [ ] **Step 7: Commit**

```bash
git add packages/ivories/src
git commit -m "feat(ivories): rising view and orientation in layouts, scenes, Stage and presets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: GM piano sounds from the pepperscore-sounds packs

**Files:**
- Create: `packages/ivories/src/core/audio/gmSounds.ts`
- Test: `packages/ivories/src/core/audio/gmSounds.test.ts` (new)
- Modify: `packages/ivories/src/core/audio/engine.ts`
- Test: `packages/ivories/src/core/audio/engine.test.ts` (append)
- Modify: `packages/ivories/src/react/IvoriesProvider.tsx` (`sounds` prop, own engine)
- Modify: `packages/ivories/src/react/withProvider.tsx` (`'sounds'` in `PROVIDER_KEYS`)
- Test: `packages/ivories/src/react/IvoriesProvider.sounds.test.tsx` (new)
- Modify: `packages/ivories/src/core/index.ts`

**Interfaces:**
- Consumes: smplr 1.0.0 `Sampler` (value) and its instance type; engine `InstrumentFactoryFn = (ctx: BaseAudioContext, id: string, destination: AudioNode, loader: unknown) => Promise<Instrument>`.
- Produces:
  - `gmSounds.ts`: `type SoundPackName = 'core' | 'complete'`; `interface SoundsOption { pack?: SoundPackName; assetBaseUrl?: string; instrument?: string }`; `type FetchJson = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>`; `interface GmSoundDeps { fetch?: FetchJson; makeSampler?: (ctx: BaseAudioContext, o: { buffers: Record<number, AudioBuffer>; destination: AudioNode }) => Instrument; pageBase?: string }`; `SOUNDS_VERSION = '0.1.0'`; `GM_PIANO = 'acoustic_grand_piano'`; `defaultSoundsBase(pack?)`; `resolveSoundsBase(o, pageBase?)`; `packIndexUrl(base)`; `sampleUrl(base, name)`; `gmInstrumentName(id, o)`; `parsePackIndex(u)`; `parseSamplePack(u): [number, string][]`; `base64ToArrayBuffer(b64)`; `loadPackIndex(base, fetchJson): Promise<Set<string>>`; `loadGmBuffers(ctx, url, fetchJson): Promise<Record<number, AudioBuffer>>`; `resetGmSoundCaches(): void` (test seam); `gmInstrumentFactory(o: SoundsOption, fallback: InstrumentFactoryFn, deps?: GmSoundDeps): InstrumentFactoryFn`.
  - `engine.ts`: `export type Instrument` (now includes the `Sampler` instance); `export const defaultMakeInstrument`; `AudioEngineDeps.sounds?: SoundsOption`, `AudioEngineDeps.soundsDeps?: GmSoundDeps`.
  - Provider prop `sounds?: SoundsOption` (own engine only; rebuilt when its JSON changes).

- [ ] **Step 1: Write the failing GM tests**

Create `packages/ivories/src/core/audio/gmSounds.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SOUNDS_VERSION, defaultSoundsBase, gmInstrumentFactory, gmInstrumentName, packIndexUrl,
  resetGmSoundCaches, resolveSoundsBase, sampleUrl,
} from './gmSounds'
import type { FetchJson, SoundsOption } from './gmSounds'

const CORE = 'https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/'
const PIANO_URL = `${CORE}soundfonts/fluidr3/acoustic_grand_piano.json`
const INDEX = { pack: 'core', fluidr3: ['acoustic_grand_piano', 'electric_piano_1'] }
const PIANO = { name: 'acoustic_grand_piano', samples: { 36: btoa('a'), 41: btoa('bb') } }
const dest = {} as AudioNode

type Route = unknown | Error | number
function fakeFetch(routes: Record<string, Route>) {
  return vi.fn(async (url: string) => {
    const r = routes[url]
    if (r instanceof Error) throw r
    if (r === undefined) return { ok: false, status: 404, json: async () => ({}) }
    if (typeof r === 'number') return { ok: false, status: r, json: async () => ({}) }
    return { ok: true, status: 200, json: async () => r }
  })
}
/** decodeAudioData rejects buffers whose byte length is in `bad`. */
function fakeCtx(bad: number[] = []) {
  return {
    decodeAudioData: vi.fn(async (b: ArrayBuffer) => {
      if (bad.includes(b.byteLength)) throw new Error('undecodable')
      return { length: b.byteLength } as unknown as AudioBuffer
    }),
  }
}
function harness(routes: Record<string, Route>, o: SoundsOption = {}) {
  const fallback = vi.fn(async (_c: BaseAudioContext, id: string) => ({ fallback: id }) as never)
  const made: { buffers: Record<number, AudioBuffer>; destination: AudioNode }[] = []
  const makeSampler = vi.fn((_c: BaseAudioContext, s: { buffers: Record<number, AudioBuffer>; destination: AudioNode }) => {
    made.push(s)
    return { sampler: true, ready: Promise.resolve() } as never
  })
  const fetch = fakeFetch(routes)
  const make = gmInstrumentFactory(o, fallback, { fetch: fetch as unknown as FetchJson, makeSampler })
  return { fallback, made, makeSampler, fetch, make }
}

beforeEach(() => { resetGmSoundCaches() })

describe('GM sound URLs (rising-roll spec §2 GM sounds, R-G)', () => {
  it('defaults to the core pack on jsDelivr, pinned like pepperscore', () => {
    expect(SOUNDS_VERSION).toBe('0.1.0')
    expect(defaultSoundsBase()).toBe(CORE)
    expect(resolveSoundsBase({})).toBe(CORE)
    expect(resolveSoundsBase({ pack: 'complete' })).toBe('https://cdn.jsdelivr.net/npm/pepperscore-sounds-complete@0.1.0/')
  })

  it('an assetBaseUrl wins, is trimmed, gains a trailing slash and resolves against the page', () => {
    expect(resolveSoundsBase({ assetBaseUrl: ' https://x.test/sounds ' })).toBe('https://x.test/sounds/')
    expect(resolveSoundsBase({ assetBaseUrl: '/sounds' }, 'https://host.test/app/page')).toBe('https://host.test/sounds/')
  })

  it('index and sample file URLs', () => {
    expect(packIndexUrl(CORE)).toBe(`${CORE}pack.json`)
    expect(sampleUrl(CORE, 'acoustic_grand_piano')).toBe(PIANO_URL)
  })

  it('the piano voice maps to sounds.instrument; other instruments keep their id', () => {
    expect(gmInstrumentName('acoustic_grand_piano', {})).toBe('acoustic_grand_piano')
    expect(gmInstrumentName('acoustic_grand_piano', { instrument: 'bright_acoustic_piano' })).toBe('bright_acoustic_piano')
    expect(gmInstrumentName('electric_piano_1', { instrument: 'bright_acoustic_piano' })).toBe('electric_piano_1')
  })
})

describe('gmInstrumentFactory (R-G)', () => {
  it('loads the JSON pack, decodes every sample and builds a Sampler keyed by MIDI number', async () => {
    const h = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: PIANO })
    const ctx = fakeCtx()
    const inst = await h.make(ctx as unknown as BaseAudioContext, 'acoustic_grand_piano', dest, null)
    expect(inst).toMatchObject({ sampler: true })
    expect(Object.keys(h.made[0].buffers)).toEqual(['36', '41'])
    expect(h.made[0].destination).toBe(dest)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(2)
    expect(h.fallback).not.toHaveBeenCalled()
  })

  it('decodes a pack once per AudioContext: a second voice on it reuses the buffers', async () => {
    const h = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: PIANO })
    const ctx = fakeCtx() as unknown as BaseAudioContext
    await h.make(ctx, 'acoustic_grand_piano', dest, null)
    await h.make(ctx, 'acoustic_grand_piano', dest, null)
    expect(h.fetch.mock.calls.filter(([u]) => u === PIANO_URL)).toHaveLength(1)
    expect(h.made[1].buffers).toBe(h.made[0].buffers)
  })

  it('an instrument missing from a reachable index takes the fallback path', async () => {
    const h = harness({ [`${CORE}pack.json`]: INDEX })
    expect(await h.make(fakeCtx() as never, 'violin', dest, null)).toEqual({ fallback: 'violin' })
    expect(h.fetch.mock.calls.map(([u]) => u)).toEqual([`${CORE}pack.json`])
  })

  it('falls back when the pack is unreachable and retries on the next load (Review Focus 4)', async () => {
    const h = harness({ [`${CORE}pack.json`]: new Error('offline'), [PIANO_URL]: 503 })
    const ctx = fakeCtx() as never
    expect(await h.make(ctx, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
    expect(await h.make(ctx, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
    expect(h.fetch.mock.calls.filter(([u]) => u === PIANO_URL)).toHaveLength(2)
    expect(h.fetch.mock.calls.filter(([u]) => u === `${CORE}pack.json`)).toHaveLength(2)
  })

  it('skips one undecodable sample; a pack with none playable falls back (Review Focus 4)', async () => {
    const one = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: PIANO })
    await one.make(fakeCtx([2]) as never, 'acoustic_grand_piano', dest, null)
    expect(Object.keys(one.made[0].buffers)).toEqual(['36'])
    resetGmSoundCaches()
    const none = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: PIANO })
    expect(await none.make(fakeCtx([1, 2]) as never, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
  })

  it('corrupt JSON (no samples object) falls back', async () => {
    const h = harness({ [`${CORE}pack.json`]: INDEX, [PIANO_URL]: { name: 'x', samples: ['nope'] } })
    expect(await h.make(fakeCtx() as never, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
  })

  it('refuses an unsafe instrument name without fetching anything', async () => {
    const h = harness({}, { instrument: '../../evil' })
    expect(await h.make(fakeCtx() as never, 'acoustic_grand_piano', dest, null)).toEqual({ fallback: 'acoustic_grand_piano' })
    expect(h.fetch).not.toHaveBeenCalled()
  })

  it('a self-hosted assetBaseUrl drives both URLs; sounds.instrument picks the file', async () => {
    const base = 'https://cdn.example.test/gm/'
    const h = harness({
      [`${base}pack.json`]: { pack: 'complete', fluidr3: ['bright_acoustic_piano'] },
      [`${base}soundfonts/fluidr3/bright_acoustic_piano.json`]: PIANO,
    }, { assetBaseUrl: 'https://cdn.example.test/gm', instrument: 'bright_acoustic_piano' })
    await h.make(fakeCtx() as never, 'acoustic_grand_piano', dest, null)
    expect(h.makeSampler).toHaveBeenCalledTimes(1)
  })
})
```

Append to `packages/ivories/src/core/audio/engine.test.ts` (add `import { resetGmSoundCaches } from './gmSounds'` to its imports):

```ts
describe('AudioEngine sounds option (R-G)', () => {
  it('loads the piano voice and the live keys from the GM pack through the Sampler seam', async () => {
    resetGmSoundCaches()
    const ctx = { ...fakeContext(), decodeAudioData: vi.fn(async () => ({}) as AudioBuffer) }
    const fetchJson = vi.fn(async (url: string) => ({
      ok: true, status: 200,
      json: async () => (url.endsWith('pack.json')
        ? { pack: 'core', fluidr3: ['acoustic_grand_piano'] }
        : { name: 'acoustic_grand_piano', samples: { 60: btoa('x') } }),
    }))
    const sampler = { start: vi.fn(() => () => {}), stop: vi.fn(), dispose: vi.fn(), ready: Promise.resolve() }
    const makeSampler = vi.fn(() => sampler as never)
    const engine = new AudioEngine({
      makeContext: () => ctx as unknown as AudioContext,
      sounds: { pack: 'core' },
      soundsDeps: { fetch: fetchJson, makeSampler },
    })
    await engine.loadVoice(voice('v1'))
    await engine.prepareLive()
    expect(fetchJson).toHaveBeenCalledWith('https://cdn.jsdelivr.net/npm/pepperscore-sounds-core@0.1.0/soundfonts/fluidr3/acoustic_grand_piano.json')
    expect(makeSampler).toHaveBeenCalledTimes(2)
    engine.noteOn(60, 90)
    expect(sampler.start).toHaveBeenCalledWith({ note: 60, velocity: 90 })
  })

  it('an explicit makeInstrument still wins over sounds (tests and hosts keep their seam)', async () => {
    const { made, makeInstrument } = harness()
    const engine = new AudioEngine({ makeContext: () => fakeContext() as unknown as AudioContext, makeInstrument, sounds: { pack: 'core' } })
    await engine.loadVoice(voice('v1'))
    expect(makeInstrument).toHaveBeenCalledTimes(1)
    expect(made).toHaveLength(1)
  })
})
```

Create `packages/ivories/src/react/IvoriesProvider.sounds.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { IvoriesProvider } from './IvoriesProvider'

const made = vi.hoisted(() => ({ opts: [] as unknown[] }))
vi.mock('../core/audio/engine', async (orig) => {
  const real = await orig<typeof import('../core/audio/engine')>()
  const { fakeEngine } = await import('./testEngine.test-helpers')
  return { ...real, AudioEngine: vi.fn(function (o: unknown) { made.opts.push(o); return fakeEngine() }) }
})

describe('provider sounds option (R-G)', () => {
  it('builds its own engine with sounds; the same content keeps the engine, new content rebuilds it', async () => {
    const kid = <span className="kid" />
    const { rerender, container } = render(<IvoriesProvider sounds={{ pack: 'complete' }}>{kid}</IvoriesProvider>)
    await waitFor(() => expect(container.querySelector('.kid')).not.toBeNull())
    expect(made.opts.at(-1)).toMatchObject({ sounds: { pack: 'complete' } })
    const n = made.opts.length
    rerender(<IvoriesProvider sounds={{ pack: 'complete' }}>{kid}</IvoriesProvider>)
    await new Promise((r) => setTimeout(r, 20))
    expect(made.opts.length).toBe(n)
    rerender(<IvoriesProvider sounds={{ pack: 'core', instrument: 'bright_acoustic_piano' }}>{kid}</IvoriesProvider>)
    await waitFor(() => expect(made.opts.at(-1)).toMatchObject({ sounds: { pack: 'core', instrument: 'bright_acoustic_piano' } }))
  })

  it('without sounds the engine is built exactly as before', async () => {
    const { container } = render(<IvoriesProvider><span className="kid" /></IvoriesProvider>)
    await waitFor(() => expect(container.querySelector('.kid')).not.toBeNull())
    expect((made.opts.at(-1) as { sounds?: unknown }).sounds).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run packages/ivories/src/core/audio packages/ivories/src/react/IvoriesProvider.sounds.test.tsx`
Expected: FAIL — `./gmSounds` missing; `sounds` unknown.

- [ ] **Step 3: Implement `gmSounds.ts`**

Create `packages/ivories/src/core/audio/gmSounds.ts`:

```ts
import { Sampler } from 'smplr'
import type { Instrument, InstrumentFactoryFn } from './engine'

export type SoundPackName = 'core' | 'complete'

/** Piano samples from the pepperscore-sounds GM packs (rising-roll spec §2 GM sounds, R-G). */
export interface SoundsOption {
  /** 'core' (default: 19 instruments) or 'complete' (all 128 GM). */
  pack?: SoundPackName
  /** A self-hosted copy of a pack; a relative URL resolves against the page. */
  assetBaseUrl?: string
  /** The GM sound the piano voice and live keys load. Default 'acoustic_grand_piano'. */
  instrument?: string
}

export type FetchJson = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export interface GmSoundDeps {
  fetch?: FetchJson
  makeSampler?: (ctx: BaseAudioContext, o: { buffers: Record<number, AudioBuffer>; destination: AudioNode }) => Instrument
  /** Base for a relative assetBaseUrl. Default document.baseURI. */
  pageBase?: string
}

/** Pinned exactly like pepperscore's SOUNDS_VERSION: a pack release never changes a deployed page. */
export const SOUNDS_VERSION = '0.1.0'
export const GM_PIANO = 'acoustic_grand_piano'
const SAFE_NAME = /^[a-z0-9_]+$/

export function defaultSoundsBase(pack: SoundPackName = 'core'): string {
  return `https://cdn.jsdelivr.net/npm/pepperscore-sounds-${pack}@${SOUNDS_VERSION}/`
}

/** Absolute pack base with a trailing slash. */
export function resolveSoundsBase(o: SoundsOption, pageBase?: string): string {
  const raw = o.assetBaseUrl?.trim() || defaultSoundsBase(o.pack ?? 'core')
  const withSlash = raw.endsWith('/') ? raw : `${raw}/`
  const page = pageBase ?? (typeof document !== 'undefined' ? document.baseURI : undefined)
  try { return new URL(withSlash, page).href } catch { return withSlash }
}

export const packIndexUrl = (base: string): string => new URL('pack.json', base).href
export const sampleUrl = (base: string, name: string): string => new URL(`soundfonts/fluidr3/${name}.json`, base).href

/** The piano voice (and the live bus) load sounds.instrument; every other voice its own id. */
export function gmInstrumentName(id: string, o: SoundsOption): string {
  return id === GM_PIANO ? (o.instrument ?? GM_PIANO) : id
}

/** pack.json -> the FluidR3 instrument names it ships. */
export function parsePackIndex(u: unknown): Set<string> {
  const list = (u as { fluidr3?: unknown } | null)?.fluidr3
  return new Set(Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : [])
}

/** `samples` entries keyed by a MIDI number 0-127 with a non-empty string; anything else is ignored. */
export function parseSamplePack(u: unknown): [number, string][] {
  const samples = (u as { samples?: unknown } | null)?.samples
  if (typeof samples !== 'object' || samples === null || Array.isArray(samples)) return []
  const out: [number, string][] = []
  for (const [k, v] of Object.entries(samples as Record<string, unknown>)) {
    const midi = Number(k)
    if (Number.isInteger(midi) && midi >= 0 && midi <= 127 && typeof v === 'string' && v.length > 0) out.push([midi, v])
  }
  return out
}

/** Bare (or data:-prefixed) base64 -> bytes for decodeAudioData. */
export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/^data:[^,]*,/, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

let indexCache = new Map<string, Promise<Set<string>>>()
let bufferCache = new WeakMap<BaseAudioContext, Map<string, Promise<Record<number, AudioBuffer>>>>()

/** Test seam: forget every cached index and decoded pack. */
export function resetGmSoundCaches(): void {
  indexCache = new Map()
  bufferCache = new WeakMap()
}

/** The pack's instrument list. An unreachable index resolves empty and is not cached. */
export function loadPackIndex(base: string, fetchJson: FetchJson): Promise<Set<string>> {
  const hit = indexCache.get(base)
  if (hit) return hit
  const cache = indexCache
  const safe: Promise<Set<string>> = (async () => {
    const res = await fetchJson(packIndexUrl(base))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return parsePackIndex(await res.json())
  })().catch(() => {
    if (cache.get(base) === safe) cache.delete(base)
    return new Set<string>()
  })
  cache.set(base, safe)
  return safe
}

/**
 * One pack file decoded on one AudioContext, cached (N voices = one fetch and
 * one decode). A failure is not cached, so a later load retries. One sample
 * that will not decode is skipped -- smplr spreads its neighbours over the gap.
 */
export function loadGmBuffers(ctx: BaseAudioContext, url: string, fetchJson: FetchJson): Promise<Record<number, AudioBuffer>> {
  let perCtx = bufferCache.get(ctx)
  if (!perCtx) { perCtx = new Map(); bufferCache.set(ctx, perCtx) }
  const cache = perCtx
  const hit = cache.get(url)
  if (hit) return hit
  const p = (async () => {
    const res = await fetchJson(url)
    if (!res.ok) throw new Error(`GM sample pack ${url}: HTTP ${res.status}`)
    const entries = parseSamplePack(await res.json())
    const out: Record<number, AudioBuffer> = {}
    await Promise.all(entries.map(async ([midi, b64]) => {
      try { out[midi] = await ctx.decodeAudioData(base64ToArrayBuffer(b64)) } catch { /* skipped, see above */ }
    }))
    if (Object.keys(out).length === 0) throw new Error(`GM sample pack ${url}: no playable samples`)
    return out
  })()
  cache.set(url, p)
  p.catch(() => { if (cache.get(url) === p) cache.delete(url) })
  return p
}

/**
 * An engine instrument factory that loads from the GM pack (R-G). pepperscore's
 * packs are JSON with bare base64 mp3 per MIDI note -- not MIDI.js, so smplr's
 * Soundfont cannot read them -- so they are decoded here and handed to smplr's
 * Sampler as AudioBuffers. Anything that goes wrong uses `fallback` (today's
 * SplendidGrandPiano / Soundfont path); nothing throws past this function.
 */
export function gmInstrumentFactory(o: SoundsOption, fallback: InstrumentFactoryFn, deps: GmSoundDeps = {}): InstrumentFactoryFn {
  return async (ctx, id, destination, loader) => {
    const name = gmInstrumentName(id, o)
    if (!SAFE_NAME.test(name)) return fallback(ctx, id, destination, loader)
    const fetchJson: FetchJson = deps.fetch ?? ((url) => fetch(url))
    const makeSampler = deps.makeSampler
      ?? ((c, s) => Sampler(c, { buffers: s.buffers, destination: s.destination } as never) as unknown as Instrument)
    try {
      const base = resolveSoundsBase(o, deps.pageBase)
      const index = await loadPackIndex(base, fetchJson)
      // A reachable index without this instrument: today's path. An unreachable one: try the file anyway.
      if (index.size > 0 && !index.has(name)) return fallback(ctx, id, destination, loader)
      const buffers = await loadGmBuffers(ctx, sampleUrl(base, name), fetchJson)
      const inst = makeSampler(ctx, { buffers, destination })
      await inst.ready
      return inst
    } catch {
      return fallback(ctx, id, destination, loader)
    }
  }
}
```

- [ ] **Step 4: Wire it into the engine**

In `packages/ivories/src/core/audio/engine.ts`:
- change the smplr import to `import { SampleLoader, Soundfont, SplendidGrandPiano } from 'smplr'` plus `import type { Sampler } from 'smplr'`, and add:

```ts
import { gmInstrumentFactory } from './gmSounds'
import type { GmSoundDeps, SoundsOption } from './gmSounds'
```

- replace `type Instrument = ReturnType<typeof SplendidGrandPiano> | ReturnType<typeof Soundfont>` with:

```ts
/** The instance type produced by any smplr instrument factory we use (Sampler: the GM pack, R-G). */
export type Instrument = ReturnType<typeof SplendidGrandPiano> | ReturnType<typeof Soundfont> | Sampler
```

- in `AudioEngineDeps` add after `makeInstrument?`:

```ts
  /** Load the piano voice (and live keys) from the pepperscore-sounds GM pack (R-G). Ignored when makeInstrument is given. */
  sounds?: SoundsOption
  /** Test seam for the GM loader (fetch, Sampler construction). */
  soundsDeps?: GmSoundDeps
```

- change `const defaultMakeInstrument: InstrumentFactoryFn = …` to `export const defaultMakeInstrument: InstrumentFactoryFn = …` (body unchanged);
- in the constructor replace `this.makeInstrument = deps.makeInstrument ?? defaultMakeInstrument` with:

```ts
    this.makeInstrument = deps.makeInstrument
      ?? (deps.sounds ? gmInstrumentFactory(deps.sounds, defaultMakeInstrument, deps.soundsDeps) : defaultMakeInstrument)
```

In `packages/ivories/src/core/index.ts`, after `export * from './audio/engine'` add `export * from './audio/gmSounds'`.

- [ ] **Step 5: Provider `sounds` prop**

In `packages/ivories/src/react/IvoriesProvider.tsx`:
- add `import type { SoundsOption } from '../core/audio/gmSounds'`;
- in `IvoriesProviderProps` after `engine?:` add:

```ts
  /** Piano samples from the pepperscore-sounds GM pack for the provider's own engine (R-G). Unset: smplr's grand piano. */
  sounds?: SoundsOption
```

- replace the `ownEngine` block:

```ts
  const ownEngine = useDisposable(
    () => (props.engine ? null : new AudioEngine({ makeContext: sharedAudioContext })),
    (e) => e.dispose(), [!props.engine],
  )
```

with:

```ts
  // Rebuilt only when the sounds option's CONTENT changes (hosts pass object literals).
  const soundsKey = props.sounds ? JSON.stringify(props.sounds) : ''
  const soundsRef = useRef(props.sounds); soundsRef.current = props.sounds
  const ownEngine = useDisposable(
    () => (props.engine ? null : new AudioEngine({ makeContext: sharedAudioContext, sounds: soundsRef.current })),
    (e) => e.dispose(), [!props.engine, soundsKey],
  )
```

In `packages/ivories/src/react/withProvider.tsx`, add `'sounds'` to `PROVIDER_KEYS` after `'midiDeviceId'`.

- [ ] **Step 6: Run**

Run: `npx vitest run packages/ivories/src/core/audio packages/ivories/src/react` → PASS.
Run: `npm run check -w packages/ivories` → no type errors.
Run: `npm run build` → the library build and `check-dist` pass (smplr stays an external dependency; `gmSounds` touches `document`/`fetch` only inside functions, so `ssr.test.ts` stays green).
Run: `npm test` → all pass; passed = previous + the `it` blocks added here; 1 skipped.

- [ ] **Step 7: Commit**

```bash
git add packages/ivories/src
git commit -m "feat(ivories): piano from the pepperscore-sounds GM packs via smplr Sampler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Studio wiring — Play live, rising/orientation in the toolbar, BPM control

**Files:**
- Modify: `apps/studio/src/studio/liveMidi.ts`
- Create: `apps/studio/src/studio/LiveBpmField.tsx`
- Create: `apps/studio/src/studio/LiveSessionBar.tsx`
- Modify: `apps/studio/src/studio/LiveMidiSettings.tsx` (+ test append)
- Modify: `apps/studio/src/studio/LayoutToolbar.tsx` (+ test append)
- Modify: `apps/studio/src/studio/modeSync.ts` (+ test append)
- Modify: `apps/studio/src/App.tsx` (+ `App.test.tsx` append, and its `beforeEach`)

**Interfaces:**
- Consumes (public entries only): `ivories/core` → `DEFAULT_LIVE_BPM`, `MIN_LIVE_BPM`, `MAX_LIVE_BPM`, `singleLayout`, types `IvoriesView`, `Orientation`; `ivories` → `IvoriesProvider` props `liveClock`, `bpm`, `onBpmChange` (Task 4).
- Produces:
  - `useLiveMidi` state gains `bpm: number` (default 100) and `session: boolean` (default false).
  - `LiveBpmField({ id?, className?, showLabel? })` — `input[aria-label="BPM"].live-bpm-input`.
  - `LiveMidiSettings({ showBpm = true })`; `LiveSessionBar({ onLoadScore })`.
  - `modeForView('rising') === 'roll'`; `withPrimaryMode` keeps a rising slot on `'roll'` (R-M).
  - Empty stage **Play live** button (`.btn-play-live`), `.live-session-bar`, **Load a score** button (`.btn-load-score`) (R-S).

- [ ] **Step 1: Write the failing studio tests**

Append inside `describe('display mode <-> layout (R7)', …)` in `apps/studio/src/studio/modeSync.test.ts`:

```ts
  it('a rising slot is a roll: the roll toggle keeps it, the keyboard toggle replaces it (R-M)', () => {
    const r: Layout = { kind: 'single', main: { kind: 'ivories', view: 'rising', orientation: 'horizontal' } }
    expect(primarySlot(r)).toBe('main')
    expect(withPrimaryMode(r, 'roll')).toBe(r)
    expect(withPrimaryMode(r, 'keyboard')).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'keyboard' } })
  })

  it('keyboard -> roll gives a plain falling slot', () => {
    const k: Layout = { kind: 'single', main: { kind: 'ivories', view: 'keyboard' } }
    expect(withPrimaryMode(k, 'roll')).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'falling' } })
  })
```

Append inside `describe('LayoutToolbar (spec §6)', …)` in `apps/studio/src/studio/LayoutToolbar.test.tsx` (add `act` to its `@testing-library/react` import):

```tsx
  it('offers rising notes and an orientation for roll slots, kept across falling <-> rising (R-M)', () => {
    render(<LayoutToolbar />)
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'rising' } })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising' } })
    fireEvent.change(screen.getByLabelText('Main orientation'), { target: { value: 'horizontal' } })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising', orientation: 'horizontal' } })
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'falling' } })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'falling', orientation: 'horizontal' } })
    fireEvent.change(screen.getByLabelText('Main source'), { target: { value: 'keyboard' } })
    expect(screen.queryByLabelText('Main orientation')).toBeNull()
  })

  it('shows the BPM field only with no score and a rising slot (R-S)', () => {
    const score = useTransport.getState().score
    try {
      useTransport.setState({ score: null })
      render(<LayoutToolbar />)
      expect(screen.queryByLabelText('BPM')).toBeNull()
      act(() => { useStudioStage.setState({ layout: singleLayout('rising') }) })
      expect(screen.getByLabelText('BPM')).toBeTruthy()
      act(() => { useTransport.setState({ score: { name: 'x' } as never }) })
      expect(screen.queryByLabelText('BPM')).toBeNull()
    } finally {
      useTransport.setState({ score })
    }
  })
```

In `apps/studio/src/studio/LiveMidiSettings.test.tsx`, change the `beforeEach` `setState` to `useLiveMidi.setState({ enabled: false, deviceId: null, audio: true, error: null, bpm: 100, session: false })` and append inside its `describe`:

```tsx
  it('shows the live BPM when enabled and commits only valid values; showBpm={false} hides it', () => {
    useLiveMidi.setState({ enabled: true })
    const { unmount } = render(<LiveMidiSettings />)
    const field = screen.getByLabelText('BPM') as HTMLInputElement
    expect(field.value).toBe('100')
    fireEvent.change(field, { target: { value: '9' } })
    expect(useLiveMidi.getState().bpm).toBe(100)
    fireEvent.change(field, { target: { value: '144' } })
    expect(useLiveMidi.getState().bpm).toBe(144)
    fireEvent.blur(field)
    expect(field.value).toBe('144')
    unmount()
    render(<LiveMidiSettings showBpm={false} />)
    expect(screen.queryByLabelText('BPM')).toBeNull()
  })
```

In `apps/studio/src/App.test.tsx`, change the top-level `beforeEach` line to `useLiveMidi.setState({ enabled: false, deviceId: null, audio: true, error: null, bpm: 100, session: false })`, and append inside `describe('App: live MIDI', …)` (it owns `stubMidi()`):

```tsx
  it('Play live: MIDI on, a single rising slot, the toolbar and the live bar; Load a score brings the drop zone back (R-S)', async () => {
    stubMidi()
    useStudioStage.setState({ layout: singleLayout('falling'), aspect: 'free' })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Play live' }))
    expect(useLiveMidi.getState()).toMatchObject({ enabled: true, session: true })
    expect(useStudioStage.getState().layout).toEqual({ kind: 'single', main: { kind: 'ivories', view: 'rising' } })
    expect(engine.resume).toHaveBeenCalled()
    await waitFor(() => expect(document.querySelector('.layout-toolbar')).not.toBeNull())
    expect(document.querySelector('.live-session-bar')).not.toBeNull()
    expect(document.querySelector('.stage-empty')).toBeNull()
    expect(screen.getAllByLabelText('BPM')).toHaveLength(1)
    await waitFor(() => expect(document.querySelector('.ivories-rising')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Load a score' }))
    expect(document.querySelector('.stage-empty')).not.toBeNull()
    expect(document.querySelector('.live-session-bar')).toBeNull()
  })

  it('the toolbar BPM reaches the provider (data-bpm on the rising view)', async () => {
    stubMidi()
    useStudioStage.setState({ layout: singleLayout('falling'), aspect: 'free' })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Play live' }))
    const field = await screen.findByLabelText('BPM') as HTMLInputElement
    fireEvent.change(field, { target: { value: '132' } })
    expect(useLiveMidi.getState().bpm).toBe(132)
    await waitFor(() => expect(document.querySelector('.ivories-rising')!.getAttribute('data-bpm')).toBe('132'))
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/studio/src`
Expected: FAIL — no `rising` option/orientation select/BPM field, no Play live button, `modeForView('rising')` is null.

- [ ] **Step 3: Store, field and bar**

Replace `apps/studio/src/studio/liveMidi.ts` with:

```ts
import { create } from 'zustand'
import { DEFAULT_LIVE_BPM } from 'ivories/core'

interface LiveMidiState {
  enabled: boolean
  deviceId: string | null
  /** liveAudio: default on in the studio (spec §4.1). */
  audio: boolean
  /** Why live MIDI cannot run (provider onError 'midi-unavailable'), shown in the settings section. */
  error: string | null
  /** Live BPM: speed and grid of a rising view with no score (provider bpm, R-P). */
  bpm: number
  /** "Play live": no score, the stage shows live input instead of the drop zone (R-S). */
  session: boolean
  set(patch: Partial<Omit<LiveMidiState, 'set'>>): void
}

export const useLiveMidi = create<LiveMidiState>((set) => ({
  enabled: false,
  deviceId: null,
  audio: true,
  error: null,
  bpm: DEFAULT_LIVE_BPM,
  session: false,
  set: (patch) => set(patch),
}))
```

Create `apps/studio/src/studio/LiveBpmField.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { MAX_LIVE_BPM, MIN_LIVE_BPM } from 'ivories/core'
import { useLiveMidi } from './liveMidi'

/** The live BPM (rising view, no score). Commits only values in range; blur shows the committed one. */
export function LiveBpmField({ id, className = '', showLabel = true }: { id?: string; className?: string; showLabel?: boolean }) {
  const bpm = useLiveMidi((s) => s.bpm)
  const set = useLiveMidi((s) => s.set)
  const [draft, setDraft] = useState(String(bpm))
  useEffect(() => { setDraft(String(bpm)) }, [bpm])
  return (
    <span className={`live-bpm flex items-center gap-1 ${className}`}>
      {showLabel && <span className="live-bpm-label">BPM</span>}
      <input
        id={id} type="number" aria-label="BPM" min={MIN_LIVE_BPM} max={MAX_LIVE_BPM} step={1} value={draft}
        className="live-bpm-input w-16 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 text-xs text-[var(--ink)]"
        onChange={(e) => {
          const v = e.target.value
          setDraft(v)
          const n = Number(v)
          if (v.trim() !== '' && Number.isFinite(n) && n >= MIN_LIVE_BPM && n <= MAX_LIVE_BPM) set({ bpm: Math.round(n) })
        }}
        onBlur={() => setDraft(String(useLiveMidi.getState().bpm))}
      />
    </span>
  )
}
```

Create `apps/studio/src/studio/LiveSessionBar.tsx`:

```tsx
import { LiveMidiSettings } from './LiveMidiSettings'

/** The "Play live" session's controls (R-S): MIDI device and sound, and the way back to a score. */
export function LiveSessionBar({ onLoadScore }: { onLoadScore(): void }) {
  return (
    <div className="live-session-bar flex flex-wrap items-center gap-4 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink-dim)]">
      <div className="live-session-midi min-w-64 flex-1">
        <LiveMidiSettings showBpm={false} />
      </div>
      <button
        type="button"
        className="btn-load-score rounded-md border border-[var(--line)] px-3 py-1 text-xs text-[var(--ink)]"
        onClick={onLoadScore}
      >
        Load a score
      </button>
    </div>
  )
}
```

In `apps/studio/src/studio/LiveMidiSettings.tsx`:
- add `import { LiveBpmField } from './LiveBpmField'`;
- change the signature to `export function LiveMidiSettings({ showBpm = true }: { showBpm?: boolean } = {}) {`;
- after the device `SettingsRow` block (`{enabled && ( <SettingsRow label="Device" … )}`) add:

```tsx
      {enabled && showBpm && (
        <SettingsRow label="Live BPM (no score)" htmlFor="live-bpm">
          <LiveBpmField id="live-bpm" showLabel={false} />
        </SettingsRow>
      )}
```

- [ ] **Step 4: Mode sync and toolbar**

Replace `modeForView` and `withPrimaryMode` in `apps/studio/src/studio/modeSync.ts` with:

```ts
export function modeForView(v: IvoriesView): DisplayMode | null {
  // A rising slot is a roll too (R-M), so it can be the primary keys slot.
  return v === 'falling' || v === 'rising' ? 'roll' : v === 'keyboard' ? 'keyboard' : null
}
```

```ts
/** The layout with its primary keys slot showing `mode`; the same object when nothing changes. */
export function withPrimaryMode(l: Layout, mode: DisplayMode): Layout {
  const slot = primarySlot(l)
  if (!slot) return l
  const s = sourceAt(l, slot)
  if (s?.kind !== 'ivories') return l
  // The roll toggle leaves either roll alone (a rising slot stays rising, R-M).
  if (mode === 'roll' && (s.view === 'falling' || s.view === 'rising')) return l
  const view = viewForMode(mode)
  if (s.view === view) return l
  return layoutReducer(l, { type: 'setSource', slot, source: { kind: 'ivories', view } })
}
```

In `apps/studio/src/studio/LayoutToolbar.tsx`:
- change the `ivories/core` type import to `import type { Aspect, CameraFit, Corner, IvoriesView, LayoutAction, LayoutKind, Orientation, SlotName, SlotSource } from 'ivories/core'` and add:

```tsx
import { useTransport } from '../transport/useTransport'
import { LiveBpmField } from './LiveBpmField'
```

- in `SOURCE_OPTIONS` insert `['rising', 'Rising notes'],` after `['falling', 'Falling keys'],`;
- replace the last line of `sourceFor` (`return { kind: 'ivories', view: value as … }`) with:

```tsx
  const view = value as IvoriesView
  // Switching between the two rolls keeps the slot's orientation (R-M).
  const orientation = current.kind === 'ivories' ? current.orientation : undefined
  return orientation && (view === 'falling' || view === 'rising') ? { kind: 'ivories', view, orientation } : { kind: 'ivories', view }
```

- in `LayoutToolbar`, after `const { layout, aspect, dispatch, setAspect } = useStudioStage()` add:

```tsx
  // Live BPM matters only for a rising view running on the live clock: no score (R-S).
  const score = useTransport((s) => s.score)
  const showBpm = !score && slotsOf(layout).some((slot) => {
    const s = sourceAt(layout, slot)
    return s?.kind === 'ivories' && s.view === 'rising'
  })
```

- after the aspect `<select …>…</select>` add `{showBpm && <LiveBpmField className="layout-bpm" />}`;
- inside each slot's `<span className="slot-source-group …">`, after the source `<select>`, add:

```tsx
            {s.kind === 'ivories' && (s.view === 'falling' || s.view === 'rising') && (
              <select aria-label={`${label} orientation`} className={`slot-orientation-select ${SELECT}`} value={s.orientation ?? 'vertical'}
                onChange={(e) => dispatch({ type: 'setSource', slot, source: { ...s, orientation: e.target.value as Orientation } })}>
                <option className="slot-orientation-option" value="vertical">Vertical</option>
                <option className="slot-orientation-option" value="horizontal">Horizontal</option>
              </select>
            )}
```

- [ ] **Step 5: App — live session, provider clock and BPM**

In `apps/studio/src/App.tsx`:
- add imports `import { singleLayout } from 'ivories/core'` and `import { LiveSessionBar } from './studio/LiveSessionBar'`;
- after `const setLiveMidi = liveMidi.set` add:

```tsx
  // "Play live" (R-S): no score; the stage shows live input on the provider's live clock.
  const liveSession = !t.score && liveMidi.session
  const setLiveBpm = useCallback((bpm: number) => setLiveMidi({ bpm }), [setLiveMidi])
  // A score arriving (a recorded take, a scene) ends the session, so a later
  // "Load another file" shows the drop zone, not the live view again.
  useEffect(() => { if (t.score && liveMidi.session) setLiveMidi({ session: false }) }, [t.score, liveMidi.session, setLiveMidi])
```

- change `const { clearSong } = loader` to `const { clearSong, unlockAudio } = loader` and after `loadAnother`'s `useCallback` add:

```tsx
  const startLive = useCallback(() => {
    unlockAudio()   // this click is the gesture that lets live keys sound
    setLiveMidi({ enabled: true, session: true, error: null })
    useStudioStage.getState().setLayout(singleLayout('rising'))
  }, [unlockAudio, setLiveMidi])
```

- on `<IvoriesProvider …>` replace `clock={clock}` with the four lines:

```tsx
          clock={t.score ? clock : undefined}
          liveClock={liveSession}
          bpm={liveMidi.bpm}
          onBpmChange={setLiveBpm}
```

(the studio's AudioClock drives the provider only while a score is loaded; with none, the provider's live clock runs — R-S, R-L);
- change `{!t.score && (` (the `stage-empty` block) to `{!t.score && !liveSession && (` and, inside it, directly before the `btn-open-scenes` button add:

```tsx
            <button
              type="button"
              className="btn-play-live rounded-md border border-[var(--accent)] px-3 py-1 text-xs text-[var(--ink)]"
              onClick={startLive}
            >
              Play live
            </button>
```

- replace `{t.score && <LayoutToolbar />}` with:

```tsx
      {(t.score || liveSession) && <LayoutToolbar />}
      {liveSession && <LiveSessionBar onLoadScore={() => setLiveMidi({ session: false })} />}
```

- [ ] **Step 6: Run**

Run: `npx vitest run apps/studio/src` → PASS (including the existing "every control and option carries a contextual class name" test).
Run: `npm run build` → studio `tsc -b && vite build` pass; `npm run check` → passes (public imports only).
Run: `npm test` → all pass; passed = previous + the `it` blocks added here; 1 skipped.
Manual check (dev server bound to 0.0.0.0): `npm run dev -- --port 5183`, open `http://<host>:5183/`, click **Play live**, confirm the rising view, the toolbar BPM field and the orientation select; stop the server.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src
git commit -m "feat(studio): Play live session, rising and orientation in the toolbar, live BPM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: End-to-end — fake MIDI, rising live and score, horizontal, BPM

**Files:**
- Modify: `apps/studio/src/embed/EmbedFixture.tsx` (+ `EmbedFixture.test.tsx` append)
- Modify: `e2e/fixtures.ts` (window registry type)
- Create: `e2e/fakeMidi.ts`
- Create: `e2e/rising.spec.ts`
- Create: `e2e/studio-live.spec.ts`

**Interfaces:**
- Consumes: `<Ivories view="rising" | "falling" orientation input>` (Task 6), `data-t`/`data-bpm`/`data-orientation` on view roots (Tasks 2, 5), `.ivories-bpm-input` (Task 5), studio **Play live**, `.layout-toolbar` BPM and `Main orientation` (Task 8).
- Produces: `FIXTURE_CASES` sections `section.fixture-case[data-case="rising-live|rising-score|falling-horizontal|rising-horizontal"]`; `window.__ivoriesFixture.cases`; e2e helpers `installFakeMidi(page)`, `midiBound(page)`, `noteOn(page, midi, velocity?)`, `noteOff(page, midi)`.

- [ ] **Step 1: Fixture cases (unit test first)**

Append inside the `describe` in `apps/studio/src/embed/EmbedFixture.test.tsx`:

```tsx
  it('embeds the rising and horizontal cases after the presets', () => {
    const { container } = render(<EmbedFixture />)
    const cases = [...container.querySelectorAll<HTMLElement>('section.fixture-case')].map((s) => s.dataset.case)
    expect(cases).toEqual(['rising-live', 'rising-score', 'falling-horizontal', 'rising-horizontal'])
  })
```

Run: `npx vitest run apps/studio/src/embed` → FAIL. Then in `apps/studio/src/embed/EmbedFixture.tsx`:
- change the `ivories` type import to `import type { IvoriesHandle, IvoriesPreset, IvoriesProps, PepperScoreClockHandle } from 'ivories'`;
- after `FIXTURE_PRESETS` add:

```tsx
/** Rising-roll cases (rising-roll spec §4 e2e): live MIDI with no score, a score, and both rolls horizontal. */
export const FIXTURE_CASES: { id: string; title: string; props: IvoriesProps }[] = [
  { id: 'rising-live', title: 'rising (live MIDI, no score)', props: { view: 'rising', input: 'midi' } },
  { id: 'rising-score', title: 'rising (score)', props: { view: 'rising', scoreUrl: '/fixtures/demo.mid' } },
  { id: 'falling-horizontal', title: 'falling, horizontal', props: { view: 'falling', orientation: 'horizontal', scoreUrl: '/fixtures/demo.mid' } },
  { id: 'rising-horizontal', title: 'rising, horizontal', props: { view: 'rising', orientation: 'horizontal', scoreUrl: '/fixtures/demo.mid' } },
]
```

- change `FixtureRegistry` to add `cases: Partial<Record<string, IvoriesHandle>>` and the registry constant to `{ handles: {}, notation: {}, cases: {} }`;
- after the presets' `.map(…)` inside `<main>` add:

```tsx
      {FIXTURE_CASES.map((c) => (
        <section key={c.id} className="fixture-case flex flex-col gap-2" data-case={c.id}>
          <h2 className="fixture-case-title text-sm text-[var(--ink-dim)]">{c.title}</h2>
          <div className="fixture-case-frame h-[360px] overflow-hidden rounded-lg border border-[var(--line)]">
            <Ivories {...c.props} ref={(h) => { if (h) registry.cases[c.id] = h }} />
          </div>
        </section>
      ))}
```

In `e2e/fixtures.ts`, add `cases: Partial<Record<string, FixtureHandle>>` to the `__ivoriesFixture` window type.

Run: `npx vitest run apps/studio/src/embed` → PASS.

- [ ] **Step 2: Fake MIDI helper**

Create `e2e/fakeMidi.ts`:

```ts
import type { Page } from './fixtures'

interface FakeMidi { noteOn(midi: number, velocity?: number): void; noteOff(midi: number): void; bound(): boolean }
declare global { interface Window { __fakeMidi?: FakeMidi } }

/**
 * Replaces Web MIDI before any page script runs: one input, "Fake Keys",
 * driven from the test. Matches what MidiInput reads (inputs.forEach,
 * onstatechange, port.onmidimessage with data + timeStamp).
 */
export async function installFakeMidi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Handler = (e: { data: Uint8Array; timeStamp: number }) => void
    const port = { id: 'fake-keys', name: 'Fake Keys', type: 'input', state: 'connected', onmidimessage: null as Handler | null }
    const access = { inputs: new Map([[port.id, port]]), outputs: new Map(), onstatechange: null as unknown, sysexEnabled: false }
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) })
    const send = (bytes: number[]) => port.onmidimessage?.({ data: Uint8Array.from(bytes), timeStamp: performance.now() })
    window.__fakeMidi = {
      noteOn: (m, v = 100) => send([0x90, m, v]),
      noteOff: (m) => send([0x80, m, 0]),
      bound: () => port.onmidimessage !== null,
    }
  })
}

export const midiBound = (page: Page) => page.evaluate(() => window.__fakeMidi?.bound() ?? false)
export const noteOn = (page: Page, midi: number, velocity = 100) =>
  page.evaluate(([m, v]) => window.__fakeMidi!.noteOn(m, v), [midi, velocity] as const)
export const noteOff = (page: Page, midi: number) => page.evaluate((m) => window.__fakeMidi!.noteOff(m), midi)
```

- [ ] **Step 3: Embed e2e**

Create `e2e/rising.spec.ts`:

```ts
/**
 * Rising roll e2e (rising-roll spec §4): live MIDI through a fake MIDIAccess,
 * a score, both rolls horizontal, and the Transport BPM field.
 */
import { test, expect } from './fixtures'
import type { Page } from './fixtures'
import type { Locator } from '@playwright/test'
import { installFakeMidi, midiBound, noteOff, noteOn } from './fakeMidi'

const SHOTS = '/tmp/ivories-e2e'
const caseOf = (page: Page, id: string) => page.locator(`section[data-case="${id}"]`)
const drawnT = async (view: Locator) => Number(await view.getAttribute('data-t'))

/** A cheap signature of what a canvas currently shows. */
const signature = (canvas: Locator) => canvas.evaluate((c: HTMLCanvasElement) => {
  const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  let h = 0
  for (let i = 0; i < data.length; i += 97) h = (h * 31 + data[i]) >>> 0
  return h
})

/** Mean brightness of a pixel column 8 CSS px in from the left and right edges. */
const edges = (canvas: Locator) => canvas.evaluate((c: HTMLCanvasElement) => {
  const ctx = c.getContext('2d')!
  const px = c.width / Math.max(1, c.clientWidth)
  const mean = (x: number) => {
    let sum = 0, n = 0
    for (let y = Math.floor(c.height * 0.1); y < c.height * 0.9; y += 2) {
      const d = ctx.getImageData(Math.round(x), y, 1, 1).data
      sum += (d[0] + d[1] + d[2]) / 3
      n++
    }
    return sum / n
  }
  return { left: mean(8 * px), right: mean(c.width - 8 * px) }
})

test.beforeEach(async ({ page }) => { await installFakeMidi(page) })

test('rising, live MIDI: the first note starts the live clock and the note rises', async ({ page }) => {
  await page.goto('/embed-fixture')
  const section = caseOf(page, 'rising-live')
  const view = section.locator('.ivories-rising')
  await expect(view).toBeVisible({ timeout: 20_000 })
  await expect(section.locator('.ivories-bpm-input')).toHaveValue('100')
  await expect.poll(() => midiBound(page), { timeout: 10_000 }).toBe(true)
  expect(await drawnT(view)).toBe(0)
  await noteOn(page, 60)
  await expect.poll(() => drawnT(view), { timeout: 10_000 }).toBeGreaterThan(0.3)
  const canvas = view.locator('canvas.ivories-canvas')
  const before = await signature(canvas)
  await page.waitForTimeout(300)
  expect(await signature(canvas)).not.toBe(before)
  await noteOff(page, 60)
  await section.screenshot({ path: `${SHOTS}/rising-live.png` })
})

test('rising, live MIDI: the Transport BPM field sets the view BPM', async ({ page }) => {
  await page.goto('/embed-fixture')
  const section = caseOf(page, 'rising-live')
  const field = section.locator('.ivories-bpm-input')
  await expect(field).toBeVisible({ timeout: 20_000 })
  await field.fill('120')
  await expect(section.locator('.ivories-rising')).toHaveAttribute('data-bpm', '120')
})

test('rising with a score runs on the score clock and has no BPM field', async ({ page }) => {
  await page.goto('/embed-fixture')
  const section = caseOf(page, 'rising-score')
  const view = section.locator('.ivories-rising')
  await expect(view).toBeVisible({ timeout: 20_000 })
  await expect(section.locator('.ivories-time')).not.toHaveText(/\/ 0:00$/)
  await expect(section.locator('.ivories-bpm')).toHaveCount(0)
  await section.locator('.ivories-btn-play').click()
  await expect.poll(() => drawnT(view), { timeout: 10_000 }).toBeGreaterThan(0.5)
  await section.screenshot({ path: `${SHOTS}/rising-score.png` })
})

for (const id of ['falling-horizontal', 'rising-horizontal']) {
  test(`${id}: the keyboard stands on the left edge`, async ({ page }) => {
    await page.goto('/embed-fixture')
    const section = caseOf(page, id)
    const view = section.locator('.ivories-view')
    await expect(view).toHaveAttribute('data-orientation', 'horizontal', { timeout: 20_000 })
    await expect(section.locator('.ivories-time')).not.toHaveText(/\/ 0:00$/)
    const canvas = view.locator('canvas.ivories-canvas')
    await expect.poll(async () => (await edges(canvas)).left, { timeout: 10_000 }).toBeGreaterThan(150)
    expect((await edges(canvas)).right).toBeLessThan(100)
    await section.screenshot({ path: `${SHOTS}/${id}.png` })
  })
}
```

- [ ] **Step 4: Studio e2e**

Create `e2e/studio-live.spec.ts`:

```ts
/** Studio "Play live" (R-S): rising view on the live clock, toolbar BPM, horizontal toggle, back to a score. */
import { test, expect } from './fixtures'
import { installFakeMidi, midiBound, noteOff, noteOn } from './fakeMidi'

test('studio Play live: live notes rise, the BPM control drives the view, the roll turns horizontal', async ({ page }) => {
  await installFakeMidi(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Play live', exact: true }).click()
  const toolbar = page.locator('.layout-toolbar')
  await expect(toolbar).toBeVisible()
  await expect(page.locator('.live-session-bar')).toBeVisible()
  const view = page.locator('.studio-stage .ivories-rising')
  await expect(view).toBeVisible()

  const bpm = toolbar.getByLabel('BPM', { exact: true })
  await bpm.fill('132')
  await bpm.blur()
  await expect(view).toHaveAttribute('data-bpm', '132')

  await expect.poll(() => midiBound(page), { timeout: 10_000 }).toBe(true)
  await noteOn(page, 64)
  await expect.poll(async () => Number(await view.getAttribute('data-t')), { timeout: 10_000 }).toBeGreaterThan(0.3)
  await noteOff(page, 64)

  await toolbar.getByLabel('Main orientation').selectOption('horizontal')
  await expect(view).toHaveAttribute('data-orientation', 'horizontal')
  await page.screenshot({ path: '/tmp/ivories-e2e/studio-live-horizontal.png' })

  await page.getByRole('button', { name: 'Load a score' }).click()
  await expect(page.locator('#file-input')).toBeAttached()
  await expect(page.locator('.live-session-bar')).toHaveCount(0)
})
```

- [ ] **Step 5: Run the browser suite**

Run: `npm run test:e2e`
Expected: the previous 17 pass (1 skipped without pepperscore) plus the 6 new tests pass; screenshots in `/tmp/ivories-e2e/` (`rising-live.png`, `rising-score.png`, `falling-horizontal.png`, `rising-horizontal.png`, `studio-live-horizontal.png`). Open each screenshot and confirm by eye: the horizontal ones show the keyboard up the left edge with low notes at the bottom and an upright `C4`; the rising ones show bars above the keys and beat lines.
Run: `npm test` → all pass; 1 skipped.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/embed e2e
git commit -m "test(e2e): rising live/score, horizontal rolls, BPM control, fake MIDIAccess

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: README

**Files:**
- Modify: `packages/ivories/README.md`

**Interfaces:**
- Consumes: every public name added above (`RisingKeys`, `useLiveBpm`, `orientation`, `bpm`, `liveClock`, `autoStart`, `onBpmChange`, `sounds`, `toScreen`, `pitchAtScreen`).
- Produces: documentation only.

- [ ] **Step 1: Presets line**

Replace the paragraph under `## Presets` with:

```md
`<Ivories view>`: `falling`, `rising`, `keyboard`, `keyboard+notation`, `endless+falling`, `endless+keyboard`. `orientation` (`vertical` | `horizontal`) applies to the falling or rising main view. `chrome`: `full` (transport with seek, tempo, metronome, and the BPM field when there is no score), `minimal` (play button), `none`.
```

- [ ] **Step 2: New sections before `## Errors`**

Insert directly above `## Errors`:

````md
## Rising notes

`<RisingKeys>` turns the roll around: a note appears at the keyboard edge when it starts, grows from its key while held, then detaches and drifts away. It takes the same `labels`, `range`, `input`, `theme`, `height`, `className` and `onLayout` props as `<FallingKeys>`, plus `visibleBeats` (beats between the keys and the far edge, default 8), `beatsPerBar` (live grid, default 4) and `beatGrid` (beat and bar lines, default true).

- With a score, notes move on the score's clock. A beat is a quarter note on its tempo map, and grid lines follow its time signatures (stronger on each bar).
- Live notes (`input="midi"`) are stamped in the provider's clock time and drawn in the live colour, next to the score's notes when there is one.
- With no score and no `clock` prop, the provider runs a free-running live clock that starts on the first key (`autoStart` starts it at mount; `liveClock` turns it on without a `<RisingKeys>`). `bpm` (default 100, 20–300) sets the speed and grid; changing it re-spaces the grid but never moves notes already played. `<Transport>` shows a BPM field in this mode, `useLiveBpm()` returns `{ bpm, setBpm }`, and `onBpmChange(bpm)` reports changes.

```tsx
<IvoriesProvider bpm={90} liveAudio>
  <RisingKeys input="midi" />
  <Transport controls={{ seek: false }} />
</IvoriesProvider>
```

## Horizontal piano roll

`orientation="horizontal"` on `<FallingKeys>`, `<RisingKeys>` and `<Ivories>` stands the keyboard on the left edge, low notes at the bottom, with time running across: falling notes arrive from the right, rising notes leave to the right. Key proportions are unchanged. `onLayout` still reports the vertical (canonical) geometry; `toScreen`, `fromScreen` and `pitchAtScreen` from `ivories/core` map between it and the view. In a `<Stage>` layout an ivories slot carries it: `{ kind: 'ivories', view: 'rising', orientation: 'horizontal' }`.

## GM piano sounds

By default the piano is smplr's Splendid Grand Piano. Pass `sounds` to load it from the pepperscore-sounds GM sample packs instead (the same packs and CDN layout pepperscore uses):

```tsx
// A MIDI keyboard in, piano out (the becreative /play-me page):
<Keyboard input="midi" liveAudio sounds={{ pack: 'core' }} />
```

`sounds: { pack?: 'core' | 'complete'; assetBaseUrl?: string; instrument?: string }`. Files load from `https://cdn.jsdelivr.net/npm/pepperscore-sounds-<pack>@0.1.0/`, or from `assetBaseUrl` for a self-hosted copy: `pack.json` lists the instruments and `soundfonts/fluidr3/<name>.json` holds the samples. `instrument` picks the GM sound for the piano voice and the live keys (default `acoustic_grand_piano`); other score voices whose instrument is in the pack load from it too. If the pack cannot be reached, that instrument falls back to the default piano and a later load tries again. Browsers start audio only after a user gesture on the page; after one, the first live key resumes a suspended context.
````

- [ ] **Step 3: Errors**

In `## Errors`, after the paragraph that starts `The exceptions are \`audio-unavailable\``, add:

```md
Every reported error is also logged once with `console.warn('[ivories] <code>: <message>', cause)` (once per provider for each code and message), so an embed without `onError` still shows why audio or MIDI went quiet.
```

- [ ] **Step 4: Verify and commit**

Run: `npm run build` → passes (the pack check still includes `README.md`).

```bash
git add packages/ivories/README.md
git commit -m "docs(ivories): rising notes, horizontal roll, live clock and BPM, GM sounds, console errors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage map

| Spec item | Task(s) |
|---|---|
| §1.1 / §2 Error logging (console.warn once per code+message, onError unchanged) | 1 |
| §1.2 / §2 Rising view (onset at the edge, growth while held, detach and drift; colours, live colour, labels, flash, tokens) | 3 (draw), 5 (component) |
| §2 Rising sources (score + live, together) | 3, 4 (trail), 5 |
| §2 Scroll speed (`beatPx = extent / visibleBeats`, score tempo map or `bpm`; beat and bar lines; `beatsPerBar`; score time signature) | 3 |
| §1.3 / §2 Live clock (ManualClock, first note or `autoStart`, never stops; `bpm` default 100; BPM change never re-times) | 4 |
| §2 BPM wiring (`<Transport>` field in live mode; studio live MIDI section + toolbar; `useLiveBpm()`) | 5, 8 |
| §1.4 / §2 Orientation (falling + rising, keyboard on the left, low notes at the bottom; rotated canonical geometry; oracle passes) | 2 (falling), 5 (rising) |
| §2 Layout model (`orientation` on ivories slots, `'rising'` view, validators, SceneV2 stays v2, toolbar rising + orientation) | 6, 8 |
| §2 Presets (`<Ivories view="rising">`, `<Ivories orientation>`) | 6 |
| §1.5 / §2 GM sounds (`sounds` option, pepperscore-sounds packs, jsDelivr default and layout, pack.json index, unset = unchanged, live notes same instrument) | 7 |
| §3 Out of scope (video recording, roll editing, quantisation) | not planned |
| §4 Unit tests (dedupe; rising geometry both orientations; horizontal = rotation, oracle-derived; live clock + BPM; validators; GM URL resolution + fallback) | 1, 2, 3, 4, 5, 6, 7 |
| §4 E2E (rising live with fake MIDIAccess, rising with a score, horizontal falling + rising screenshots, studio BPM control) | 9 |
