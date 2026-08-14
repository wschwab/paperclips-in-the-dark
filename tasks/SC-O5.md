---
id: SC-O5
title: "Clocks oracle and SPARK contract"
deps: [SC-C1, SC-C2, SC-R3]
track: contract
outputs:
  - conformance/suites/semantics/clocks.test.ts (NEW)
  - backend-ada/core/src/paperclips_core-clocks.ads (SPARK Post state — contract change; body NOT implemented)
  - Expected proof failure or failing core test recorded
acceptance:
  - Ownership, purpose, related IDs, bounded progress, accumulating rollover, reset with remaining overflow, embedded healing behavior, total clock listing, owner deletion policy covered
  - SPARK Post stated before implementation; expected proof failure recorded
  - Red against current source; existing unrelated conformance green
---

# SC-O5 — Clocks oracle and SPARK contract

## Target

Create `conformance/suites/semantics/clocks.test.ts` (NEW). Edit ONLY `backend-ada/core/src/paperclips_core-clocks.ads` (+ `.adb` ONLY if needed to keep it compiling — prefer contract-only changes: state the `Post` for the rollover-accumulation `Progress` and the reset semantics WITHOUT implementing the new behavior; if the body must change to compile, record that explicitly) — this is the one contract-owned SPARK edit of the wave. Do NOT touch other backend or contract files. Read-only elsewhere.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section "Clocks" and SC-O5 list; Wave 0 decisions W2, W4, W5, W6.
- `docs/pages/contract/wave0/clock-taxonomy.mdx` — taxonomy, DTO sketch, purpose list, owner-deletion (reassignment + `reassignedClockIds`), related-clock unlink-on-delete, rollover accumulation/reset semantics with the worked example and the SPARK `Post` sketch (§10.4).
- Frozen Wave 2 contract: clock schema (behavior/ownerKind/ownerId/purpose/relatedClockIds), clock ops (create/update/delete/progress/reset; clock-progress result family).
- `backend-ada/AGENTS.md` — gnatprove loop, `XDG_RUNTIME_DIR=/tmp`, project files.

## Changes (freeze these cases red)

`clocks.test.ts`:
- `CLOCK-OWNER-001` create with campaign ownership (empty ownerId) succeeds; `CLOCK-OWNER-002` character/crew ownerId must reference an existing entity of that kind (fails: no ownership validation).
- `CLOCK-OWNER-003` update changes owner; owner validation applies (fails).
- `CLOCK-PURPOSE-004` purpose validated against the settings ClockPurposes list (10 values); invalid → `VALIDATION` (fails).
- `CLOCK-BEHAVIOR-005` bounded clock: progress clamps at full, overflow discarded, rollover stays 0 (fails: clockKind rename absent).
- `CLOCK-ROLLOVER-006` rollover clock: two progress calls past full ACCUMULATE prior overflow (6th +1 on 4/4 keeps rollover 2 — FV-006 reproduction; fails: overwrite bug).
- `CLOCK-RESET-007` reset applies at most one clock size and retains remaining overflow (worked example from the taxonomy; fails).
- `CLOCK-TUG-008` negative (tug-of-war) progress consumes rollover first, preserving `rollover > 0 ⇒ segments = size` (fails).
- `CLOCK-RELATED-009` relatedClockIds validated: unique, not self, must exist; cycles allowed; healing clocks unreferenceable (fails).
- `CLOCK-UNLINK-010` deleting a clock removes its id from remaining clocks' relatedClockIds atomically (fails).
- `CLOCK-REASSIGN-011` deleting a character/crew reassigns its clocks to campaign (ownerKind campaign, ownerId ""), revisions bumped, `reassignedClockIds` in the result; no clock deleted (fails).
- `CLOCK-LIST-012` listClocks is total and lists all standalone clocks with the new row shape (fails).
- `CLOCK-HEALING-013` embedded healing clock behavior unchanged: not in /api/clocks, rollover healing via harm ops (guard).
- `CLOCK-RESULT-014` clock.progress result carries requested/effective/visibleApplied/overflowAdded (fails).
- `CLOCK-CREATE-015` create requires name/ownerKind/ownerId/purpose/behavior/size (fails against old request schema).

SPARK contract (contract-owned edit):
- State the `Post` for `Progress` (accumulation) and `Reset` (at most one size, retains remainder) in `paperclips_core-clocks.ads` per the taxonomy §10.4 sketch, WITHOUT implementing the behavior change. Run the changed-unit gnatprove (`(cd backend-ada/core && env XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -u paperclips_core-clocks.ads --level=2 --checks-as-errors=on)`) and RECORD the expected proof failure (the old body cannot satisfy the new Post). If the core test suite must compile, note the expected failing core test.

## Green (this card's own gate)

- New suite file exists with frozen case names; red cases fail for the documented reasons; guards pass.
- `(cd conformance && npm run test:ada -- --run suites/semantics/clocks.test.ts)` shows the red set.
- SPARK Post stated in the .ads; the gnatprove run output recorded (expected failure documented); no other backend files changed.

Report exact commands and outputs.

## Metrics

`tasks/metrics/contract/SC-O5.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
