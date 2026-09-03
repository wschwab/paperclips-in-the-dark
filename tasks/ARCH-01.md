---
id: ARCH-01
title: Ada mega-module decomposition
deps:
  - TEST-04
  - TEST-05
  - MUT-02
track: contract
outputs:
  - backend-ada/server/src/pitd_callback.adb
  - backend-ada/server/src/ (six extracted packages)
  - agent-docs/test-audit/browser-evidence/reports/w9-arch01-report.md
acceptance:
  - relevant focused suites and mutants unchanged after each slice; full seeded conformance, frontend tests/build, six browser journeys, benchmark budgets green at completion
---

# ARCH-01 — Ada mega-module decomposition

**Wave 8.** Finding AR-014. One concern extracted per revision (stored classification; normalization/preview; summary projection with one canonical history metadata path; capability projection; operation routing; thin AWS callback dispatch/encoding glue). No behavior, response shape, error precedence, contract, or test change mixed in.
**Status:** DONE (per `tasks/metrics/contract/ARCH-01.json`)
**Metrics:** `tasks/metrics/contract/ARCH-01.json` (wave-9 card per `/tmp/w9-arch01-brief.md`; structural-only: LOC moved, not added)

## Log

- 2026-08-28: `pitd_callback.adb` 9513→2958 lines with six concerns extracted to packages; exact current symbols and target package interface named before each extraction; focused tests + assigned mutants run after every extraction.
- 2026-08-28: post-extraction gates green — canonical suite 58 files / 471 tests, mutation 28/28, gnatprove 246/246. One mid-card corruption (character-detail.ts, actually ARCH-02 surface) recovered via `git show HEAD` replay.
- 2026-08-28: wave-9 review green (`w9-review-brief.md`); full Ada CI green after the complete card. Report: `agent-docs/test-audit/browser-evidence/reports/w9-arch01-report.md`.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
