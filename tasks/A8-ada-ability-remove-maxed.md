---
id: A8
title: "Ada server: ability.remove op + TimesTakeable ABILITY_MAXED enforcement"
deps: [A2]
track: ada
outputs:
  - backend-ada/server: ability.remove branch in Mutate (character + crew special abilities); ability.take validates TimesTakeable against playbook/crew game data → ABILITY_MAXED
  - conformance: red-green semantics tests for both (take to limit, take past limit → ABILITY_MAXED, remove)
acceptance:
  - "live probe: ability.take at TimesTakeable limit → ok:false ABILITY_MAXED; remove works incl. NOT_FOUND for unknown; revision advance"
  - "full conformance suite green; gnatprove gate stays green"
---

Found 2026-08-07 during F2p live acceptance probing. Two gaps in Mutate
(server/src/pitd_callback.adb ~line 426):
1. `ability.remove` has NO branch — returns 200 ok:false VALIDATION "unknown
   operation" despite being in the frozen contract (characters AND crews).
2. `ability.take` blindly increments timesTaken without checking the playbook's
   TimesTakeable (game data SpecialAbilities) — contract description explicitly
   promises "TimesTakeable → ABILITY_MAXED"; repeated take of a takeable-once
   ability succeeded live (timesTaken 1 → 2).
Both are conformance blind spots: endpoints.test.ts only checks OperationResult
SHAPE for ability.remove, and there are no semantics tests for take limits.
Fourth instance of the shape-vs-semantics gap (A4, A5, A7, A8) — E0-relevant.
The F2p frontend (client + page tests) handles ABILITY_MAXED / NOT_FOUND codes
and is accepted; its live take-limit/remove paths defer to this task.

## Log
- 2026-08-07: filed from F2p probe findings.
- 2026-08-07: DONE. deepseek-v4-flash-0731 child. Orchestrator verified: build
  green; diff review (Can_Take_More reads TimesTakeable from game data, unknown
  ability/missing data stays permissive; remove drops whole entry + NOT_FOUND);
  own probe port 9701 (take→maxed→remove→NOT_FOUND, state unchanged on maxed);
  conformance 152/152 (150 + SEMANTICS-ABILITY-LIMITS-001/002, red→green shown).
