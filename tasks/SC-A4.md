---
id: SC-A4
title: "Total collections and degraded deletion"
deps: [SC-A3, SC-C1, SC-C4, SC-O2, SC-R0]
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb (per-member isolation, route-derived degraded summaries, raw-byte delete tokens, stale-token rejection, unreadable deletion, crew unlinking)
acceptance:
  - O2 total-collections cases green: 200 with degraded members, uniform row shape, deleteToken deletion, stale token 409, unreadable crew deletion unlinks readable members
  - Server healthy after every counterexample
---

# SC-A4 — Total collections and degraded deletion

## Target

Edit: `backend-ada/server/src/pitd_callback.adb` (+ `.ads` if needed). Do NOT edit `contract/`, `conformance/`, or `backend-ada/core/`.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section "Degraded entities, collections, repair, and deletion"; SC-A4.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` — D9/D10 (unreadable) rows.
- Frozen contract: campaign.json summary rows (isReadable/isRepairable/isComplete/deleteToken), deleteToken pattern `sha256:[0-9a-f]{64}`, delete/repair If-Match semantics.
- Frozen oracle: `total-collections.test.ts`, `entity-admission.test.ts`.
- Existing code: `All_Entities`, roster handler, delete handler, `dossier.crewId` unlinking on crew delete.

## Changes

1. Per-member isolation: one unreadable member never removes valid rows and never changes the response from `200` for roster/list endpoints (characters, crews, clocks, roster, members).
2. Route-derived degraded summaries: a record under `characters/{id}` is listed as character `{id}` even when the body claims another identity or cannot be parsed; rows have the SAME schema as valid rows with canonical empties where data is unreadable, `isReadable:false`, `isRepairable`, `isComplete:false`, and `deleteToken` = `sha256:<lowercase hex>` of the current raw bytes.
3. Degraded deletion: delete of an unreadable entity accepts the `deleteToken` as `If-Match`; a token that no longer matches the current bytes → `409 STALE_REVISION` (never act on unseen data); readable entities continue to use their revision.
4. Unreadable crew deletion: scan readable characters and atomically clear every matching `dossier.crewId` before removing the crew; unreadable characters do not prevent deletion and remain separately visible.
5. Direct access to degraded entities stays `422 INVALID_ENTITY` (SC-A3 classifier); collections remain 200.

## Red

O2 total-collections red cases (run and record before starting).

## Green

- `(cd conformance && npm run test:ada -- --run suites/contract/total-collections.test.ts suites/persistence/entity-admission.test.ts)` green for the collection/deletion cases.
- Server build green; health stays ok after every counterexample.
- No contract/conformance/core edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/ada/SC-A4.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
