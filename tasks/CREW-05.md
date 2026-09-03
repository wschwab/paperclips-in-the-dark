---
id: CREW-05
title: Cohort conditional validation
deps: []
track: frontend
outputs:
  - frontend/src/pages/crew-sections/cohorts.ts
  - conformance/suites-browser/checkpoints/crew01-cohort-add.mjs
acceptance:
  - only the selected kind's type field shown; Quality/Scale bounds from capabilities/settings; contract-required fields marked; Add disabled until kind-specific requirements valid; backend validation authoritative; no hardcoded bounds
---

# CREW-05 — cohort conditional validation

**Wave 7.** Finding UX-011.
**Status:** DONE (per `tasks/metrics/frontend/CREW-05.json`)
**Metrics:** `tasks/metrics/frontend/CREW-05.json`

## Log

- 2026-08-27: red — cohort add showed all fields; Add readiness undefined.
- 2026-08-27: live conditional-field reproduction first (current code already showed only the selected Gang/Expert type field — retained as browser regression); Quality/Scale bounds derived from capabilities/settings; contract-required fields marked; Add disabled until all kind-specific requirements valid.
- 2026-08-27: green — crew01-cohort-add journey PASS (conditional kind fields, Custom reveal, aria-required Add gating; 4 kinds × 3 states × 2 themes); journey green through wave-8/9 gates; Luna PASS (`crew add journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
