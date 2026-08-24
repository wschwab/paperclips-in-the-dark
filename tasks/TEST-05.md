---
id: TEST-05
title: Ada runtime/proof audit and surgery
deps:
  - TEST-01
  - MUT-01
track: contract
outputs:
  - backend-ada/core/tests/core_tests.adb
  - agent-docs/test-audit/deletion-log.md
acceptance:
  - runtime failure output names the invariant
  - gnatprove passes at >= current check count (246)
  - relevant mutants produce a named runtime/proof failure
---

# TEST-05 — Ada runtime/proof audit and surgery

**Status:** complete
**Revision:** lsnlsqqz (working copy; finalized before next card)

## Log

- 2026-08-24: every runtime assertion in `core_tests.adb` now carries a GNAT
  Assert label naming its ledger invariant; multi-conjunct monoliths were split
  so each named case guards exactly one invariant. Assertion count 78 → 109;
  conditions preserved verbatim, zero removals. Family → contract mapping block
  added at the top of the file (29 families keyed by stable family name).
- 2026-08-24: deletions — zero rows qualified. All 78 runtime decisions are
  keep; proof decisions record complementarity (proof covers all inputs,
  runtime covers integration chains), never supersession. Evidence in
  `deletion-log.md`.
- 2026-08-24: acceptance — core tests green (109 named cases); named-failure
  demo produced `ASSERTION_ERROR : rollover-overflow-created (M13): new carry
  ADDS to existing` then restored byte-exact; M13 mutation drill killed with a
  NAMED failure and source restored sha256-verified; gnatprove gate passed at
  exactly 246 checks (baseline unchanged). Orchestrator independently re-ran
  the core binary (exit 0) and gnatprove (246/246).

## Worker

Implemented by opencode-go/ox-alpha-free from a bounded brief; report at
/tmp/test05-report.md.
