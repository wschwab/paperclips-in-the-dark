---
id: SC-O2
title: "Recursive admission and total collections oracle"
deps: [SC-C1, SC-C2, SC-C4, SC-R0]
track: contract
outputs:
  - conformance/suites/persistence/entity-admission.test.ts (NEW)
  - conformance/suites/contract/total-collections.test.ts (NEW)
acceptance:
  - SC-R0 counterexample matrix exercised across direct GET, history, mutation, import, repair, roster, and list endpoints
  - Valid rows survive, degraded rows retain route identity and tokens, unreadable crew deletion unlinks readable members
  - Red against current source; existing unrelated conformance green
---

# SC-O2 — Recursive admission and total collections oracle

## Target

Create exactly: `conformance/suites/persistence/entity-admission.test.ts`, `conformance/suites/contract/total-collections.test.ts`. Do NOT edit other suites, contract, or fixtures. Read-only elsewhere.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Degraded entities, collections, repair, and deletion", "Stored-entity classification"; SC-O2 list.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` — the ten defect classes (admission counterexamples per class) and the fixture sketches.
- `docs/pages/contract/wave0/finding-traceability.mdx` FV-010 row (roster isolation reproduction).
- Frozen Wave 2 contract (`contract/schemas/*.json`, openapi statuses).
- Existing helper conventions (suite-helpers, api, test IDs).

## Changes (freeze these cases red)

`entity-admission.test.ts` (per defect class; seed files directly into the temp data dir via a fixture-seeding helper, or import; use direct file seeding where the server would never write the shape):
- `ADMIT-PARSE-001` unparseable bytes (truncated JSON, invalid UTF-8) on direct GET → `422 INVALID_ENTITY`; bytes untouched (checksum) (fails today: 500/other).
- `ADMIT-ROOT-002` non-object root (array/string/number) → `422 INVALID_ENTITY` (fails).
- `ADMIT-KEY-003` undeclared top-level key → `422 INVALID_ENTITY`; no write; collections keep `200` (fails).
- `ADMIT-KEY-004` undeclared NESTED key → `422 INVALID_ENTITY` (fails: top-level-only checks today).
- `ADMIT-REQUIRED-005` missing nested required property → `422 INVALID_ENTITY` (fails).
- `ADMIT-TYPE-006` wrong primitive type at depth → `422 INVALID_ENTITY` (fails).
- `ADMIT-ENUM-007` invalid enum at depth → `422 INVALID_ENTITY` (fails).
- `ADMIT-BOUND-008` out-of-bound number at depth → `422 INVALID_ENTITY` (fails).
- `ADMIT-IDENTITY-009` body kind/id mismatch with route → route identity authoritative; direct GET `422 INVALID_ENTITY`; collection row shows route-derived id/kind (fails).
- `ADMIT-REVISION-010` revision < 1 → `422 INVALID_ENTITY`; formatVersion mismatch → typed failure, no write (fails).
- `ADMIT-HISTORY-011` history read of a degraded entity → `422 INVALID_ENTITY` (fails).
- `ADMIT-MUTATION-012` mutation on a degraded entity → `422 INVALID_ENTITY`, no write (fails).
- `ADMIT-IMPORT-013` import of an entity that fails admission → `400 INVALID_ENTRY` with pointer details (fails).
- `ADMIT-CONTROLS-014` controls (valid canonical character/crew/clock; empty contacts/factions; empty crewId) pass (guard — must stay green).

`total-collections.test.ts`:
- `TOTAL-200-001` roster returns `200` with one unreadable member and valid rows preserved (fails: today 400/413 — FV-010 reproduction).
- `TOTAL-ROW-002` degraded row has the same schema as valid rows: route id/kind, canonical empties, `isReadable:false`, `isRepairable`, `isComplete:false`, `deleteToken` (fails).
- `TOTAL-DELETE-003` unreadable member deletable via its `deleteToken` as If-Match (fails).
- `TOTAL-STALE-004` delete with stale token → `409 STALE_REVISION` (fails).
- `TOTAL-CREW-005` deleting an unreadable crew scans readable characters and clears matching `dossier.crewId` atomically; unreadable characters remain visible separately (fails).
- `TOTAL-LIST-006` list endpoints (characters/crews/clocks) stay `200` with degraded members (fails).
- `TOTAL-HEALTH-007` server remains healthy after every counterexample (guard).
- `TOTAL-NOWRITE-008` collection reads never write (checksum guard).

## Green (this card's own gate)

- New files exist with frozen names; the red set fails for the documented reasons; controls and guards pass.
- `(cd conformance && npm run test:ada -- --run suites/persistence/entity-admission.test.ts suites/contract/total-collections.test.ts)` shows the red set.
- One existing persistence file unchanged-green.

Report exact commands and outputs.

## Metrics

`tasks/metrics/contract/SC-O2.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-O2.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
