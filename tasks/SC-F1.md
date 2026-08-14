---
id: SC-F1
title: "Generated schema and completeness consumption"
deps: [SC-C5, SC-O3, SC-A3]
track: frontend
outputs:
  - frontend/src/schema/*.ts (decoders derived from the frozen contract)
  - frontend/src/schema/generated/completeness.ts consumption (outstanding-field computation)
  - frontend/src/schema/decoders.test.ts (strict decoder matrix)
acceptance:
  - Decoders accept canonical empty values, reject undeclared keys (top-level AND nested), expose repairability without permissive unknown fallbacks
  - Outstanding fields computed from generated predicates, not hand-copied lists
  - FV-027 frontend side closed (P27B)
---

# SC-F1 — Generated schema and completeness consumption

## Target

Edit: `frontend/src/schema/` (character.ts, crew.ts, clock.ts, campaign.ts, common.ts, operation-result.ts, index.ts, decoders.test.ts) and consume `frontend/src/schema/generated/completeness.ts` (SC-C5 output — never hand-edit generated files). Do NOT edit `contract/`, `conformance/`, or other frontend pages.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` SC-F1; `docs/pages/contract/wave0/completeness-audit.mdx` (predicate semantics, counterexamples X0-X4); the fix-wave plan P27B card (agent-docs/FRONTEND-FIX-WAVE-PLAN.md).
- Frozen contract: contract/schemas/*.json (canonical v1 — decoders mirror these exactly; additionalProperties:false preserved; error union in operation-result.json).
- Reference implementation of the shapes: `conformance/src/schemas.ts` (already synced to the frozen contract — mirror it; keep frontend project conventions).
- Frozen oracle: completeness.test.ts, entity-admission.test.ts (frontend-relevant expectations).

## Changes

1. Update the Effect schema decoders to the frozen contract shapes: lifecycle booleans, clock metadata (behavior/ownerKind/ownerId/purpose/relatedClockIds), crew contacts/factions required, claimOverrides sparse, summary rows (isReadable/isRepairable/isComplete/deleteToken/canUndo/historyCount), the whole-error union with retryable/recovery.
2. Strictness: unknown top-level AND nested keys rejected where the contract says additionalProperties:false; canonical empty values accepted; no permissive `unknown` fallbacks for entity DTOs.
3. Completeness consumption: outstanding fields computed via the generated predicates (PREDICATES/findIncompleteRecords/isComplete from `frontend/src/schema/generated/completeness.ts`) — never hand-copied pointer lists.
4. Tests: extend decoders.test.ts with the recursive strictness matrix (unknown top-level, unknown nested, missing/wrong-type/enum/bound controls reject; valid canonical shape + explicitly extensible nested data decode) — FV-027 P27B red-green. Preserve existing passing tests; the fix-wave P27B red assertions must fail before your change.

## Red

P27B red assertions (run the focused decoders tests; record failures before starting).

## Green

- `(cd frontend && npm test -- --run src/schema/decoders.test.ts)` green.
- `(cd frontend && npm run build)` green (typecheck + build).
- No contract/conformance edits; generated files regenerated via the generator, not hand-edited.

Report exact commands and outputs.

## Metrics

`tasks/metrics/frontend/SC-F1.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
