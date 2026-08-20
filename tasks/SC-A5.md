---
id: SC-A5
title: "Capability and metadata infrastructure"
deps: [SC-C3, SC-R4, SC-O4]
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb (load/validate expanded settings; serve service/character/crew capability projections)
acceptance:
  - O4 capability cases green (service maxPayloadBytes/maxHistorySnapshots/batch; character effective caps/harm capacities/load limits/ability takes; crew upgrade+ability catalogs/effectiveTurf/developThreshold)
  - No capability value persisted in byte-identical entity documents
---

# SC-A5 — Capability and metadata infrastructure

## Target

Edit: `backend-ada/server/src/pitd_callback.adb` (+ `.ads` if needed). Do NOT edit `contract/`, `conformance/`, or `backend-ada/core/`.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section "Limits and capabilities"; SC-A5; Q19/Q20/Q41.
- `docs/pages/contract/wave0/limit-inventory.mdx` — the derived-limit list (§3), service-limit list (§4), settings field names (§2).
- Frozen contract: settings schema (extended game-settings-schema.json), capability endpoints + response schemas in openapi.yaml.
- Frozen oracle: `published-limits.test.ts` (capability cases).
- Existing code: settings loading, `Rating_Cap`, `Turf_Effect_Delta`, `Can_Take_More`, `Armor_Available`, service constants (Max_Import, Max_History_Snapshots).

## Changes

1. Load and validate the expanded game settings at startup (schema-validated; reject invalid files loudly). Every capability value is read from settings — no literals.
2. `GET /api/capabilities` (service): maxPayloadBytes 1048576, maxHistorySnapshots 50, batch max 50 — from the existing constants, now published.
3. `GET /api/characters/{id}/capabilities`: effective action caps per action (settings Base/Mastery + crew Mastery derivation — same function SC-A6 uses for enforcement), harm capacities per level with remaining, load limits per commitment option (incl. ability raises), available ability takes. Computed from settings + current entity state.
4. `GET /api/crews/{id}/capabilities`: full available upgrade catalog (upgradeId, totalBoxes, marked, remaining, coin affordability), full available ability catalog (maxTakes, taken), effectiveTurf, developThreshold.
5. Nothing capability-shaped is persisted into entity documents (checksum guard: capability GET never writes; entity GET bytes unchanged).

## Red

O4 capability cases (run and record before starting).

## Green

- `(cd conformance && npm run test:ada -- --run suites/semantics/published-limits.test.ts)` green for the capability cases.
- Server build green.
- Entity documents byte-identical before/after capability reads (checksum).
- No contract/conformance/core edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/ada/SC-A5.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/ada/SC-A5.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
