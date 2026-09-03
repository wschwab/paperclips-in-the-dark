---
id: CREW-02
title: Intentional claim acquisition and removal
deps:
  - TEST-02
track: frontend
outputs:
  - frontend/src/pages/crew-sections/claims.ts
  - conformance/suites-browser/checkpoints/crew02-claims.mjs
acceptance:
  - acquisition confirmation; stronger disconnected-node warning; normal-mode acquisition focus; explicit claim-edit mode for relinquish/removal; browser proof acquires two claims, reloads, deliberately removes one
---

# CREW-02 — intentional claim acquisition and removal

**Wave 7.** Finding UX-008.
**Status:** DONE (per `tasks/metrics/frontend/CREW-02.json`)
**Metrics:** `tasks/metrics/frontend/CREW-02.json`

## Log

- 2026-08-27: red — claim set/remove had no named assertion path.
- 2026-08-27: acquisition confirmation, stronger disconnected-node warning via aria-live, normal-mode acquisition focus, explicit claim-edit mode for relinquish/removal; contract-permitted out-of-sequence acquisition preserved after confirmation.
- 2026-08-27: green — crew02-claims journey PASS (acquire 2 claims → reload → remove 1; 5 claim ops × 2 states × 3 themes); journey retained in the six-journey browser suite, green through wave-8/9 gates; Luna PASS (`w7-crew02 journey: 6/6 checkpoints, 0 problems`).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
