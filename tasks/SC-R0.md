---
id: SC-R0
title: "Canonicalization and repair matrix"
deps: []
track: contract
outputs:
  - docs/pages/contract/wave0/canonicalization-matrix.mdx
acceptance:
  - Every declared property of character, crew, clock, campaign, and common schemas appears in exactly one matrix row with a canonical rule or an explicit needs-input result
  - No silent unknown-key loss; all ten defect classes have HTTP outcome, write/no-write behavior, and a test fixture
---

# SC-R0 — Canonicalization and repair matrix

## Target

Write ONE file: `docs/pages/contract/wave0/canonicalization-matrix.mdx`. Read-only everywhere else. Do not edit `PAPERCLIPS.md`, `contract/`, `conformance/`, or any source.

## Inputs

- Governing decisions: `docs/pages/contract/spec-change-work-spec.mdx` sections "Canonical shape and normalization" and "Stored-entity classification and HTTP errors" (read the whole file; it is the authority).
- Schemas to enumerate: `contract/schemas/character.json`, `crew.json`, `clock.json`, `campaign.json`, `common.json`, `operation-result.json`.
- Settings schema: `data/games/game-settings-schema.json`; game files `data/games/blades-in-the-dark.json`, `scum-and-villainy.json`.
- Legacy reference shapes: `blades-in-the-sheets/Models/` (C#; e.g. notes as a single string is a known legacy shape). Read-only reference.
- DTO format rules: `PAPERCLIPS.md` §6 and §7.1.

## Contract (interfaces produced for downstream cards)

- Terminology used by later waves: `canonical`, `repairable`, `needs-input`, `unreadable` (normalizer outcomes).
- The matrix is consumed by SC-S1 (normative wording), SC-C1 (schema changes), SC-C2 (repair operations), SC-A1 (canonicalizer), SC-O1 (oracle cases).
- Every defect-class row must state: canonical default availability, warning, required caller input, HTTP outcome, write/no-write behavior, test fixture.

## Red (questions the research must answer)

No exhaustive classification exists today. Produce the matrix for ALL of: missing key, `null` value, wrong primitive type, wrong enum value, invalid numeric bound, unknown/undeclared key, known legacy shape (e.g. notes string), wrong identity (`kind`/`id` mismatch), non-object root, unparseable bytes. For every property in the schemas decide: schema-valid canonical default exists (which?) or `needs-input` (why?). Identify which classes are `repairable` vs `unreadable` vs `needs-input`, and which HTTP outcome applies (400 INVALID_ENTRY / 422 INVALID_ENTITY / 409 NORMALIZATION_REQUIRED / other).

## Green

`docs/pages/contract/wave0/canonicalization-matrix.mdx` exists and contains:

1. The ten defect classes, each with the six required columns (default availability, warning, caller input, HTTP outcome, write/no-write, fixture).
2. A complete property-path inventory: every declared property of character, crew, clock, campaign, and common schemas (including nested objects and array items) appears in exactly one row with a canonical rule or explicit needs-input. Use the schema property paths as row keys.
3. An explicit "unknown key" rule that never loses data silently (preview classifies and displays removal).
4. Legacy conversion rules enumerated (e.g. one notes string → one-entry notes array).
5. A per-class fixture sketch suitable for SC-O1 oracle cases.

Acceptance: run a check that every schema property path appears in the document (e.g. a small script reading the schemas and grepping the mdx). Report the command and its output in Evidence.

## Evidence

- The property-path coverage check output.
- Section count and row count of the matrix.

## Metrics

`tasks/metrics/contract/SC-R0.json` is written by the orchestrator after review — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-R0.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
