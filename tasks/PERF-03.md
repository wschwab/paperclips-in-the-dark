---
id: PERF-03
title: Mutation continuity instrumentation
deps:
  - PERF-01
  - BROWSER-01
track: frontend
outputs:
  - frontend/src/pages/character-detail.ts
  - conformance/suites-browser/checkpoints/char03-continuity.mjs
acceptance:
  - stress and gear failure scenarios within approved scroll/render budgets; focus and alert visible/announced; deliberate alert-routing mutant killed
---

# PERF-03 — mutation continuity instrumentation

**Wave 6.** Finding UX-003. Real character mutations instrumented at scrolled positions (pre/post `scrollY`, initiating/focused element rects, operation and render-to-stable durations, alert visibility).
**Status:** DONE — char03-continuity journey 9 checkpoints, alert-routing mutant killed, renderToStableMs 80.4, scrollDriftPx 0 (per `tasks/metrics/frontend/PERF-03.json`)
**Metrics:** `tasks/metrics/frontend/PERF-03.json`

## Log

- 2026-08-26: red — char03-continuity journey not yet added; no browser coverage for mutation continuity at scrolled positions.
- 2026-08-26: continuity fix in `frontend/src/pages/character-detail.ts` (wrapHandlers + per-click server-authoritative UI await); `char03-continuity.mjs` records both checkpoints (stress-continuity-record, gear-failure-alert-routed); alert-routing mutant killed by the new journey.
- 2026-08-26: green — all 5 browser journeys green (char02-option-editors, char03-continuity, character-contacts, pc-chargen, roster-smoke); renderToStableMs 80.4, scrollDriftPx 0.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
