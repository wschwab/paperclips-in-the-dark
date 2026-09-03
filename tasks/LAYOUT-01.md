---
id: LAYOUT-01
title: Roster and sheet alignment
deps: []
track: frontend
outputs:
  - frontend/src/pages/roster.ts
  - frontend/src/styles/roster.css
  - conformance/suites-browser/checkpoints/layout01-alignment.mjs
  - agent-docs/test-audit/browser-evidence/reports/w7-layout01-report.md
acceptance:
  - shared grid starts align roster/sheet columns; Health/Traumas dead gap removed with DOM reading order preserved; repeated-row grids stabilize action columns; true 1440/768/390 verification (no CSS emulation)
---

# LAYOUT-01 — roster and sheet alignment

**Wave 7.** Finding UX-014.
**Status:** DONE — 756/756 frontend tests, 12 browser journeys incl. new layout01-alignment green, zero horizontal overflow (per `tasks/metrics/frontend/LAYOUT-01.json`)
**Metrics:** `tasks/metrics/frontend/LAYOUT-01.json`

## Log

- 2026-08-27: red — roster/sheet misaligned; dead gaps in the action column; overflow at 390×844 (char03-continuity probe: roster masthead left 284 ≠ plate left 729; roster plates emptied by auto-repair; multicol created a 1419px rebalance seam).
- 2026-08-27: grid alignment fix in `frontend/src/pages/roster.ts` + `roster.css` (Create beside section headings; action columns tightened; no horizontal overflow).
- 2026-08-27: green — 756/756 frontend tests; tsc clean; `npm run build` clean; 12 browser journeys (incl. new layout01-alignment: 18 probes × 3 viewports × 3 themes) green; numeric geometry within budget; Luna PASS (`layout journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
