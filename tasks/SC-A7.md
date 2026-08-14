---
id: SC-A7
title: "Clock core and API"
deps: [SC-A5, SC-C1, SC-C2, SC-O5, SC-R3]
track: ada
outputs:
  - backend-ada/core/src/paperclips_core-clocks.ads/.adb (proven rollover accumulation + reset; ownership/purpose metadata)
  - backend-ada/server/src/pitd_callback.adb (clock API: create/update/delete/progress/reset, ownership validation, reassignment, unlink)
acceptance:
  - O5 clock cases green (ownership, purpose, related IDs, bounded, accumulation, reset remainder, tug-of-war, unlink, reassignment, total listing, result family)
  - Changed SPARK units prove at the required level; healing clock behavior unchanged
---

# SC-A7 — Clock core and API

## Target

Edit: `backend-ada/core/src/paperclips_core-clocks.ads/.adb` (the SPARK `Post` is already stated by SC-O5 — implement to satisfy it), `backend-ada/core/tests/core_tests.adb` (new core tests), `backend-ada/server/src/pitd_callback.adb` (+ `.ads`). Do NOT edit `contract/` or `conformance/`.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section "Clocks"; SC-A7; Q23/Q24; W2-W6.
- `docs/pages/contract/wave0/clock-taxonomy.mdx` — semantics §10 (accumulation, at-most-one-size reset, tug-of-war rollover-first, invariant `rollover > 0 ⇒ segments = size`), the SPARK Post sketch §10.4, ownership validation §5, reassignment §8, unlink §9, purpose list §7.
- Frozen contract: clock schema + clock ops (create requires name/ownerKind/ownerId/purpose/behavior/size; clock.progress 4-field family; clock.reset; delete unlink; owner-delete reassignment with reassignedClockIds sideEffects).
- Frozen oracle: `clocks.test.ts`.
- `backend-ada/AGENTS.md` — gnatprove loop; the existing `paperclips_core-clocks.ads` Post stated by SC-O5 (read the current file).

## Changes

1. Core: implement `Progress` accumulation (new overflow adds to existing rollover; Q24) and `Reset` (applies at most one clock size, retains remainder) satisfying the SC-O5 `Post`; signed progress consumes rollover first for negative deltas (W6); bounded clocks keep overflow 0. Prove the unit at level 2.
2. Healing clock: behavior unchanged — embedded rollover healing monitor state; NOT in `/api/clocks`.
3. Server: clock DTO serialization to the frozen schema (behavior/ownerKind/ownerId/purpose/relatedClockIds; legacy `clockKind` documents migrate via the SC-A1 canonicalizer rules — W3: project→bounded, rollover→rollover, purpose custom, campaign ownership, relatedClockIds []).
4. API: create with ownership validation (ownerId must reference an existing entity of ownerKind; campaign ⇒ empty); update op (owner/purpose/related edits, ownerKind+ownerId together); clock.progress signed with the 4-field result family (requested/effective/visibleApplied/overflowAdded, nonzero split reported); clock.reset (no numeric fields); deleteClock unlinks the id from every remaining clock's relatedClockIds in the same atomic snapshot.
5. Owner deletion: deleting a character/crew reassigns its clocks to campaign (ownerKind campaign, ownerId "", new revision/updatedAt) in the same snapshot; result sideEffects report `clock <id> reassigned to campaign` (per the frozen C2 contract).

## Red

O5 clock cases (run and record before starting).

## Green

- `(cd conformance && npm run test:ada -- --run suites/semantics/clocks.test.ts)` — clock cases green.
- `(cd backend-ada/core && env XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -u paperclips_core-clocks.ads --level=2 --checks-as-errors=on)` green; `core_tests` green incl. the new rollover accumulation tests.
- Server build green.
- No contract/conformance edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/ada/SC-A7.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
