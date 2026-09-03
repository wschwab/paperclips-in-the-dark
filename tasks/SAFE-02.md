---
id: SAFE-02
title: Owned managed launcher and CI cutover
deps:
  - SAFE-01
track: contract
outputs:
  - conformance/scripts/managed-run.mjs
  - conformance/scripts/managed-browser-smoke.mjs
  - conformance/scripts/workflow-isolation-guard.mjs
  - backend-ada/ci.sh
acceptance:
  - collision calibration leaves a pre-existing 9657 server untouched, runs on a different owned port
  - wrong-dataDir, child-exit, bind-failure cases fail before a test request
  - success, assertion failure, timeout, SIGINT, SIGTERM leave no child and no owned temp directory
  - RUN_CONFORMANCE=1 backend-ada/ci.sh cannot contact the pre-existing 9657 server, no default campaign hash change
---

# SAFE-02 — owned managed launcher and CI cutover

**Wave 0.** Findings AR-003 and UX-013.
**Status:** DONE (per `tasks/metrics/contract/SAFE-02.json`)
**Metrics:** `tasks/metrics/contract/SAFE-02.json` (canonical record; wave-0 scorecard with the original narrative at `tasks/metrics/contract/SC-SAFE-02.json`, numbers copied verbatim)

## Log

- 2026-08-23: red preserved — 4/17 selected cases failed before implementation; first implementation run failed 13/20 managed-run cases (temporary fake default directory used; never user data).
- 2026-08-23: `openai-codex/gpt-5.6-luna` workers (effort `none`) built the owned launcher: unique temp directory + unused port per run, readiness gated on exact live child, no bind/startup error, health implementation + `dataDir` resolving to the exact owned directory; `finally` cleanup covers all exits and signals, targeting only the exact owned child/process tree and directory.
- 2026-08-23: green — 32/32 focused safety tests (+7 browser-smoke lifecycle tests) + typecheck pass; guarded npm smoke pass; independent safety review PASS.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
