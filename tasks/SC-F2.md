---
id: SC-F2
title: "Normalization, import, repair, and degraded deletion UI"
deps: [SC-F1, SC-C2, SC-O1, SC-O2]
track: frontend
outputs:
  - frontend/src/pages/import.ts (or extend an existing import surface) — preview/warnings/required-input/confirm flows
  - frontend/src/pages/roster.ts (degraded-row repair/delete controls) and related components
  - frontend tests for the flows
acceptance:
  - Preview, warnings, required-input fields, explicit confirmation, stale-token recovery, degraded-row repair/delete controls, friendly typed failure states
  - Never display raw result documents
  - Focused red-green tests pass
---

# SC-F2 — Normalization, import, repair, and degraded deletion UI

## Target

Edit frontend pages/components: the import surface (`frontend/src/pages/` — find the current import UI; the roster page `roster.ts` for degraded rows; shared components for preview/confirm dialogs). Do NOT edit `contract/`, `conformance/`, or schema-generated files.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` SC-F2; the degraded-entities section (total rows, deleteToken, isRepairable); the fix-wave plan (P10/P17-related conventions, roster patterns).
- Frozen contract: import preview/apply and repair preview/apply endpoints, NORMALIZATION_REQUIRED/INVALID_ENTRY/INVALID_ENTITY/STALE_REVISION union shapes, degraded row fields.
- Frozen oracle: canonical-shape.test.ts, import-repair.test.ts, entity-admission.test.ts, total-collections.test.ts (the behaviors the UI must drive).
- Existing frontend patterns: error-card component, notice patterns, `frontend/src/api/client.ts`.

## Changes

1. **Import UI**: partial-document import flow with preview (every fill/conversion/correction/removal shown, warnings), required-input fields for needs-input pointers, explicit confirmation, stale preview-token recovery (re-preview), `If-Match` handling, success state with the entity. Never render raw result documents.
2. **Repair UI**: degraded/repairable rows on roster show repair affordance (isRepairable) with preview → confirm → apply; needs-input pointers rendered as editable fields; unreadable rows show delete-only with the deleteToken flow.
3. **Degraded deletion**: delete control for unreadable rows using the row's deleteToken; 409 STALE_REVISION → friendly refresh/re-token copy (no raw JSON).
4. Typed failure states: INVALID_ENTRY pointer details surfaced as a readable list; NORMALIZATION_REQUIRED warnings shown pre-confirmation.
5. Tests: focused page tests for preview/warn/confirm/stale/re-preview/delete flows; follow the existing test conventions (see roster.test.ts, import-related tests).

## Red

Focused tests fail before your change (write them first; the preview/confirm flows don't exist today).

## Green

- `(cd frontend && npm test -- --run <your test files>)` green.
- `(cd frontend && npm run build)` green.
- No contract/conformance edits.

Note: this card is UI behavior; visual verification (browser, screenshots) is the Wave 6 gate's job — your acceptance is the focused red-green suite plus a clear evidence log.

Report exact commands and outputs.

## Metrics

`tasks/metrics/frontend/SC-F2.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/frontend/SC-F2.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
