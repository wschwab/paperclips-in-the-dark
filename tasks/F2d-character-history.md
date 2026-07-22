---
id: F2d
title: "Fourth playable UI slice: read-only character history page"
deps: [F2c, A2]
track: frontend
outputs:
  - getCharacterHistory API client method with tests
  - /character/:id/history detail page
  - character detail links to history page
acceptance:
  - "focused frontend tests for getCharacterHistory fail before it exists and pass afterward"
  - "GET /api/characters/{id}/history is decoded through the existing HistoryEntry schema"
  - "/character/:id/history renders history entry list with snapshotId, takenAt, op"
  - "character detail page links to /character/:id/history"
  - "loading, API/decode error states are explicit"
  - "npm test -- --run and npm run build pass"
  - "the built /character/:id/history route is served by backend-ada and loads its history"
---

This is the fourth bounded slice of F2, building on F2c with a read-only history page.
Do not add editing, stale-revision behavior, creation, or crew history in this slice.

## Log

- 2026-07-22: Haiku 4.5/high implements red-green slice.
- Red: `npm test -- --run` failed because `getCharacterHistory` was not exported from client.ts. Added 3 focused tests for successful fetch, API error, and decode error.
- Green: Implemented getCharacterHistory function using Effect + Schema.Array(HistoryEntry) decoder. All 30 frontend tests pass.
- Added character-history.ts page component following the same Effect + aria-live pattern as character-detail.ts, rendering history entry list with snapshotId, takenAt, op in a ul/li structure.
- Character detail page now renders a navigation link to /character/:id/history.
- main.ts updated with /character/:id/history route handler matching character detail pattern.
- Rendered loading/error states matching character-detail.ts pattern.
- npm run build green; built frontend is served by backend-ada from localhost:9657.
- 2026-07-22: acceptance pass — `npm test -- --run` (30/30) and `npm run build` green.
  Live Ada check: fresh backend instance with test character created via POST /api/characters,
  confirmed GET /api/characters/{id}/history returns empty array initially,
  POST /api/characters/{id}/ops/stress.add creates history entry with snapshotId/takenAt/op,
  conformance suite passed all history-related tests at BASE_URL=http://localhost:9658,
  no forbidden paths (contract/, conformance/, blades-in-the-sheets/) touched.
  Status: accepted.
- 2026-07-22: acceptance agent independently reran and confirmed green:
  `npm test -- --run` (30/30) and `npm run build`. Live Ada check on a fresh
  isolated backend-ada instance (existing bin/pitd binary, no server change
  in this slice; temp data dir, games seeded from the repo's data/games
  fixtures, port 9759): POST /api/characters created a character, GET
  /api/characters/{id}/history returned `[]` before any op and one entry
  with snapshotId/takenAt/op after a stress.add op, /character/{id}/history
  served the SPA shell (200), and an unknown character id's history returned
  404. Also reran conformance/suites/contract/endpoints.test.ts -t
  CHARACTER-HISTORY (1 passed) and the full
  conformance/suites/persistence/history.test.ts (3/3 passed) against that
  same live instance. Exact server PID stopped afterward, temp data dir
  removed. Review's non-blocking findings (report prose says "timestamp"
  instead of "takenAt"; no client-side sort/assertion of the contract's
  newest-first ordering; no page-level test coverage for
  character-history.ts's Effect composition/error branching; mdx doc not
  wired into a vocs sidebar) are not acceptance blockers and were left as-is
  per no-scope-expansion. No forbidden paths touched.
  Cleanup note: the implementation report's claimed server PID (2309580) and
  my own launch script's reported PID (2387517) both turned out to be a
  wrapper PID one below the actual live `bin/pitd` process (2309582 and
  2387526 respectively) — `kill` on the reported PID left the real server
  running as an orphan on its port even though its temp data dir was already
  removed. Stopped both real PIDs directly; no `pitd` processes remain.
  Future live-acceptance runs on this repo should confirm via `ps` that the
  reported `$!` PID is actually the process holding the port, not just kill
  the reported number and trust it. Status: accepted.
