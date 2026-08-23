---
id: EDGE-02
title: Strict ordinary decoders
deps:
  - ORACLE-01
track: contract
outputs:
  - conformance/src/schemas.ts
  - conformance/suites/contract/strict-responses.test.ts
  - frontend/src/schema/clock.ts
  - frontend/src/schema/operation-result.ts
  - frontend/src/schema/decoders.test.ts
  - frontend/src/api/client.ts
  - frontend/src/pages/character-detail.ts
acceptance:
  - cd frontend && npm test -- --run
  - cd frontend && npm run build
  - cd conformance && npm run typecheck
  - cd conformance && npm run test:ada
  - independent GPT-5.6 Luna/openai-codex/xhigh frontend review returns PASS
---

# EDGE-02 — strict ordinary decoders

**Status:** implementation complete; blocked on required independent review
**Revision:** qywvprto (working copy; finalized before next card)

## Log

- 2026-08-23: red decoder cases rejected missing lifecycle flags, missing current clock fields, missing summary readability/history metadata, missing typed-error fields, legacy `clockKind`, and legacy error unions. Before implementation, seven focused cases accepted invalid input.
- 2026-08-23: ordinary conformance and frontend schemas now require the current response contract. Legacy clock and error transforms/defaults were removed rather than preserved behind aliases. Existing named import/repair migrations remained green in the canonical seeded suite.
- 2026-08-23: the clock client now sends the complete current create DTO (`ownerKind`, `ownerId`, `purpose`, `behavior`, `size`, and `relatedClockIds`). The UI translates wire behavior `bounded` to the existing visible term `project` without adding a decoder alias.
- 2026-08-23: frontend acceptance passed 16 files/616 tests and production build. Conformance typecheck and canonical Track A passed 55 files/430 tests.
- 2026-08-23: browser verification exercised the seeded character route at real 1440×900 and 390×844 viewports in light, dark, and high-contrast themes. At both widths, document scroll width equaled viewport width, project client width equaled scroll width, and the clock remained visibly labelled `project`; six screenshots were captured under `/tmp/omp-sshots-*`.
- 2026-08-23: the mandatory GPT-5.6 Luna/openai-codex/xhigh review could not execute because the provider reported its usage limit, with reset at 2026-08-27 08:03. The code is not marked complete until that exact reviewer returns PASS.
