---
id: F2b
title: "Second playable UI slice: character detail page"
deps: [F2a, A2]
track: frontend
outputs:
  - getCharacter API client method with tests
  - /character/:id detail page
  - character links from roster to detail page
acceptance:
  - "a focused frontend test fails before getCharacter exists and passes afterward"
  - "GET /api/characters/{id} is decoded through the existing Character schema"
  - "/character/:id renders character name, playbook, heritage, background, vice, stress, traumas"
  - "roster /character/:id links navigate via client routing"
  - "loading, API/decode error states are explicit"
  - "npm test -- --run and npm run build pass"
  - "the built /character/:id route is served by backend-ada and loads its character"
---

This is the second bounded slice of F2, building on F2a with character detail read-only.
Do not add editing, history, stale-revision behavior, or creation in this slice.

## Log

- 2026-07-22: Haiku 4.5/high implements red-green slice.
- Red: `npm test -- --run src/api/client.test.ts` failed because `getCharacter`
  was not exported. Green: 3 focused client tests; all frontend tests pass.
- Added character-detail.ts page component following the same Effect + aria-live
  pattern as roster.ts.
- Roster now renders character links to /character/:id; client routing via
  location.pathname regex match.
- npm run build green; served by backend-ada.
- 2026-07-22: Sonnet 5/medium review found no blocking issues (see
  `tasks/metrics/frontend/F2b.json`).
- 2026-07-22: acceptance pass — `npm test -- --run` (24/24) and `npm run
  build` green. Live Ada check: fresh `backend-ada/server/bin/pitd` instance,
  created a character via `POST /api/characters`, confirmed
  `GET /api/characters/{id}` returns the full decodable Character DTO,
  `/character/{id}` serves the SPA shell, unknown id returns 404. No
  forbidden paths (contract/, conformance/, blades-in-the-sheets/) touched.
  Status: accepted.
