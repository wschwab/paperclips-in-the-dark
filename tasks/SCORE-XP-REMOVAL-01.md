---
id: SCORE-XP-REMOVAL-01
title: Remove the regular sheet's Score XP section and End downtime button (superseded)
deps:
  - GAME-MODE-03
track: frontend
status: superseded
---

# SCORE-XP-REMOVAL-01 — superseded by XP-TRACKER-02..04

**Disposition: closed as superseded.** This card did not implement the removal.
Its capability and frozen-journey blockers were resolved by the human-approved
XP Tracker contract/backend/frontend sequence, not by dropping the session
expression capability. It is no longer blocked or awaiting decisions.

## Delivered replacement

- `tasks/XP-TRACKER-02.md` declares `characterXpResolve` / `xp.resolve`: explicit
  GM-confirmed XP split across Playbook, Insight, Prowess and Resolve, with the
  three session expression counters cleared only on successful completion.
- `tasks/XP-TRACKER-03.md` implements validation and atomic award/clear with one
  revisioned write and snapshot. Track room and allocation totals are checked
  before mutation. Full frontend reachability lands with XP-TRACKER-04.
- `tasks/XP-TRACKER-04.md` removes the old Talents Score XP subsection, its End
  downtime button, the obsolete client helper/options and detail-page handler
  wiring. The Score-only XP Tracker retains the three expression controls and
  desperate-action XP assistance; Resolution provides allocation/completion.
  Permanent playbook and attribute XP tracks stay in Talents.

The API operations `end-downtime` and `session.set` remain. In particular, the
contract's optional `clearSessionExpressions` is retained for API callers;
removing the UI button is not removal of that backend capability.

## Human-approved frozen amendments

XP-TRACKER-04 records the exact before/after changes: the lifecycle journey's
End downtime click and `end-downtime-ok` checkpoint were replaced by zero-total
Scoundrel XP completion through `/ops/xp.resolve` and
`scoundrel-xp-completed`. Stress selectors were scoped to the character sheet
so the new tracker is not mistaken for the stress meter. Human parity no longer
requires an End downtime UI control; `characterXpResolve` remains reachable.

## Acceptance citation

`tasks/XP-TRACKER-04.md` records the final Sol 6.1 round-4 **PASS at `6cc54859`**,
with real-Ada award, request, focus and parity evidence and final integration
gates. Earlier review failures in that card were fixed and superseded. This
cleanup adds no independent implementation or verification claim.

## Historical reason for the stop

At this card's original investigation, the regular-sheet Score XP block was the
only UI for the three session expression tracks and the End downtime clear.
Game mode showed the XP condition but did not cover those controls; the frozen
lifecycle journey clicked the old button. Removing the block then would have
lost capability and invalidated the journey. Those observations explain the
historical blocked status, but are not current gaps after XP-TRACKER-02..04.
