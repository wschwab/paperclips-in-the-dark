---
id: CREW-01
title: Rep/Turf, Tier, and funds
deps:
  - DEC-04
  - CONTRACT-03
track: frontend
outputs:
  - frontend/src/pages/crew-sections/trackers.ts
  - frontend/src/pages/crew-detail.ts
  - conformance/suites-browser/checkpoints/crew-create-trackers.journey.mjs
acceptance:
  - unified Rep/Turf tracker with non-color cues; Roman-numeral Tier from settings; Stash bounded by CONTRACT-04 stashCapacity, disabled at capacity; reload-safe; Luna review
---

# CREW-01 — Rep/Turf, Tier, and funds

**Wave 7.** Finding UX-007.
**Status:** DONE (per `tasks/metrics/frontend/CREW-01.json`)
**Metrics:** `tasks/metrics/frontend/CREW-01.json`

## Log

- 2026-08-28: red (1 stash-bound test failing before fix), then green: SC-F3 block 5/5 pass; full frontend suite 759/759; tsc clean; vite build clean.
- 2026-08-28: unified Rep/Turf tracker (Rep top-left, Turf bottom-right, distinct Turf accent), Roman-numeral Tier from settings, Stash bounded by CONTRACT-04 `stashCapacity` and disabled at capacity; mutation responses authoritative for stale/clamped state.
- Luna gate: REVIEW-02 corrected-candidate rerun independently ran `npm run test:browser` (fresh run 2026-08-31, candidate 9c837bde: passed=true, 0 problems, 6/6 journeys); crew-create-trackers stash-bound-disabled-at-capacity:1, tier-clamp-notice:1, matrix=9; zero console/network errors; journey race resolved by per-click server-authoritative + UI await.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
