---
id: SC-A1
title: "Recursive validator and canonicalizer"
deps: [SC-R0, SC-R1, SC-C1, SC-O1, SC-O2]
track: ada
outputs:
  - backend-ada/server/src/generated/ (schema-derived validator package, emitted by the SC-C5 generator)
  - backend-ada/server/src/pitd_callback.adb (canonicalizer + validator wiring, every write path)
acceptance:
  - O1 canonical-shape cases green; O2 admission cases green where they are write-path checks
  - Canonical GET/download byte-identical; no read path writes
  - Crash probes leave old or complete new files only
---

# SC-A1 — Recursive validator and canonicalizer

## Target

Edit: `backend-ada/server/src/pitd_callback.adb` (+ `.ads` if needed), and consume the generated validator package under `backend-ada/server/src/generated/` (regenerate with the SC-C5 generator if the schemas changed since generation; if the generated file is missing, run the generator per skill/README or the SC-C5 card). Do NOT edit `contract/`, `conformance/`, or `backend-ada/core/` (SPARK boundary stays clean).

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Canonical shape and normalization", "Validation implementation", "Degraded entities"; SC-A1.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` — the canonical defaults per property, defect classes, legacy rules L1-L8, the four normalizer outcomes.
- `docs/pages/contract/wave0/validator-spike.mdx` — the emitted validator shape (Required_/Allowed_ constants, Check_ procedures, stable RFC 6901 pointers).
- Frozen contract: `contract/schemas/*.json` (canonical v1), `contract/openapi.yaml` (write-path statuses).
- Frozen oracle: `conformance/suites/persistence/canonical-shape.test.ts`, `entity-admission.test.ts` (the red cases this card makes green).
- `backend-ada/AGENTS.md` — Ada idioms, XDG_RUNTIME_DIR=/tmp, gnatprove loop.

## Changes

1. Wire the generated recursive validator into every WRITE path (create, import-apply, repair-apply, every mutation writing a nested object): validate the request/payload recursively before any write. Do NOT hand-maintain the Required/Allowed sets (they are generated; regenerate, don't edit).
2. Implement the canonicalizer per the R0 matrix: missing/null → canonical defaults (per-property); known legacy conversions (L1-L8); deterministic clamp for out-of-bound numbers; unknown-key handling per the preview rules (write paths that accept import/repair content classify and display removals; API mutations reject unknown keys). The canonicalizer produces the ordered change list (JSON pointer, reason, previous, replacement).
3. Every write persists the complete canonical shape (total objects; sparse claimOverrides preserved as-is when already canonical).
4. Reads stay pure: admission/classification on read, but NO write, NO repair during GET.
5. Byte-identity: GET/download return the stored bytes exactly.

## Red

O1/O2 red cases (run them; record the failing set before starting).

## Green

- `(cd conformance && npm run test:ada -- --run suites/persistence/canonical-shape.test.ts suites/persistence/entity-admission.test.ts)` — the O1 write-path cases and O2 write-path cases green; read-path admission cases may remain red (SC-A3 owns read admission — do not expand scope; if a case is genuinely read-path, list it and leave it red).
- Server build green: `(cd backend-ada/server && env XDG_RUNTIME_DIR=/tmp alr --non-interactive build)`.
- Crash probes: kill the server mid-write (test hook) leaves old or complete new file only (run the atomic-write probes from the existing persistence suite).
- No edits to core/ or contract/.

Report exact commands and outputs; state which O-cases are green and which are deferred to SC-A3.

## Metrics

`tasks/metrics/ada/SC-A1.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
