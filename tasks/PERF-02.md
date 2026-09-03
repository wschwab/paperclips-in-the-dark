---
id: PERF-02
title: Bounded roster rendering with degraded reachability
deps:
  - PERF-01
  - BROWSER-01
track: frontend
outputs:
  - frontend/src/pages/roster.ts
  - agent-docs/test-audit/browser-evidence/reports/perf02-report.md
acceptance:
  - DOM nodes within the committed 1000-row budget; every readable row discoverable; every degraded row reachable under a nonmatching query; BROWSER-02 journey 1 passes
---

# PERF-02 — bounded roster rendering with degraded reachability

**Wave 4.** Finding AR-010.
**Status:** DONE — 16/16 roster tests, 697/697 frontend suite, DOM 5188→1190 nodes (budget 2000), degraded rows 0/100→100/100 reachable (per `tasks/metrics/frontend/PERF-02.json`)
**Metrics:** `tasks/metrics/frontend/PERF-02.json`

## Log

- 2026-08-26: red — 16/16 roster tests, but DOM 5188 nodes exceeded the committed budget 2000; degraded rows 0/100 reachable (1,000-row roster mapped every row into the DOM; search could hide degraded rows whose fallback text did not match).
- 2026-08-26: bounded rendering (`ROSTER_PAGE_SIZE=100`, `ROSTER_DOM_BUDGET_NODES=2000` in `frontend/src/pages/roster.ts`); counts describe the full result set; degraded rows stay in an always-visible recovery group; compact `aria-live` preserved.
- 2026-08-26: green — 16/16 roster tests, 697/697 frontend suite, 1000-row DOM 1190 nodes, degraded rows 100/100 reachable. Evidence in `agent-docs/test-audit/browser-evidence/reports/perf02-report.md`.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
