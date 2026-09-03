---
id: BROWSER-02
title: Six exact stateful journeys
deps:
  - BROWSER-01
track: contract
outputs:
  - conformance/scripts/browser-suite.mjs
  - conformance/scripts/browser-journeys.mjs
  - conformance/suites-browser/
  - agent-docs/test-audit/browser-evidence/reports/w8-browser02-report.md
acceptance:
  - 6/6 top-level journeys, all matrix entries, no horizontal overflow, no missing screenshots/numeric files, no default-data change
---

# BROWSER-02 — six exact stateful journeys

**Wave 4.** Finding AR-005. Covers the six journeys: roster/recovery, character create/edit, crew create/trackers, import/repair, lifecycle, clock; route/theme matrix (roster, character detail, crew detail × 1440×1000, 768×1024, 390×844 × light, dark, high contrast).
**Status:** DONE (per `tasks/metrics/contract/BROWSER-02.json`)
**Metrics:** `tasks/metrics/contract/BROWSER-02.json`

## Log

- 2026-08-27: wave-8 card per `/tmp/w8-browser02-brief.md`; six exact stateful journeys enforced by `REQUIRED_IDS` in `browser-suite.mjs`; 6/6 journeys PASS, 45/45 route × viewport × theme matrix entries green on the first full managed run recorded in `agent-docs/test-audit/browser-evidence/reports/w8-browser02-report.md`.
- Post-wave-8: re-run green as part of wave-8/9 gates. Journey checkpoints caught crew-detail regressions during wave-7 shared-working-copy work (crew-journey fix card, 2026-08-28).
- Per-journey numeric JSON + screenshots land in `$TMPDIR/pitd-browser/<runId>/`. Sibling-noise policy: journeys from in-flight sibling cards are reported as theirs, never blocked on.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
