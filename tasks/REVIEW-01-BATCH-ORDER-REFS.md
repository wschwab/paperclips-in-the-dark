---
id: REVIEW-01-BATCH-ORDER-REFS
title: Preserve batch order and share mutation admission and composite history
deps:
  - REVIEW-01
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/pitd_ops.ads
  - conformance/suites/contract/batch-boundary.test.ts
  - docs/pages/contract/ops-audit.mdx
  - tasks/metrics/ada/REVIEW-01-BATCH-ORDER-REFS.json
acceptance:
  - New order, reference, snapshot, and unknown-property regressions fail before implementation
  - Batch execution and item outcomes follow request order while lock acquisition remains deterministically ordered
  - Batch clock update shares single-route request and reference admission
  - Every successfully changed entity gets one composite snapshot/history entry and revision increment
  - Unknown request properties return 400 VALIDATION without state or history writes
  - Full Ada, tooling, frontend, audit validators, and 28-mutant campaign pass
---

# REVIEW-01-BATCH-ORDER-REFS — shared batch correctness boundary

**Status:** observed acceptance is recorded in the metrics file; independent director review pending.
**Source:** blind review of checkpoint `0627c594`: P1 execution-order drift, P1 skipped clock references, P2 first-child snapshot policy, and P2 unknown batch properties. This parent-linked corrective card introduces no new FV/AR identifiers. No contract or frozen test edits.

## Log

- 2026-10-04: Removed only the isolated calibration workspace through `jj workspace forget review01-plant-sol` and `rm -rf /tmp/review01-0627c594-plant`; retained `/tmp/review01-0627c594-plant-answer-key.txt`. Work returned to the primary repository without commits.
- Read PAPERCLIPS §7.1/§7.2 and frozen OpenAPI `/campaign/batch`: operations are sequential, request and per-op objects forbid unknown keys, and **the batch operation itself** declares `x-snapshot: true` with one snapshot/history entry. Therefore each changed entity gets one pre-batch entry labeled `campaign.batch`, even if all children are micro-ops. Snapshot eligibility is not conditional on the first child, nor on whether any individual child is snapshot-worthy.
- **RED:** `cd conformance && npm run test:ada -- --run suites/contract/batch-boundary.test.ts`, exit 1: **13/13 additions failed**, 1 failed file (`artifact://10474`). Sorted entity storage reversed dependent fund operations and notes; successful results were sorted rather than requested; missing clock owners/relationships and self-links persisted; duplicate links had no per-item typed reference rejection; micro-op-first/only batches lacked snapshots; crew history used a child label; unknown request keys returned 200 and persisted changes.
- Replaced in-place entity sorting with a separate `Lock_Order` index. The plan remains request-ordered for execution, repeated-entity state propagation, and outcomes; removed obsolete `Req_Idx` and failure-only result reorder. Commit uses the entity's final planned state, snapshots once under `campaign.batch`, and bumps revision once.
- Added `Validate_Mutation_Request`, shared by the single-entity and batch paths, combining the existing request-shape validator and clock reference checker before mutation. Invalid batch items retain the existing typed per-item error/HTTP-200 envelope and suppress every planned write. Unknown top-level/per-operation properties are rejected as the existing 400 VALIDATION shape error.
- **Build:** `cd backend-ada/server && XDG_RUNTIME_DIR=/tmp alr --non-interactive build`, exit 0, compile/bind/link (2.46 s).
- First focused run caught a test-oracle mistake: the fund example expected a satchel balance of 1 without accounting for its settings-derived capacity. Changed that expected balance to `min(initial + gain, DTO maximum) - spend`; did not change implementation or weaken the order/outcome assertions. The original red run also failed the genuine ordering and rollback assertions.
- **GREEN focused:** `cd conformance && npm run test:ada -- --run suites/contract/batch-boundary.test.ts suites/semantics/composites.test.ts suites/contract/error-union.test.ts suites/semantics/clocks.test.ts`, exit 0: **46/46 tests, 4/4 files**, `artifact://10479`.
- Added current batch behavior and the snapshot-policy rationale to the existing operations-audit docs page. The standardized shape-validation 400 is documented without changing OpenAPI's currently 200-only batch response table.
- Refreshed the same ten callback/ops restoration hashes only after in-memory verification of all 28 mutation anchors; no anchor, replacement, expected killer, or mutant intent changed. Full acceptance and mutation evidence are recorded in the metrics file and additively in MUT-02.
- Full `cd conformance && npm run test:ada -- --run`: **508/508 tests, 60/60 files** (495 baseline + 13 additions), exit 0, 63.27 s (`artifact://10482`). `cd conformance && npm run test:tooling`: **220/220 tests, 14/14 files**, exit 0, 71.95 s (`artifact://10484`). `cd frontend && npm test -- --run`: **794/794 tests, 20/20 files**, exit 0, 15.40 s (`artifact://10486`).
- Full mutation campaign `cd conformance && npm run test:mutation`, exit 0: **28/28 killed**, **0 survived** (**P0 19/19**, **P1 9/9**) with refreshed restoration hashes. Result: `agent-docs/test-audit/mutation-results.json`, revision `ed64305cbe09`, timestamp `2026-10-04T07:53:58.589Z`; raw evidence: `agent-docs/test-audit/mutation-raw-2026-10-04T07-53-58-587Z.txt`. Campaign evidence and second 2026-10-04 hash-refresh entry appended to `tasks/metrics/contract/MUT-02.json` as `correction2026-10-04-batch`.
