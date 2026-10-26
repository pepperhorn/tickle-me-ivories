# Docs index

| Folder | Purpose |
|---|---|
| [specs/](specs/) | What and why: problem, goals, non-goals, acceptance criteria |
| [plans/](plans/) | How: a task breakdown with file ownership and dependencies |
| [handoffs/](handoffs/) | Shared understanding passed between agents ("hand over" / "handoff to") |
| [decisions/](decisions/) | ADRs: decisions that shouldn't be argued again |
| [wip/LEDGER.md](wip/LEDGER.md) | **The WIP ledger**: every in-flight item, its status, branch, and worktree |

Work-item IDs (`NNNN`) and task keys (`K` = `NNNN` or `NNNN-tN`) come from the ledger and appear in every related filename and branch. ADRs have their own numbering.

## Existing project material

The existing [specs](superpowers/specs/), [plans](superpowers/plans/),
[handovers](superpowers/handover/), and [research](superpowers/research/)
remain in place. New numbered work uses the folders above and links to existing
material as needed.

Start with [the operating manual](../AGENTS.md), then the ledger. Before
dispatching into a fresh checkout, read [worktree setup](worktree-setup.md).
The library's [README](../packages/ivories/README.md) documents public APIs and CSS.

## Orchestration adoption — 2026-10-26

The owner approved committing/pushing the workflow setup on 2026-10-26. The
pre-existing fretboard work is recorded as item 0001 and is preserved separately
on orch/0001-fretboard-baseline; feature code stays out of the docs-only master
commits. No new agent worktrees have been launched by initialization.

Describe a feature to the lead (Codex or Opus), agree the numbered spec and plan,
then run `orch-dispatch NNNN`. Implementation runs in isolated worktrees and
opens draft PRs; the other model family reviews before the lead merges.
Saying "hand over" or "handoff to" produces a self-contained committed doc in
handoffs. Everyone reads GBrain; the lead maintains project writeback.
