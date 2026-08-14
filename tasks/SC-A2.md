---
id: SC-A2
title: "Import and repair transactions"
deps: [SC-A1, SC-C2, SC-O1, SC-R0]
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb (import preview/apply, repair preview/apply, preview tokens, atomic writes)
acceptance:
  - O1 import/repair cases green (preview 409 NORMALIZATION_REQUIRED, apply 200 with If-Match + token + confirmation, needs-input 400 INVALID_ENTRY, unknown-key preview classification, legacy conversion, token staleness, byte identity, one baseline snapshot)
  - Crash probes leave old or complete new files only
---

# SC-A2 — Import and repair transactions

## Target

Edit: `backend-ada/server/src/pitd_callback.adb` (+ `.ads` if needed). Do NOT edit `contract/`, `conformance/`, or `backend-ada/core/`.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Canonical shape and normalization" (partial import, repair, preview tokens, atomic apply), "Degraded entities" (content token sha256, stale → 409); SC-A2.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` — defect classes, per-class HTTP outcomes, legacy rules.
- Frozen contract: import/repair paths and statuses in `contract/openapi.yaml`; the error union (NORMALIZATION_REQUIRED with preview+token, INVALID_ENTRY with pointer details).
- Frozen oracle: `conformance/suites/persistence/canonical-shape.test.ts`, `import-repair.test.ts`.
- Existing server code: `Import_Valid`, import handlers, `Atomic_Write`, history/snapshot machinery, `--test-hooks` crash hooks.

## Changes

1. **Import preview**: `importCharacter`/`importCrew` preview mode computes the canonicalizer output without writing: fills, conversions, corrections, listed removals, warnings; returns `409 NORMALIZATION_REQUIRED` (with preview + opaque preview token) when any material/lossy change or fill is needed, or proceeds normally when the document is canonical. Unknown properties are never dropped silently: preview classifies and displays each removal; apply without a classified removal is rejected.
2. **Import apply**: requires `If-Match` (entity revision), confirmation, and the preview token; mismatched/stale preview token → `409 STALE_REVISION`; needs-input pointers without caller values → `400 INVALID_ENTRY` with pointer-level details; success atomically writes the previewed result and takes exactly ONE baseline snapshot (import clears history per existing contract).
3. **Repair preview/apply**: repair-preview on a degraded/repairable stored entity returns the normalized result + warnings + preview token (`409 NORMALIZATION_REQUIRED`), no write; repair-apply requires preview token + confirmation + `If-Match` (revision, or the raw-byte `sha256:` content token for unreadable rows); atomic write of the previewed result; changed bytes since preview → `409 STALE_REVISION`. Unparseable bytes: no repair (deletion only).
4. **Preview tokens**: opaque, bound to the exact input bytes + revision (so staleness is detectable); single-use or bounded lifetime — choose and document.
5. Preserve history rules: import baseline snapshot exactly one; repair keeps history per the Wave 1 rule (a repair apply is a snapshot-worthy write).

## Red

O1 import/repair red cases (run and record before starting).

## Green

- `(cd conformance && npm run test:ada -- --run suites/persistence/canonical-shape.test.ts suites/persistence/import-repair.test.ts)` green for the import/repair cases.
- Server build green.
- Crash probes: kill mid-apply leaves old or complete new file only.
- No contract/conformance/core edits.

Report exact commands and outputs; list any case still red and why.

## Metrics

`tasks/metrics/ada/SC-A2.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
