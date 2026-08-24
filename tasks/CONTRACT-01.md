---
id: CONTRACT-01
title: PC creation flow with Talent validation
deps:
  - DEC-01
track: contract
outputs:
  - docs/pages/contract/contract-c1-pc-creation.mdx
  - contract/openapi.yaml
  - conformance/suites/contract/pc-creation.test.ts
  - backend-ada/server/src/pitd_callback.adb
  - frontend/src/pages/character-create.ts
  - frontend/src/lib/chargen.ts
  - frontend/src/lib/completion-cues.ts
  - conformance/suites-browser/pc-chargen.journey.mjs
acceptance:
  - cd conformance && npm run test:ada -- suites/contract/pc-creation.test.ts
  - cd conformance && npm run test:ada
  - cd frontend && npm test -- --run
  - cd conformance && npm run test:browser
---

# CONTRACT-01 — PC creation flow with Talent validation

**Status:** complete (stages 1–3)
**Commits:** stage 1 `5155b7c9`, stage 2 `36d60c1b`, stage 3 `644cb067`

## Behavior (human ruling 2026-08-24)

- New validated creation path `POST /api/characters/pc`
  (`createPcCharacter`); the unvalidated `POST /characters` remains for
  experienced characters / NPCs. Existing zero-dot characters grandfathered.
- Validation, entirely settings-derived (`StartingActionDots`: 7,
  `StartingActionDotMax`: 2 added to game settings + schema): allocation must
  sum exactly to the budget and every action ≤ cap; violations return
  VALIDATION naming rule and numbers. Setting absent → NOT_FOUND naming keys.
- Frontend chargen: playbook select, per-action pickers grouped by attribute,
  live unspent counter with both budget numbers visible, submit gated on
  exactly-0-unspent; completion cues after creation for unset vice/ability/
  dossier/crew derived from the DTO.
- Crews get a presented frontend-only multi-step create flow; no API change.

## Log

- 2026-08-24 stage 1: spec page, settings+schema keys, OpenAPI operation,
  coverage artifacts regenerated (109 operations), 10-row RED oracle
  (8 failing on missing route, 2 passing-by-design pins).
- 2026-08-24 stage 2: Ada handler `Handle_Pc_Create` + request validation;
  oracle 10/10 green; canonical gate 55 files/442 tests; gnatprove 246 checks.
- 2026-08-24 stage 3: client `createPcCharacter`, chargen page, completion
  cues, client/page tests; browser journey pc-chargen PASS end-to-end;
  frontend 19 files/656 tests; build clean.
- Review note (orchestrator): worker's killed first attempt left broken tests
  that were repaired by hand — fixes included a real UI bug it exposed
  (playbook switch kept stale dot fills, silently inverting the next click
  into a clear) fixed by remounting pickers on playbook change.
