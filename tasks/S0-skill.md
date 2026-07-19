---
id: S0
title: "Agent skill: SKILL.md + generated api-reference"
deps: [A2]
track: skill
outputs:
  - skill/SKILL.md
  - skill/api-reference (generated from contract/openapi.yaml in CI — never hand-edited)
acceptance:
  - "SKILL.md covers: discovery via /api/health, server provisioning, 'never invent IDs — roster first', rulebook-ephemeral-read policy"
  - "api-reference regenerates reproducibly from the contract in CI"
---

Spec §13 S0 + §12 non-goals (no rulebook text reproduction).

## Log
