---
id: UNKNOWN-OP-01
title: Reject unknown single-operation names without changing batch reporting
track: contract
outputs:
  - contract/openapi.yaml
  - backend-ada/server/src/pitd_ops.adb
  - conformance/suites/contract/unknown-operation.test.ts
  - conformance/fixtures/mutation-catalog.json
  - docs/pages/backlog/unknown-operation-status.mdx
  - tasks/metrics/contract/UNKNOWN-OP-01.json
acceptance:
  - cd conformance && npm run test:ada -- --run
  - cd conformance && npm run test:ada -- --cycles 2 -- --run
  - cd conformance && npm run test:tooling
  - cd conformance && npm run typecheck
  - cd backend-ada/core && XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -P paperclips_core.gpr --level=2 --checks-as-errors=on
  - cd docs && npm run build
---

# UNKNOWN-OP-01

## Approved decision

An unknown single-op name is **400 VALIDATION**: invalid request input, not an
absent resource. It uses the existing typed envelope, issue pointers and
`ok:false`; no new status/code/path. OpenAPI global and batch descriptions
make that distinction explicit. The former permissive Validate_Request fallback
admitted unknown names into Mutate, which returned a VALIDATION body later sent
as200. Admission now returns false with “unknown operation”. Fifteen declared
apply-validated operations retain their previous admission behavior; their
request/domain semantics are not broadened by this card.

## Red → green

New suite `conformance/suites/contract/unknown-operation.test.ts`:
- UNKNOWN-OP-SINGLE-CHARACTER-001 — RED actual200 vs expected400; GREEN400.
- UNKNOWN-OP-SINGLE-CREW-001 — RED actual200 vs expected400; GREEN400.
- UNKNOWN-OP-BATCH-001 — comparison control GREEN from the start.

Initial canonical run: **2 failed /1 passed**, run
`2026-10-14T12-10-53-478Z-c83b685a`. Both single cases also check the strict
operation-result schema, body code/status/false outcome, and unchanged full
entity/history despite revision and idempotency headers.

The batch case compares an unknown op with a known stress.add whose delta is
not an integer. Both report HTTP200 aggregate ok:true/error:null, member outcomes
[true,false,true], middle VALIDATION400, and unchanged entire entity/revision/
history. This confirms the existing aggregation convention, not a failed write
being applied. The human explicitly instructed leaving that design alone when
unknown and other invalid members agree. Agents must inspect every outcome.

## Frozen boundaries

**No frozen test edited.** SEMANTICS-COMPOSITES-002 before and after is identical:
HTTP200/ok:true aggregate, failed unknown member VALIDATION400, no committed state,
revision or history. All four composite cases pass unchanged. Only NEW tests
were added; no weakened or replaced assertions.

## Exercised gates

- Focused new suite plus composites: **7/7**.
- Full Ada, real settings: **597/597**, **71 files**.
- Canonical two-cycle: **597/597 each**, 1,194 executions.
- Tooling: **233/233**, **18 files**.
- SPARK: **246/246** checks proved; conformance typecheck passes.
- Canonical API reference, capability manifest and contract coverage regenerated
  in place. DTO/error schemas did not change, so Ada schema-validator output and
  the strict conformance schema mirror intentionally do not change.

Only the backend ops mutation target changed. Its four restoration pins now use
`fc0d914efe00871bed11bcbe623424dc6a78f4dea4565db920f323c2ea21320c`.
No frontend target pin was refreshed while the fast worker edits those sources.
No mutation campaign started: the human requires coordination, and the full
campaign belongs to the subsequent LOADOUT-ATOMIC-01 gate after sources freeze.

Evidence: `tasks/metrics/contract/UNKNOWN-OP-01-*.log`. No frontend, campaign-data
or fast-worker files touched. No jj abandon/restore or force push. This card is
committed with explicit paths and pushed separately before the next card.

Final documentation gates: Vocs **155 files generated**; metrics **181 files,
0 errors**; traceability **231/231**, reconciliation **17/17**.
