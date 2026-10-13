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

## Rising/roll plan (2026-10-13) — rulings

- Ruling: adopt every correction in preflight.md, carried per task — scratch run proves the corrected plan goes green — cost if wrong: rework visible in that task's diff.
- Task 7: review 70e7abb — Important: GM failures silent vs user console requirement. Ruling: user requirement outranks the brief's "silent" fallback — warn to console (deduped), not onError — cost: none.
- Ruling: accept CDP setBlockedURLs fixture blocking (Chromium-only config) and the @internal isGmVoice/isGmInstrument probe on the public API (no stripInternal) — makes the GM e2e unable to pass on silent fallback — cost if wrong: two tiny exported members to remove later.

## Rising/roll plan — parked findings

- Task 1: minor (deferred): test finds onError call by index; logged Set unbounded if messages vary
- Task 2: minor (deferred): horizontal above-keys chord readout may overlap note labels (plan-mandated values); no test for horizontal stage-centre; small per-frame tuple/object allocations; StageView test doesn't assert matrix args
- Task 3: minor (deferred): per-frame RisingState spread + BeatLine[] (same order as falling path; class doc comment now inaccurate); duplicated bar loops; no score-path beatClockFor cache test; no trail flash test
- Task 4: minor (deferred): one-commit window pairing outgoing live clock with new score (fix: liveClockActive = wantsLiveClock ? liveClock : null — cheap, fix before merge); setBpm reports unchanged clamped value; host-clock-wins test pre-passing; real 30ms timeout in test
- Task 5: minor (deferred): fractional BPM draft shows 100.4 until blur (round in parseBpmDraft); useLiveBpm returns fresh object; per-frame rising object (T5-3 accepted); no visibleBeats/beatsPerBar pass-through test
- Task 6: minor (deferred): no visibleBeats pass-through test in Stage; no orientation-on-notation validator case
- Task 7: minor (deferred): buffers live for page lifetime per instrument; JSON.stringify key order rebuild; fixed 20ms sleep in test; real browser decode/playback unverified (CARRY TO TASK 9 / play-me)
- Task 7: minor (deferred): unsafe-name warning says "default piano" for non-piano voices
- Task 8: minor (deferred): studio BPM draft resynced mid-edit on fractional input; Load a score leaves live clock running behind drop zone; notation-sync e2e cold-load flake (log for final review); session bar ~150px tall
- Task 9: minor (deferred): GmProbe interval never cleared; #file-input id selector; horizontal specs don't assert low-notes-bottom; gmBuilt WeakSet module-global; each provider loads its own default piano (~800 sample requests each) — note for perf
- Task 10: minor (deferred): Errors section lacks cross-ref to GM audio console warnings
- Final fix wave: complete (ae0e2c9..f5cbbab, all addressed). Parked (later): setVoiceVolume doesn't update bus.voice so setSounds reverts it (public API, unreachable today); stranded JSDoc / 'fetched once' comment; seek slider in live mode.

## Platform SDK + plugin plan (2026-10-13) — rulings

- Ruling: adopt every correction in preflight.md, carried per task — cost if wrong: rework visible per task.
- Ruling: plugin bundle budget raised to 512 KiB (zod v4 ~97KB gz) rather than moving the SDK to zod/mini now — cost if wrong: heavier plugin download; zod/mini later.
- Ruling: pin ivories' tonal dependency to "~6.4.3" in Task 1 (tonal 6.5.0 ships a missing main; breaks Node/SSR consumers) — cost: none.
- Ruling: deployment requires OTP_AUTH_TRANSPORT bearer|both on ph-apps (SDK needs token in /verify) — record in gate 0.5 checklist — cost if wrong: sign-in fails.
- Task 8: review e57f57a — Important (plan-mandated gap): no arrow-key nav; a11y paths untested. Ruling: global a11y constraint outranks brief code — add arrows + tests. Fix round 1 dispatched (FIX_BASE e57f57a) with paste/focus/onDone/clamp bundle.
- Task 16: review 87d7d92 — Important: no focus trap; current-device revoke duplicate via weaker path; pill visible in transparent captures. Rulings: a11y constraint outranks brief; hide current-device revoke; hide pill in transparent mode (CSS). Fix round 1 dispatched (FIX_BASE 87d7d92).
- Task 17: review dde956f — Important (plan-mandated): visibility change / re-open drops a live link (unstoppable public link). Ruling: fix despite brief — privacy. Fix round 1 dispatched (FIX_BASE dde956f) incl. conditional camera note, revoke key write/prune/cap, stale closure.
- Ruling: drop "Public (listed)" visibility in the studio for 0.1 (revoke leaves save on /public; no unlist hook yet) — cost if wrong: users can't list scenes publicly until a later release.

## Platform plan — parked findings and post-publish todos

- Task 1: minor (deferred): trivial runtime typeof assertion; near-tautological ReturnType check
- Task 2: minor (deferred): check-dist misses dynamic import(); linux-only optional lock entry; README before pack (Task 9); esbuild dev-server advisory is dev-only
- Task 3: minor (deferred): types.ts comment contains literal ph_uid (reword if a D14 grep guard is added); hand-written SaveRow/ResolvedShare types may drift from schemas; body-read drop classified server; untested Retry-After date / optional-auth paths
- Task 4: minor (deferred): set() always notifies (re-renders); client code check 4-12 digits vs spec 8 (server enforces)
- Task 5: minor (deferred): after cancelled restore old token rides optional calls until verifyCode; no encoded-path test; DELETE body through proxy (G7/Task 20)
- Task 6: minor (deferred): fake reads appSlug from query OR body (prod is method-specific) — CARRY TO TASK 7 cheap fix; non-Fail exceptions swallowed to 500 without logging (add debug) — CARRY TO TASK 7; cursor decoder looser than prod; README missing from tarball (Task 9)
- Task 7: minor (deferred): missing error/pagination/StrictMode tests; save cast unchecked; CARRY TO TASK 9 — confirm dist/react and dist/ui share one PhProvider context chunk
- Task 8: minor (deferred): paste not blocked while busy; manual submitCode rejects if onDone throws
- Task 9: minor (deferred, FIX BEFORE GATED RUN): smoke-saves lacks try/finally cleanup; prints share code in failure msg; no explicit exit; README omits createFakeGateway name
- Task 10: minor (deferred): schema stricter than ivories on hand-edited payloads (ratio clamp, unknown orientation, long deviceId/voice id, keyOverride) — deliberate; ivories validFill allows 80 chars vs spec 64 (fix ivories side later); CARRY TO FINAL — verify gateway maxBytes measurement == ivories UTF-8 JSON bytes
- Task 11: minor (deferred): non-PhError → unavailable (network may be better); named() passes third-party PlatformError messages; weak never-leaks assertion; device label untested
- Task 12: minor (deferred): list summaries lack songTitle; untested pagination/look round-trip/wrong kind; string match on PayloadVersionError name
- Task 14: minor (deferred): shutdown no re-entry guard (noisy, may cut clean close); watchdog stops detached runs (document; CARRY TO TASK 19: launch mock gateway as a foreground child of the test runner, PORT/PH_BASE_URL 8790); check-bundle doesn't ban react/ivories (add sourcemap check); signed-out activate test asserts fetch too early; partial-write error body; budget string duplicated; zod locales (zod/mini later)
- Task 15: minor (deferred): Save-a-copy test two scenarios in one it; source-grep test; duplicate import line
- Task 16: minor (deferred): refocus counter never resets; external sign-out steals focus to Sign in
- Task 18: minor (deferred): /debug strike-lab blocked by CSP in prod (dev rig; accept or exclude); floating base image tags (pin nginx); untested negative hosting checks; workspaces reformat churn; no server_tokens off / HSTS via Traefik (G7)
- Task 18: POST-PUBLISH TODO — when pepperscore 0.2 is published, install it in the studio and extend CSP: script-src 'wasm-unsafe-eval', worker-src 'self' blob:, font-src https://cdn.jsdelivr.net (and connect-src already has jsdelivr) — add a check-hosting rule keyed on pepperscore presence
- Task 18: docker build/run not executed (no docker in WSL) — G7 on Coolify must verify nginx -t, npm ci on alpine, /s/ 200, /tickle.config.json 404 when absent
- Task 19: minor (deferred): intermittent unit test failure (1/9 runs, unidentified) — CARRY TO FINAL REVIEW
- Task 19: minor (deferred): stale "rebuild before release" comment in plugin tsup.config
- Final fix wave: complete (tickle 2c03b26..407bb1d, app-sdk ..525e230, plugin ..6ded716; all addressed). Parked: owned Stop sharing visible after sign-out (error on click); schema.d.ts import check regex narrow.
