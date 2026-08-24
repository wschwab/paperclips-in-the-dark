---
id: TEST-04
title: Conformance isolation and surgery
deps:
  - TEST-01
  - MUT-01
  - ORACLE-01
  - EDGE-01
track: contract
outputs:
  - conformance/suites/contract/operation-matrix.test.ts
  - agent-docs/test-audit/deletion-log.md
acceptance:
  - three full managed runs green
  - twenty focused concurrency/isolation runs green
  - setup failures reported distinctly; no new mutant survives
---

# TEST-04 — conformance isolation and surgery

**Status:** complete
**Revision:** kvnnkltw (working copy; finalized before next card)

## Log

- 2026-08-24: replaced the endpoint/success overlap with a generated exact-
  schema operation matrix (`operation-matrix.test.ts`, 24 generated read cases
  driven from `getEndpointSchemaMap()`, every failure message carrying
  operationId + method + path + status). Deleted `success-routes.test.ts`
  (21 rows, DC-001) only after the matrix ran green. The matrix is a strict
  superset: it adds the three capability read routes success-routes never hit.
- 2026-08-24: M01 carry-over preserved as two named cases asserting raw
  crew-summary projection fields (canUndo/historyCount) on /roster and crew
  list — endpoints.test.ts had only schema-oracle validation.
- 2026-08-24: six ledger-approved semantics duplicates deleted after body-by-
  body verification against their replacements; retired-deadish and
  stress-overflow files removed whole. Three upgrades enacted in place
  (PERSISTENCE-ATOMIC-001 now can fail — the old form accepted every outcome;
  LIFECYCLE-GAMES-002 pins served-vs-authored settings; TA00-SORT-006 pins the
  exact permutation instead of self-comparison).
- 2026-08-24: acceptance — focused matrix+endpoints 117/117 across pre-delete,
  post-delete, final runs; 20/20 focused isolation invocations green; three
  full managed runs 432/432 each (~49s). Orchestrator independently re-ran a
  full managed run (432/432) plus typecheck.
- Known staleness: `conformance-classification.json` predates the Wave-3 walk
  and still says "keep" for deleted rows; per-layer decisions files are the
  ledger of record.

## Worker

Implemented by opencode-go/ox-alpha-free (omp -p, yolo, max thinking) from a
bounded brief; report at /tmp/test04-report.md. TEST-05 was deliberately
serialized after this card because both mutate/rebuild the same backend tree.
