---
id: C0
title: "Contract authoring: ops-catalog audit + openapi.yaml + schemas + golden fixtures"
deps: []
track: contract
assignee: orchestrator (human-adjacent; NOT dispatched to implementers)
outputs:
  - contract/openapi.yaml
  - contract/schemas/*.json
  - conformance/fixtures/*.json (golden documents)
  - docs/pages/contract/ops-audit.mdx (audit record, per-op vs C# method)
acceptance:
  - "npx @redocly/cli lint contract/openapi.yaml — no errors"
  - "every operation in docs/agent-api-spec.md §8–9 appears in the audit table with a verdict (adopted / corrected / dropped) and the C# method it mirrors"
  - "all §7.2 corrections present: harm spillover, box-wise unmark-upgrade, full rolodex transition set, asymmetric playbook-XP flow, commitment lock ops, fund partial-gain sideEffects, no hardcoded maxima"
  - "golden fixtures validate against contract/schemas via ajv"
---

Audit every operation row against the C# `Models/` source (spec §7.2, REVIEW
gap #35) — verify against source, not memory. Then author the contract:
OpenAPI 3.1, OperationResult uniform shape (§7.1), typed error codes,
x-snapshot flags per op, If-Match/Idempotency-Key headers, no nulls anywhere.

## Log
- 2026-07-19: task graph created; C0 reserved for orchestrator per AGENTS.md.
