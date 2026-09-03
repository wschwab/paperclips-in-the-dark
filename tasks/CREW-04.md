---
id: CREW-04
title: Ability and upgrade safety/layout
deps: []
track: frontend
outputs:
  - frontend/src/pages/crew-detail.ts
  - frontend/src/pages/crew-detail.test.ts
  - conformance/suites-browser/checkpoints/crew04-advance.mjs
acceptance:
  - removal/decrement/unmarking requires explicit advancement-edit mode (+ confirmation where appropriate); ability description renders full-width below the picker; browser proof of the advance flow
---

# CREW-04 — ability and upgrade safety/layout

**Wave 7.** Finding UX-010.
**Status:** DONE (per `tasks/metrics/frontend/CREW-04.json`)
**Metrics:** `tasks/metrics/frontend/CREW-04.json`

## Log

- 2026-08-27: red — ability/upgrade removal not test-pinned; description layout shifted (repeated cramped name in the picker flex row).
- 2026-08-27: advancement-edit mode gates removal; selected ability description renders as a full-width block below the picker.
- 2026-08-27: green — crew04-advance journey PASS (95/95 crew-detail unit tests; 10 paths × 3 themes × 2 viewports); journey green through wave-8/9 gates; Luna PASS (`w7-crew04 journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
