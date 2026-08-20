---
id: SC-F5
title: "Operation errors and transport errors"
deps: [SC-F1, SC-C4, SC-O7]
track: frontend
outputs:
  - frontend/src/api/client.ts (error decoding, transport classification, stale-revision refresh)
  - frontend/src/pages/* error rendering (accessible alerts, recovery actions)
  - frontend tests
acceptance:
  - Discriminated union decoded; malformed JSON distinguished from network/HTTP/domain failures; recovery actions; stale-revision refresh preserved; accessible alerts; no parser/raw-JSON leakage
  - FV-019, FV-020, FV-023, FV-024 closed
---

# SC-F5 — Operation errors and transport errors

## Target

Edit: `frontend/src/api/client.ts` (fetchJson/DecodeError, undo If-Match), `frontend/src/pages/character-create.ts`, `crew-create.ts`, `character-detail.ts`, `crew-detail.ts` (error rendering), `frontend/src/components/error-card.ts` if needed, and their tests. Do NOT edit `contract/`, `conformance/`, or schema-generated files.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` SC-F5; the error-union section; the fix-wave plan P19 (stale-safe undo), P20 (create game-data error cards), P23 (malformed JSON classification), P24 (friendly operation errors) cards.
- Frozen contract: the whole-error union (operation-result.json $defs/operationError — per-code status/detail/retryable/recovery), If-Match requirements on undo/delete.
- Frozen oracle: error-union.test.ts, concurrency-tokens.test.ts (server-side behavior the client must drive).

## Changes

1. **Union decoding**: decode errors through the generated/derived union schemas; known codes map to user copy, unknown code gets a concise fallback; recovery instructions surfaced.
2. **Transport classification**: malformed 200 JSON → DecodeError (never status-0 ApiError, never parser text leaked); rejected HTTP → ApiError; thrown fetch → network ApiError; pages show distinct friendly copy — FV-023.
3. **Stale revision refresh**: undoCharacter/undoCrew send If-Match with the current revision; 409 refreshes without undoing concurrent state — FV-019; stale-revision refresh preserved everywhere (positive invariant).
4. **Create-page error cards**: recoverable error card with one h1, retry, roster escape, friendly category, no `ApiError:` leakage — FV-020.
5. **Friendly operation errors**: known typed codes → user copy; no raw DTO string; role="alert" — FV-024.
6. Tests: extend client.test.ts and page tests per P19/P20/P23/P24 red assertions.

## Red

P19/P20/P23/P24 red assertions (run focused tests; record failures before starting).

## Green

- `(cd frontend && npm test -- --run src/api/client.test.ts src/main.test.ts src/pages/shell.test.ts src/pages/character-detail.test.ts src/pages/crew-detail.test.ts)` green.
- `(cd frontend && npm run build)` green.
- No contract/conformance edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/frontend/SC-F5.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/frontend/SC-F5.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
