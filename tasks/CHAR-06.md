---
id: CHAR-06
title: Tracker and field affordances
deps: []
track: frontend
outputs:
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/character-sections/
acceptance:
  - keyboard/browser path edits and reloads each field; mobile and Hi-C layouts contained; no maximum hardcoded
---

# CHAR-06 — tracker and field affordances

**Wave 6.** Finding UX-006 (form clarity: semantic selects, delta labels, XP, Stash/Lifestyle, Background Description).
**Status:** DONE — character-detail + crew-detail tests 706/706; browser suite PASS (per `tasks/metrics/frontend/CHAR-06.json`)
**Metrics:** `tasks/metrics/frontend/CHAR-06.json`

## Log

- 2026-08-26: red — delta labels absent; stash/lifestyle hierarchy flat; semantic selects unvalidated.
- 2026-08-26: semantic default option text, consistent delta labels, tangible XP tracker furniture with accessible names and settings-derived bounds, strengthened Stash/Lifestyle hierarchy (no invented writable Lifestyle), optional Background Description authoring preserving the short Background name and contract field mapping.
- 2026-08-26: green — character-detail + crew-detail tests 706/706; `char06-tracker-delta` checkpoint (4 deltas × edge cases); browser suite all journeys PASS; build clean; Luna PASS (`char06 journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
