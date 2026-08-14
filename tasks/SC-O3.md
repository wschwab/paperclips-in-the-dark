---
id: SC-O3
title: "Completeness oracle"
deps: [SC-C1, SC-C5, SC-R2]
track: contract
outputs:
  - conformance/suites/semantics/completeness.test.ts (NEW)
acceptance:
  - For every completeness pointer: canonical empty is readable+incomplete; satisfying the predicate advances completeness; legitimate empty outside the list stays complete; whitespace fails nonBlankString
  - Roster summary changes without stored flag changes; retired/deadish use the same computation
  - Red against current source; existing unrelated conformance green
---

# SC-O3 — Completeness oracle

## Target

Create exactly: `conformance/suites/semantics/completeness.test.ts`. Do NOT edit other suites, contract, or fixtures. Read-only elsewhere.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section "Completeness"; SC-O3 list.
- `docs/pages/contract/wave0/completeness-audit.mdx` — the 13 pointers (exact), canonical empties, counterexamples X0-X4, predicate semantics.
- Frozen Wave 2 contract: `x-requiredWhenComplete` records on character/crew schemas; roster summary fields `isComplete`/`isReadable`/`isRepairable` (campaign.json).
- Conventions: suite-helpers, api, test IDs.

## Changes (freeze these cases red)

- `COMPLETE-EMPTY-001` a character with canonical empty at `/dossier/name` is readable and incomplete (fails: no isComplete today).
- `COMPLETE-FILL-002` filling the pointer flips the roster summary to complete without any stored flag change (fails).
- `COMPLETE-ALL-003` each of the 13 pointers: canonical empty → incomplete; a satisfying value → advances toward complete (character 8, crew 5 — loop over pointers; fails).
- `COMPLETE-WHITESPACE-004` whitespace-only string fails `nonBlankString` → incomplete (fails).
- `COMPLETE-LEGIT-005` legitimate empties outside the list (e.g. empty `dossier.crewId`, zero tier, empty notes, empty contacts) leave a fully-named entity complete (guard where it already passes; fails only if the implementation over-reports).
- `COMPLETE-PREDICATES-006` counterexamples X2 (zero vs positiveInteger), X3 (false vs true), X4 (empty array vs nonEmptyArray) are schema-valid, readable, and incomplete (fails: predicates not generated).
- `COMPLETE-SUMMARY-007` roster summary reports isReadable/isRepairable/isComplete with no stored flags (fails).
- `COMPLETE-RETIRED-008` retired/deadish entities use the same completeness computation (retired with canonical-empty pointer stays incomplete) (fails).
- `COMPLETE-CLOCK-009` standalone clocks are always complete after create (guard; assert no completeness list exists on clocks).
- `COMPLETE-NOSTORE-010` no completeness flag is ever persisted (checksum the stored file before/after roster reads — guard).

## Green (this card's own gate)

- File exists with frozen case names; red cases fail for the documented reasons; guards pass.
- `(cd conformance && npm run test:ada -- --run suites/semantics/completeness.test.ts)` shows the red set.

Report exact commands and outputs.

## Metrics

`tasks/metrics/contract/SC-O3.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
