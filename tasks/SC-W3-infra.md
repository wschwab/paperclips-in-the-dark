---
id: SC-W3-infra
title: Wave-3 infrastructure status (historical)
deps: []
track: contract
outputs:
  - tasks/metrics/contract/SC-W3-infra.json
acceptance:
  - frozen managed-suite state recorded (279 passed / 135 failed); strict-decode offline pins retained; remaining reds categorized
---

# SC-W3-infra — wave-3 infrastructure status (historical)

**Historical status card** (2026-08-14, orchestrator + deepseek-v4-flash-0731 fix-up dispatches).
**Status:** blocked — see metrics notes (per `tasks/metrics/contract/SC-W3-infra.json`)
**Metrics:** `tasks/metrics/contract/SC-W3-infra.json`

## Log

- 2026-08-14: full managed suite at freeze — 279 passed / 135 failed; 9 strict-decode offline tests still reject bad shapes; remaining reds are behavioral oracles + server-lag classes.
- 2026-09-04 (finding-6 backfill): this tracked card created so the metrics record has its required `tasks/` file and `## Log` per work-spec §3.3 and §5. No sessions/results invented beyond the tracked metrics record.
