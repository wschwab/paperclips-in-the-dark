---
id: SC-C5
title: "Generated client metadata and parity manifest"
deps: [SC-C1, SC-C4, SC-R1, SC-S1]
track: contract
outputs:
  - skill/generate-api-reference.mjs (extended: completeness/recovery/capability sections)
  - New deterministic generator(s) for frontend completeness predicates and the operation capability manifest
  - Schema-derived Ada validator metadata generator (SC-R1 selection)
  - Generated artifacts (skill/api-reference/, frontend completeness TS module, capability manifest JSON)
  - conformance tooling tests for generator determinism/idempotency
acceptance:
  - Generators are deterministic and idempotent (second run changes zero bytes — proven by a tooling test)
  - Every operationId (99 today) has a manifest disposition: agent reference, required human route/control, or approved exemption with reason
  - Generated artifacts contain no hand-edited drift (regeneration check in the tooling test)
  - Redocly lint passes; conformance tooling tests pass
---

# SC-C5 — Generated client metadata and parity manifest

## Target

Edit: `skill/generate-api-reference.mjs`, `skill/api-reference/` (generated), `conformance/src/` (tooling tests only), and add generator scripts. The generated frontend completeness module lands under `frontend/src/schema/generated/` (new directory; only generated content). Do NOT hand-edit generated files beyond the generator itself. Read-only everywhere else (do not touch openapi paths or schemas — SC-C1/C2/C4 own them; you CONSUME their output).

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Generated client metadata and parity manifest" (SC-C5), "Client obligations and parity", "Completeness" (predicate vocabulary), Wave 0 decisions W1, W9.
- `docs/pages/contract/wave0/completeness-audit.mdx` (pointer lists, predicate semantics, stable order).
- `docs/pages/contract/wave0/validator-spike.mdx` §4 (the generator emission shape for Ada entity validators — your Ada-validator generator emits that shape).
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` §9 (canUndo/historyCount derivation — nothing to generate, but the manifest must list lifecycle ops).
- `contract/openapi.yaml` (all 99 operationIds, x-requiredWhenComplete in schemas after SC-C1, the error union after SC-C4).
- `skill/SKILL.md` and `skill/api-reference/README.md` (existing generated reference structure).

## Changes

1. **Frontend completeness predicates generator**: emits a deterministic TypeScript module from `x-requiredWhenComplete` (character + crew pointer records, predicate vocabulary, stable order) — e.g. `frontend/src/schema/generated/completeness.ts` exporting typed pointer lists and a predicate function set. No hand-copied lists anywhere.
2. **Agent API reference generator extension**: `skill/generate-api-reference.mjs` gains sections for completeness predicates, capability endpoints (SC-C3 output), recovery instructions and typed error codes (SC-C4 union), and lifecycle attention codes. Regenerate `skill/api-reference/`.
3. **Operation capability manifest generator**: maps every `operationId` (enumerate from openapi.yaml; verify count = 99) to: agent reference entry (operation documentation), human UI requirement (destructive/lifecycle/designated sheet ops need a reachable human control — list the required set per the work spec "Client obligations"), or an approved exemption with reason. Exemptions require explicit approval — default to NO exemptions; flag candidates for the orchestrator instead. Emit `skill/api-reference/capability-manifest.json` (or an equivalent generated location).
4. **Ada validator metadata generator** (SC-R1 selection): emits the schema-derived `Required_*`/`Allowed_*` constants and `Check_*` procedures in the spike's emission shape (validator-spike §4), deterministically and idempotently, into a generated Ada file under `backend-ada/server/src/generated/` (mark the file as generated; SC-A1 consumes it in Wave 4 — do NOT wire it into builds now).
5. **Tooling tests**: conformance `npm run test:tooling` gains generator determinism/idempotency tests (run twice, diff byte-identical) and manifest completeness (every operationId has exactly one disposition).

## Red

Today: no completeness module, api-reference lacks the new sections, no manifest, no Ada validator generation, tooling tests don't cover generators.

## Green

- `(cd conformance && npm run test:tooling)` green, including the new idempotency + manifest tests.
- Manifest has 99 dispositions (no exemptions without orchestrator approval).
- Generated files regenerate byte-identical (proven by the test, not by claim).
- Redocly lint still passes (you did not touch openapi).

Report the exact commands and outputs. Do NOT run project-wide gates (no full vitest suite, no frontend build).

## Metrics

`tasks/metrics/contract/SC-C5.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
