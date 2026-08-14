---
id: SC-F6
title: "Create recovery and incomplete labels"
deps: [SC-F1, SC-C6, SC-O3]
track: frontend
outputs:
  - frontend/src/pages/character-create.ts, crew-create.ts (phase-two failure recovery, link/retry)
  - frontend/src/pages/roster.ts (Unnamed {playbook|crewType} labels)
  - frontend tests
acceptance:
  - Phase-two create failure retains the created entity; retry/link without duplicating create
  - Deterministic `Unnamed {playbook|crewType}` labels for incomplete rows
  - FV-017, FV-018 closed
---

# SC-F6 — Create recovery and incomplete labels

## Target

Edit: `frontend/src/pages/character-create.ts`, `crew-create.ts`, `frontend/src/pages/roster.ts`, and their tests. Do NOT edit `contract/`, `conformance/`, or schema-generated files.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` SC-F6; Q35/Q36; the fix-wave plan P17 (create recovery) and P18 (unnamed roster label) cards.
- Frozen contract: create ops, dossier.update, roster summary rows; completeness semantics (an incomplete row is a draft — labels come from the playbook/crewType fields, which are present even when name is empty).
- Frozen oracle: completeness.test.ts expectations.

## Changes

1. **Create recovery (FV-017)**: when phase-two (naming/dossier) fails after phase-one created the entity, retain the created entity and render a link/retry that resumes only the failed sub-step (dossier.update/fields.update); retry NEVER POSTs create again (entity count stays one across two retries); success reaches the sheet.
2. **Unnamed labels (FV-018)**: roster renders `Unnamed {playbook}` / `Unnamed {crewType}` for rows with empty name (mirror the existing character fallback for crews; href/id unchanged; named rows unchanged).
3. Tests: extend character-create.test.ts, crew-create.test.ts (fetch-call sequence proving no duplicate create; retry reaches the sheet), roster.test.ts (blank-link red before change, `Unnamed Assassins` after).

## Red

P17/P18 red assertions (run focused tests; record failures before starting).

## Green

- `(cd frontend && npm test -- --run src/pages/character-create.test.ts src/pages/crew-create.test.ts src/pages/roster.test.ts)` green.
- `(cd frontend && npm run build)` green.
- No contract/conformance edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/frontend/SC-F6.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
