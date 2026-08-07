---
id: A9
title: "Ada server: gear.add/remove/commit/uncommit/clear-commitments ops"
deps: [A2]
track: ada
outputs:
  - backend-ada/server: implement the five missing gear ops in Mutate per contract/openapi.yaml
  - conformance: red-green semantics tests for gear ops (add/remove/commit/uncommit/clear-commitments + COMMITMENT_LOCKED path)
acceptance:
  - "live probe: gear.add appends to loadout w/ bulk; commit/uncommit set commitment; clear-commitments resets; remove drops; COMMITMENT_LOCKED still works; revision advance"
  - "full conformance suite green; gnatprove gate stays green"
---

Found 2026-08-07 during F2r live acceptance probing. Mutate
(server/src/pitd_callback.adb) has ONLY gear.lock / gear.unlock /
gear.set-commitment (lines ~516-520). gear.add {name, bulk}, gear.remove
{Named name}, gear.commit {Named name}, gear.uncommit {Named name},
gear.clear-commitments (no body) all return 200 ok:false VALIDATION "unknown
operation". Conformance endpoints.test.ts posts {name:"Test"} for these and only
checks OperationResult SHAPE — green against unknown-op errors. FIFTH instance
of the shape-vs-semantics gap (A4, A5, A7, A8, A9) — E0-relevant.
The F2r frontend (client methods + page UI + tests) implements the contract
faithfully and is accepted; its live gear paths defer to this task. The
character DTO gear: {loadout, availableGear, commitment, isCommitmentLocked,
maxBulk}; commitment $defs (common.json) — check values (light/normal/heavy/
encumbered). Note the DTO has BOTH loadout and availableGear; read the openapi
descriptions + C# reference (blades-in-the-sheets/Models) for what each op
mutates — don't guess (gear.add vs availableGear vs loadout).

## Log
- 2026-08-07: filed from F2r probe findings.
- 2026-08-07: DONE. First dispatch (broad prompt incl. writing conformance tests)
  died silently mid-investigation; orchestrator wrote the conformance test
  (gear-ops.test.ts, red 4-fail/152-pass verified) and redispatched server-only.
  deepseek-v4-flash-0731 child (a9-gear-ops2) implemented the five ops; child
  flagged and matched the test's precondition order (NOT_FOUND before
  NO_COMMITMENT). Orchestrator verified: build green, own probe (all 19 steps
  exact), conformance 156/156.
