---
id: SC-A8
title: "Lifecycle state machine"
deps: [SC-A6, SC-C2, SC-C4, SC-O6, SC-R5]
track: ada
outputs:
  - backend-ada/core/src/paperclips_core-monitors.ads/.adb (pending/out-of-action state, retirement flag independent of trauma count, cleanup transitions, updated Posts)
  - backend-ada/server/src/pitd_callback.adb (retire op, stress/trauma/end-score transitions, retired allow/deny lists, undo, derived history capabilities)
acceptance:
  - O6 lifecycle cases green (all 25 LIFECYCLE-*)
  - Changed SPARK units prove at the required level; core tests green
  - Superseded conformance cases updated in Wave 7 only — do not touch existing suites
---

# SC-A8 — Lifecycle state machine

## Target

Edit: `backend-ada/core/src/paperclips_core-monitors.ads/.adb` (+ `paperclips_core-characters.ads` if the character aggregate changes), `backend-ada/core/tests/core_tests.adb`, `backend-ada/server/src/pitd_callback.adb` (+ `.ads`). Do NOT edit `contract/`, `conformance/`, or other core units.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section "Character lifecycle"; SC-A8; Q33/Q42; W13-W16.
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` — the FULL frozen design: state model §2 (flags + invariants), gates §2.3 (TRAUMA_REQUIRED/RETIRED/OUT_OF_ACTION), transition table §3, end-score rules §4, deadish §5, allow/deny lists §6, cleanup functions §7 (one shared retirement cleanup; distinct deadish cleanup), sequence §8, canUndo/historyCount §9, and the current-behavior conflicts §11 (the 12 backend items with file:line are your fix list).
- Frozen contract: retire op, end-score optional body, trauma.add resolution semantics, stress.add typed attention token `"stress full — trauma pending"`, OUT_OF_ACTION in the union.
- Frozen oracle: `lifecycle-state-machine.test.ts`.
- `backend-ada/AGENTS.md` — gnatprove loop.

## Changes

1. Core: add `traumaPending`, `isOutOfAction`, `stressClearPending` to the monitor/character state; `Is_Retired` becomes an explicit stored flag NEVER recomputed from the trauma count (conflict §11.10); `Is_Deadish` derived from fatal harm. State and prove the transition Posts: stress-max sets pending (never auto-trauma), resolution keeps stress full and sets both out-of-action flags, end-score clears stress + both flags atomically, shared retirement cleanup (stress/harm/healing clock/armor cleared; dossier/playbook/trauma history/notes/gear/fund preserved), deadish cleanup (stress + pending cleared; harm preserved).
2. Server: implement the frozen gates — TRAUMA_REQUIRED (pending blocks gameplay/stress/end-score; trauma.add is resolution-only), OUT_OF_ACTION (stress ops), RETIRED (deny-list; allow-list proceeds: dossier/name/notes/notebook/trauma.remove/undo/delete/import/reads); trauma.remove never clears isRetired (conflicts §11.4); max-th trauma resolution runs the shared cleanup in the same transition (conflict §11.5); harm.add landing fatal runs the deadish cleanup (conflict §11.6); end-score inherent stress clear + flag resets + optional body + one-snapshot (conflicts §11.7-8); new retire op (confirm:true, If-Match, x-snapshot true).
3. Derived: roster/detail responses expose canUndo/historyCount computed at response time (never stored) — historyCount = retained snapshots, canUndo = historyCount > 0 (conflict §11.9); create takes exactly one baseline snapshot so a fresh entity's first undo is not NO_HISTORY (FV-028 backend part).
4. Undo stays the recovery path in every state, including while traumaPending.

## Red

O6 lifecycle cases (run and record before starting).

## Green

- `(cd conformance && npm run test:ada -- --run suites/lifecycle/lifecycle-state-machine.test.ts)` — lifecycle cases green.
- Changed core units prove (`gnatprove -u` per unit, level 2); `core_tests` green.
- Server build green.
- No contract/conformance edits (superseded lifecycle tests are updated in Wave 7).

Report exact commands and outputs; list any O6 case still red and why.

## Metrics

`tasks/metrics/ada/SC-A8.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
