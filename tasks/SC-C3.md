---
id: SC-C3
title: "Settings and capability projections"
deps: [SC-R3, SC-R4, SC-S1]
track: contract
outputs:
  - data/games/game-settings-schema.json (extended)
  - data/games/blades-in-the-dark.json, scum-and-villainy.json, français-blades-in-the-dark.json, rus-blades-in-the-dark.json (complete domain-bound set)
  - data/games/crew-settings-schema.json (NEW) and data/games/scum-and-villainy-crews.json (NEW)
  - contract/openapi.yaml (capability endpoints + response schemas; new /capabilities paths only)
acceptance:
  - Every settings file validates against the extended settings schema
  - Every game-domain literal from the SC-R4 inventory has a settings field (values per the inventory table)
  - Service, character, and crew capability endpoints declared with full response schemas
  - Redocly lint passes
---

# SC-C3 — Settings and capability projections

## Target

Edit: `data/games/game-settings-schema.json`, `data/games/blades-in-the-dark.json`, `data/games/scum-and-villainy.json`, `data/games/français-blades-in-the-dark.json`, `data/games/rus-blades-in-the-dark.json`; create `data/games/crew-settings-schema.json` and `data/games/scum-and-villainy-crews.json`; add NEW `/api/capabilities` path blocks to `contract/openapi.yaml` (do not touch other openapi regions — SC-C2/SC-C6 own them). Read-only everywhere else.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Limits and capabilities", "Numeric operation results"; Wave 0 decisions W2, W7, W11, W12.
- `docs/pages/contract/wave0/limit-inventory.mdx` — the complete migration plan (§2 table with exact field names and per-game values), derived-limit list (§3), service-limit list (§4).
- `docs/pages/contract/wave0/clock-taxonomy.mdx` §7 — ClockPurposes field shape and the 10 exact values (both games ship all 10; translated files same list).
- `docs/pages/contract/spec-change-work-spec.mdx` "Limits and capabilities": capability responses are advisory for presentation; the mutation remains authoritative; derived limits are NEVER persisted in byte-identical entity DTOs (Q41).
- Existing data: `data/games/games.json`, `data/games/blades-in-the-dark-crews.json` (the only crew file today), current `game-settings-schema.json` (draft-04 style `definitions`, PascalCase top-level fields, additionalProperties: false).

## Changes

1. **Settings schema** (`game-settings-schema.json`): add the complete domain-bound set from the inventory §2 table — `StressMax`, `TraumaMax`, `HarmCapacities` (Lesser/Moderate/Severe/Fatal), `XpTrackMaxima` (Playbook/Attribute/Crew), `FundMaxima` (SatchelMax/StashMax/StashToCoinRate), `CrewTrackerMaxima` (HeatMax/WantedMax/RepMax), `TurfMax`, `LoadMaxima` (MaxBulk/CommitmentMaxBulk{Light,Normal,Heavy,Encumbered}), `ActionCap` (Base/Mastery), `SessionExpressionMax` (=2, W7), `DevelopCoinCostMultiplier` (=8, W11), `ClockPurposes` (10 values, W2), `RecoveryClockSize`/`ActionPointMaximum`/`FactionStatus` stay. Keep draft-04 style and `additionalProperties: false`; make every new field required once all game files carry it.
2. **Game files**: add the fields with the exact per-game values from the inventory §2 table (blades: 9/4/2,2,1,1/8,6,10/4,40,2/9,4,12/6/9,3,5,6,9/3,4/2/8/10 purposes; S&V: same defaults per W12 except published differences — ActionPointMaximum 3, RecoveryClockSize 6, FactionStatus -3..3, ActionCap Base/Mastery 3/3, TurfMax 6). Translated files mirror blades values.
3. **Crew settings**: create `crew-settings-schema.json` (CrewTypes with Upgrades[].TotalBoxes, SpecialAbilities[].TimesTakeable, claims map Kind: claim|turf|lair, per the existing blades-in-the-dark-crews.json shape) and `scum-and-villainy-crews.json` (S&V crew types with upgrades/abilities; use the blades file as the structural template and the S&V book data — keep values minimal and consistent with `scum-and-villainy.json`; mark any values you could not verify).
4. **Capability endpoints** (openapi.yaml, new paths only): `GET /api/capabilities` (service: maxPayloadBytes 1048576, maxHistorySnapshots 50, batch max 50), `GET /api/characters/{id}/capabilities` (effective action caps per action incl. Mastery derivation inputs, harm capacities per level with remaining, load limits per commitment option, available ability takes), `GET /api/crews/{id}/capabilities` (full available upgrade catalog with totalBoxes/marked/remaining, full available ability catalog with maxTakes/taken, effectiveTurf, developThreshold). Full response schemas (new components.schemas entries), documented as advisory; mutations remain authoritative.
5. **No DTO changes**: capabilities live only in the new endpoints; nothing is added to entity schemas.

## Red

Today the settings schema lacks the domain-bound set, only blades has a crew file, S&V crew capabilities 404, and no capability endpoints exist.

## Green

- Every settings file validates against `game-settings-schema.json` (ajv in /tmp; no repo package changes) — report the command/output.
- `blades-in-the-dark-crews.json` and the new S&V crew file validate against `crew-settings-schema.json`.
- Capability paths present with schemas; redocly lint passes.
- No entity schema file changed (orchestrator checks jj diff scope).

Report the exact commands and outputs. Do NOT run project-wide gates.

## Metrics

`tasks/metrics/contract/SC-C3.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts; list any S&V crew values you could not source.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
