---
id: EDGE-01
title: Recursive and near-limit unknown-key disclosure
deps:
  - ORACLE-01
track: contract
outputs:
  - conformance/suites/persistence/unknown-key-boundary.test.ts
acceptance:
  - cd conformance && npm run test:ada -- suites/persistence/unknown-key-boundary.test.ts
  - cd conformance && npm run typecheck
  - cd conformance && npm run test:ada
---

# EDGE-01 — recursive and near-limit unknown-key disclosure

**Status:** complete
**Revision:** wpyxstyy (working copy; finalized before next card)

## Log

- 2026-08-23: expanded the boundary matrix from three count checks to seven end-to-end cases: exact 512/513/600 multisets, a request within 1 KiB of the 1 MiB limit, nested/repeated array-item pointers, confirmed apply preservation, and stale-token no-write behavior.
- 2026-08-23: current backend normalization passed all seven cases without a source change, as the card required when no new defect was exposed.
- 2026-08-23: controlled M04 truncation compiled successfully and the focused suite killed it with exact-pointer failures in all three count cases. The source was restored from the parent revision, rebuilt, and the focused suite returned 7/7 green.
- 2026-08-23: final acceptance proved typecheck and canonical Track A 55 files/426 tests; the managed run removed its owned temporary evidence. `jj st` showed only this test file before task records were added.
