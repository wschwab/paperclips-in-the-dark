---
id: CHAR-02
title: Live option-editor regression
deps:
  - BROWSER-01
track: frontend
outputs:
  - frontend/src/pages/character-detail.ts
  - conformance/suites-browser/checkpoints/char02-option-editors.mjs
acceptance:
  - Hound playbook ability, Heritage, Background, Vice, description editors driven live (select, save, reload, verify name + description); game-data-fetch failure, accessible state, rerender survival; browser coverage retained even if current code passes
---

# CHAR-02 — live option-editor regression

**Wave 6.** Finding UX-002.
**Status:** DONE — 9 checkpoints char02-option-editors PASS; contract misreading fixed; all journeys green (per `tasks/metrics/frontend/CHAR-02.json`)
**Metrics:** `tasks/metrics/frontend/CHAR-02.json`

## Log

- 2026-08-26: red — char02 journey failed: take-ability select never enabled (contract misreading of `availableAbilityTakes`).
- 2026-08-26: contract misreading fixed; editors verified via journey (72 matrix entries: 8 editors × 3 themes × 3 viewports).
- 2026-08-26: green — 9 checkpoints in char02-option-editors (6 happy-path + editor-accessible-state + editor-survives-rerender + game-data-fetch-degrades); all other journeys green; Luna PASS (`w6-maj23 journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
