---
id: SC-R6
title: "32-finding traceability rebuild"
deps: []
track: contract
outputs:
  - docs/pages/contract/wave0/finding-traceability.mdx
acceptance:
  - Exactly one row per FV-001..FV-032 with original reproduction, owning wave/card, red evidence, expected green evidence, status
  - False blanket closures from the superseded draft corrected; the ten craft cards preserved
  - Every FV has exactly one owning card
---

# SC-R6 — 32-finding traceability rebuild

## Target

Write ONE file: `docs/pages/contract/wave0/finding-traceability.mdx`. Read-only everywhere else. Do not edit `PAPERCLIPS.md`, `contract/`, `conformance/`, or any source. Do not read `agent-docs/draft-answers.md`.

## Inputs

- The work spec: `docs/pages/contract/spec-change-work-spec.mdx` (read the whole file — the ordered waves and SC-O8 constraints are normative).
- Finding register: `agent-docs/frontend-vetting/BUGS.json` (32 findings with severity) and the per-finding records `agent-docs/frontend-vetting/bugs/FV-001.json` … `FV-032.json` (reproductions and evidence paths).
- Existing craft plan: `agent-docs/FRONTEND-FIX-WAVE-PLAN.md` (the ten craft findings: FV-008, FV-012..FV-016, FV-025, FV-030..FV-032; their P-card targets).
- The superseded draft's Part 7 mapping: `docs/pages/contract/spec-change-draft.mdx` (its closure claims are known to contain FALSE blanket closures — your job is to correct them).

## Contract (interfaces produced for downstream cards)

- This ledger is the authoritative traceability source for Wave 7 closure and informs SC-O8 (FV-specific oracle corrections) and the Wave 8 integration gate.
- Correct the draft's misattributions. Per the work spec SC-O8, do not misattribute:
  - FV-004 to entity admission;
  - FV-007 to backend rollover alone;
  - FV-017/FV-018 to completeness alone;
  - FV-020/FV-023/FV-028 to typed domain errors alone.
- Every FV must have exactly ONE owning card (implementation owner). Shared infrastructure may be a dependency but never the substitute for the finding's behavioral proof.

## Red (questions the research must answer)

For each FV-001..FV-032, from its record: what is the original reproduction? Which wave/card owns its closure (check the work spec waves 4–7 and the fix-wave plan P-cards)? What red evidence must exist and what green evidence closes it? What is the current status?

Where the superseded draft claimed closure by a broad mechanism (e.g. "closed by E4/B6"), determine the TRUE owner card in this spec's wave structure and the finding's own focused reproduction requirement.

## Green

`docs/pages/contract/wave0/finding-traceability.mdx` exists and contains:

1. A table with exactly 32 rows (FV-001..FV-032): columns `FV`, `Severity`, `Original reproduction` (short, with evidence path), `Owning wave/card` (exactly one), `Dependencies`, `Red evidence`, `Expected green evidence`, `Status`.
2. A short "corrections" section listing every blanket closure from the superseded draft Part 7 that was replaced, with the corrected owner.
3. The ten craft findings explicitly preserved with their P-card owners from the fix-wave plan.
4. A note of which FVs are contract-only (no implementation P-card, e.g. FV-026 owned by an oracle/contract card) and which need both backend and frontend cards (e.g. FV-027).

Acceptance: 32 rows, each with exactly one owning card; every correction from the draft's Part 7 table is listed; the ten craft findings are present with their P-card owners.

## Evidence

- The BUGS.json severity counts (P0/P1/P2/P3).
- The draft Part 7 table excerpt being corrected.
- One example FV record showing the reproduction→owner mapping method.

## Metrics

`tasks/metrics/contract/SC-R6.json` is written by the orchestrator after review — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
