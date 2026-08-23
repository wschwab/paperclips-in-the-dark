---
id: SC-GATE-01
title: Canonical seeded Track A gate
deps:
  - SC-SAFE-02
track: contract
outputs:
  - conformance/package.json
  - conformance/scripts/managed-run.mjs
  - conformance/src/managed-run.test.ts
acceptance:
  - cd conformance && npm run test:ada
  - npx vitest run --config vitest.tooling.config.ts src/managed-run.test.ts
  - npm run typecheck
---

# GATE-01 — canonical seeded Track A gate

**Status:** complete
**Revision:** yvtxsnqy (working copy; finalized before next card)

## Log

- 2026-08-23: direct unseeded COMPLETE-ALL-003 was red; canonical npm was also red until default seeds were wired. Initial GATE selection had 4/5 new cases fail; corrected red remained 4/5 fail, while forwarding already passed.
- 2026-08-23: green proved managed tooling 26/26, typecheck, and canonical Track A 55 files/422 tests using fresh owned temporary data and two standard seeds; cleanup removed the run.
- 2026-08-23: exact package consumed by CI/mutation is the canonical `conformance` package and its managed launcher path.
- 2026-08-23: first review incorrectly failed later MUT methodology while explicitly saying GATE was satisfied; calibrated no-effort Luna rereview returned PASS.
