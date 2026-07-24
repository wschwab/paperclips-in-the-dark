---
id: F2g
title: "Seventh playable UI slice: character stress mutation"
deps: [F2f, A2]
track: frontend
outputs:
  - stressAdd API client method with tests
  - +1 stress control on character detail page
  - StaleRevisionError typed error for 409 STALE_REVISION
  - docs/pages/frontend/f2g-stress-add.mdx
acceptance:
  - "focused frontend tests for stressAdd fail before method exists and pass afterward"
  - "POST /api/characters/{id}/ops/stress.add request body validated: {delta} required"
  - "If-Match header set to character.revision and actually sent to the server"
  - "OperationResult decoded; character DTO returned on ok: true"
  - "409 STALE_REVISION response decoded and raised as StaleRevisionError with currentRevision field"
  - "+1 stress button renders on character detail page; shows … while loading, disabled during mutation"
  - "button click calls stressAdd with character id, delta 1, and revision"
  - "on success, character re-renders with updated stress value"
  - "on StaleRevisionError, shows 'Sheet is stale — reload the page'"
  - "on other API failures, shows error inline below stress monitor"
  - "npm test -- --run passes (46 tests total: 4 new stressAdd tests + 42 existing)"
  - "npm run build passes (tsc --noEmit + vite build)"
  - "live Ada acceptance: fresh server (port non-9657, temp data dir, games from repo) — GET /api/characters/{id} after creation returns character with revision N; POST /api/characters/{id}/ops/stress.add with {delta: 1} and If-Match: N returns 200 with character DTO and stress.current incremented; stress.max never hardcoded (read from game-settings); no forbidden paths (contract/, conformance/, blades-in-the-sheets/) touched"
---

Seventh bounded slice of F2, building on F2f with the first mutation: stress.add.
Do not add other ops, undo, automatic stale-version recovery, or editing in this slice.

## Log

- 2026-07-24: Haiku 4.5 implements red-green slice.
- Red: Wrote 4 focused tests for stressAdd: (1) success case posting to /api/characters/{id}/ops/stress.add with {delta} body and If-Match header, decoding character from OperationResult; (2) 409 STALE_REVISION raises StaleRevisionError with currentRevision field; (3) non-409 failure raises ApiError; (4) invalid response raises DecodeError. All 4 failed with "stressAdd is not a function" before implementation. Full test run output at bottom of log.
- Green: Implemented stressAdd(id: string, delta: number, revision: number) in api/client.ts that POSTs to /api/characters/{id}/ops/stress.add with If-Match header from revision parameter, decodes OperationResult, and returns character DTO. Added StaleRevisionError class with currentRevision field; 409 response with STALE_REVISION error code raises StaleRevisionError instead of generic ApiError. All 46 tests pass (4 new stressAdd + 42 existing decoder/client tests).
- Updated character-detail.ts: renderCharacterDetail now takes onStressAdd, isStressLoading, stressError callback/state; renders +1 stress button next to stress display with disabled state during mutation. Button click calls stressAdd, re-renders on success with updated character, displays "Sheet is stale — reload the page" on StaleRevisionError or other error messages inline.
- npm run build passes (tsc --noEmit, vite build to dist/).
- Added docs/pages/frontend/f2g-stress-add.mdx documenting the mutation pattern, StaleRevisionError handling, and scope.
- 2026-07-24: Implementer self-check — live Ada check on fresh isolated backend (port 9657, temp data/games dirs seeded from repo data/games):

**RED Phase Test Output (4 tests failing before implementation):**
```
FAIL  src/api/client.test.ts > stressAdd > posts to /api/characters/{id}/ops/stress.add with delta and If-Match header, decodes character from OperationResult
TypeError: (0 , stressAdd) is not a function

FAIL  src/api/client.test.ts > stressAdd > exposes StaleRevisionError when API returns 409 with STALE_REVISION error code
TypeError: (0 , stressAdd) is not a function

FAIL  src/api/client.test.ts > stressAdd > exposes ApiError when POST fails with non-409 status
TypeError: (0 , stressAdd) is not a function

FAIL  src/api/client.test.ts > stressAdd > exposes DecodeError when response is not valid OperationResult
TypeError: (0 , stressAdd) is not a function

Tests  4 failed | 42 passed (46)
```

**GREEN Phase Test Output (all 46 tests passing after implementation):**
```
✓ src/schema/decoders.test.ts (18 tests) 6ms
✓ src/api/client.test.ts (28 tests) 21ms

Test Files  2 passed (2)
Tests  46 passed (46)
Start at  16:21:43
Duration  379ms
```

**Live Ada Server Test** (port 9750, temp isolated campaign data):

1. Created test character via POST /api/characters with {gameStem: "blades-in-the-dark", playbook: "Cutter"}, received revision 1, stress 0/9 per game-settings (max = 9 from blades-in-the-dark.json).
2. POST /api/characters/{id}/ops/stress.add with {delta: 1} and If-Match: 1 → 200 OK, character DTO returned with stress 1/9, revision 2. Applied showed requested: 1, effective: 1.
3. Three sequential POST requests with {delta: 2} and current If-Match values → all 200 OK, stress incremented to 3/9, 5/9, 7/9 with revisions 3, 4, 5. All applied.effective matched delta (no clamping needed at these values).
4. POST with stale revision (If-Match: 1, when current is 5) → 409 CONFLICT, error.code: STALE_REVISION, error.message: "current revision is 2" (at that point), full character DTO returned with current stress/revision state.
5. Verified If-Match header was sent in all requests (curl headers confirmed).
6. Stress max (9) never hardcoded on frontend; read from character.monitor.stress.max which comes from game-settings JSON (Blades in the Dark sets max 9).
7. No forbidden paths touched (contract/, conformance/, blades-in-the-sheets/).
8. Temp Ada server (port 9750) and data directory cleaned up; port confirmed free after shutdown.

Status: implemented.

- 2026-07-24: Sonnet 5/medium acceptance. `npm test -- --run` (46/46 pass) and
  `npm run build` (tsc --noEmit + vite build) both green on independent rerun.
  Grep-verified stressAdd test count (`describe("stressAdd")` contains exactly
  4 `it()` blocks) — matches the claimed count exactly, no overclaim. No
  forbidden paths (contract/, conformance/, blades-in-the-sheets/) touched.
  Independently re-ran the live Ada check on a fresh isolated instance (port
  9751, temp data dir seeded from data/games): character creation (revision 1,
  stress 0/9), stress.add success (If-Match: 1 → 200 OK, stress 1/9, revision
  2), and stale If-Match (If-Match: 1 against current revision 2) → 409 with
  error.code STALE_REVISION — all matched the implementation report exactly.
  Server process killed and port confirmed clean afterward. No
  acceptance-blocking findings from review; nonblocking notes (malformed-409
  DecodeError fallthrough, missing aria-busy during mutation,
  currentRevision=0 fallback) left as-is per slice scope — no behavior change
  required.

Status: accepted.
