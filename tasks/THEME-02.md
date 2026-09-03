---
id: THEME-02
title: Focus and error geometry
deps: []
track: frontend
outputs:
  - frontend/src/styles/components.css
  - conformance/suites-browser/checkpoints/theme02-focus-error.mjs
  - agent-docs/test-audit/browser-evidence/reports/w7-theme02-report.md
acceptance:
  - red reserved for error, focus token for focus; inset outline/safe offset keeps geometry inside editors away from adjacent controls; browser evidence captures focus-only, error-only, focus+error at all affected widths/themes
---

# THEME-02 — focus and error geometry

**Wave 7.** Finding UX-016.
**Status:** DONE (per `tasks/metrics/frontend/THEME-02.json`)
**Metrics:** `tasks/metrics/frontend/THEME-02.json`

## Log

- 2026-08-27: red — focus borders collided with error borders on 12 elements.
- 2026-08-27: focus-ring offset from the error border in `frontend/src/styles/components.css`; enough block spacing to keep geometry inside the editor and away from adjacent controls.
- 2026-08-27: green — 9/9 red-separation combos, 9/9 error-alert-red, 36/36 geometry probes, 27/27 screenshots; theme02-focus-error journey (12 elements × 3 states × 3 themes) retained in the six-journey suite; Luna PASS (`theme journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
