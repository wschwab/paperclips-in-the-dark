---
id: Z2-scorecard
title: Z2 conformance scorecard
deps:
  - Z2
track: zero
outputs:
  - tasks/metrics/zero/Z2-scorecard.json
acceptance:
  - scorecard mirrors the tracked Z2 state honestly (Track Z halted, expected-red, non-blocking)
---

# Z2-scorecard — Z2 conformance scorecard

**Historical scorecard.** Backfilled tracked record for the pre-existing metrics file. Track Z is halted and expected-red, non-blocking (PAPERCLIPS.md §10).
**Status:** complete — see metrics notes (per `tasks/metrics/zero/Z2-scorecard.json`)
**Metrics:** `tasks/metrics/zero/Z2-scorecard.json`

## Log

- Metrics record carries no explicit date, implementation agent, or iteration count (`date: see notes`; `passRateAtFirstDoneClaim: pending green (no first-done claim recorded)`).
- 2026-09-04 (finding-6 backfill): this tracked card created so the metrics record has its required `tasks/` file and `## Log` per work-spec §3.3 and §5. Recorded as-is; no sessions/results/timestamps invented. See the metrics file for the full field state.
