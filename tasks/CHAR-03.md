---
id: CHAR-03
title: Section-local updates and error recovery
deps:
  - PERF-03
track: frontend
outputs:
  - frontend/src/pages/character-detail.ts
  - conformance/suites-browser/checkpoints/char03-continuity.mjs
acceptance:
  - stress and gear failure scenarios within approved scroll/render budgets; focus and alert visible/announced; deliberate alert-routing mutant killed
---

# CHAR-03 — section-local updates and error recovery

**Wave 6.** Finding UX-003. Operation errors route to the initiating section's `role="alert"`; scroll preserved unless focus/alert must move; affected-section updates preferred over whole-sheet repaint.
**Status:** DONE — char03-continuity 2 checkpoints PASS, alert-routing mutant killed, all journeys green (per `tasks/metrics/frontend/CHAR-03.json`)
**Metrics:** `tasks/metrics/frontend/CHAR-03.json`

## Log

- 2026-08-26: red — no char03-continuity journey existed; mutation continuity at scrolled positions untested.
- 2026-08-26: section-local error routing + scroll continuity implemented; char03-continuity records both checkpoints (stress-continuity-record, gear-failure-alert-routed); alert-routing mutant killed by the new journey.
- 2026-08-26: green — all journeys green (see also PERF-03: renderToStableMs 80.4, scrollDriftPx 0).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
