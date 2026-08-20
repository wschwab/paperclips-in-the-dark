---
id: SC-A3
title: "Stored admission and typed errors"
deps: [SC-A1, SC-A2, SC-C4, SC-O2, SC-O7]
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb (centralized read/parse/admission; reusable error union without raw exception leakage)
  - backend-ada/server/src/pitd_error.adb/ads (NEW reusable error construction)
acceptance:
  - O2 admission cases green across direct GET, history, mutations, batch, capabilities, collection projection
  - O7 error-union cases green (status/code/detail/retryable/recovery shapes)
  - FV-027 backend side (unknown keys / unreadable bytes → typed 422, no write)
---

# SC-A3 — Stored admission and typed errors

## Target

Edit: `backend-ada/server/src/pitd_callback.adb` (+ `.ads` if needed); create `backend-ada/server/src/pitd_error.adb/.ads` (reusable typed-error construction). Do NOT edit `contract/`, `conformance/`, or `backend-ada/core/`.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Stored-entity classification and HTTP errors", "Degraded entities", SC-A3.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` — per-class HTTP outcomes (direct GET 422 INVALID_ENTITY, collections 200, unparseable bytes 422).
- Frozen contract: the error union (operation-result.json $defs/operationError — one branch per code with status/detail/retryable/recovery/entity|preview|token).
- Frozen oracle: `entity-admission.test.ts`, `total-collections.test.ts`, `error-union.test.ts`.
- `backend-ada/AGENTS.md` — exception handling at the SPARK-off boundary; JSON via GNATCOLL.

## Changes

1. Centralize read/parse/admission so direct GET, history, mutations, batch, capabilities, and collection projection share ONE classification path (the R0 matrix classes): canonical / repairable / needs-input / unreadable.
2. Read admission (direct access): parseable non-canonical → `422 INVALID_ENTITY` with repairability details (outcome + needs-input pointers); unparseable → `422 INVALID_ENTITY`; collections stay `200` (SC-A4 owns the projection — share the classifier).
3. Typed errors: implement the reusable error union faithfully — every error carries code, status, message, retryable, recovery, typed details; entity/preview/token where the branch requires them (per operation-result.json). No raw exception/JSON leakage into messages. Batch items construct the same union.
4. Malformed request JSON at the transport boundary → `400 VALIDATION` with pointer details (not a 500).
5. Keep the no-write invariant: admission failures never write; checksum guards.

## Red

O2 admission + O7 error-union red cases (run and record before starting).

## Green

- `(cd conformance && npm run test:ada -- --run suites/persistence/entity-admission.test.ts suites/contract/total-collections.test.ts suites/contract/error-union.test.ts)` — admission and error-union cases green (collection-projection cases may remain red if SC-A4 owns them — list which).
- Server build green; server remains healthy after every counterexample.
- No contract/conformance/core edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/ada/SC-A3.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/ada/SC-A3.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
