---
id: SC-O1
title: "Canonicalization, import, and repair oracle"
deps: [SC-C1, SC-C2, SC-C4, SC-R0]
track: contract
outputs:
  - conformance/suites/persistence/canonical-shape.test.ts (NEW)
  - conformance/suites/persistence/import-repair.test.ts (NEW)
acceptance:
  - New cases collect cleanly and fail against current source for the intended reasons (red oracle)
  - Existing unrelated conformance remains green
  - Test names/IDs frozen
---

# SC-O1 — Canonicalization, import, and repair oracle

## Target

Create exactly: `conformance/suites/persistence/canonical-shape.test.ts`, `conformance/suites/persistence/import-repair.test.ts`. Do NOT edit any other suite, the contract, or fixtures. Read-only elsewhere.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Canonical shape and normalization", "Degraded entities", "Stored-entity classification"; SC-O1 list.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` — defect classes D1-D10 with HTTP outcomes and fixture sketches (F1-F10); legacy rules L1-L8.
- The frozen Wave 2 contract: `contract/schemas/*.json`, `contract/openapi.yaml` (import preview/apply, repair preview/apply, preview tokens, If-Match requirements).
- Existing conventions: `conformance/src/suite-helpers.ts` (`newCharacter`, `characterOp`, `revisionHeader`), `api.ts`, test case ID style (e.g. `SEMANTICS-*`), `BLADES`/`SCUM` constants.

## Changes (freeze these cases red)

`canonical-shape.test.ts`:
- `CANON-CREATE-001` create writes every declared key in canonical shape (character, crew, clock) — expect to FAIL today (nested objects are not yet total).
- `CANON-NULL-002` a `null` value in a create body normalizes to the canonical default (fails: today null likely rejected or persisted).
- `CANON-IMPORT-003` partial import preview returns `409 NORMALIZATION_REQUIRED` with warnings + preview token and writes nothing (fails: no preview exists).
- `CANON-IMPORT-004` confirmed apply requires If-Match + preview token + confirmation, atomically writes the previewed result (fails).
- `CANON-IMPORT-005` import apply with missing needs-input pointer values returns `400 INVALID_ENTRY` with pointer-level details (fails: no INVALID_ENTRY).
- `CANON-IMPORT-006` unknown property in import is rejected unless the preview classifies and displays removal; with preview the removal is listed (fails).
- `CANON-LEGACY-007` known legacy conversion (notes string → one-entry array) previewed and applied (fails).
- `CANON-REPAIR-008` repair preview on a degraded stored entity computes without writing; apply atomically writes; preview-token staleness → `409 STALE_REVISION` (fails: no repair ops).
- `CANON-READONLY-009` GET returns the stored document byte-identically and a second read changes zero bytes; a GET after a seeded non-canonical file does NOT repair it (fails for the second part: no admission).
- `CANON-NOWRITE-010` no read path writes to disk (checksum before/after GET) — may PASS today; keep it green as a guard.
- `CANON-VERSION-011` canonicalisation never changes `formatVersion` (fails when repair exists; today trivially passes — assert the semantic anyway).
- `CANON-SPARSE-012` claimOverrides outer array always present, items keep only claimId when inheriting (fails: schema not yet sparse-permissive... verify against the frozen C1 schema and adjust the assertion to the contract).
- `CANON-TOTAL-013` a stored document missing an ordinary property is classified repairable/needs-input per the R0 matrix, never silently repaired on read (fails: no classification).

`import-repair.test.ts`:
- `REPAIR-TOKEN-001` unparseable bytes cannot be repaired (deletion only) — direct GET `422 INVALID_ENTITY` (fails).
- `REPAIR-TOKEN-002` deleteToken = `sha256:<hex>` bound to raw bytes; changed bytes → `409 STALE_REVISION` (fails).
- `REPAIR-TOKEN-003` repair/delete after bytes change never acts on unseen data (fails).
- `REPAIR-ATOMIC-004` crash between preview and apply leaves old bytes; crash during apply leaves old or complete new file only (uses `--test-hooks`; fails until backend work — the case itself must run and fail for the right reason).

## Green (this card's own gate)

- The two new files exist with the frozen names; every case either fails for the documented reason or is marked as a guard (list which).
- `(cd conformance && npm run test:ada -- --run suites/persistence/canonical-shape.test.ts suites/persistence/import-repair.test.ts)` shows the red set.
- Existing suites unaffected: run one existing persistence file and confirm its pass set is unchanged.

Report exact commands and outputs. Do NOT edit other files.

## Metrics

`tasks/metrics/contract/SC-O1.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts; record any case whose red reason differed from the card.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
