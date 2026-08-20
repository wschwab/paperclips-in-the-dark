---
id: SC-A9
title: "Retained server defects"
deps: [SC-A6, SC-A8, SC-C2, SC-C6, SC-O8]
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb (cohort allowed fields, vice request parity, malformed transport classification, remaining SC-R6 backend assignments)
acceptance:
  - O8 backend-owned cases green (FV-004 cohort.add server acceptance)
  - Cohort.add accepts hasArmor/edges/flaws/description and rejects true unknowns
  - Malformed request JSON → 400 VALIDATION with pointer details (never 500)
  - Vice request parity: dossier.update accepts the full vice shape incl. purveyor
---

# SC-A9 — Retained server defects

## Target

Edit: `backend-ada/server/src/pitd_callback.adb` (+ `.ads` if needed). Do NOT edit `contract/`, `conformance/`, or `backend-ada/core/`.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` SC-A9; `docs/pages/contract/wave0/finding-traceability.mdx` (SC-R6 ledger — backend-owned rows: FV-004 → SC-A9; any other SC-R6 backend assignments not covered by A1-A8).
- Frozen contract: cohort.add request schema (hasArmor/edges/flaws/description, additionalProperties false), dossier.update vice `$defs.vice`, malformed-JSON classification (400 VALIDATION).
- Frozen oracle: SC-O8's focused cases (e.g. the FV-004 server-behavior case in the cohort/request-validation suite).
- Existing code: `Validate_Request` cohort.add branch (lines ~1287-1292 per the inventory), vice handling, transport parse boundary.

## Changes

1. `cohort.add`: accept `hasArmor` (boolean), `edges` (array of string), `flaws` (array of string), `description` (string) in the request; true unknown fields still rejected with 400 VALIDATION (FV-004 closure).
2. Vice request parity: `dossier.update` accepts the full vice object incl. required `purveyor` per `$defs.vice` (the server already stores purveyor; make the request path match the frozen contract).
3. Malformed transport: request bodies that are not parseable JSON / wrong root shape → `400 VALIDATION` with pointer-level details; never a 500, never a raw exception leak (SC-A3 union applies).
4. Any remaining SC-R6 backend assignments not covered by SC-A1..A8 (check the ledger; report what you find).

## Red

O8 backend cases (run and record before starting).

## Green

- The O8 cohort/vice/transport cases green (file names from the O8 card's report; run the same selectors).
- Server build green.
- No contract/conformance edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/ada/SC-A9.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/ada/SC-A9.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
