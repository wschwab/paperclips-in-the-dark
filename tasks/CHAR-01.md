---
id: CHAR-01
title: Approved PC creation workflow
deps:
  - DEC-01
  - CONTRACT-01
track: frontend
outputs:
  - frontend/src/pages/character-create.ts
  - frontend/src/pages/character-create.test.ts
  - conformance/suites-browser/pc-chargen.journey.mjs
acceptance:
  - approved PC/NPC distinction, settings-derived counters, required-field state, atomic submission, escape/override, persistent finish path; real Chromium verification + Luna review
---

# CHAR-01 — approved PC creation workflow

**Wave 6.** Finding UX-001.
**Status:** DONE — character-create tests + pc-chargen browser journey green; browser suite 6/6 journeys PASS; build clean (per `tasks/metrics/frontend/CHAR-01.json`)
**Metrics:** `tasks/metrics/frontend/CHAR-01.json`

## Log

- 2026-08-26: red — `REQUIRED_AFTER_CREATE` fields missing from the chargen form; required-field state not visible before submit.
- 2026-08-26: implemented exactly the approved workflow (`REQUIRED_AFTER_CREATE` + `renderRequiredAfterCreate` in `frontend/src/pages/character-create.ts`); character-create tests + pc-chargen browser journey green.
- 2026-08-26: browser suite all 6 journeys PASS; build clean; Luna review (`char01 journey: 6/6 checkpoints, 0 problems` per finding-traceability UX-001).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
