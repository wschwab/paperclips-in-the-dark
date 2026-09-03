---
id: ARCH-02
title: Frontend domain and page-controller decomposition
deps:
  - TEST-03
  - BROWSER-02
  - MUT-02
track: contract
outputs:
  - frontend/src/pages/
  - agent-docs/test-audit/browser-evidence/reports/w9-arch02-report.md
acceptance:
  - relevant focused suites and mutants unchanged after each slice; full seeded conformance, frontend tests/build, six browser journeys, benchmark budgets green at completion
---

# ARCH-02 — frontend domain and page-controller decomposition

**Wave 8.** Finding AR-014. One domain/client or page section extracted at a time using existing patterns (shared mutation transport; character domains; crew domains; roster/recovery; character section controllers; crew section controllers). Routing, focus, alert, render behavior unchanged except unavoidable module boundaries. No framework migration.
**Status:** DONE (per `tasks/metrics/contract/ARCH-02.json`)
**Metrics:** `tasks/metrics/contract/ARCH-02.json` (implementation `ox-alpha`, omp main session)

## Log

- 2026-08-28: frontend 20 files / 756 tests green on first claim; tsc clean; build clean (676 modules); browser 6/6 journeys; mutation 28/28 killed (P0 19/19, P1 9/9).
- 2026-08-28: identical on the wave-9 orchestrator re-run; conformance parity scanner amended to group page + first-party imports (strict-add fix; no manifest or disposition change).
- Report: `agent-docs/test-audit/browser-evidence/reports/w9-arch02-report.md`; wave-8 archive `agent-docs/test-audit/browser-evidence/wave5-browser-evidence.md` retained as history.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
