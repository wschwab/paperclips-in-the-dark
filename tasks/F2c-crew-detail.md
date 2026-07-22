---
id: F2c
title: "Third playable UI slice: crew detail page"
deps: [F2b, A2]
track: frontend
outputs:
  - getCrew API client method with tests
  - /crew/:id detail page
  - crew links from roster to detail page
acceptance:
  - "a focused frontend test fails before getCrew exists and passes afterward"
  - "GET /api/crews/{id} is decoded through the existing Crew schema"
  - "/crew/:id renders crew name, type, tier, heat, wanted, rep, hold, fund"
  - "roster /crew/:id links navigate via client routing"
  - "loading, API/decode error states are explicit"
  - "npm test -- --run and npm run build pass"
  - "the built /crew/:id route is served by backend-ada and loads its crew"
---

This is the third bounded slice of F2, building on F2b with crew detail read-only.
Do not add editing, history, stale-revision behavior, or creation in this slice.

## Log

- 2026-07-22: Haiku 4.5/high implements red-green slice.
- Red: `npm test -- --run src/api/client.test.ts` failed because `getCrew`
  was not exported from client.ts. Green: 3 focused crew client tests; all 27 frontend tests pass.
- Added crew-detail.ts page component following the same Effect + aria-live
  pattern as character-detail.ts, rendering crew name, type, basics, status, fund, and notes.
- Roster now renders crew links to /crew/:id via client routing with navLinks.
- main.ts updated with /crew/:id route handler matching character detail pattern.
- npm run build green; built frontend is served by backend-ada from localhost:9657.
- 2026-07-22: acceptance pass — `npm test -- --run` (27/27) and `npm run build` green.
  Live Ada check: fresh backend instance with test crew created via POST /api/crews,
  confirmed GET /api/crews/{id} returns decodable Crew DTO, /crew/{id} serves SPA shell,
  unknown id returns 404, frontend renders crew detail page successfully.
  No forbidden paths (contract/, conformance/, blades-in-the-sheets/) touched.
  Status: accepted.
- 2026-07-22: acceptance agent independently reran and confirmed green:
  `npm test -- --run` (27/27) and `npm run build`. Live Ada check on a fresh
  isolated backend-ada instance (temp data/games dirs seeded from the repo's
  data/games fixtures, port 9758): POST /api/crews created a crew, GET
  /api/crews/{id} returned a decodable Crew DTO, /crew/{id} served the SPA
  shell, unknown id returned 404. Exact server PID stopped afterward, temp
  dir removed. Review's non-blocking findings (mdx doc lists "experience"
  as rendered though it isn't; route regex accepts non-UUID ids and relies
  on backend 404) are not acceptance blockers and were left as-is per
  no-scope-expansion. No forbidden paths touched. Status: accepted.
