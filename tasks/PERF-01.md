---
id: PERF-01
title: Replace benchmark and freeze explicit budgets
deps:
  - SAFE-02
  - GATE-01
track: contract
outputs:
  - conformance/scripts/dataset-benchmark.mjs
  - conformance/scripts/lib/chromium-resolve.mjs
  - agent-docs/test-audit/performance-budgets.json
acceptance:
  - cd conformance && npm run test:benchmark green with counts equal to scale
  - over-budget drill fails naming metric/scale; mid-run failure drill proves cleanup
  - no default-data change
---

# PERF-01 — benchmark replacement and frozen budgets

**Status:** complete
**Revision at budget freeze:** ee303c8e (recorded in budgets file)

## Log

- 2026-08-24: red state confirmed — all eleven defects in the old script
  documented with line numbers, including two extra ones (invalid character-
  create payload rejected by the contract; `mkdirSyncSync` ReferenceError on
  fresh checkouts guaranteeing the leak path).
- 2026-08-24: rewrite — one launcher invocation per scale (0/10/100/1000),
  independent fresh data dirs, degraded mix seeded as owned fixture bytes
  (70/10/10/10) staged under tmpdir, count gate before any timing accepted,
  repair-preview probes per degraded row, route classes roster/collections/
  entity-direct/mutation with warmup 3 + measured 20.
- 2026-08-24: metrics captured per scale — API p50/p95/max per class, transfer
  bytes, server peak RSS (/proc VmHWM via unique data-dir token), DOM nodes,
  render-to-stable (mutation-observer quiet window), JS heap, containment.
  Machine/runtime versions recorded. Shared Chromium resolver extracted to
  scripts/lib/chromium-resolve.mjs (BROWSER-01 imports it now).
- 2026-08-24: budgets frozen from the valid baseline only after review:
  bytes/nodes/RSS ×1.5 (+16 MiB RSS slack), latency ×3 +5 ms floor (justified:
  measured run-to-run p95 variance ~2.4× would false-positive at ×1.5),
  containment hard-bound 0 px; fail-closed both directions (missing budget or
  unbudgeted produced metric both fail).
- 2026-08-24: drills — shrunken-budget run exited 1 naming
  `scale 1000: BUDGET EXCEEDED roster.p95Ms`; mid-run failure drill left zero
  temp dirs and zero live processes. Orchestrator independently ran
  `npm run test:benchmark`: PASS, all scales within frozen budgets, launcher
  cleanup line per scale, no data/ changes.

## Worker

Implemented by opencode-go/ox-alpha-free; report at /tmp/perf01-report.md.
Contract-docs follow-ups recorded for a later docs pass: createdAt missing is
classified repairable (auto-stamped), not needs-input as the matrix doc says;
`isRepairable:true` covers both repairable and needs-input rows — only the
preview outcome distinguishes them.
