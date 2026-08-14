---
id: SC-C2
title: "Import, repair, deletion, and lifecycle operations"
deps: [SC-C1, SC-C4, SC-R3, SC-R5, SC-S1]
track: contract
outputs:
  - contract/openapi.yaml (paths and operation updates only)
acceptance:
  - Partial import preview/apply, repair preview/apply, retire, stress/trauma/end-score transitions, degraded If-Match token syntax, required concurrency headers, declared statuses per persisted-state operation, exact numeric result families — all present in OpenAPI
  - Redocly lint passes; no edits outside the assigned path regions
---

# SC-C2 — Import, repair, deletion, and lifecycle operations

## Target

Edit `contract/openapi.yaml` ONLY, and ONLY in these regions (do not touch other path blocks):

- `/characters/import` and `/crews/import` (preview/apply contract);
- `/characters/{id}/repair*` and `/crews/{id}/repair*` (NEW repair preview/apply paths);
- `/characters/{id}/retire` (NEW);
- `/characters/{id}/delete`, `/crews/{id}/delete`, `/clocks/{id}/delete` (If-Match token syntax, statuses);
- `/characters/{id}/undo`, `/crews/{id}/undo` (If-Match required);
- `/characters/{id}/ops/trauma.add`, `/trauma.remove`, `/stress.add`, `/stress.clear`, `/end-score` (transition semantics);
- `/clocks*` (create/update/delete/progress/reset — clock metadata + result families);
- components.parameters.ifMatch (required-flag declarations for the named ops);
- `x-snapshot` flags where the lifecycle matrix says snapshot-worthy.

Read-only everywhere else, including all other path blocks and the entity schemas (SC-C1 owns them; the error union lives in SC-C4's files — reference it by $ref, do not redefine it).

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Canonical shape and normalization" (partial import, repair, preview token, If-Match), "Stored-entity classification and HTTP errors" (status table), "Degraded entities, collections, repair, and deletion" (deleteToken syntax `sha256:<lowercase hex>`; stale → 409), "Numeric operation results" (the four families verbatim), "Character lifecycle" (retire/end-score rules), "Clocks" (owner deletion reassignment — W5; related-clock unlink — W4; rollover accumulation — Q24).
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` §3, §4, §8 (transition semantics, end-score optional body, trauma.add resolution-only, stress.add typed attention token `"stress full — trauma pending"`, retire operation `{confirm: true}` + CONFIRM_REQUIRED, undo/delete If-Match) and §7 (cleanup one-snapshot).
- `docs/pages/contract/wave0/clock-taxonomy.mdx` §5 (create request shape: required name/ownerKind/ownerId/purpose/behavior/size; relatedClockIds optional), §8 (reassignedClockIds on owner delete), §10 (signed clock.progress consuming rollover first; clock.progress result family `requested`/`effective`/`visibleApplied`/`overflowAdded`; clock.reset at most one size, retains remainder).
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` §1 (per-class HTTP outcomes for import/repair: preview 409 NORMALIZATION_REQUIRED, apply 200, needs-input apply 400 INVALID_ENTRY, unparseable 422).

## Changes

1. **Import preview/apply**: importCharacter/importCrew gain a preview mode (e.g. `?preview=1` or a `preview` request field — choose one and be explicit) returning `409 NORMALIZATION_REQUIRED` with warnings and a preview token when normalization would fill/convert/drop data, or `200` with the preview when canonical; confirmed apply requires `If-Match` (entity revision), the preview token, and confirmation; missing values for needs-input pointers → `400 INVALID_ENTRY` with pointer-level details; unknown properties are rejected unless the preview classifies and displays removal; success takes exactly one baseline snapshot.
2. **Repair preview/apply** (new paths): repair-preview on a degraded/repairable stored entity returns `409 NORMALIZATION_REQUIRED` with the previewed result and warnings (no write); repair-apply requires the preview token + confirmation + `If-Match` (revision or raw-byte `sha256:` content token for unparseable/degraded rows) and atomically writes the previewed result; changed bytes since preview → `409 STALE_REVISION`. Unparseable bytes cannot be repaired (deletion only).
3. **Retire** (new path): `POST /characters/{id}/retire` with body `{confirm: true}` (else `CONFIRM_REQUIRED`), `If-Match` required, `x-snapshot: true`, statuses RETIRED/STALE_REVISION/404, idempotency key; explicit retirement is legal below max trauma (Q33).
4. **Lifecycle transitions**: trauma.add becomes resolution-only (requires pending trauma; else `VALIDATION`; max-th resolution runs the shared retirement cleanup in the same snapshot — LIFECYCLE-TRAUMA-001/002 wording); trauma.remove never clears isRetired; stress.add declares the typed attention sideEffect token when landing at max and setting traumaPending; stress.add/stress.clear declare `TRAUMA_REQUIRED` (pending) and `OUT_OF_ACTION` (out-of-action) gates; end-score body optional with inherent stress clear + flag resets, `TRAUMA_REQUIRED` rejection while pending, `RETIRED` gate, one-snapshot atomicity.
5. **Clocks**: createClock request gains required ownerKind/ownerId/purpose/behavior/size (+optional relatedClockIds, default []); update path (owner/purpose/related edits) with ownership validation; clock.progress signed delta with the clock-progress result family (requested/effective/visibleApplied/overflowAdded, nonzero splits reported); clock.reset declares "applies at most one clock size, retains remaining overflow"; deleteClock declares related-clock unlink cleanup; owner delete (character/crew) declares reassignment to campaign + `reassignedClockIds` in the result.
6. **Concurrency**: ifMatch (entity revision) REQUIRED on undo, delete, import-apply, repair-apply; delete of degraded entities accepts the `sha256:` content token as If-Match.
7. **Statuses**: every persisted-state operation in the assigned regions declares its full status set (200/400/404/409/422 + OpResult error refs); numeric ops declare exactly one family per the four-family table.

## Red

Current OpenAPI has no preview/apply, no repair, no retire, end-score requires ≥1 flag, trauma.add is a free toggle, clocks lack metadata, undo/delete If-Match optional.

## Green

- Redocly lint passes (`npx @redocly/cli lint contract/openapi.yaml`).
- Every assigned region updated per the changes; the orchestrator greps for the new operationIds and the declared families/statuses.
- Numeric families: each numeric op in the regions declares exactly one family; clock.progress declares the 4-field family.

Report the exact commands and outputs. Do NOT run project-wide gates. If your assigned regions overlap with another worker's lines (SC-C6 touches existing op blocks; SC-C3 adds capability paths), keep to your regions and message the other workers via hub if a conflict appears.

## Metrics

`tasks/metrics/contract/SC-C2.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
