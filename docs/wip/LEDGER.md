# WIP Ledger

> Single writer: the **lead**, on the main branch only. Implementers report status through their return handoff.
> Status: proposed · specced · planned · dispatched · in-review · changes-requested · ready · merged · closed · blocked · parked

Next ID: 0003

## Active

| K | Title | Status | Owner (provider/model) | Branch | PR | Worktree | T3 task/thread | Spec | Plan | Latest handoff | Updated |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0001 | Guitar/bass fretboard template and Tele artwork (existing WIP) | in-review | lead / Codex; earlier Astra and ClaudeCRF work | orch/0001-fretboard-baseline | [draft #5](https://github.com/pepperhorn/tickle-me-ivories/pull/5) | /home/shaun/tickle-me-ivorys | prior shared-checkout tasks ended; no active dispatch | [existing design](../superpowers/specs/2026-10-26-fretted-instrument-views-design.md) | — | — | 2026-10-26 |
| 0002 | More realistic Tele artwork | proposed | lead / Codex (design) | master (docs only) | — | /home/shaun/tickle-me-ivorys | — | [spec](../specs/0002-realistic-tele-artwork.md) | [draft plan](../plans/0002-realistic-tele-artwork.md) | — | 2026-10-26 |

Item 0001 tracks work that predates orchestration. The visual template, CSS
skins, scene integration, B-flat preference, and partial ClaudeCRF Tele artwork
with lead CSS integration are preserved on orch/0001-fretboard-baseline at
9591a659cb3b39c92af26b4a6045206c485d31dd and pushed as draft PR #5. No new
orchestration implementation plan exists for this inherited baseline. The earlier visual-template proposal and unfinished arrangement
design are separate scopes; do not treat this ledger row as implementation
approval for the arrangement optimiser. Final artwork acceptance is pending.
The owner authorised preserving the existing WIP as a feature-branch baseline
on 2026-10-26. Review it before merging; it has not become approved artwork or
a merged release. Future worktrees that need it must start from this branch's
commit or a later merged baseline, rather than master alone.

PR #5 is a work-in-progress preservation PR. It has not received cross-model
review or final visual acceptance; do not merge until those gates are met.

## Done / closed

| K | Title | PR | Merged | Notes |
|---|---|---|---|---|

## Log
<!-- One line per status change, newest first: YYYY-MM-DD NNNN old→new — note -->
2026-10-26 0001 proposed→in-review — Owner requested WIP PR; branch pushed and draft #5 opened at 9591a65, linked to T3. Review not yet dispatched.
2026-10-26 0001 proposed→proposed — Owner authorised baseline commit on orch/0001-fretboard-baseline; no code pushed to master or PR opened by this preservation step.
2026-10-26 0002 —→proposed — Original SVG design study and draft spec/plan prepared after request for realism; live app unchanged, no implementation dispatched.
2026-10-26 0001 —→proposed — Adopted existing uncommitted fretboard WIP for tracking; not dispatched or approved through the new workflow.
