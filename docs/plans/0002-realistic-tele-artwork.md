# Plan 0002 — More realistic Tele artwork

- **Status:** draft, not dispatched
- **Spec:** ../specs/0002-realistic-tele-artwork.md
- **Required implementation base:** orch/0001-fretboard-baseline (resolve its SHA when dispatching); master alone does not contain the fretboard implementation
- **Verification:** npm run lint && npm test && npm run check && npm run build, plus visual checks

## Approach

Settle the spec's open questions and agree the visual study before implementing.
The owner authorised committing the setup and preserving existing fretboard WIP
(item 0001) on orch/0001-fretboard-baseline. Review that baseline before merging.
Do not dispatch a
worktree expecting these uncommitted files to be copied automatically. Follow
the local PepperScore archive preflight in ../worktree-setup.md.

## Tasks

### T1 — Integrate realistic Tele geometry and material tokens

- **Depends on:** committed/reviewed fretboard baseline and approved spec
- **Route:** implement (default); GPT-6.1 Sol high per approved routing
- **Owns:** packages/ivories/src/react/views/teleArtwork.ts,
  packages/ivories/src/react/views/Fretboard.tsx,
  packages/ivories/src/react/views/Fretboard.test.tsx,
  packages/ivories/src/style.css,
  packages/ivories/src/core/fretboard/types.ts,
  packages/ivories/src/core/layout/validate.ts,
  packages/ivories/src/core/platform/sceneV2.test.ts,
  apps/studio/src/studio/LayoutToolbar.tsx,
  apps/studio/src/studio/LayoutToolbar.test.tsx,
  packages/ivories/README.md, and this task's handoff files
- **May read:** all repository source and the design study
- **Acceptance:** AC1–AC8 after the spec's open questions are resolved
- **Verify:** default gate plus browser inspection of desktop/phone, label toggle,
  all instrument skins, open-string notes, 12/24-fret behaviour, live-note release,
  and forward/backward seeking
- **Notes:** separate physical instrument geometry from teaching-range bounds;
  generate wood detail once, not during playback; never use a photographed
  neck image under interactive note circles

## Review and merge

ClaudeCRF Opus high reviews the implementation PR under the approved routing.
If rate limited, report it; do not silently change an explicitly requested
provider. No PR, worktree, dispatch or merge is authorised by this draft alone.

## Risks

Life-like proportions leave less room for labels. The focus view must solve
this without distorting the instrument or placing notes off their string.
Hardware and texture must not obscure the educational overlay. Scope remains
visual; fingering/arrangement rules stay separate.
