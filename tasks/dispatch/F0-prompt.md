# Task F0 — frontend bootstrap

You are Grok 4.5, implementing task F0 of paperclips-in-the-dark.

Read first: `PAPERCLIPS.md` §12 and §3 (architecture), `tasks/F0-frontend-bootstrap.md`
(your acceptance criteria), `contract/openapi.yaml` + `contract/schemas/*.json`
(FROZEN — read-only).

Build under `frontend/` only:
- Vite + TypeScript + Effect. HTTP client and `effect/Schema` decoders
  mirroring `contract/schemas/` (character, crew, clock, operation-result,
  campaign health/roster). Decoders live in `frontend/src/schema/`.
- A minimal health-check page: fetches `/api/health`, renders
  status/implementation/version/dataDir. Talks ONLY to `/api/*` relative paths
  (served same-origin by the backend; dev proxy to localhost:9657 in vite
  config).
- Framework decision (plain DOM vs thin lib): decide, justify in
  `docs/pages/frontend/f0-framework-decision.mdx` (~half a page). Bias:
  minimal — plain DOM + small helpers unless you can argue otherwise.
- TDD: vitest for the decoders (decode golden fixtures from
  `conformance/fixtures/` — read-only) before writing them.

Rules:
- Touch ONLY `frontend/` and `docs/pages/frontend/`. Never `contract/`,
  `conformance/` (fixtures are read-only inputs), `tasks/`, `blades-in-the-sheets/`.
- No git or jj commands — orchestrator owns version control.
- No aesthetic work — that is F1. Unstyled HTML is correct here.

Acceptance (orchestrator-run):
- `cd frontend && npm ci && npm run build` succeeds.
- `npm test -- --run` green (decoder tests against golden fixtures).
- Health page renders /api/health data (verified against a stub server).
- Decision doc exists.

When done, print: file tree, how to run dev server, decision summary.
