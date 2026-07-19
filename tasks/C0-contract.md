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
- 2026-07-19: audit complete (docs/pages/contract/ops-audit.mdx) — every §8–9
  catalog row verified against Models/ source. Notable: catalog's harm
  slot-full-failure corrected to spillover; Fund.Gain silently drops overflow
  in C# (contract surfaces it); C# UnmarkUpgrade removes whole entry (contract
  diverges box-wise per spec §5.1.6); TakeAbility confirmed not to touch
  playbook XP; rolodex modeled as one total set-closeness op.
- 2026-07-19: contract authored. openapi.yaml (3.1, 71 paths) lints clean
  (redocly, config in contract/redocly.yaml — security/summary/4xx-on-GET
  rules off by design, rationale inline). Schemas draft-2020-12; golden
  fixtures (character/crew/clock) validate via ajv+formats. One authoring
  defect caught by validation: UUID regex variant group {4}→{3}.
- 2026-07-19: STATUS: done pending human contract-freeze sign-off (spec §13 —
  freeze is a human gate before C1 dispatch).
