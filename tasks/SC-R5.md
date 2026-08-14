---
id: SC-R5
title: "Lifecycle transition matrix"
deps: []
track: contract
outputs:
  - docs/pages/contract/wave0/lifecycle-matrix.mdx
acceptance:
  - Full transition table for stress-full, trauma resolution, end-score, explicit retirement, final-trauma retirement, fatal harm/deadish, fatal-harm removal, deletion
  - No transition leaves contradictory pending flags; end-score cannot erase unresolved trauma
  - Voluntary and trauma retirement share one cleanup function; all locked rules preserved
---

# SC-R5 — Lifecycle transition matrix

## Target

Write ONE file: `docs/pages/contract/wave0/lifecycle-matrix.mdx`. Read-only everywhere else. Do not edit `PAPERCLIPS.md`, `contract/`, `conformance/`, or any source.

## Inputs

- Governing decisions: `docs/pages/contract/spec-change-work-spec.mdx` section "Character lifecycle" (read the whole file). The locked rules are normative:
  - retired characters remain readable and deletable;
  - dossier, named field, note, and notebook edits remain allowed after retirement;
  - lifecycle cleanup and undo remain available;
  - gameplay mutations return `RETIRED` unless explicitly allowed by the matrix;
  - removing trauma does not silently reverse a completed voluntary retirement; undo is the recovery path;
  - retirement heals harm and clears stress; deadish preserves harm (incl. fatal) and clears stress;
  - retirement cleanup: sets `isRetired`, clears stress and all pending/out-of-action state, clears harm, resets healing clock, clears armor usage, preserves dossier/playbook/trauma history/notes/gear ownership/fund state;
  - deadish: caused by fatal harm (not a free-standing toggle), preserves all harm, clears stress and pending state, distinct from retirement;
  - sequence: stress max → `traumaPending` + typed attention; trauma resolution records trauma, keeps stress full, sets `isOutOfAction` + `stressClearPending`; `end-score` rejects `TRAUMA_REQUIRED` while pending; successful `end-score` clears stress to zero, resets both out-of-action flags, performs selected score cleanup in one snapshot.
- Public rule: <https://rpg.stackexchange.com/questions/148519/can-i-retire-without-trauma> (explicit retirement is not restricted to max trauma).
- Reference: `blades-in-the-sheets/Models/` C# (retirement, deadish, trauma, `IsRetired`, `IsDeadish` semantics).
- Current behavior: `conformance/suites/lifecycle/retirement.test.ts`, `conformance/suites/semantics/retired-deadish.test.ts`, `stress-overflow.test.ts`; `contract/openapi.yaml` (retire/end-score/undo/delete/trauma ops); `backend-ada/core/src/` and `server/src/pitd_callback.adb` for existing transitions; `frontend/src/` for what the UI currently offers.

## Contract (interfaces produced for downstream cards)

- The matrix feeds SC-S1 (normative lifecycle wording), SC-C2 (retire/end-score/undo operations), SC-O6 (lifecycle oracle), SC-A8 (state machine), SC-F4 (lifecycle UI).
- The "one cleanup function" decision and the full allow-list of retired operations are frozen here.

## Red (questions the research must answer)

For each transition produce: preconditions (incl. flags), atomic state changes (every field touched), errors (`TRAUMA_REQUIRED`, `RETIRED`, `CONFIRM_REQUIRED`, `STALE_REVISION`, ...), allowed next operations, undo behavior (does undo restore the complete prior state? which transitions are snapshot-worthy?), and the conformance cases SC-O6 must freeze.

Transitions: stress reaching maximum; trauma resolution; end-score (normal and with pending trauma); explicit retirement (confirmed); final-trauma retirement; fatal harm applied (deadish); fatal harm removed (recovery?); deletion. Also decide: which retired operations are allowed (dossier/name/look/heritage/background/vice fields, notes, notebook, trauma list edits? lifecycle cleanup? undo?) and which return `RETIRED`.

## Green

`docs/pages/contract/wave0/lifecycle-matrix.mdx` exists and contains:

1. The transition table: one row per transition with preconditions, atomic changes, errors, allowed next ops, undo behavior, snapshot-worthy flag.
2. The retired-operation allow-list (explicit) and the deny-list (gameplay mutations → `RETIRED`).
3. The shared cleanup function design (one cleanup used by both retirement paths) with its exact field effects.
4. The deadish transition design (fatal-harm caused, distinct from retirement) and fatal-harm removal semantics.
5. The end-score rules incl. `TRAUMA_REQUIRED` rejection and the one-snapshot atomicity.
6. The `canUndo`/`historyCount` derivation (response-time, never stored).
7. The SC-O6 conformance case list (test names SC-O6 will freeze).
8. Any current-behavior conflicts found (file:line) that SC-A8 must fix.

Acceptance: every transition has all six columns; the two retirement paths call the same cleanup; no row leaves `traumaPending` and `isOutOfAction` contradictory; the SC-O6 case list covers every locked rule.

## Evidence

- C# model excerpts for retirement/deadish.
- Current conformance test excerpts showing today's behavior.
- The stackexchange citation.

## Metrics

`tasks/metrics/contract/SC-R5.json` is written by the orchestrator after review — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
