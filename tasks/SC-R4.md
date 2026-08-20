---
id: SC-R4
title: "Enforced-limit inventory"
deps: []
track: contract
outputs:
  - docs/pages/contract/wave0/limit-inventory.mdx
acceptance:
  - Every client-visible rejection or clamp points to a published data source (settings field, capability projection, request schema, or service capability)
  - Every game-domain literal has a settings-field migration plan
  - Classification table covers schema, Ada core, Ada server, frontend, and game settings
---

# SC-R4 — Enforced-limit inventory

## Target

Write ONE file: `docs/pages/contract/wave0/limit-inventory.mdx`. Read-only everywhere else. Do not edit `PAPERCLIPS.md`, `contract/`, `conformance/`, or any source.

## Inputs

- Governing decisions: `docs/pages/contract/spec-change-work-spec.mdx` sections "Limits and capabilities" and "Numeric operation results" (read the whole file).
- Schema bounds: `contract/schemas/*.json` and `contract/openapi.yaml` (request body bounds, `maxLength`, `maximum`, `minItems`, etc.).
- Ada core: `backend-ada/core/src/` (SPARK types, ranges, capacity subtypes).
- Ada server: `backend-ada/server/src/pitd_callback.adb` and any other server sources (validation literals, clamps, `Rating_Cap`, `TotalBoxes`, history limits, payload caps).
- Frontend: `frontend/src/` (client-side caps, max attributes, track lengths, load limits).
- Game settings: `data/games/games.json`, `blades-in-the-dark.json`, `scum-and-villainy.json`, `blades-in-the-dark-crews.json`, `game-settings-schema.json` (what is already published).
- Reference: `blades-in-the-sheets/Models/` C# (settings-driven maxima, e.g. `StressMax`, `TraumaMax`, harm slots, XP tracks, fund/stash, turf, load).

## Contract (interfaces produced for downstream cards)

- The classification feeds SC-C3 (settings schema + capability projection schemas), SC-A5 (capability infrastructure), SC-A6 (remove literals, enforce published bounds), SC-O4 (limits oracle).
- The five classes are fixed: game-domain (settings), derived (server-computed capability projections), request (OpenAPI request schemas), service (payload/batch/history limits), internal (never client-visible).

## Red (questions the research must answer)

Enumerate EVERY bound enforced anywhere, including at least: stress max, trauma max, harm slots per level (per-level capacities), XP track lengths and thresholds, fund/stash caps and conversion, crew trackers (rep/heat/wanted/turf), load commitment, action rating caps (raw settings max AND effective cap incl. Mastery/crew-derived), ability take counts, upgrade box counts (`TotalBoxes`), recovery clocks, session expressions, history snapshot retention, batch size, payload size, idempotency LRU size, revision arithmetic, clock sizes. For each:

- Where is it enforced today (schema / Ada core / Ada server / frontend / not enforced)?
- What is the current literal or source?
- Classification (game-domain / derived / request / service / internal).
- Target authoritative source and migration step (settings field name, capability projection field, request schema bound, or "internal — never client-visible").

## Green

`docs/pages/contract/wave0/limit-inventory.mdx` exists and contains:

1. The complete classification table with every bound found, one row per bound, with the five required columns (enforced where, current literal/source, class, target source, migration step).
2. The game-domain migration plan: for every game-domain literal, the exact settings field to add to `game-settings-schema.json` (SC-C3 will implement), including per-level harm capacities, action rating caps, `TotalBoxes`, clock-purpose lists, session expressions, stress/trauma/XP/fund/load values. All supported games must be covered (`blades-in-the-dark.json`, `scum-and-villainy.json`, translations where present).
3. The derived-limit list that must become capability projections (effective action cap, available upgrades/abilities, harm capacities, load limits) — explicitly NOT persisted in entity DTOs.
4. Service-limit list (payload, batch, history retention, idempotency) for service capabilities.
5. Internal-capacity list that must NEVER appear as an API promise.

Acceptance: every row has all five columns filled; no game-domain literal lacks a migration plan; the doc states which limits are currently hardcoded in Ada/frontend (grep-verified with file:line citations).

## Evidence

- Grep results with file:line for the key literals (e.g. rating caps, `MaxHistorySnapshots`, payload caps, stress/trauma maxima).
- The settings files listing of existing published fields.

## Metrics

`tasks/metrics/contract/SC-R4.json` is written by the orchestrator after review — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-R4.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
