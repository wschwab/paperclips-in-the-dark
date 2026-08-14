---
id: SC-O8
title: "FV-specific oracle corrections"
deps: [SC-C1, SC-C2, SC-C4, SC-R6]
track: contract
outputs:
  - conformance oracle cases pinning confirmed findings not already covered by O1-O7 (per the SC-R6 ledger)
acceptance:
  - Every confirmed finding not pinned by O1..O7 has a focused red case or an explicit pointer to its owning card's existing pinned reproduction
  - No misattribution: FV-004 not admission, FV-007 not backend rollover alone, FV-017/FV-018 not completeness alone, FV-020/FV-023/FV-028 not typed domain errors alone
  - Red against current source; existing unrelated conformance green
---

# SC-O8 — FV-specific oracle corrections

## Target

Create focused conformance cases for confirmed findings not already pinned by O1..O7, in the SUITE THAT MATCHES THE FINDING'S OWNING CARD (per the SC-R6 ledger) — prefer extending the oracle files the owning card consumes. Do NOT edit the contract or fixtures. Read-only elsewhere. If a finding's reproduction is already frozen by O1-O7, record the mapping instead of duplicating.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section SC-O8 (the explicit non-misattribution list).
- `docs/pages/contract/wave0/finding-traceability.mdx` — the authoritative ledger (owner per finding, red evidence, evidence paths).
- `agent-docs/frontend-vetting/bugs/FV-###.json` + `agent-docs/frontend-vetting/evidence/` — the original reproductions (read them; do not re-derive).
- Frozen Wave 2 contract.

## Changes

For each finding, decide: (a) already pinned by O1-O7 (record which case), or (b) add a focused case in the suite of its owning card. Minimum set to check per the non-misattribution list:

- FV-004 (owner SC-A9): focused case that `cohort.add` with hasArmor/edges/flaws/description succeeds and an unknown field is rejected — the SERVER-behavior red, distinct from the contract schema check (fails: server rejects allowed fields).
- FV-007 (owner SC-F3): the healing-clock delta-vs-absolute red is a FRONTEND behavior (page test) — record that the conformance-side pin is the declared operation family (O4/NUM-CLOCK); add the conformance case asserting the healing-clock op family declaration if absent.
- FV-017/FV-018 (owner SC-F6): frontend create-flow UX — record that no conformance case substitutes for the page tests; add any API-level case that supports them (e.g. phase-one create leaves a usable entity; no duplicate on retry is a frontend concern).
- FV-020/FV-023/FV-024/FV-028 (owner SC-F5/SC-F4): transport/error-presentation — record mapping to O7 error-union cases; add API-level support cases only where the union/decoders are involved.
- FV-019 (owner SC-F5): pinned by O7/CONC-IFMATCH-001 (record mapping).
- FV-026 (owner SC-C6): pinned by the contract schema (vice ref) — record mapping to a request-validation case.
- FV-010 (owner SC-A4): pinned by O2/TOTAL-* (record mapping).
- Any other finding with no O1-O7 pin: add the focused case in its owning card's suite.

## Green (this card's own gate)

- A mapping table: FV → pinned-by (O-case name) or new case (file + name); every one of the 32 findings appears.
- New cases fail for the documented reasons; no case misattributes per the non-misattribution list.
- `(cd conformance && npm run test:ada -- --run <new/changed files>)` shows the red set.

Report exact commands and outputs.

## Metrics

`tasks/metrics/contract/SC-O8.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
