# Ivories MVP handover — rulings and parked findings

Branch `feat/ivories-mvp`, plan `docs/superpowers/plans/2026-10-12-ivories-mvp.md` (29 tasks, all complete). 947 unit tests pass (1 skipped); e2e 17 pass (1 skipped without pepperscore); real pepperscore 0.2 notation e2e 6 pass via `PEPPERSCORE_TARBALL=… npm run test:e2e:notation`.

## Pepperscore 0.2 rulings (branch feat/external-clock in ph-vexflow-view)

- Ruling: ExternalClock.now() is score-time seconds on the score's own tempo map (rate-independent position) — matches §4.3 "uses the score's own tempo"; sent to ivories plan writer — cost if wrong: notation drifts at non-1 tempo, fix in ivories adapter only.
- Ruling: accept plan decisions 1-9 (clock mode visual-only, forces playhead on, onSeek-only clicks) — all consistent with spec §4.3 — cost if wrong: small API follow-up in 0.2.x.
- Task 4: review e901c5e — Important (plan-mandated): vacuous onPlay assertion on reader A. Ruling: fix the test despite the brief — spec binding, test must pin Decision 7 — cost if wrong: none.
- Ruling: ivories <Notation> must pass a memoized (stable-identity) clock adapter to pepperscore — avoids per-render resubscribe churn — cost if wrong: perf only.
- Ruling: Task 5 changed apps/reader/package.json pin 0.1.1→0.2.0 so the demo links the workspace — necessary for build-based suites — cost if wrong: one-line revert.

## Ivories rulings

- Ruling: adopt every correction in preflight.md verbatim, carried per task in dispatch — each is the smallest fix and aligns with the spec — cost if wrong: rework of that item, visible in its task diff.
- Ruling: Task 2 Step 8 moves to Task 3 (moves keep 680; T3 → 681) — Global Constraint "moves keep count" outranks plan step placement — cost: none.
- Ruling: providers never retime self-loaded scores (T10) — spec R1/Clock-time constraint — cost if wrong: host tempo prop on self-loaded scores ignored.
- Ruling: provider audio default = AudioClock or no clock only (T15) — spec §3.1 — cost if wrong: ManualClock embeds silent by default.
- Ruling: R7 amended to primary slot only (T24) — matches task code/test, simpler — cost if wrong: secondary keys slot keeps its view on mode toggle.
- Ruling: AudioClock.dispose freezes position (T4 contract) — spec §3.1 "dispose stops timers" — cost: none.
- Ruling: library CSS wrapped in @layer ivories (T8) — host override-ability — cost if wrong: specificity surprises, easy revert.
- Ruling: T2 hashFile.test uses join(__dirname,'../../../../../local-fixtures/…') not fileURLToPath (jsdom throws on non-file URL) — same effect — cost: none.
- Ruling: CSS must live inside @layer ivories despite the brief's "append"; css-scope check extended to enforce — pre-flight layer ruling outranks append wording — cost: none. ALL later tasks touching style.css: insert inside the layer.
- Ruling: audio-unavailable never sets status.error for any cause (resume fail, no Web Audio, instrument load) — playback continues silently and Transport shows "tap to enable sound"; onError still fires — cost if wrong: no inline message for audio failure.
- Ruling: midi-unavailable has no inline message (onError only) — playback unaffected per spec §4.1; studio shows device state in its own MIDI settings (Task 18) — cost if wrong: embeds show no visual hint MIDI failed.
- Ruling: T18 does not call loader.setError on midi-unavailable (would leave an undismissable stage banner); state shown in the MIDI settings section instead — consistent with the T17 ruling — cost: none.
- Ruling: accept slotViewProps additive library prop on <Stage> (needed for primary-only onLayout) — cost: one extra documented prop (CARRY TO TASK 26 README).
- Ruling: on scene load, layout's primary view wins over a disagreeing saved mode — layout is the richer source of truth — cost if wrong: a hand-edited scene shows a different roll/keyboard than its mode field.
- Ruling: check-dist does not reject @layer (brief contradicted the single-layer ruling) — css-scope enforces the layer — cost: none.
- Ruling: no fallback min-height on .ivories-view (would break flex children/small PIP insets); README documents host must size the box; presets keep 12rem — cost if wrong: bare views in auto-height hosts render 0 tall until sized.
- Ruling: parseMidi uses namespace import with default fallback for @tonejs/midi (CJS under plain Node) — needed for dist to import in Node/SSR — cost: none.
- Ruling: Task 28 landed as two commits (library data-t, then e2e) despite one-commit constraint — logical split is clearer — cost: none.
- Ruling: one targeted follow-up fix for the regression introduced by the fix wave (not a second findings wave) — first-note drop is load-bearing for every embed — cost: one extra small commit + scoped re-review.

## Parked findings (real, deferred — triaged 'later' by the final review)

- Task 1: minor (deferred): root preview script dropped (use -w apps/studio)
- Task 2: minor (deferred): repeated consecutive ivories/core imports in studio files (merge later); ivories dep not alphabetical
- Task 3: minor (deferred): alias regex can false-fail on a later comment mentioning packages/ivories; dead pepperhornScope exemption; require/new URL/import.meta.glob not scanned
- Task 4: minor (deferred): load() not guarded after dispose; load() leaves silent time base undocumented; play() probes isRunning after dispose
- Task 5: minor (deferred): play() lead-in seekAt uses raw now while already playing (guard with !s.playing or baseNow); App readers (playheadAt(..., engine.currentTime)) assume AudioContext base — follow-up when a host drives the studio clock silently (Task 14 swaps the stage onto the provider — CARRY TO TASK 14: readers should use the clock's now()); beforeEach reset lacks rate:1; pause in lead-in emits pause+seek (stopAll twice, harmless)
- Task 6: minor (deferred): end-of-score pause+seek emits two events; silent-fallback originFor drifts and notes pile into suspended context (consider audioEnabled: () => engine.running); no focused test for bare pause→silence or setScore mid-play re-seat; retime window between seek event and [notes] rebuild; loadAnother redundant silence
- Task 7: minor (deferred): StageText BUNDLED_FAMILY comment references studio @fontsource dep
- Task 8: minor (deferred): StageText test name/comment still mention per-pitch ids; npm reformatted sideEffects/files arrays
- Task 9: minor (deferred): no "resumes at real size" test; Math.max(1,NaN) bypasses clamp; FrameLoop spreads Set per frame; throwing subscriber logs at 60Hz; raf=0 stub starts duplicate loops; "stops on the last" test exercises dispose not last-unsubscribe; heldScoreNotes voice find per note; keyOf test cast
- Task 10: minor (deferred): useClockTime keeps old clock time on clock change; onNoteOn time=startSec vs onNoteOff time=t inconsistent (document); untested hooks/withProvider/boundary/claim release; onReady refires per new controlled score object
- Task 11: minor (deferred): onLayout called before overlayRef update (host throw loops); per-frame rangeFromProp/theme spread allocations; no "resumes when sized" test; Guarded lacks className; default height 0 in auto-height parent (doc/min-height before embed docs — CARRY TO TASK 26)
- Task 11: minor (deferred): setFailed after reportError (host onError throw hides message); failed never resets on resubscribe
- Task 12: minor (deferred): no RED run (tests after code); untested: resume rejection → audio-unavailable, tap button hidden when running / click resumes, metronome toggle, minimal hides tempo/metronome, standalone Transport, height/className; needsTap reads non-reactive engine.running
- Task 13: minor (deferred): App.tsx lost trailing newline
- Task 14: minor (deferred): manual browser pass covered roll/keyboard/transport/load-another only — themes/labels/chord/metronome/tempo/scenes/debug covered by code trace; CARRY TO TASK 28 smoke (themes switch, labels on, tempo change mid-play); liveHead reads engine.currentTime (equivalent while studio clock is AudioClock(engine) without isRunning) — requirement on any task that swaps the studio clock: use transportClock().now()
- Task 15: minor (deferred): MediaClock.dispose can call el.play() via now()→cross() during pre-roll (fix before merge — final review); now() side effect + backward step at crossing; element native-control events ignored during pre-roll; crossing play() outside user gesture (iOS); host clock + audio + no Web Audio → originFor throws in setInterval; audioDead never resets on engine change; fixed 80ms negative waits
- Task 16: minor (deferred): start() catch rejects after stop() (StrictMode spurious midi-unavailable — gen check in catch; fix before merge); single pedalInput across devices; duplicated requestMIDIAccess/listing helpers; untested stop/setDevice release, retrigger, pedal-only unplug; same pitch from two devices overwrites owner
- Task 17: minor (deferred): per-frame allocations merging live+score maps & ChordFeed while keys held; engine-prop swap strands live notes; constant assertion in behaviour test; prepareLive failure silent
- Task 18: minor (deferred): midi-unavailable always "unavailable in this browser" (permission denial wording); hard-coded error colour; vanished deviceId shows orphan value; error not cleared on later success; redundant test setState; double blank line
- Task 19: minor (deferred): validFill returns untrimmed value; rgb( ) passes; named colours refused (UI must offer hex/transparent only — CARRY TO TASK 24); MASK shared mutable object
- Task 20: minor (deferred): o/o2 naming in decodeScene; TickleHost.decodeScene/shareSaved/update contracts lack "strip deviceIds" doc — CARRY TO PLUGIN WORK (out of this plan; note in finish report): TickleHost.decodeScene must bind { shared: true }, shareSaved/update must pass sceneForShare; rawHash test duplicates encoder; buildShareScene inline arrow
- Task 21: minor (deferred): reportError fires twice in dev StrictMode; no tests for two slots sharing a device, other device keeps running when one ends, deviceId change releases old stream
- Task 21: minor (deferred): no test for rejected pending acquire removal
- Task 22: minor (deferred): no direct-value ownTime test across tempo change; count-in not scaled under retimed tempo (comment); stale load error shown during retry; needs-musicxml not re-reported on MIDI→MIDI swap; no render-crash Guarded test
- Task 23: minor (deferred): crash test exercises Notation's own guard not Stage's slot guard; swap test uses mask not webcam (no-reacquire not directly proven); one-commit lag on uncontrolled resync; margin clamp relies on ingress (validLayout/reducer) — hand-built layout props unclamped
- Task 24: minor (deferred): Stage slotViewProps test weaker than comment; swap remounts WebcamControls (lease retaken, harmless); CountIn keyboardH placement inside split/pip slot unverified in browser (CARRY TO TASK 28)
- Task 24: minor (deferred): no test for no-keys-slot leaving mode alone
- Task 25: minor (deferred): zoom pass-through untested; falling/keyboard presets not asserted to omit notation wrapper
- Task 26: minor (deferred): parseMidi Midi const between imports; check-dist regex misses bare side-effect imports
- Task 27: minor (deferred): fixture ref callbacks ignore null (stale registry on unmount); unit test doesn't assert handle registration
- Task 28: minor (deferred): data-t written every frame even when unchanged; e2e-notation Ctrl-C leaves pepperscore in node_modules (SIGINT); count-in measure race; note-click locator guesses pepperscore DOM; tempo test can't distinguish restart; App finds count-in host via Stage class query
- Task 29: minor (deferred): all-zero-length recording returns empty score (should be null); repeated stop() returns stale score; throwing live listener stops others; untested held-note close/empty/unmount; startAudio recreated per render
- Parked (later): main fallback types-only (CJS require fails, ESM-only by design); PlaybackDriver.onClock→stopAll unguarded for duck-typed engines.

## Pepperscore parked findings

- Task 1: minor (deferred): nearest() dense one-liner; NaN nearSeconds returns first candidate; clock.mjs stale "Review Focus 4" comment; no tempo-change/pickup case in clock.mjs (covered T2); clock.ts doc should state score-tempo semantics
- Task 2: minor (deferred): clock-contract.mjs readiness loop falls through silently if Vite never starts; expected.json description "beat 1 of bar 3" ambiguous (means after first quarter, 7.5 s)
- Task 3: minor (deferred): seek-while-playing play(target) failure in catch leaves playing=true with no loop (add setPlaying(false)/stop when from!==undefined) — real bug, final review should fix
- Task 3: minor (deferred): seek while playing flickers loadingAudio; stopped seek past end currentTime() unclamped until timeline resolves; clock-embed lacks no-notice + no-steal assertions; only chromium run
- Task 4: minor (deferred): playhead effect deps omit playhead/clock (removing clock at runtime leaves clock paint); seekPending can stay set and scroll later; new adapter per render rebuilds subscription/rAF each render.
- Task 5: minor (deferred): reader app pins unpublished 0.2.0; CHANGELOG lacks transpose-with-clock line; README never states negative time = no playhead
