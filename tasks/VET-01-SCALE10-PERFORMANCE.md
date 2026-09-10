---
id: VET-01-SCALE10-PERFORMANCE
title: Restore frozen scale-10 read budgets
deps:
  - PERF-04
track: ada
outputs:
  - backend-ada/server/src/pitd_normalize.adb
  - backend-ada/server/src/pitd_stored.adb
  - backend-ada/server/paperclips_server.gpr
  - conformance/src/read-classification-allocation.test.ts
  - docs/pages/contract/stored-read-performance.mdx
acceptance:
  - Same-machine historical controls and revision slice measurements preserved
  - Frozen roster and collection budgets remain unchanged
  - Read allocation regressions added failing-first
  - Candidate benchmark respects roster p50 13ms and collections p50 9ms at scale10
---

# VET-01-SCALE10-PERFORMANCE

## Log

- 2026-10-05: Wave 10 VET failure supplies the performance red: scale10 roster
  p50 16.98ms >13ms; collections p50 13.76ms >9ms. Historical accepted PERF-04
  card and metrics retained, not rewritten as current-machine evidence.
- Measured disposable jj workspaces at 801798b8 →0627c594 →96654312 →e019e0ff
  →ba03c32e →bc63af5f, with back-to-back oldest/current controls. All show the
  same failure; no isolated regression begins at the later lock/admission work.
  `perf-investigation/bisect-summary.json` preserves exact scale10 measurements.
  Diagnostic subset enforcement also reported absent unrequested scales; this
  is not a full benchmark gate pass.
- Added failing-first structural allocation guards: TOOLING-READ-PERF-001
  failed on collecting/sorting every known key; TOOLING-READ-PERF-002 failed on
  reparsing each stored document for normalization. Both passed after removing
  redundant work. These guard code structure, not semantic conformance.
- Candidate 1 (unknown-key filtering only): roster p50 13.97/15.26ms,
  collections p50 11.61/12.46ms. Improvement is insufficient; retained as
  intermediate evidence, not acceptance. No second read cache introduced.
- Recovered VetPerf's completed parse-once and production-mode edits. Recorded
  compiler metadata had no optimization flag; the existing Alire manifest sets
  `GPR_BUILD=production`, and the server GPR now consumes that scenario with
  `-O2` while retaining runtime checks. TOOLING-READ-PERF-003 failed before the
  GPR edit and passed afterward in `history://vet-fail-fix.VetPerf` (lines
  580–592). Its recovered assertions additionally check the manifest/scenario
  connection; these added assertions are not yet rerun.
- No cache, budget, schema, or admission bypass was added. The existing parse
  failure fallback remains unchanged. Main owns M04/M06 mutation retargeting:
  M06's old adjacent parse/exception anchor changed; M04 must target the
  removal-key collector rather than the legacy dictionary collector.
- Recovery worker ran no builds, tests, formatters, or benchmarks. Candidate
  acceptance remains **pending orchestrator verification**, not green from
  structural guards. The recorded intermediate measurements remain failures.
- Removed all seven recovered `vet-perf-*` disposable jj workspaces and their
  exact `/tmp/pitd-perf-*` directories after confirming the archived evidence
  and absence of directly launched executables there. Unrelated workspaces
  were left untouched.
- Main's serial production build confirmed `-O2` and retained runtime checks.
  Full frozen benchmark still failed scale10 collections p50 9.46ms >9ms:
  `agent-docs/test-audit/vet-evidence/bc63af5f-resumed-2026-10-05/benchmark-production.log`.
  No budget change was made.
- Added TOOLING-READ-PERF-004 before implementation. Main recorded expected
  red (1 failed, 3 passed) in the adjacent `performance-membership-red.log`.
  Replaced per-member pipe-wrapped temporary construction in `In_Allowed`
  with guarded delimiter/slice comparison. Empty names, embedded pipes, and
  arbitrary allowed-string lower bounds retain the previous exact matching
  semantics; the length guard bounds arithmetic before iteration.
  Worker ran no checks; Main owns structural green, rebuilt semantic suites,
  and frozen full benchmark acceptance for this further correction.
- Main's subsequent full benchmark passed collections but failed scale10
  roster p50 13.17ms >13ms and mutation p50 6.67ms >6.13ms:
  adjacent `final-benchmark.log`. This remains an observed failure, not noise
  dismissed by repeating the benchmark.
- Added TOOLING-READ-PERF-005; Main recorded expected red (1 failed, 4 passed)
  in `performance-string-allocation-red.log`. Removed redundant field lookups
  and canonical scalar-string deep clones in `N_Str`/`N_Str_Required`.
  GNATCOLL 26's `Adjust` retains string storage by reference count whereas
  `Clone` calls allocating `Create`; `Set_Field` replaces the object member.
  Container/error deep copies, missing/null diagnostic distinction, coercion,
  and min-length checks are retained. Main owns green/build/full benchmark and
  final campaign rerun if acceptance succeeds; worker ran no verification.
- Scalar correction verification observed by orchestrator: structural **5/5**,
  production build exit 0 (**4.73s**), semantic **45/45 across 4 files**
  (**4.40s**), then full frozen benchmark **all 4 scales PASS**, exit 0
  (**22.72s**). Scale10 p50: **roster10.15ms**, **collections1.97ms**,
  **mutation4.30ms**, within unchanged **13/9/6.13ms** budgets. Archived full
  result `bc63af5f-resumed-2026-10-05/performance-scalar-green.json`; logs
  `performance-string-allocation-green.log`, `performance-scalar-production-build.log`,
  `performance-scalar-semantics.log`, and `performance-scalar-benchmark.log`.
  Refreshed M04 normalizer hash to `6164d6f7b5c61bf36c396ad3ef5b1bbeeb0e60541cafc8f5ff4939e526a85fc1`;
  final source-corrected full campaign is running as `bg_36`, timeout 0.
  Next exact command after **28/28**: `python /tmp/pitd-vet-final-gates.py pass2`.

## Exact next commands (orchestrator, serial)

1. In `backend-ada/server`:
   `XDG_RUNTIME_DIR=/tmp alr --non-interactive build`.
   Then inspect `backend-ada/server/obj/pitd_normalize.ali` and
   `backend-ada/server/obj/pitd_stored.ali`; each must contain `A -O2` and must
   not contain `A -gnatp`. Do not benchmark an old executable.
2. In `conformance`:
   `npm run test:tooling -- src/read-classification-allocation.test.ts`.
3. In `conformance`:
   `npm run test:ada -- --run suites/persistence/entity-admission.test.ts suites/persistence/canonical-shape.test.ts suites/persistence/unknown-key-boundary.test.ts suites/persistence/write-reference-admission.test.ts`.
4. Optional scale10 diagnostic in `conformance`:
   `npm run test:benchmark -- --record --scales 10`.
   This records measurements only, not acceptance; absent scales cannot pass
   the full frozen gate.
5. Full acceptance in `conformance`: `npm run test:benchmark`.
   Record the actual rebuilt-candidate result here and in task metrics; do not
   change budgets. Main separately owns full suites and mutation validation.

Evidence directory:
`agent-docs/test-audit/vet-evidence/bc63af5f-wave10/perf-investigation/`.

## Final corrected-source acceptance (2026-10-06)

After deterministic validator-race correction and refreshed full mutation
campaign, the complete fresh benchmark passed all4 scales, exit0 in26.07s.
Scale10 p50: **roster9.87ms / collections7.77ms / mutation4.29ms** within
unchanged **13/9/6.13ms** budgets. Revision9fb9a13cf847, timestamp
2026-10-06T02:35:53.019Z; archived `pass3-performance-results.json` and
`pass3-final-benchmark.log` in resumed VET evidence.

Full corrected-source mutation **28/28** with restoration PASS; fresh
typecheck, four Ada540/540 cycles, tooling233/233, frontend806/806 and
validators163/231/17 all PASS. Older genuine benchmark failures and
intermediate measurements are preserved. The specified corrective gate
set is complete; this record does not claim the broader release verdict.
