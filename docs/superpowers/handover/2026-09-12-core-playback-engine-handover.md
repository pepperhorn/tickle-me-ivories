# Core Playback Engine — Build Handover

**Branch:** `feat/core-playback-engine` · 21 commits from `d8f19f6`
**State:** 94 tests passing, `npm run build` clean, geometry oracle passing.
**Plan:** `docs/superpowers/plans/2026-09-12-core-playback-engine.md` (plan 1 of 4)

This records decisions taken during the build that are not recoverable from
the diff, plus constraints the next plan must not rediscover the hard way.

## Carry forward to plan 2

Task 7: CARRY TO PLAN 2 — do NOT build the per-voice volume slider on top of the velocity fold. On a velocity-layered sampled piano, velocity selects the sample LAYER, so folding volume into it changes timbre, not just level: turning a voice down would make it sound gently struck rather than quieter. Real mechanism: smplr instruments expose `output: OutputChannel` with its own volume, but the engine caches instruments by instrument id, so two voices sharing the grand piano cannot have independent output volume without either per-voice instrument instances or a per-voice GainNode insert (smplr has addInsert). Decide that when the volume UI is actually built.
- when the BPM control is wired, setTempo must pair with engine.stopAll() the way seek and pause already do in App.tsx, or notes already handed to smplr at old times keep sounding across the change.
- LOOKAHEAD_SEC (0.15) must stay below smplr's internal 200ms scheduler lookahead. Below it, every note we hand over becomes a live voice almost immediately, which is WHY engine.stopAll() cancels pending notes on seek/pause. Raise it past 200ms and stopAll() silently stops cancelling.
- a piano track plus a channel-10 percussion track yields played.length===2, so no hand split AND the drums become a coloured voice on a grand piano sample.

## Parked findings (real, deferred, not defects)

- **Task 1:** package-lock.json name still "tmi-scaffold" vs package.json "tickle-me-ivorys" — will cause spurious lockfile churn on next npm install
- **Task 1:** oxlint script/devDep retained from template without .oxlintrc.json — `npm run lint` exists but is unconfigured
- **Task 2:** unshift of default tempo breaks sort if input has negative ticks (not reachable from MIDI/MusicXML data)
- **Task 2:** scale:0 unguarded -> Infinity. NOTE for plan 2: the BPM slider must keep its 25% minimum, or add a guard.
- **Task 2:** segmentAtTicks/segmentAtSec are linear scans (correct at tempo-map scale; the binary-search requirement is for notes, not tempoMap)
- **Task 3:** geometry.test.ts boundaries() helper re-derives the same wi-accumulation as production, so a SHARED indexing bug across geometry.ts/geometry.test.ts/geometry-check.mjs would slip all three. Reviewer ruled it correct by hand trace. Worth fixing in the final wave: compute expected boundaries from key widths read off l.keys instead. FLAG FOR FINAL REVIEW.
- **Task 5:** hashFile.ts has no dedicated test (thin crypto.subtle wrapper, out of brief scope)
- **Task 5:** hand-split branch has no test asserting the two hand voices get distinct hues (multi-track branch does)
- **Task 5:** no test for a fully empty MIDI file (zero pitched tracks); degrades gracefully by inspection
- **Task 7:** NaN velocity would pass through foldVelocity unguarded (upstream data assumed valid; not this file's contract)
- **Task 8:** draw-function tests assert only relative call counts, never that a bar's fill colour matches noteColor(hue,velocity). Geometry/colour correctness is verified by reading, not by test. Inherent to the brief's smoke-test approach. FLAG FOR FINAL REVIEW.
- **Task 9:** the original scale-mode musical-position test is retained but remains unable to distinguish tick-based from seconds-ratio conversion; the new absolute-mode test is the one that proves the mechanism.
- **Task 10:** no affordance to load a second file without a page reload — FileDropZone only renders when no score is loaded. Structural, belongs to plan 2's file/session work. FLAG FOR FINAL REVIEW.
- **Task 10:** toggle() is async and unguarded against double-click before the first engine.resume() settles. Low likelihood, pre-first-resume only.
- **Task 10:** `git add -A` in the brief's commit step swept my plan-file edits into the feature commit. Transparent in the report; a narrower git add in future plans would avoid it.

## Decisions taken during the build

### Pre-flight
feature branch in place, not a separate worktree — brand-new repo, no
### Pre-flight
CONFLICT 1 — T10 renders keyboard mode by setting `fallSeconds: 0.001`,
### Pre-flight
CONFLICT 2 — T10's draw callback calls setPlayhead every frame, which
### Pre-flight
CONFLICT 3 — `npm create vite@latest .` prompts "directory not empty"
### Task 5
the implementer correctly found that my plan's code failed its own "drops empty tracks" test, but fixed it the wrong way. Spec 6.1 says hand-split applies when the file has "exactly one PITCHED track" = played.length===1. Gating on raw midi.tracks.length breaks the commonest real-world shape: a Type 1 MIDI with a conductor track (tempo/meta, no notes) + one piano track has tracks.length===2, so hands would never split and the roll would be monochrome. The real defect was my TEST, which conflated "empty tracks don't become voices" with the hand-split rule. Decided: restore played.length===1, rewrite the test to use TWO real tracks + one empty (tests the stated intent without colliding), and ADD a conductor-track regression test. Cost if wrong: hand-split fires on a file the user wanted kept as one voice — visible immediately and adjustable in plan 2's voice UI.
### Task 6
the implementation is right and my test #5 was wrong. It asserted collect(4.9) returns [] when note 4 starts at 5.0 — but 5.0 is inside the 150ms lookahead from 4.9, so collecting it is exactly what a lookahead scheduler must do. Making the implementation match that assertion would require "only collect notes that have already started", which destroys the lookahead and contradicts test #1. Verified tests 1,2,3,4,6,7 all hold against the given implementation; only #5 is defective. Decided: fix the test — collect(4.9) returns [4] (notes 0-3, already passed, are correctly skipped, which is what the test name actually claims), and the follow-up collect(5.0) returns [] because note 4 was already consumed. Cost if wrong: none; the corrected test asserts the documented behaviour and the other six tests independently pin the same semantics.
### Task 7
verified all three API claims against node_modules/smplr/dist/index.d.ts myself — all correct (SplendidGrandPiano is `declare const ... InstrumentFactory`, `.load` is marked @deprecated in favour of `.ready`, and smplr's NoteEvent has no gain/volume field; the `volume` in the typedefs is on internal VoiceParams, not the public start() event). Accepting the fold of voice.volume into velocity FOR THIS PLAN: every voice is created at volume 1.0 and no volume UI exists until plan 2, so velocity*1.0 === velocity and the code is exactly correct today. Building a GainNode architecture now would be implementing plan 2's feature. Cost if wrong: none in plan 1.
### Task 7
the retry stands and must be implemented. The implementer dropped it reading the brief's interface bullets as authoritative over its prose, but the plan's Global Constraints and spec §11 both mandate "retry once, then fall back". The concrete cost of omitting it: one dropped network request for a soundfont permanently downgrades that voice to piano for the whole session, when a retry would likely have succeeded. Cost if wrong: one extra failed request on a genuinely missing instrument, ~1 round-trip of delay.
### Task 7
ALSO folding one Minor into this fix round, against the usual rule that minors defer. engine.ts is the only file in this plan with zero automated tests, and the reviewer identified two pure calculations inside play() (the never-schedule-in-the-past clamp, and the velocity fold) that are unit-testable in jsdom once extracted. Extracting them buys real coverage of two stated guarantees at near-zero cost, in the one place with no test net. Cost if wrong: two tiny exported functions that are slightly more API surface than strictly needed.
### Task 8
the flagged error is REAL and worse than "unrelated" — `npm run build` (tsc -b && vite build) has been FAILING since Task 6 and three task reviews missed it. Two defects, both mine:
### Task 8
finding confirmed and MORE reachable than the reviewer realised. A whole note at 60bpm in 4/4 is already 4s; tied across a bar, 8s. Decisively: the master tempo control's range is 25-300%, so at its 25% minimum ANY note longer than 2 seconds at notated tempo exceeds the 8s cutoff. This would show as notes silently un-lighting mid-hold exactly when a user slows a piece down to study it — the worst possible time. Decided: replace the fixed cutoff with the score's actual longest note duration, carried on RenderState as maxNoteDur and computed once per score/retime. Rejected the alternative of simply raising the constant: any fixed number is wrong for some score, and the correct value is already cheap to compute. Cost if wrong: one extra number threaded through RenderState.
### Task 9
the loadScore/tempo reconciliation gap is real. It is currently LATENT — Task 10's loader calls parseMidi(bytes, name, getState().tempo), so the incoming score is already timed to the live setting — but the store guarantees nothing, Task 10 is not written yet, and nothing tests it. Decided: make loadScore retime the incoming score to the current tempo rather than resetting tempo to default. Retiming is idempotent when the caller already timed it correctly, so it costs one cheap call and makes the store correct by construction regardless of caller. Resetting tempo instead would silently discard a user's tempo choice on every file load. Cost if wrong: one redundant retimeScore per load.
### Task 9
folding the Minor in too. The reviewer showed the "preserves musical position" test cannot distinguish tick-based conversion from naive seconds-ratio scaling, because its fixture has a single-tempo map. I checked further and it is worse than stated: in SCALE mode the two are mathematically identical for ANY tempo map, since ticksToSec divides uniformly by scale. Only an ABSOLUTE-mode transition distinguishes them, because that flattens the map. So the test for this plan's subtlest logic proves nothing about the mechanism it exists to verify. Cost if wrong: one extra test.
### Task 10
fixing the Important (aria-label on the scrub) plus three cheap minors in one round, rather than deferring them to the final review. A round is needed anyway for the accessibility gap, so the marginal cost of the other three is zero, and each is a real defect rather than taste: (1) the per-frame Map allocation is literally what the draw-loop purity check was checking for, 60 allocations/sec for data that changes only on score load; (2) the error message says "Could not read <file>" after a successful parse when instrument loading fails, so the message contradicts the visibly-loaded score; (3) mmss() is a pure formatter in a file with no tests at all. Cost if wrong: a slightly larger fix diff before the final review.
### Pre-flight
dispatching ONE fix wave covering the 2 named fixes plus 11 cheap findings. Included three items that are judgement calls beyond strict necessity, flagged for the user to reverse:
### Pre-flight
deferring finding 5 (setTempo has no engine.stopAll counterpart) to plan 2 rather than fixing blind — there is no tempo UI in this plan, so the path is unreachable and untestable here. Recorded below as a carry-forward so plan 2 does not rediscover it.
### Pre-flight
four residual test-coverage gaps parked rather than triggering a second fix wave, which the process does not allow and which they do not warrant — all four are missing tests over code the reviewer verified by reading, not suspected defects. Parked: (1) end-of-playback stop untested, the most behaviourally significant, though its pause math was hand-verified; (2) clearScore untested; (3) the seek clamp contract untested at the useTransport level; (4) the C4 label's 14px threshold untested, in a file with no render tests at all. Cost if wrong: a regression in one of these four would not be caught by CI. All are cheap to add and belong in plan 2's test pass.
