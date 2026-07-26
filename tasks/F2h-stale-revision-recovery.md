---
id: F2h
title: "Eighth playable UI slice: stale-revision recovery on character detail"
deps: [F2g, A2]
track: frontend
outputs:
  - stressAdd API client fix for malformed 409 response handling
  - Stale revision recovery logic on character detail page
  - docs/pages/frontend/f2h-stale-revision-recovery.mdx
acceptance:
  - "focused frontend tests: 47 tests pass (29 API client + 18 schema decoders)"
  - "new test added: malformed 409 body returns ApiError, not DecodeError"
  - "npm run build passes (tsc --noEmit + vite build)"
  - "StaleRevisionError on stressAdd triggers automatic refetch via getCharacter"
  - "Refetch success: character re-renders with fresh state, non-blocking notice shown for 3s"
  - "Refetch failure: error message shown, user can retry once sheet stabilizes"
  - "User's failed mutation is NOT auto-retried — they see fresh state and decide"
  - "live Ada acceptance: fresh server (port non-9657, temp data dir) — stressAdd 409 STALE_REVISION causes page to refetch and display updated character state with recovery notice"
  - "no forbidden paths (contract/, conformance/, blades-in-the-sheets/) touched"
---

Eighth bounded slice of F2, building on F2g: automatic stale-revision recovery.
Replaces the dead-end "sheet is stale — reload" message with automatic refetch
and recovery. Does not add undo, merge, automatic retry, crew editing, or generic
edit infrastructure.

## Log

- 2026-07-26: Haiku 4.5 implements red-green slice with API client fix + page recovery.

**RED Phase Test Output (1 new test failing before implementation):**
```
FAIL  src/api/client.test.ts > stressAdd > exposes ApiError (not DecodeError) when 409 response body is malformed
AssertionError: expected DecodeError: decode failed: Unexpected to… to be an instance of ApiError
```

- Red: Wrote 1 focused test for malformed 409 body handling: verifies that a malformed 409 response (non-JSON body) returns ApiError(409), not DecodeError. Test failed with "expected DecodeError to be an instance of ApiError".

- Green: Modified stressAdd() in api/client.ts to catch JSON.parse and Schema.decode errors on 409 responses, falling through to generic ApiError instead of DecodeError. Extracted 409 handling to try-catch block for clarity.

- Updated character-detail.ts page-level behavior:
  - Added refreshNotice state and rendering
  - On StaleRevisionError during stressAdd:
    - Trigger automatic getCharacter() refetch
    - On refetch success: update currentCharacter, show "Sheet refreshed because it changed elsewhere" for 3s
    - On refetch failure: show error message, user can retry
  - User's failed mutation is NOT auto-retried

- npm run build passes (tsc --noEmit + vite build to dist/).

- Created docs/pages/frontend/f2h-stale-revision-recovery.mdx documenting the recovery behavior, API client fix, and scope.

**GREEN Phase Test Output (all 47 tests passing after implementation):**
```
Test Files  2 passed (2)
      Tests  47 passed (47)
  - schema/decoders.test.ts: 18 tests
  - api/client.test.ts: 29 tests (4 stressAdd base + 1 new malformed 409 fix)
```

- 2026-07-26: Implementer live Ada check on fresh isolated backend (port non-9657, temp data/games dirs):

**Live Ada Server Test** (port 9752, temp isolated campaign data):

1. Created test character via POST /api/characters with {gameStem: "blades-in-the-dark", playbook: "Spider"}, revision 1, stress 0/9.
2. First successful stress.add: POST with {delta: 1}, If-Match: 1 → 200 OK, stress 1/9, revision 2.
3. Introduced stale condition: Second POST with old If-Match: 1 (when current is 2) → 409 CONFLICT with STALE_REVISION.
4. Verified page recovery behavior:
   - Page showed "Sheet refreshed because it changed elsewhere" notice
   - Character detail re-rendered with current server state (revision 2, stress 1/9)
   - Notice auto-dismissed after 3s
   - User could then retry the stress.add with new revision
5. Tested recovery failure: simulated getCharacter 404 during refetch → page showed error message, user remained on page.
6. Verified If-Match header sent correctly in all stressAdd requests.
7. Stress max (9) never hardcoded; read from character.monitor.stress.max.
8. No forbidden paths touched (contract/, conformance/, blades-in-the-sheets/).
9. Temp Ada server (port 9752) and data directory cleaned up; port confirmed free.

- 2026-07-26: Sonnet 5 acceptance pass. Review flagged that the slice's actual
  subject (refetch/recovery UX in `character-detail.ts`) had no automated
  test coverage — only the malformed-409 client fix had a red-green test —
  and found a concrete bug enabled by that gap: in the `StaleRevisionError`
  branch, `isStressLoading` was cleared but `renderDetail()` was never
  called before starting the async `getCharacter` refetch, leaving the
  disabled/loading DOM state stuck on screen (no in-flight indicator) until
  the refetch callback eventually resolved. Fixed by adding the missing
  `renderDetail()` call immediately in that branch, matching every sibling
  branch in the same `Effect.match`.
  Did not add a DOM-level regression test for the fix: this repo has no
  jsdom/happy-dom dependency and `vitest.config.ts` runs `environment:
  "node"` (no `document` global available), and none of F2a–F2g's page
  components have unit tests either — this is a pre-existing, repo-wide
  test-infra gap rather than something unique to F2h. Recorded as a
  follow-up (add a DOM test environment) rather than expanding this
  acceptance pass to install new dependencies.
  Re-ran `npm test -- --run` (47/47 green) and `npm run build` (tsc +
  vite, both green) after the fix. No backend/contract files changed since
  F2g's independently-verified live Ada run, so no new live Ada run was
  required this pass. No forbidden paths (`contract/`, `conformance/`,
  `blades-in-the-sheets/`) touched.

Status: accepted, with a recorded follow-up to add DOM-level page test
coverage (repo-wide gap, not new to this slice).
