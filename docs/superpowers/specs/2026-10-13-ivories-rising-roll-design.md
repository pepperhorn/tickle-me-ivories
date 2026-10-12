# Ivories — rising notes, horizontal roll, live BPM clock, GM sounds, console errors

**Date:** 2026-10-13
**Status:** Directed by the user (2026-10-13 message); builds on `2026-10-12-ivories-mvp-design.md`
**Branch:** `feat/ivories-mvp`

## 1. Requests (verbatim intent)

1. Audio and MIDI errors are also sent to the browser console.
2. An alternative to the falling-notes view that **emits notes and they drift up** ("rising"), for live input and for a supplied score.
3. The rising view needs a clock: a **BPM** for live input (wired into the UI), or the score's own clock when a score is supplied.
4. Falling and rising must both also work as a **horizontal, traditional piano-roll** view.
5. Piano playback through smplr using **our GM sound libraries** (pepperscore-sounds packs) — used by the becreative `/play-me` page (MIDI keyboard in, piano out, keyboard-only view by default).

## 2. Decisions

| Topic | Decision |
|---|---|
| Error logging | Every error a provider reports (`reportError`, all codes) is also logged once to the console as `console.warn('[ivories] <code>: <message>', cause)`. De-duplicated per provider per code+message so a repeating failure logs once. `onError` behaviour unchanged. |
| Rising view | New `<RisingKeys>` component (and `view: 'rising'` in layouts/presets). Notes appear at the keyboard edge at their onset and travel away from it; a held note grows from the keyboard until released, then detaches and drifts. Same velocity colours, live colour, labels, hit flash and theme tokens as `<FallingKeys>`. |
| Rising sources | Score notes (onset/duration from the score, time from the provider clock) **and** live notes (note-on/off times stamped in provider clock time). Both can show together. |
| Scroll speed | Distance per beat: `beatPx = viewExtent / visibleBeats` (`visibleBeats` prop, default 8). Seconds per beat come from the score's tempo map when a score is loaded (score clock), otherwise from `bpm`. Beat grid lines every beat, stronger every bar (`beatsPerBar`, default 4; the score's time signature when a score is loaded). |
| Live clock | When there is no score, a provider with `liveClock` (or any `<RisingKeys>` used without a score) runs a free-running `ManualClock` that starts on the first live note (or immediately with `autoStart`) and never stops at a duration. `bpm` prop on the provider (default 100) feeds the grid and speed; changing it does not re-time past notes (they keep their clock times; only spacing of the grid/speed changes). |
| BPM wiring | `<Transport>` gains a BPM field shown when the provider has no score (live mode); the studio exposes it in the live MIDI section and the toolbar when a rising slot has no score. `useLiveBpm()` hook exposes get/set. |
| Orientation | `orientation: 'vertical' \| 'horizontal'` on `<FallingKeys>` and `<RisingKeys>` (default vertical). Horizontal = keyboard drawn vertically on the left edge (low notes at the bottom), time runs horizontally: falling notes approach the keyboard from the right; rising notes leave the keyboard to the right. Geometry is the canonical vertical geometry rotated (chordl key ratios unchanged; the geometry oracle still passes). |
| Layout model | `SlotSource` ivories variant gains optional `orientation`; `IvoriesView` gains `'rising'`. Validators accept and whitelist both; SceneV2 stays `v: 2` (optional fields). Toolbar offers rising and an orientation toggle per ivories slot. |
| Presets | `<Ivories view>` gains `'rising'`; `<Ivories orientation>` applies to the main roll view. |
| GM sounds | Engine/provider option `sounds?: { pack?: 'core' \| 'complete'; assetBaseUrl?: string; instrument?: string }`. When set, the piano voice loads through smplr from the pepperscore-sounds GM sample pack (same jsDelivr default base and layout as pepperscore's `assetBaseUrl`/`soundPack`; pack.json is the index). When unset, current behaviour (smplr's default piano) is unchanged. Live notes use the same instrument. |

## 3. Out of scope

Recording rising trails to video; editing in the horizontal roll; quantisation of live input.

## 4. Testing

Unit: error logging dedupe; rising geometry (onset at the keyboard edge, travel per beat, held-note growth, detach on release) in both orientations; horizontal geometry is the rotation of vertical (oracle-derived); live clock free-running + BPM change; validators for the new fields; GM sound source URL resolution and fallback. E2E: rising view with live MIDI (fake MIDIAccess injected) and with a score; horizontal falling and rising screenshots; studio BPM control.
