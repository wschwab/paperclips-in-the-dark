---
id: C2
title: "Conformance repeatability and persisted-state hardening"
deps: [C1]
track: contract
outputs:
  - conformance/suites/persistence/repeatability.test.ts
acceptance:
  - "Ada: BASE_URL=http://localhost:9657 npx vitest run suites/persistence/repeatability.test.ts"
  - "Zero: BASE_URL=http://localhost:9657 npx vitest run suites/persistence/repeatability.test.ts"
---

Add a backend-neutral regression for persisted roster growth. A conforming server
must continue to return a complete roster after enough crews have been persisted
to exceed a small fixed response buffer. This captures the Z2 back-to-back suite
failure without depending on test order or backend internals.

Also cover monotonic identity allocation across deletion. An implementation may
not derive the next ID solely from the current number of index entries, because
deleting an earlier entity would then allow a later create to overwrite a live
entity at the reused ID.

This is a dedicated conformance-hardening task. Backend implementation tasks may
not edit this test.

## Log

- 2026-07-21: added after Zero passed a cold 131/131 run but returned 500 from
  `GET /api/campaign/roster` on the second run against the same process. Ada was
  observed to survive the same accumulated state.
- 2026-07-21 wave 1 red-green baseline: TypeScript typecheck passed. Ada passed
  `PERSISTENCE-REPEATABILITY-001` with 12 persisted crews (1/1). Clean Zero
  created all 12 crews, then roster returned 500 and logged
  `http handler failed`. The test is green for Ada and correctly red for Zero.
- 2026-07-21 wave 2: DeepSeek's 14 KiB roster builder and `PITD_DATA` repair
  made a fresh focused run green twice and a fresh full run 132/132. Luna then
  fixed deletion-driven ID reuse with persisted per-kind sequences;
  `PERSISTENCE-REPEATABILITY-001/002` are 2/2 green on fresh Ada and Zero.
  Accumulated Zero state remains red once the serialized roster approaches the
  native HTTP response boundary (about 6 KiB). A 30 KiB local builder did not
  lift that boundary, demonstrating the need for the §10.3 neutral shim for
  larger rosters.
