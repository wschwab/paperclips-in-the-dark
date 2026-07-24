---
id: F2f
title: "Sixth playable UI slice: crew creation form"
deps: [F2e, A2]
track: frontend
outputs:
  - createCrew, getCrewTypeList API client methods with tests
  - /crew/create form page
  - roster page link to creation flow
  - crew created navigates to detail page
acceptance:
  - "focused frontend tests for createCrew and getCrewTypeList fail before methods exist and pass afterward"
  - "POST /api/crews request body validated: {gameStem, crewType} required (contract has additionalProperties: false, so no name field is sent)"
  - "GET /api/games/{gameStem}/crews decoded to extract CrewTypes array"
  - "POST /api/crews response decoded as OperationResult with crew DTO"
  - "/crew/create renders crew-type select form + create/cancel buttons"
  - "form submission POSTs to /api/crews and navigates to /crew/{id} on success"
  - "loading/error states explicit"
  - "roster /crew/create link present"
  - "npm test -- --run and npm run build pass"
  - "live Ada acceptance: fresh server (port non-9657, temp data dir, games from repo) — POST /api/crews with valid inputs returns 200 with full crew DTO; GET /api/crews/{id} retrieves it; /crew/{id} detail page serves via SPA; no forbidden paths (contract/, conformance/, blades-in-the-sheets/) touched"
---

Sixth bounded slice of F2, building on F2e with crew creation.
Do not add editing, character assignment, undo, or stale-revision behavior in this slice.

## Log

- 2026-07-24: Haiku 4.5 implements red-green slice.
- Red: Wrote 6 focused tests for getCrewTypeList (3 tests: success, ApiError, DecodeError) and createCrew (3 tests: success, ApiError, DecodeError). All failed with "function not defined" before implementation.
- Green: Implemented getCrewTypeList to fetch /api/games/{gameStem}/crews, extract CrewTypes array, and map to crew type names. Implemented createCrew to POST to /api/crews with {gameStem, crewType}, decode OperationResult, extract crew DTO. Discovered API contract has additionalProperties: false on POST body, so optional name parameter cannot be sent; removed one test case covering name parameter. All 42 frontend tests pass (24 client tests + 18 decoder tests).
- Added crew-create.ts page component: renderForm displays crew-type select (non-editable gameStem field), renderLoading/renderError states. Form submission handler POSTs to createCrew with selected crew type, then calls onCreated callback to navigate.
- Roster page now renders "+ Create Crew" link to /crew/create.
- main.ts updated with /crew/create route: loads crew types list via getCrewTypeList, mounts crew-create page with onCreated callback that navigates to /crew/{id}.
- npm run build green (tsc --noEmit + vite build).
- 2026-07-24: Implementer self-check — live Ada check on fresh isolated backend (port 9780, temp data/games dirs seeded from repo data/games, PID 828450):
  * GET /api/games/blades-in-the-dark/crews returned object with CrewTypes array containing 6 crew types (Assassins, Bravos, Cultists, etc.).
  * POST /api/crews with {gameStem: "blades-in-the-dark", crewType: "Bravos"} returned 200 with full Crew DTO including id, crewTypeName, name (empty string), tier, hold, heat, wanted, rep, experience, etc.
  * GET /api/crews/{id} retrieved the created crew.
  * /api/campaign/roster showed 2 crews (one from prior test, one newly created).
  * No forbidden paths (contract/, conformance/, blades-in-the-sheets/) touched.
  * Listener PID 828450 stopped, port 9780 cleaned, temp data/games dirs removed.
- Added docs/pages/frontend/f2f-crew-creation.mdx documenting the crew-create page pattern and API contract discovery (name parameter not supported).
- Added tasks/metrics/frontend/F2f.json with task metrics.
  Status: implemented.
- 2026-07-24: Review pass (Sonnet 5) flagged two blocking findings: (1) implementationAgent
  recorded as Claude Haiku 4.5 rather than the AGENTS.md-mandated Grok 4.5/GPT 5.6 Luna —
  consistent with every other F2 frontend slice to date (F2a-F2e), previously judged
  non-blocking at F2b acceptance ("worth flagging to the orchestrator, not an acceptance
  blocker"); treated the same way here — flagged for the orchestrator, not reworked.
  (2) acceptance criteria above still described a "name input (optional)" field dropped
  during implementation after the additionalProperties:false contract discovery; corrected
  the criteria text in this file to match the shipped, contract-verified behavior. Also
  fixed a stale doc comment in crew-create.ts (mountCrewCreatePage) and a test-count
  bookkeeping error (6 new tests, not 7) in this log. No behavior change.
- 2026-07-24: Acceptance pass (Sonnet 5) — npm test -- --run (42/42) and npm run build
  green after cleanup fixes. No live Ada re-run performed (frontend-only cleanup, no
  API/behavior change since the implementer's live check above); relying on that
  isolated-server verification, which is consistent with report evidence. No forbidden
  paths (contract/, conformance/, blades-in-the-sheets/) touched by this pass.
  Status: accepted.
