---
id: CHAR-04
title: Approved phase/downtime presentation
deps:
  - DEC-02
  - CONTRACT-02
track: frontend
outputs:
  - frontend/src/pages/character-detail.ts
  - docs/pages/contract/contract-c2-vice-stress.mdx
acceptance:
  - only approved semantics; no control calls a full stress clear "Indulge Vice" unless it records contracted vice relief; real Chromium verification + Luna review
---

# CHAR-04 — approved phase/downtime presentation

**Wave 6.** Finding UX-004.
**Status:** DONE — 706/706 character-detail tests, browser suite PASS, build clean (per `tasks/metrics/frontend/CHAR-04.json`)
**Metrics:** `tasks/metrics/frontend/CHAR-04.json`

## Log

- 2026-08-26: red — stress-clear labeled as "Indulge Vice" (false); overindulged signal absent; phase helpers missing.
- 2026-08-26: VP clamp + stress/trauma boundary fix in `frontend/src/pages/character-detail.ts`; only approved semantics surfaced.
- 2026-08-26: green — 706/706 character-detail tests; `conformance/suites/contract/character-summary.test.ts` 3/3; M02/M03 killed; browser suite PASS; build clean; Luna PASS (`char04 journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
