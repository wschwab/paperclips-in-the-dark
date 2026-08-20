---
id: SC-R1
title: "Ada recursive validator spike"
deps: []
track: contract
outputs:
  - docs/pages/contract/wave0/validator-spike.mdx
acceptance:
  - Verdict applies the decision rule: generic maintained validator chosen only if ALL exercised requirements pass, else schema-generated entity validators
  - Exercised requirements list with pass/fail per item; rejected alternatives and dependency impact recorded
  - All spike commands reproducible from the document
---

# SC-R1 — Ada recursive validator spike

## Target

Write ONE file: `docs/pages/contract/wave0/validator-spike.mdx`. Scratch spike code goes in `/tmp` only. Read-only in the repository; do not edit `PAPERCLIPS.md`, `contract/`, `conformance/`, or any source.

## Inputs

- Governing decisions: `docs/pages/contract/spec-change-work-spec.mdx` sections "Validation implementation" and "Wave 0" (read the whole file).
- Toolchain facts: `backend-ada/AGENTS.md` (GNAT FSF 16.1.0, GPRbuild 26.0.1, Alire 2.1.1; `XDG_RUNTIME_DIR=/tmp` is mandatory for every `alr` call; AWS 21.0.0 pinned; GNATCOLL 26 core-only packaging compatible).
- Schemas to validate: `contract/schemas/character.json`, `crew.json`, `clock.json`, `campaign.json`, `common.json` (note their `$ref`/`$defs` structure — external and internal references must be exercised).
- Existing crate manifests: `backend-ada/core/alire.toml`, `backend-ada/server/alire.toml`.

## Contract (interfaces produced for downstream cards)

- The selection feeds SC-A1 (recursive validator and canonicalizer) and SC-C5 (schema-derived validator metadata if generation is chosen).
- Verdict must name the chosen approach and the exact dependency impact (crate, version, licensing, proof/toolchain interaction).

## Red (questions the research must answer)

Can a maintained Ada library provide Draft 2020-12 JSON Schema validation, external `$ref` resolution, stable JSON pointers, and usable diagnostics in the current GNAT/Alire toolchain? If yes, use it; otherwise generate or centrally define entity-specific recursive validators. Never hand-maintain a second unsynchronized set of `Character_Required`/`Allowed` lists.

Exercise ALL of: external `$ref` (cross-file), internal `$ref`/`$defs`, nested `required`, nested `additionalProperties`, enums, `pattern`, numeric bounds, and stable error pointers. Record which schema constructs in `contract/schemas/*.json` must be supported.

## Green

`docs/pages/contract/wave0/validator-spike.mdx` exists and contains:

1. Survey of maintained Ada JSON Schema validators (check the Alire catalog and upstream sources; read the source of any candidate — "source-verified" is required, not a README skim).
2. A spike result per exercised requirement (pass/fail with the exact command and output excerpt). Scratch projects under `/tmp`; do not add dependencies to the repo.
3. The decision rule applied with a clear verdict: generic library OR schema-generated entity validators, with rejected alternatives and dependency impact.
4. If generation wins: the generator approach sketch (deterministic, idempotent) that SC-C5/SC-A1 can consume.

Acceptance: every exercised requirement has a pass/fail row and the verdict row states the chosen approach and why.

## Evidence

- The exact spike commands (each re-runnable from `/tmp`).
- Pass/fail excerpt per requirement.

## Metrics

`tasks/metrics/contract/SC-R1.json` is written by the orchestrator after review — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-R1.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
