---
id: C3
title: "Contract change: crew contacts & factions with status tracking"
deps: [C0]
track: contract
assignee: orchestrator (contract authoring exception, per C0 precedent)
outputs:
  - contract/schemas/crew.json: contacts + factions properties
  - contract/openapi.yaml: crew contact add/remove ops; faction add/remove + status set ops
  - conformance additions for the new ops (contract + semantics)
  - docs/pages/contract/ update documenting the change and rationale
acceptance:
  - "redocly lint clean; golden crew fixture (extended) validates via ajv"
  - "new conformance tests collect cleanly and fail red against current backends (no server support yet — Ada implementation is a follow-up A-track task)"
  - "no changes to any existing op's semantics"
---

**HUMAN AUTHORIZATION 2026-07-29** ("Please do change the contract for
Factions and Contacts on the Crew sheet") — the one sanctioned breach of the
contract freeze, via this dedicated contract-change task per tasks/README.md.
Not urgent; scheduled after the in-flight F2m slice to keep commits
single-purpose. Design sketch: crew gains `contacts` (name, profession,
closeness?) and `factions` (name, status int bounded by game-settings range,
custom names allowed); ops mirror rolodex ergonomics. Follow-ups it unblocks:
A-track server support task, then the crew-sheet Contacts & Factions UI
slice. All other sheet-plan decisions confirmed as-is by human (vehicles as
cohorts, playbook extras as gear, derived lifestyle, turf-in-rep, desperate
XP on attributes).

## Log
- 2026-07-29: task created on human authorization; deferred behind F2m.
- 2026-08-07: DONE. Contract/schema/openapi edits from prior session; conformance
  additions + docs page by deepseek-v4-flash-0731 (prime-agent child c3-finisher).
  Orchestrator verification (all reran independently): redocly lint clean; all 3
  golden fixtures ajv-VALID (draft 2020-12); conformance typecheck + tooling green;
  live vs Ada: 149 tests = 138 green / 11 red, red set exactly the new C3
  semantics + PERSISTENCE-REVISION-004 (no regressions). Faction status range
  read from game-settings via new FactionStatus {Min,Max} convention (grep: no
  hardcoded range). Child self-report was fully accurate and it caught the
  orchestrator's op-naming error (faction.set-status, not faction.status.set).
  Follow-up: A-track server support task (contacts/factions ops + FactionStatus
  game-settings key).
