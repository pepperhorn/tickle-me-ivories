# 0002 — More realistic Tele artwork

- **Status:** draft
- **Ledger:** 0002 · **Plan:** ../plans/0002-realistic-tele-artwork.md
- **Author:** lead · **Date:** 2026-10-26

## Problem

The owner finds the current guitar too schematic and requests a more realistic
appearance. The present Tele has an oversized headstock, an untapered neck, and
an artificial body join at the end of either a 12- or 24-fret display. The
requested headstock and upper body need to read as one instrument.

## Design study

[Interactive SVG study](../prototypes/realistic-tele.html) explores a slimmer
headstock, a tapered maple neck, the visible single-cutaway body, subtle wood
grain, lacquer shading, metallic frets, individually routed strings, tuner
bushings, neck pickup, bridge and control hardware. It is a standalone design
document, not a replacement for the live app. Its notes are an illustrative
C-major grip with functional Note/Fret and neck-detail controls.

Reference: [Fender Standard Telecaster](https://www.fender.com/products/standard-telecaster/),
including its front-view product photo and specifications (648 mm scale, 42.86
mm nut, 21 frets for this model), consulted 2026-10-26. The vector paths are an
original approximation, not a traced image or a claim of manufacturing accuracy.

## Goals

- Recognisable Tele proportions before adding material effects.
- Independent CSS skinning for finish, wood, pickguard, metal and note overlays.
- A physical neck that does not shorten to fret 12 when the teaching range does.
- Readable circular note/fret labels through a focused neck view when needed.
- Lightweight, deterministic SVG materials; no per-frame random texture work.

## Non-goals

Photographic textures, trademark logos, bass redesign, additional instruments,
arrangement algorithms, changes to source pitches or audio, and publishing the
existing WIP without review.

## User-visible behaviour

Tele remains a selectable skin within the fretboard view. The instrument
overview shows headstock and body; the neck-detail view enlarges playable
positions. The active teaching fret range controls note placement/highlights,
not instrument body location. Non-active physical frets remain subdued.

At narrow widths, the overview prioritises recognising the instrument; a neck
detail view provides readable labels rather than shrinking text with the entire
instrument. The study hides tiny labels in mobile overview. The production
zoom/pan behaviour must be specified before implementation.

## Constraints

Keep score/live clock integration, label toggle, exact-pitch assignment,
scene round-tripping, current API compatibility, and B-flat spelling rules.
Preserve existing silhouettes until separately redesigned. SVG resources must
be uniquely scoped per instance for split views. The study's colours are CSS
variables; production must use the library's scoped token conventions.

## Acceptance criteria

- [ ] AC1 — Desktop overview shows a proportionate Tele headstock and upper body.
- [ ] AC2 — Neck widens towards the body; strings, frets and notes use its geometry.
- [ ] AC3 — Nut, individual posts, string routing, neck pickup and single cutaway read clearly.
- [ ] AC4 — Selecting 12 frets does not relocate the body to fret 12.
- [ ] AC5 — Finish, wood, pickguard and metal can be restyled independently with CSS.
- [ ] AC6 — Note/Fret labels remain readable in neck detail and respect pitch spelling.
- [ ] AC7 — Scene, live notes, seeks, other skins and multiple SVG instances still work.
- [ ] AC8 — Desktop and phone visual inspection passes, with no page overflow or obscured controls.

## Open questions

- User acceptance of this design direction is pending.
- Decide zoom/pan persistence and crop behaviour for neck detail in the live app.
- The physical Tele study uses 21 frets; decide how the generic 24-fret option
  should work without implying a standard 21-fret Tele physically has 24 frets.
- Resolve the implementation base from orch/0001-fretboard-baseline (item 0001)
  before dispatch; approval to commit the setup and preserve WIP was given on
  2026-10-26, but neither the realism spec nor artwork has final acceptance yet.
