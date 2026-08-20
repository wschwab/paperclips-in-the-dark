---
id: SC-C1
title: "Canonical entity schemas"
deps: [SC-R0, SC-R2, SC-R3, SC-R5, SC-S1]
track: contract
outputs:
  - contract/schemas/character.json (canonical v1)
  - contract/schemas/crew.json (canonical v1)
  - contract/schemas/clock.json (canonical v1)
  - contract/schemas/campaign.json (total summary rows)
  - conformance/fixtures/golden-character.json, golden-crew.json, golden-clock.json (canonical shape)
acceptance:
  - Every golden fixture validates against its storage schema (ajv via a /tmp scratch project; no repo package changes)
  - x-requiredWhenComplete emitted exactly on the 13 locked pointers with predicate nonBlankString in stable order
  - Clock schema matches the SC-R3 DTO sketch (behavior rename, ownership/purpose/related fields)
  - Lifecycle booleans traumaPending/isOutOfAction/stressClearPending present and required
  - No minLength/pattern added to any locked completeness pointer; claimOverrides items stay sparse (claimId only)
---

# SC-C1 — Canonical entity schemas

## Target

Edit exactly: `contract/schemas/character.json`, `crew.json`, `clock.json`, `campaign.json`, `conformance/fixtures/golden-character.json`, `golden-crew.json`, `golden-clock.json`. Read-only everywhere else. Do NOT edit `operation-result.json` or `common.json` (SC-C4 owns them in this wave) and do NOT add `canUndo`/`historyCount` (SC-C6 owns those).

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Canonical shape and normalization", "Completeness", "Degraded entities, collections, repair, and deletion", "Clocks", "Character lifecycle"; Wave 0 decisions W3, W8, W10, W16.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` — property inventory and canonical defaults for every property (the matrix is authoritative for what "canonical empty" means per property; totalsation must not change types or rename paths).
- `docs/pages/contract/wave0/completeness-audit.mdx` — the 13 locked pointers (exact list + order), the 5 SC-C1 guardrails (must-follow), predicate vocabulary.
- `docs/pages/contract/wave0/clock-taxonomy.mdx` — the DTO sketch (§5), validation rules (§5 table rules 0-6), purpose enum (§7).
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` §2.1 — the three new lifecycle flags.
- `PAPERCLIPS.md` (amended by SC-S1 — read the current file).

## Changes

1. **character.json**: add `traumaPending`, `isOutOfAction`, `stressClearPending` as required canonical booleans (W16). Add `x-requiredWhenComplete` (array of records `{pointer, predicate}`) with exactly the 8 character pointers from the completeness audit, `nonBlankString`, in the audit's stable order. Totalise: every ordinary property at every nesting level becomes required (canonical total objects, sparse-overlay exception does not apply to characters); values keep the canonical empties documented in the matrix; DO NOT add minLength/pattern to any locked pointer; keep `monitor.armor.has*` (W8).
2. **crew.json**: add `x-requiredWhenComplete` with exactly the 5 crew pointers, `nonBlankString`, stable order. Make `contacts` and `factions` required canonical arrays (Q4). `claimedClaimIds`/`claimOverrides` stay required; `claimOverrides` items keep the sparse shape (only `claimId` required; `name`/`description`/`effects` optional and absent when inherited). Totalise every ordinary property (crew nested objects too, e.g. upgrades/cohorts items) per the matrix.
3. **clock.json**: replace `clockKind` (project|rollover) with `behavior` (bounded|rollover) (W3); add required `ownerKind` (enum campaign|character|crew), `ownerId` (string; empty for campaign), `purpose` (enum of the 10 ClockPurposes values), `relatedClockIds` (array of uuid refs, uniqueItems). Encode expressible rules with if/then: behavior=bounded ⇒ rollover=0; segments ≤ size. Keep `size` minimum 1, no maximum (W10). Keep all existing required identity/timestamp fields. No x-requiredWhenComplete on clocks.
4. **campaign.json**: characterSummary and crewSummary gain required total row fields: `isReadable` (boolean), `isRepairable` (boolean), `isComplete` (boolean; meaningful when readable), `deleteToken` (string, pattern `^sha256:[0-9a-f]{64}$`; required always — canonical empty `""`? NO: decide with the matrix — a readable row has no deleteToken need; follow the matrix's canonical-empty rule for the token, i.e. token present for degraded rows and canonical empty otherwise — make it required with the matrix's canonical empty, keeping the row shape total). Keep existing fields required. Do NOT add canUndo/historyCount (SC-C6).
5. **Golden fixtures**: rewrite golden-character.json, golden-crew.json, golden-clock.json to canonical v1 shape: every declared property present with canonical empties, lifecycle booleans present, clock with the new metadata fields, crew with contacts/factions/claims, matching the updated schemas exactly. Keep them byte-stable, pretty-printed JSON with one trailing newline.

## Red

Current schemas lack the lifecycle flags, x-requiredWhenComplete, clock metadata, total nested requireds, and summary rows; current golden fixtures validate against the OLD shapes and would fail the new schemas.

## Green

- All five schemas pass redocly lint (`npx @redocly/cli lint contract/openapi.yaml` from repo root) — note openapi refs the schemas.
- Every golden fixture validates against its storage schema using ajv (scratch project under /tmp with the current schema files; do not modify repo package.json).
- x-requiredWhenComplete: exactly 13 records total (8 character + 5 crew), all nonBlankString, pointers resolving per the audit.
- No locked pointer property gained minLength/pattern.
- Clock if/then rules validate a `bounded` clock with rollover 1 as invalid and segments > size as invalid.
- Character with the new flags decodes per the schema.

Report the exact commands and outputs. Do NOT run project-wide gates.

## Metrics

`tasks/metrics/contract/SC-C1.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-C1.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
