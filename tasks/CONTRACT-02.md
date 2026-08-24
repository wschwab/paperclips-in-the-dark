---
id: CONTRACT-02
title: Amount-based Vice indulgence + trauma-clears-stress
deps:
  - DEC-02
track: contract
outputs:
  - docs/pages/contract/contract-c2-vice-stress.mdx
  - contract/openapi.yaml
  - conformance/suites/lifecycle/vice-amount.test.ts
  - backend-ada/server/src/pitd_callback.adb
  - frontend/src/pages/character-detail.ts
acceptance:
  - cd conformance && npm run test:ada -- suites/lifecycle/vice-amount.test.ts
  - cd conformance && npm run test:ada
  - cd frontend && npm test -- --run
  - cd frontend && npm run build
---

# CONTRACT-02 — amount-based Vice + trauma-clears-stress

**Status:** complete
**Behavior:** Vice indulgence takes an explicit `amount`; server clamps to
marked stress and signals overindulgence when the request exceeds it (SRD
§Overindulgence consequences surfaced to the frontend). `stress.clear` remains
exposed for agents. Trauma resolution now clears Stress to 0 atomically.

## Log

- 2026-08-25: implemented across spec page (`contract-c2-vice-stress.mdx`),
  OpenAPI request shape (`amount` required on the vice/stress-clear op),
  8-row conformance oracle (clamp, overindulge signal, zero no-op,
  negative/non-integer/missing VALIDATION, resolve-clears-stress incl.
  reload persistence), Ada apply with numeric-clamp semantics, frontend
  amount input + overindulged notice + updated client signature and tests.
- 2026-08-25: worker also ran browser verification with screenshots at three
  viewport/theme combinations (/tmp/contract02-luna/*.webp) and an isolated
  managed-server smoke (/tmp/contract02-smoke).
- 2026-08-25: orchestrator independently verified — focused oracle 8/8;
  canonical Track A 56 files/450 tests (+1 file/+8 tests); frontend 19 files/
  659 tests; production build clean. Report file was not written by the worker
  before exit; evidence above re-derived by orchestrator from gates + jj diff.
