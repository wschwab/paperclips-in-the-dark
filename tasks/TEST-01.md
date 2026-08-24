---
id: TEST-01
title: Populated inventory, ledger, duplicate clusters, and coverage
deps:
  - ORACLE-01
  - MUT-01
track: contract
outputs:
  - agent-docs/test-audit/inventory.json
  - agent-docs/test-audit/ledger.md
  - agent-docs/test-audit/duplicate-clusters.json
  - agent-docs/test-audit/contract-coverage-map.json
acceptance:
  - generator registration count equals an independent enumeration
  - no required field is blank
  - every row has exactly one decision
  - every duplicate cluster is behavior-based and names its retained signal
  - contract-coverage.json has no uncovered operation
---

# TEST-01 — populated inventory, ledger, duplicate clusters, coverage

**Status:** complete (classification); Wave-4 surgery owns physical changes
**Revision:** working copy at classification close

## Log

- 2026-08-24: regenerated `inventory.json` via
  `conformance/scripts/test-audit-inventory.mjs` — 1307 rows (1199 vitest
  registrations across frontend/conformance/tooling + 78 Ada runtime asserts +
  30 SPARK proof families).
- 2026-08-24: independent enumeration via `vitest list --json` on all three
  configs (616 + 433 + 150) plus the Ada counts equals the generator count:
  1307 = 1307.
- 2026-08-24: classified all 1307 rows with behavior-based decisions — 1267
  keep / 25 merge / 9 upgrade / 6 delete. Every row carries contractAnchor,
  observableResult, environment, determinism, uniqueSignal, target; zero blank
  fields.
- 2026-08-24: merges validated against `duplicate-clusters.json`; four
  evidence-backed merges found while walking rows were appended as cluster
  DC-005 with per-member retained-signal reasons. All dupeOf targets exist and
  are decided keep.
- 2026-08-24: deletes are assertion-contained restatements with killers
  confirmed green; each names its replacement (`replaced-by:` in `target`).
  Physical removal deferred to Wave-4 surgery (TEST-03/TEST-04) per ledger rule.
- 2026-08-24: `contract-coverage-map.json` closed at 108/108 operations with an
  empty uncoveredList after TEST-02 landed the claim-operation guards.

## Dispatch notes

Classification fanned out to five opencode-go/ox-alpha-free workers over the
13 layer slices (`agent-docs/test-audit/decisions/*.input.json` →
`*.decisions.json`). The first two dispatch attempts failed on harness issues
(omp subagents had no model role configured for task/scout; direct `omp -p`
spawns stalled on readPipedInput until stdin was detached) — fixed by running
`sh -c 'omp -p … </dev/null'` under hub process supervision. All five runs
completed exit 0; outputs were machine-validated (row parity, blank fields,
merge links, decision vocabulary) rather than trusted from reports.
