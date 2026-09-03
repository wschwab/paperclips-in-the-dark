---
id: THEME-01
title: Dark identity contrast
deps: []
track: frontend
outputs:
  - frontend/src/styles/theme.css
  - conformance/suites-browser/checkpoints/theme01-identity-contrast.mjs
  - agent-docs/test-audit/browser-evidence/reports/w7-theme01-report.md
acceptance:
  - computed kicker/alias ratios at least 4.5:1 in Dark and Hi-C via a dedicated muted-on-dark token; computed colors + ratios in browser evidence
---

# THEME-01 — dark identity contrast

**Wave 7.** Finding UX-015.
**Status:** DONE — 756/756 frontend tests, build clean, contrast light 8.13:1 / dark 12.71:1 / HiC 11.01:1 / dark+HiC 11.01:1 (per `tasks/metrics/frontend/THEME-01.json`)
**Metrics:** `tasks/metrics/frontend/THEME-01.json` (residual roster-span case split out to THEME-01-02)

## Log

- 2026-08-27: red — light-theme identity text contrast 1.63:1 (below the 4.5:1 threshold); Hi-C 1:1 on the inked band; journey payloads were expressions, not IIFEs.
- 2026-08-27: identity text colors adjusted in `frontend/src/styles/theme.css` (dedicated muted-on-dark token; no reuse of a failing light-theme muted token).
- 2026-08-27: green — 756/756 frontend tests; `npm run build` clean; 6/6 browser journeys green; contrast light 8.13:1, HiC 11.01:1, dark 12.71:1, dark+HiC 11.01:1 (all ≥ 4.5:1); theme01-identity-contrast journey green.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
