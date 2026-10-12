---
id: FRENCH-CREATE-01
title: Registered edition creation and internal-error gap
track: ada
deps:
  - GAME-MODE-02
outputs:
  - contract/schemas/character.json
  - contract/schemas/crew.json
  - contract/schemas/campaign.json
  - contract/openapi.yaml
  - skill/generate-ada-validators.mjs
  - backend-ada/server/src/generated/pitd_schema_validators.adb
  - conformance/src/schemas.ts
  - conformance/suites/contract/registered-game-creation.test.ts
  - docs/pages/backlog/french-game-creation-500.mdx
  - tasks/metrics/ada/FRENCH-CREATE-01.json
acceptance:
  - cd conformance && npm run test:ada -- --run
  - cd conformance && npm run test:ada -- --cycles 2 -- --run
  - cd conformance && npm run test:tooling
  - cd backend-ada/core && XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -P paperclips_core.gpr --level=2 --checks-as-errors=on
  - cd conformance && npm run test:mutation
  - node agent-docs/test-audit/validate-metrics.js
  - node agent-docs/test-audit/validate-finding-traceability.js
  - node agent-docs/test-audit/reconcile-audit.js
  - cd docs && npm run build
---

# FRENCH-CREATE-01

## Human-authorized scope

Fix creation across every edition in the registered data catalogue, with no
hardcoded edition list and no frontend source edits. A contract stem change is
authorized. The human separately ruled that the valid-input/server-defect path
must not claim a client VALIDATION, and then explicitly instructed leaving its
classification unchanged pending approval of a missing internal contract branch.
That remaining gap is open, not silently narrowed or claimed fixed.

## Red → green

NEW suite `registered-game-creation.test.ts` reads `data/games/games.json`,
uses each edition’s own first playbook, and registers four edition cases plus
FRENCH-CREATE-ENVELOPE-001 and FRENCH-CREATE-STEM-001. No frozen assertions change.
The initial directory enumeration also included non-edition schemas/crew/demo
JSON; corrected it to the actual registry before accepting RED evidence.

Accepted RED: **3 failed / 3 passed (6)**:
- French registered creation: HTTP 500 instead of 200.
- Independent envelope oracle: HTTP 500 differs from error.status 400.
- Isolated valid DTO with only gameStem changed: AJV reports exactly
  `/gameStem must match pattern \"^[A-Za-z0-9-]+$\"`.

Focused GREEN: **6/6** after only stem constraints/checkers/mirror change and
canonical regeneration. French defaults and factory code are unchanged.
Creation responses also pass strict JSON Schema and typed conformance decoding.
Missing-input controls retain VALIDATION/400/retryable true (corrective action,
not blind retry); unknown-game controls retain GAME_NOT_FOUND/200/retryable true,
per the existing frozen domain-error contract. The generic server-defect branch
is not presented as fixed by those request/domain controls.

## Proven root cause and change

- `pitd_ops.adb:99` propagates the stem unchanged into New_Character.
- `pitd_stored.adb:54` selects the generated character validator.
- `generated/pitd_schema_validators.adb:1405` checks gameStem with the checker
  starting at line 219; before regeneration it allowed ASCII only.
- `contract/schemas/character.json:44` supplies that pattern;
  `skill/generate-ada-validators.mjs:158` selects its generator checker.

The authorized pattern is now `^[A-Za-z0-9À-ɏ-]+$`: ASCII alphanumerics/hyphen
plus Latin U+00C0–U+024F. The allocation-free Ada validator checks the exact
corresponding UTF-8 byte ranges. This is not a French-only exception. All
current registered stems are tested from data. UUID/entity/snapshot constraints
remain unchanged. Character/crew/campaign DTOs, OpenAPI game-stem parameters
and creation bodies, conformance mirror and generated artifacts move together.
The human routes frontend GameStem mirror alignment to its owner afterwards.

## Open item: existing backend INTERNAL label is absent from contract

A server-created invalid DTO from a valid request is a server defect.
`Persist_Create` in `pitd_callback.adb:352` asks for HTTP500/INTERNAL, but
`Error_Result` in `pitd_common.adb:910–911` maps the unknown label to validation.
`pitd_error.adb:99` pins that branch to status400/retryable true. No internal/500
variant exists in the current contract/typed constructors. The human is asking
for approval; this card does not add a code/status or reclassify server defects
as bad input. All three runtime files above remain unchanged. Full details are
on the existing French backlog page.

## Mutation coordination and safety

The human explicitly instructed **not to run the campaign during frontend
review**. One combined full **28/28 campaign will run after both workers
finish**, so temporary mutations cannot collide. No campaign was started and
no new 28/28 outcome is claimed for this card.

This card changes no existing mutation-catalog target: its Ada changes are
generated validators, which are not catalog targets. Therefore there are no
own target hashes to refresh. The combined campaign owner must align any
frontend review target hashes after its tree freezes; this worker does not
refresh another worker’s moving sources.

No agent-run VCS commands, including provenance
(PITD_REVISION=FRENCH-CREATE-01-working). Canonical managed Ada uses real game
settings and isolated runtime data.

## Exercised acceptance and hand-off

- Catalogue/isolated/envelope suite: **6/6** green after **3 red / 3 pass**.
- Full real-settings Ada: **583/583**, all **68 files**.
- Two-cycle controlled restart: **583/583 in each cycle** (1,166 executions).
- Tooling **233/233**; conformance TypeScript check passes.
- SPARK **246/246** checks proved.
- Canonical generated validators, API reference, capability manifest and
  coverage regenerated in place.
- Metrics validation **169 files / 0 errors**, traceability **231/231**,
  reconciliation **17/17**. Vocs output is recorded in metrics/command logs.
- Combined mutation campaign is deferred by explicit human instruction, not
  omitted silently. The INTERNAL contract gap is likewise human-deferred.

Evidence: `tasks/metrics/ada/FRENCH-CREATE-01-*.log` and metrics JSON.
No independent review or unobserved full-campaign outcome is claimed.

Final Vocs build passes: **145 files generated**. Final records validation is
green with the same **169 / 231 / 17** counts; command logs are retained.
