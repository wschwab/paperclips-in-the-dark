---
id: CONTRACT-05
title: Per-scoundrel Contacts
deps:
  - DEC-05
track: contract
outputs:
  - docs/pages/contract/contract-c5-character-contacts.mdx
  - contract/openapi.yaml
  - conformance/suites/semantics/character-contacts.test.ts
  - backend-ada/server/src/pitd_callback.adb
  - frontend/src/pages/character-detail.ts
  - conformance/suites-browser/character-contacts.journey.mjs
acceptance:
  - cd conformance && npm run test:ada -- suites/semantics/character-contacts.test.ts
  - cd conformance && npm run test:ada
  - cd frontend && npm test -- --run
  - cd conformance && npm run test:browser
---

# CONTRACT-05 — per-scoundrel Contacts

**Status:** complete
**Behavior:** characters carry their own `contacts` list
(`{id, name, closence→closeness}` with levels `friend|contact|rival`, new
entries default to `contact`). Ops: `contact.add` (dupe name → VALIDATION),
`contact.closeness`, `contact.remove`; all x-snapshot mutations returning the
character. Absent field on stored characters = empty list (sparse overlay; no
migration). Feature named **Contacts** per ruling; BitS Rolodex was the model
reference.

## Log

- 2026-08-25: implemented across spec page, OpenAPI + JSON schemas +
  generated Ada validators, 9-row conformance oracle (add/closeness/remove
  lifecycle, reload persistence, dupe/unknown VALIDATION, history labels,
  sparse back-compat), Ada handlers, client ops + decoders, sheet Contacts
  section, browser journey, c5-seeds fixture wired into managed-run.
- 2026-08-25: worker hit a provider stream timeout after finishing all edits
  and never yielded its report; orchestrator stopped it and verified all
  gates independently: typecheck clean; focused oracle 9/9; canonical Track A
  **59 files/470 tests** (+1 file/+9); frontend 19 files/668; build clean;
  browser suite all journeys green (incl. character-contacts).
