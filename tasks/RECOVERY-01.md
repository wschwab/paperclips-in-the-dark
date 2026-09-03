---
id: RECOVERY-01
title: Degraded roster recovery and import information architecture
deps:
  - PERF-02
track: frontend
outputs:
  - frontend/src/pages/roster.ts
  - frontend/src/pages/roster-recovery.ts
  - docs/pages/frontend/recovery-import.mdx
  - conformance/suites-browser/checkpoints/roster-recovery/
acceptance:
  - degraded rows visibly classify repairable/needs-input/unreadable with the correct Repair/delete/re-import path; general Character/Crew Import lives at roster level; flow (not each row) decides create/replace under preview token, confirmation, stale-token rules
---

# RECOVERY-01 — degraded roster recovery and import information architecture

**Wave 7.** Finding UX-012.
**Status:** DONE — 23/23 roster unit tests, roster-recovery journey PASS, build clean, zero console errors (per `tasks/metrics/frontend/RECOVERY-01.json`)
**Metrics:** `tasks/metrics/frontend/RECOVERY-01.json`

## Log

- 2026-08-27: red — roster-recovery journey half-applied (duplicate `repairableCount`/`unreadableCount` declarations, lost Repair-confirm click + readableLink locator); degraded rows unreachable; import silently dropped bad records.
- 2026-08-27: filtered degraded-row visibility + import preview with data-loss pointers in `frontend/src/pages/roster.ts` + `frontend/src/pages/roster-recovery.ts`; direct detail reads stay strict at 422.
- 2026-08-27: green — 23/23 roster unit tests incl. 7 RECOVERY-01 cases; `npm run build` clean; roster-recovery journey PASS (5 import + 3 recovery probes × 4 viewports) on live backend-ada with zero console errors; Luna PASS (`w7-recovery01 journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
