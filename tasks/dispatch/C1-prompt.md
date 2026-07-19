# Task C1 — build the conformance suite

You are GPT 5.6 Luna, implementing task C1 of paperclips-in-the-dark.

Read first, in order:
1. `PAPERCLIPS.md` — the spec. §8 (conformance suite) is your deliverable;
   §4, §5.1, §6, §7 define the behavior you are testing.
2. `tasks/C1-conformance.md` — your task file with acceptance criteria.
3. `contract/openapi.yaml` + `contract/schemas/*.json` — FROZEN contract v1.
   You must not modify anything under `contract/`.
4. `conformance/fixtures/golden-*.json` — golden documents (already present).
5. Test cases to mine: `blades-in-the-sheets/Persistence.Test/` (reference
   repo symlink, read-only — port test CASES, not code).

Build under `conformance/` only:
- TypeScript + Effect (HTTP client, `effect/Schema` decoders mirroring
  contract/schemas) + vitest. `BASE_URL` env selects the target server.
- Structure per spec §8: `suites/contract/`, `suites/semantics/` (one file per
  §5.1 behavior, all 11), `suites/persistence/`, `suites/lifecycle/`.
- Scoring harness: `conformance run --against <url> --report json` (a bin
  script wrapping vitest) emitting stable test IDs + pass/fail.
- HTTP↔stdio shim (~200 LOC, neutral) for the §10.3 escape hatch.
- Include Scum & Villainy cases (different maxima — read from
  `data/games/`; if game data JSON is not yet at `data/games/`, copy it
  verbatim from `blades-in-the-sheets/UI/wwwroot/data/` as part of this task).

Rules:
- NEVER touch `contract/`, `tasks/`, `docs/` outside `docs/pages/conformance/`
  (put the report-JSON format doc there), or anything in
  `blades-in-the-sheets/`.
- Do NOT run any git or jj commands. The orchestrator owns version control.
- Red is expected: no server exists yet. Every test must fail with
  connection-refused-style errors against a dead BASE_URL, but the suite
  itself (collection, harness, report output) must run cleanly.
- TDD discipline still applies to your own tooling (the report format, shim).
- When done, print a summary: file tree, test count per suite, how to run.

Acceptance (the orchestrator will run these; your claim is not acceptance):
- `cd conformance && npm ci && npm test -- --run` executes and reports
  per-test results with stable IDs (failures expected, collection errors not).
- `npx conformance run --against http://localhost:1 --report json` (or
  equivalent documented invocation) emits valid JSON report.
- 11 semantics files exist, S&V cases present.
