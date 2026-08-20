---
id: SC-C4
title: "Typed error union"
deps: [SC-R0, SC-R5, SC-S1]
track: contract
outputs:
  - contract/schemas/operation-result.json (whole-error discriminated union)
  - contract/schemas/common.json (errorCode enum + error detail defs)
  - contract/openapi.yaml (components/responses OpResult description; error-union components only)
acceptance:
  - Every error code appears exactly once in the union with status, typed detail shape, recovery instruction, retryable, and accompanying-entity/preview/token declaration
  - Batch items reuse the same error schema by $ref
  - Code/details mismatch is rejectable at schema validation time (oneOf discriminated on code)
  - Redocly lint passes; union status values match the R0 matrix HTTP outcome table
---

# SC-C4 — Typed error union

## Target

Edit exactly: `contract/schemas/operation-result.json`, `contract/schemas/common.json`, and ONLY the error-related parts of `contract/openapi.yaml` (components.responses.OpResult description; any error-union component refs). Read-only everywhere else. Do NOT edit character/crew/clock/campaign schemas (SC-C1 owns them) and do NOT change per-operation status declarations (SC-C2 owns those).

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Stored-entity classification and HTTP errors" and "Typed error/recovery semantics" (the locked status table is normative: 400 VALIDATION, 400 INVALID_ENTRY, 422 INVALID_ENTITY, 409 NORMALIZATION_REQUIRED, 404 NOT_FOUND, 409 STALE_REVISION, plus every *_MAXED code, INSUFFICIENT_FUNDS, NO_HISTORY, CONFIRM_REQUIRED, TRAUMA_REQUIRED, RETIRED, OUT_OF_ACTION — W13).
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` §1 (the HTTP outcome column per defect class — the union's per-code status values must agree with it).
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` §2.3 (TRAUMA_REQUIRED / RETIRED / OUT_OF_ACTION gate rows) and §4 (end-score).
- `docs/pages/contract/spec-change-work-spec.mdx` "Wave 0 outcomes" W13.
- Current `common.json` `$defs/errorCode` enum — enumerate it first and extend, never shrink.

## Changes

1. **common.json**: extend `$defs/errorCode` to the complete code set (existing codes + `INVALID_ENTRY`, `INVALID_ENTITY`, `NORMALIZATION_REQUIRED`, `STALE_REVISION` if missing, `TRAUMA_REQUIRED`, `RETIRED` if missing, `OUT_OF_ACTION`, `INSUFFICIENT_FUNDS`, `NO_HISTORY` if missing, plus every existing `*_MAXED` code). Add reusable `$defs` for typed detail shapes: pointer-list details (JSON pointer + reason + expected), limit details (limit + current), preview details (warnings + preview token), stale details (current revision or current content token).
2. **operation-result.json**: replace the loose `error` object with a whole-error discriminated union — `oneOf` with one branch per code (discriminator `code`). Every branch declares: `code`, `status` (integer, the HTTP status), `message` (human-presentable), `retryable` (boolean; means the operation may succeed after the documented recovery action, never blind-replay), `recovery` (instruction string), `details` (the typed per-code shape), and where applicable the accompanying payload: `entity` (the current entity DTO), `preview` (normalization preview object), or `token` (preview/delete token). `ok` stays false for error branches. The `batch[].error` item reuses the SAME schema by `$ref` (top-level and batch errors share one schema). Keep `applied`/`sideEffects`/`character`/`crew`/`clock` as today.
3. **openapi.yaml**: update components.responses.OpResult description to reference the discriminated union and the locked status table; wire the union into the OpResult response content schema.

## Red

Today's error object is a loose `{code, message, details: object}` with no status/retryable/recovery and no per-code detail typing; batch error is a separate inline shape; errorCode enum lacks the new codes.

## Green

- Redocly lint passes (`npx @redocly/cli lint contract/openapi.yaml`).
- A validation probe (ajv in /tmp, no repo package changes) accepts a VALIDATION error with pointer details and rejects a VALIDATION error carrying a *_MAXED detail shape (code/details mismatch rejection).
- Every code in the union has all six declared members; batch item error refs the same schema.
- The union's status values agree with the R0 matrix table (spot-checked by the orchestrator).

Report the exact commands and outputs. Do NOT run project-wide gates.

## Metrics

`tasks/metrics/contract/SC-C4.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-C4.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
