---
id: SC-O0
title: "Managed conformance server harness"
deps: [SC-C1, SC-C4]
track: contract
outputs:
  - conformance/scripts/managed-run.mjs (NEW launcher)
  - conformance/package.json (test:ada script)
  - conformance/tooling tests for the launcher
acceptance:
  - (cd conformance && npm run test:ada -- --run) is the stable full managed-suite command; focused selectors forward after the second --. The seed-dependent oracle suites (entity-admission, total-collections, completeness) additionally require the standard oracle seeds and run via `npm run test:ada -- --seed-defaults -- --run <files>` (their file headers document the exact command; --seed-defaults loads conformance/fixtures/sc-o2-seeds + completeness-seeds)
  - Launcher builds/receives the server, picks an unused port, creates a temp data dir, seeds exact bytes before startup and between controlled restarts, observes readiness, stops only its own process tree, preserves evidence on failure, removes it on success
---

# SC-O0 — Managed conformance server harness

## Target

Edit: `conformance/package.json` (add `test:ada` script), new `conformance/scripts/managed-run.mjs`, new tooling test file(s) under `conformance/src/` (launcher unit tests). Do NOT edit suites, fixtures, or contract files. Read-only elsewhere.

## Inputs

- `docs/pages/contract/spec-change-work-spec.mdx` section "SC-O0" (the launcher requirements verbatim) and "Wave 3".
- Existing harness: `conformance/bin/conformance.mjs` (scoring), `conformance/vitest.config.ts` (CONFORMANCE_BASE_URL from BASE_URL), `conformance/src/api.ts`, `backend-ada/AGENTS.md` (server facts: `backend-ada/server/bin/pitd`, `--test-hooks` switch, `XDG_RUNTIME_DIR=/tmp` for alr, data-dir layout `campaign.json` + `characters/` + `crews/`, atomic .tmp writes, launch paths tests `backend-ada/test-launch-paths.sh`).

## Changes

1. `conformance/scripts/managed-run.mjs`: a launcher that
   - builds the server if needed (`(cd backend-ada/server && env XDG_RUNTIME_DIR=/tmp alr --non-interactive build)` — or receives an executable path);
   - selects an unused isolated port (e.g. bind-port-0 probe);
   - creates a fresh temporary data directory (per run; never the live `campaign-data`);
   - seeds exact bytes before startup (copy fixture directories/files — the fixture set is a launcher argument) and between controlled restarts;
   - launches `server/bin/pitd --data-dir <tmp> --port <port>` (check the server's actual CLI flags in `backend-ada/AGENTS.md`/`pitd.adb` — use the real flags, likely `--data-dir`/`--port`/`--test-hooks`), observes readiness (poll `/api/health` until 200, bounded);
   - runs vitest with `CONFORMANCE_BASE_URL=http://127.0.0.1:<port>` forwarding ALL args after `--` verbatim (so `npm run test:ada -- --run suites/foo.test.ts` and `-t name` both work);
   - stops ONLY its own process tree (exact PID, no broad kills);
   - preserves evidence (server log, temp dir) on failure, removes on success (both under a launcher-managed dir, e.g. `/tmp/pitd-managed/<run-id>/`).
2. `conformance/package.json`: add `"test:ada": "node scripts/managed-run.mjs --"` (npm forwards args after `--`; verify the exact forwarding works and document it).
3. Tooling tests (in the `test:tooling` scope): launcher argument forwarding, port isolation (two runs get different ports), temp-dir lifecycle (success removes, failure preserves), process-tree cleanup (no orphan pitd after run).

## Red

Today no managed launcher exists: suites run against a manually started server via BASE_URL.

## Green

- `(cd conformance && npm run test:ada -- --run)` runs the current suite against a managed server and reports the current pass/fail (expected: current state, no launcher-caused failures). Seed-dependent oracle suites are exercised with their seeded commands (`--seed-defaults`).
- `npm run test:ada -- --run -t <existing-test-name>` runs only that test (forwarding works).
- Tooling tests green.
- No orphan processes after success and after failure paths (check with pgrep).

Report exact commands and outputs. Do NOT run project-wide gates (no full ci.sh).

## Metrics

`tasks/metrics/contract/SC-O0.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
