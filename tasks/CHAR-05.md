---
id: CHAR-05
title: High-impact action and trauma safety
deps:
  - DEC-03
  - CONTRACT-05
track: frontend
outputs:
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/character-sections/highImpact.ts
  - frontend/src/pages/character-sections/lifecycle.ts
acceptance:
  - separated high-impact zone for Retire/Delete with consequence copy + confirmation; End Score visually distinct from permanent actions; trauma removal behind approved confirmation/edit mode; real Chromium verification + Luna review
---

# CHAR-05 — high-impact action and trauma safety

**Wave 6.** Finding UX-005.
**Status:** DONE — 706/706 frontend tests, build clean, browser suite PASS with Luna review (per `tasks/metrics/frontend/CHAR-05.json`)
**Metrics:** `tasks/metrics/frontend/CHAR-05.json`

## Log

- 2026-08-26: red — 4 failing tests (zone absent, no danger class, remove controls ungated, grid placement); build caught a lost non-null assertion.
- 2026-08-26: high-impact zone + end-score display + lifecycle state transitions implemented; trauma removal gated behind approved confirmation/edit mode.
- 2026-08-26: green — 135 page tests pass; 706/706 frontend tests; `npm run build` clean; real-Chromium numeric evidence (light/dark/high-contrast + 390px containment); `conformance/suites/persistence/lifecycle.test.ts` 5/5 transitions; screenshots attached to Luna review (`char05 journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
