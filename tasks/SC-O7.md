---
id: SC-O7
title: "Error, concurrency, and parity oracle"
deps: [SC-C2, SC-C4, SC-C5, SC-R0]
track: contract
outputs:
  - conformance/suites/contract/error-union.test.ts (NEW)
  - conformance/suites/persistence/concurrency-tokens.test.ts (NEW)
  - conformance/suites/parity/capability-parity.test.ts (NEW)
acceptance:
  - Every error-union branch covered; detail mismatch rejection; recovery semantics; readable and degraded concurrency tokens
  - Capability manifest completeness: every operationId has agent reference, human route, or approved exemption
  - Red against current source; existing unrelated conformance green
---

# SC-O7 — Error, concurrency, and parity oracle

## Target

Create exactly: `conformance/suites/contract/error-union.test.ts`, `conformance/suites/persistence/concurrency-tokens.test.ts`, `conformance/suites/parity/capability-parity.test.ts` (create the `suites/parity/` directory). Do NOT edit other suites, contract, or fixtures. Read-only elsewhere.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Stored-entity classification and HTTP errors", "Client obligations and parity", SC-O7 list; Wave 0 decisions W9, W13.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` §1 (HTTP outcomes); `lifecycle-matrix.mdx` §2.3 (gate errors).
- Frozen Wave 2 contract: the error union (SC-C4), concurrency headers (SC-C2), the capability manifest (SC-C5).

## Changes (freeze these cases red; guards where already correct)

`error-union.test.ts`:
- `ERR-UNION-001` every branch of the union is exercised (VALIDATION, INVALID_ENTRY, INVALID_ENTITY, NORMALIZATION_REQUIRED, STALE_REVISION, TRAUMA_REQUIRED, RETIRED, OUT_OF_ACTION, NOT_FOUND, NO_HISTORY, CONFIRM_REQUIRED, INSUFFICIENT_FUNDS, every *_MAXED reachable, ARMOR_NOT_AVAILABLE, PAYLOAD_TOO_LARGE) — assert status + code + detail shape + retryable + recovery present (fails: union absent).
- `ERR-DETAIL-002` VALIDATION carries pointer + expected shape (fails).
- `ERR-DETAIL-003` *_MAXED carries limit + current (fails).
- `ERR-DETAIL-004` NORMALIZATION_REQUIRED carries warnings + preview token (fails).
- `ERR-DETAIL-005` STALE_REVISION carries current revision (fails where absent).
- `ERR-MISMATCH-006` code/details mismatch is impossible at schema level (probe the union schema via ajv — schema-level, can pass once SC-C4 lands; freeze as a tooling check).
- `ERR-RETRY-007` retryable semantics: after the documented recovery action the same semantic operation succeeds; blind identical replay is not promised (fails).
- `ERR-BATCH-008` batch items use the same error schema (fails).
- `ERR-NORAW-009` error message is human-presentable, no raw document in message (guard where it passes).

`concurrency-tokens.test.ts`:
- `CONC-IFMATCH-001` undo without If-Match → rejected (fails: optional today — FV-019).
- `CONC-IFMATCH-002` delete without If-Match → rejected (fails).
- `CONC-IFMATCH-003` import-apply/repair-apply without If-Match → rejected (fails: no apply ops).
- `CONC-REV-004` readable entity: correct revision succeeds, stale revision → `409 STALE_REVISION` with current revision (guard).
- `CONC-TOKEN-005` degraded entity: deleteToken as If-Match succeeds; stale token → 409 (fails).
- `CONC-NOWRITE-006` failed concurrency check writes nothing (checksum guard).

`capability-parity.test.ts`:
- `PARITY-MANIFEST-001` every operationId in the contract appears in the generated manifest with exactly one disposition (fails: no manifest).
- `PARITY-AGENT-002` every operation has an agent reference entry (fails).
- `PARITY-HUMAN-003` destructive/lifecycle/sheet ops have reachable human routes (list the required set per the work spec; fail on missing).
- `PARITY-EXEMPT-004` exemptions require approval + reason (schema-level check of the manifest; fails until manifest exists).

## Green (this card's own gate)

- New files exist with frozen case names; red cases fail for the documented reasons; guards pass.
- `(cd conformance && npm run test:ada -- --run suites/contract/error-union.test.ts suites/persistence/concurrency-tokens.test.ts suites/parity/capability-parity.test.ts)` shows the red set.

Report exact commands and outputs.

## Metrics

`tasks/metrics/contract/SC-O7.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-O7.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
