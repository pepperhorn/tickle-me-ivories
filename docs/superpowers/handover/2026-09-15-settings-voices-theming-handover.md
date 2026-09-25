# Plan 2 handover — settings, voices and theming

Branch `feat/settings-voices-theming`, 28 commits on 36fbd8c. 392 tests, `npm run build` clean, geometry oracle passing. Headless browser smoke test 8/8 (zoom, themes, labels, chord readout, profile restore / refuse v2 / export, /debug, tempo mid-play).

**Needs a human:** listen to the metronome (click on the beat, accent on bar starts incl. 6/8, no catch-up burst after seek/resume).

## Rulings made during execution

- Scan table: preflight.md (this dir). 46 findings F1–F47. Ruling: adopt every "Ruling" column entry in preflight.md §3 verbatim — each is the smallest fix and aligns with the spec — cost if wrong: rework of that one item, visible in its task diff.
- Ruling: F13/F8 (cross-ref text, test counts) are cosmetic plan-text errors; implementers ignore stated counts — cost: none.
- Task 3: F6 manual-check rewording is plan text only — no code change; Ruling: accept 0.8 master, output slightly quieter than plan 1 — cost: user may want 1.0
- Task 5: Ruling: plan-mandated gradientColor per-call sort+hex parse in draw loop — fix it (Global Constraint: no allocation in draw loop outranks plan code); use a WeakMap cache keyed by the stops array identity — cost if wrong: small extra complexity in colors.ts
- Task 14: Ruling: F38's "correct the plan Self-Review line" is plan-doc text only — not edited; plan doc is historical — cost: none
- Task 16: Ruling: accept implementer deviation — ChordTracker on wall clock (performance.now) instead of playhead; the brief's design left the readout blank after a paused seek — cost if wrong: readout confirm timing decoupled from tempo scale
- Ruling: fix wave = Important #1-#4 + reviewer fix-before-merge (T2 Enter double commit via #5 no-op unchanged tempo; T8 revoke object URL async) + #6 stageBgOverride/text colour CSS.supports validation — cost if wrong: small extra diff
- Ruling: park final minors #7 roman numerals in minor (relative-major bIII convention), #8 autosave flush on loadAnother/pagehide, #9 Reset scope, #10 per-frame allocation sweep, #11 overlay store, #12 re-click scheme wipes stops — all real, non-blocking, none load-bearing — cost if wrong: user-visible polish later

Pre-flight: 46 plan defects (F1–F47) were ruled on before Task 1 — duplicate test imports, tests that could not pass or asserted nothing, a structuredClone crash on profile restore, display settings never persisted, the Outline theme drawing invisible keys, the minor-key tonic read wrong from @tonejs/midi, a chord readout that never confirmed a held chord. Each fix is in its task's commit.

## Parked findings (real, deferred)

- Task 2: minor (deferred): TempoControl.tsx:83-88 Enter calls commitBpm then blur() re-fires commitBpm -> setTempo+stopAll twice per Enter
- Task 3: minor (deferred): engine.ts:46-50 inst.ready rejection never disposes the half-built instance
- Task 3: minor (deferred): broken instrument stored as GRAND_PIANO_ID -> every later loadVoice re-fetches the broken one
- Task 3: minor (deferred): engine.test.ts:142-150 "retainVoices disposes and disconnects" never asserts disconnect
- Task 3: minor (deferred): dispose() leaves ctx/master set (no callers yet)
- Task 3: minor (deferred): gain.value set directly -> clicks on live slider moves; use setTargetAtTime
- Task 3: minor (deferred): retainVoices doesn't clear loading map -> a reload of a retired id waits on the orphaned task
- Task 3: minor (deferred): if newer load throws before its retainVoices, a superseded load's unique bus stays unpruned
- Task 5: minor (deferred): VelocityEditor stops list keyed by index
- Task 7: minor (deferred): MetronomeVoice has no unit tests (pending tracking/stop/onended/volume<=0)
- Task 7: minor (deferred): stop() clips an already-sounding final click at end-of-piece auto-stop
- Task 7: minor (deferred): metronome SettingsRow label lacks htmlFor/id pair
- Task 7: minor (deferred): engine.test accessor test claims lazy creation but only asserts identity
- Task 8: minor (deferred): exportProfile revokes object URL synchronously on detached anchor; no message when no score
- Task 8: minor (deferred): importProfile ignores p.song.id mismatch
- Task 8: minor (deferred): decodeProfile(null) leaks raw TypeError text to the user
- Task 8: minor (deferred): F23 test packs 11 asserts in one it; no test for F24 engine reset / App-level import refusal
- Task 8: minor (deferred): import loop `void engine.loadVoice(v)` unhandled rejection on sample-load failure
- Task 11: minor (deferred): --stage in index.css now unused by App.tsx
- Task 11: minor (deferred): App.tsx themeFor builds a template-string cache key per frame (compare fields instead)
- Task 11: minor (deferred): drawStage calls isTransparent(theme.stageBg) per frame (regex+split); bake a boolean into the cached Theme
- Task 12: minor (deferred): keyboard.ts reassigns strokeStyle/lineWidth per key in outline loops (hoist)
- Task 12: minor (deferred): ThemeSettings active/inactive button class ternary duplicated; '#00b140' duplicated vs MATTE_PRESETS[0]
- Task 14: minor (deferred): font family field fetches a Google font per keystroke (debounce / apply on blur)
- Task 14: minor (deferred): untrusted font family string with quotes breaks font-family decl (sanitise in validTextStyle/textCss)
- Task 14: minor (deferred): profile weight clamp 100-900 vs slider 300-900
- Task 14: minor (deferred): no test for App overlay push/skip logic
- Task 16: minor (deferred): raising tempo moves head back >0.25s -> chordFeed treats as scrub, readout blinks (reset/rebase in changeTempo)
- Task 16: minor (deferred): key change briefly pairs old-key spelling with new-key numeral (~60ms)
- Task 16: minor (deferred): pitchesInWindow allocates Set+array every frame while readout on (even paused); `?? []` literal per frame with no score
- Task 16: minor (deferred): keyFor and useMemo keyContext cache the same key twice
- Task 16: minor (deferred): ChordFeed.reset() leaves lastHead -> redundant second reset after seek
- Task 16: minor (deferred): no tests for new TextSettings chord rows
- Final review: CSS.supports accepts inherit/currentcolor/var() as colours; App.test URL stubs not restored; gradient stop colours string-checked only; 6/4 treated as simple metre
- Final review parked: roman numerals in minor use relative-major (bIII) convention, untested; autosave not flushed on loadAnother/pagehide; Reset only resets the settings store; per-frame allocation sweep (themeFor key string, isTransparent, pitchesInWindow); overlay state re-renders App; re-clicking the active velocity scheme wipes gradient stops
