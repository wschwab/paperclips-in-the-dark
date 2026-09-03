---
id: PERF-04
title: Optimize only measured failures
deps:
  - PERF-01
  - PERF-02
  - PERF-03
track: frontend
outputs:
  - conformance/scripts/dataset-benchmark.mjs
  - agent-docs/test-audit/performance-results.json
  - agent-docs/test-audit/performance-budgets.json
  - agent-docs/test-audit/browser-evidence/reports/w8-perf04-report.md
acceptance:
  - valid benchmark first; only metrics over committed budgets optimized; browser and mutation evidence re-run after each slice
---

# PERF-04 — optimize only measured failures

**Wave 8.** Valid performance closure: benchmark first, no optimization without a measured over-budget metric.
**Status:** DONE (no optimization owed) — benchmark harness fix for measurement determinism (per `tasks/metrics/frontend/PERF-04.json`)
**Metrics:** `tasks/metrics/frontend/PERF-04.json`

## Log

- 2026-08-27: wave-8 card per `/tmp/w8-perf04-brief.md`; benchmark first run valid — all 76 budgeted metrics within frozen budgets at scales 0/10/100/1000 (`recordedAt 2026-08-27T17:49:22Z`).
- 2026-08-27: no metric over budget, so no optimization owed; card closed as a benchmark harness fix for measurement determinism. Vet01-gap-fixes re-ran the benchmark after a heap regression finding: 3 consecutive scale-1000 runs (3,767,023 / 3,728,655 / 3,767,079 bytes, all under the frozen 5,343,941 budget).
- 2026-08-28: 20/20 then-current mutants killed during the campaign; full 28/28 on 2026-08-28.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
