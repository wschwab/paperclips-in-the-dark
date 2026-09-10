---
id: REVIEW-01-CREATE-JSON-BOUNDARY
title: Preserve create strings as JSON data across the Ada boundary
deps:
  - REVIEW-01
track: ada
outputs:
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/pitd_callback.adb
  - conformance/suites/lifecycle/creation.test.ts
  - docs/pages/contract/wave0/clock-taxonomy.mdx
  - tasks/metrics/ada/REVIEW-01-CREATE-JSON-BOUNDARY.json
acceptance:
  - LIFECYCLE-CREATION-004 through LIFECYCLE-CREATION-009 fail before implementation for quote rejection, double decoding, and identity injection
  - All request-string to JSON-source concatenation in backend-ada/server is replaced with structured JSON construction
  - Full Ada conformance, tooling, frontend, and audit validators pass
---

# REVIEW-01-CREATE-JSON-BOUNDARY — shared structured create correction

**Status:** implementation acceptance recorded in the metrics file; independent director diff review pending.
**Source:** REVIEW-01 follow-up review, P1 character/crew request-string interpolation. This parent-linked corrective card does not invent a new FV/AR identifier. Scope includes the PC route's shared character constructor. Contract and frozen conformance cases remain unchanged; user-authorized additions finish the six inherited lifecycle regressions.

## Log

- 2026-10-04: Read root/Ada AGENTS and PAPERCLIPS; inspected inherited `jj diff` and retained the six lifecycle regressions. Unrelated `.omo/` state was not modified. No commits, restore/abandon operations, or mutating Git commands.
- **RED:** `cd conformance && npm run test:ada -- --run suites/lifecycle/creation.test.ts suites/persistence/create-boundary.test.ts -t 'LIFECYCLE-CREATION-00[4-9]|PERSISTENCE-IDEMPOTENCY-0(0[7-9]|1[0-9])'`, exit 1: **17 failed / 2 passed / 3 skipped**, 2 failed files, 19 selected additions. All six JSON regressions failed for the intended defects: quoted names returned 400; literal escapes were decoded again; crafted IDs replaced existing entities, dropping revision 2 to 1, clearing the character note, and dropping crew tier 2 to 0. Evidence: `artifact://10421`.
- Replaced character/crew JSON-source templates with `Create_Object` and typed `Set_Field`; IDs and all game-setting strings are structured fields. Preserved existing initial values and settings-derived maxima. Searched the complete server source and replaced the remaining request-derived batch-result `op` source interpolation and method/path request-log interpolation with structured fields too; error-message string formatting and filesystem-path concatenation are not JSON-source construction.
- Both ordinary character creation and `/characters/pc` use the same character constructor. All four create routes now share canonical schema admission, atomic persistence, character/crew baseline snapshot, and successful response construction through `Persist_Create`.
- **GREEN:** `cd backend-ada/server && XDG_RUNTIME_DIR=/tmp alr --non-interactive build`, exit 0 (final build 1.63 s). Focused `cd conformance && npm run test:ada -- --run suites/lifecycle/creation.test.ts suites/persistence/create-boundary.test.ts suites/persistence/idempotency.test.ts`, exit 0: **3 files / 28 tests passed**, `artifact://10424`.
- Documentation extends the existing clock-taxonomy contract-decision note: character/crew create currently declare only 200 although validation already returns 400; this remains an open contract decision. No contract changes or new statuses.
- Full acceptance commands, observed counts, and artifacts are recorded in `tasks/metrics/ada/REVIEW-01-CREATE-JSON-BOUNDARY.json`.
