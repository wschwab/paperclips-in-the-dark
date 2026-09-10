---
id: REVIEW-01-BATCH-CONCURRENCY
title: Lock batch reads, reuse keyed replay, and isolate interrupted-worker assertions
deps:
  - REVIEW-01
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb
  - conformance/suites/persistence/batch-concurrency.test.ts
  - conformance/src/managed-run.test.ts
  - conformance/src/managed-orphan-regression.ts
  - conformance/fixtures/mutation-catalog.json
  - docs/pages/contract/ops-audit.mdx
  - docs/pages/frontend/operational-behavior.mdx
  - tasks/metrics/ada/REVIEW-01-BATCH-CONCURRENCY.json
acceptance:
  - Failing-first regressions cover acknowledged concurrent batch writes, keyed retries, and unrelated mutation-process matches
  - Batch acquires all entity locks before reading and classifying current DTOs
  - Batch exact retries reuse the existing serialized scope guard and replay store without new statuses or mismatch policy
  - Interrupted Vitest cleanup checks only owned server, Vitest, and executing worker PIDs
  - Full Ada, tooling, frontend, three validators, and all 28 mutants pass
---

# REVIEW-01-BATCH-CONCURRENCY — shared locking, replay, and process ownership

**Status:** implementation acceptance passed: full Ada/tooling/frontend, all three audit validators, and 28/28 mutants killed; independent director review pending.
**Source:** clean review of checkpoint `96654312` (parent `0627c594`): P1 stale pre-lock batch reads, P1 ignored batch Idempotency-Key, and P2 TOOLING-MANAGED-013 host-wide orphan matches. Work is in the primary repository, with no commits or changes to frozen contracts/tests, user campaign data, or `.omo`.

## Log

- 2026-10-05: Read the existing entity-lock registry, single-route lock/read boundary, create scope guard, and shared idempotency store. Kept deterministic lock-order indices and request-order execution from the previous correction. Moved all batch stored-file existence/read/classification below acquisition of every entity lock; locks span planning, snapshots, revision stamping, and writes, and are released on exceptional exits as well as normal returns.
- Extracted the existing batch planner into `Handle_Batch` and widened the existing `Handle_Create` guard to `Handle_Keyed_Request`, migrating every create caller. Batch uses the same method/route/key serialization and raw-body SHA-256 lookup; only a completely successful committed batch stores its original response bytes in the existing bounded store. Failed batches are not cached as successes. No second cache, new status, or key/body mismatch policy was introduced.
- **RED replay:** `cd conformance && npm run test:ada -- --run suites/persistence/batch-concurrency.test.ts`, exit 1: all six initial additions failed (`artifact://10526`). Four replay cases demonstrated extra application/history, scope retry duplication, and failed-batch recovery followed by duplicate application. The initial concurrency probes hit Node socket resets instead of the intended state oracle.
- **Concurrency regression refinement:** both undici and independent Node HTTP sockets reset under the 24-way burst, consistent with the existing persistence concurrency suite's documented Node socket limitation. Plain concurrent curl spawning serialized enough startup work to let a stale-read negative control pass, so the permanent helper starts all 24 curl children before releasing their request bodies through stdin. No retries or reduced concurrency were introduced; the same test checks all acknowledgements, final coin/revision, and 24 history entries. The isolated diagnostic server and its owned temporary data were removed.
- **RED locking:** temporarily placed the classification block before acquisition (the original defect) while keeping replay fixes intact, then `cd conformance && npm run test:ada -- --run suites/persistence/batch-concurrency.test.ts -t BATCH-CONCURRENCY`, exit 1: **2 failed**, 4 skipped (`artifact://10546`). All 24 requests acknowledged success in both cases, but batch-only ended at coin **12 / revision 13**, and mixed single/batch at **10 / 11**, instead of **24 / 25**. Restored the classification block under all entity locks immediately afterward; no negative-control code remains.
- **RED tooling:** extracted the existing blocker-substring search into the shared helper without changing its behavior, then `cd conformance && npm run test:tooling -- src/managed-run.test.ts -t TOOLING-MANAGED-028`, exit 1: **1 failed**, 27 skipped (`artifact://10529`). The stopped owned PID passed, but an unrelated live command containing `npm run test:mutation -- --exclude suites/__sc_o0_blocker__.test.ts` falsely failed the assertion. The helper's live-owned positive control also ran. An initial direct Vitest invocation used the conformance rather than tooling config and collected no tests; this was corrected to the tooling npm script before recording RED.
- Replaced the broad worker search with `assertOwnedProcessesStopped`. TOOLING-MANAGED-013 now captures the actual executing blocker's PID in its marker before interruption, alongside the announced Vitest and server PIDs. TOOLING-MANAGED-028 reuses the shared live-owned/stopped-owned controls and preserves the unrelated matching process throughout.
- **GREEN focused:** `cd backend-ada/server && XDG_RUNTIME_DIR=/tmp alr --non-interactive build && npm --prefix ../../conformance run test:ada -- --run suites/persistence/batch-concurrency.test.ts suites/contract/batch-boundary.test.ts && npm --prefix ../../conformance run test:tooling -- src/managed-run.test.ts -t 'TOOLING-MANAGED-(013|027|028)'`, exit 0: build compile/bind/link **1.71 s**, **19/19 Ada tests in 2 files**, **3/3 selected tooling tests** (25 skipped), `artifact://10548`.
- Added behavior notes to `ops-audit.mdx` and the existing operational-behavior tooling page. New IDs: `BATCH-CONCURRENCY-001/002`, `BATCH-IDEMPOTENCY-001..004`, and `TOOLING-MANAGED-028`.
- Compared every catalog restoration hash to current files. Exactly six callback entries required refresh: M05/M07/M08/M09/M14/M15, `1f3513e5b8850763060dfd18245d2575d2a20a1b9dbf65d57b364d772ae7cf26` → `fa2bbe61fbb1af2863ebfa429cbc3ebdd5f156c5f73c9094696d51ec52827400`. All other hashes matched. No mutant anchor, replacement, killer, severity, or intent changed.
- **Full acceptance and mutation:** from repo root, `npm --prefix conformance run test:ada -- --run && npm --prefix conformance run test:tooling && npm --prefix frontend test -- --run && npm --prefix conformance run test:mutation`, exit 0 (`artifact://10552`), **1811.81 s for the whole four-command sequence**. Ada **514/514**, **61/61 files**, 65.75 s Vitest (508 baseline + 6 additions); tooling **221/221**, **14/14 files**, 76.33 s (220 baseline + 1 addition); frontend **794/794**, **20/20 files**, 15.60 s. Guard-violation output was from the deliberate temporary guard-test fixtures, not user campaign data.
- **Mutation:** green baselines Ada514/tooling221/frontend794; **28/28 killed**, **0 survived** (**P0 19/19**, **P1 9/9**). All mutated source files restored byte-exactly to baseline; clean backend rebuilt after every Ada mutant. Result `agent-docs/test-audit/mutation-results.json`, revision `dfcb21d16580`, timestamp `2026-10-05T07:03:43.058Z`; raw `agent-docs/test-audit/mutation-raw-2026-10-05T07-03-43-056Z.txt`. Additive MUT-02 metrics key: `correction2026-10-05-batch-concurrency`.
- **Validators:** from repo root, `node agent-docs/test-audit/validate-metrics.js && node agent-docs/test-audit/validate-finding-traceability.js && node agent-docs/test-audit/reconcile-audit.js`, exit 0: **157 metrics files**, **231/231 traceability checks**, **17/17 reconciliation checks**, **0 errors**, reconciliation **0 warnings** and **1624 current rows**. All three reported `ALL CHECKS PASSED`.
