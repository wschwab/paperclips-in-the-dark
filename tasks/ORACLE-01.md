---
id: ORACLE-01
title: Mandatory endpoint response oracle
deps:
  - SC-GATE-01
track: contract
outputs:
  - conformance/src/contract-validator.ts
  - conformance/src/endpoint-schema-map.ts
  - conformance/src/schemas.ts
  - conformance/scripts/generate-contract-coverage.mts
  - conformance/generated/contract-coverage.json
  - conformance/suites/contract/endpoints.test.ts
acceptance:
  - cd conformance && npx vitest run --config vitest.tooling.config.ts src/contract-validator.test.ts src/endpoint-schema-map.test.ts src/generators.test.ts
  - cd conformance && npm run typecheck
  - cd conformance && npm run test:ada
---

# ORACLE-01 — mandatory endpoint response oracle

**Status:** complete
**Revision:** vnkkxxkm (working copy; finalized before next card)

## Log

- 2026-08-23: red calibration produced 18 expected failures: missing fail-closed validator/map APIs and missing deterministic coverage generator.
- 2026-08-23: the oracle now derives all 108 OpenAPI operations and all 331 operation/status dispositions; unresolved references, operation IDs, statuses, media types, and schemas fail closed.
- 2026-08-23: contract success suites select responses only through operation ID plus actual status; named schema calls remain only in validator self-calibration.
- 2026-08-23: green proved 38/38 focused tooling tests, typecheck, and canonical Track A 55 files/422 tests. The managed run removed its owned temporary evidence.
- 2026-08-23: Luna produced the red calibrations; both requested Luna implementation/review dispatches then failed before work because the provider quota was exhausted. The orchestrator implemented and verified green directly.
