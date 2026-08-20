---
id: SC-R2
title: "Completeness field and predicate audit"
deps: []
track: contract
outputs:
  - docs/pages/contract/wave0/completeness-audit.mdx
acceptance:
  - Every pointer in both locked lists resolves to the intended scalar in character.json and crew.json
  - Counterexamples generated for whitespace, valid zero, valid false, and valid empty arrays
  - Clocks confirmed to have no completeness list; predicate vocabulary approved
---

# SC-R2 — Completeness field and predicate audit

## Target

Write ONE file: `docs/pages/contract/wave0/completeness-audit.mdx`. Read-only everywhere else. Do not edit `PAPERCLIPS.md`, `contract/`, `conformance/`, or any source.

## Inputs

- Governing decisions: `docs/pages/contract/spec-change-work-spec.mdx` section "Completeness" (read the whole file). The locked pointer lists are normative:
  - Character: `/dossier/name`, `/dossier/alias`, `/dossier/look`, `/dossier/heritage/name`, `/dossier/background/name`, `/dossier/vice/name`, `/dossier/vice/purveyor/name`, `/playbook/name`.
  - Crew: `/name`, `/crewTypeName`, `/lair`, `/reputation`, `/huntingGrounds`.
  - Clocks: no completeness list.
- Schemas: `contract/schemas/character.json`, `crew.json`, `clock.json`.
- Game settings: `data/games/blades-in-the-dark.json`, `scum-and-villainy.json` (confirm the field sets do not vary by game; option lists may vary).
- Predicate vocabulary: `nonBlankString`, `nonEmptyArray`, `positiveInteger`, `true`.

## Contract (interfaces produced for downstream cards)

- Exact, approved pointer lists and predicate vocabulary feed SC-C1 (`x-requiredWhenComplete` records), SC-F1 (generated completeness predicates), SC-O3 (completeness oracle).
- Every pointer must be a JSON pointer into the entity schema resolving to the intended scalar property (string for `nonBlankString`).

## Red (questions the research must answer)

- Does each locked pointer resolve in the CURRENT schemas? Note: the schemas change in Wave 2 (SC-C1) — your audit validates the intent against today's shape and flags any pointer that cannot resolve so SC-C1 fixes it.
- For each pointer: what is its canonical empty value, and does the current schema type permit the intended predicate (e.g. `nonBlankString` requires a string; is `alias` a string, `reputation` a string, `huntingGrounds` a string)?
- Counterexamples: whitespace-only string passes/fails? `0` vs `positiveInteger`; `false` vs `true`; `[]` vs `nonEmptyArray`. Produce the exact JSON snippets SC-O3 will use.
- Are there any schema properties that look like completeness candidates but are NOT in the locked lists (intended per Q8 maximal-inclusion decision — record them so they are not silently added later)?

## Green

`docs/pages/contract/wave0/completeness-audit.mdx` exists and contains:

1. A pointer-resolution table: every locked pointer, the schema property it resolves to, its type and canonical empty, and the assigned predicate.
2. The counterexample set (whitespace, zero, false, empty array) with expected predicate outcomes and the readable/incomplete classification each produces.
3. A confirmation that clocks have no completeness list and why (creation requires identifying configuration; creation already guarantees completeness).
4. The predicate vocabulary table with the semantics of each predicate, and note that only `nonBlankString` is needed by the initial field set.
5. Any flagged pointer problems that SC-C1 must fix (e.g. pointer resolves to a non-string, or a property absent from the schema).

Acceptance: every locked pointer appears in the resolution table with a resolvable target or an explicit SC-C1 fix flag; the counterexample table has all four classes.

## Evidence

- The schema JSON excerpts used for each resolution.
- The counterexample snippets.

## Metrics

`tasks/metrics/contract/SC-R2.json` is written by the orchestrator after review — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-R2.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
