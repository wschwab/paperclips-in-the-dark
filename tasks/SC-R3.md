---
id: SC-R3
title: "Clock taxonomy and ownership"
deps: []
track: contract
outputs:
  - docs/pages/contract/wave0/clock-taxonomy.mdx
acceptance:
  - One DTO sketch covers campaign, character project, crew/score, faction, and custom standalone clocks without duplicating embedded healing clocks or implementing fictional automation
  - Owner deletion behavior specified (default: reassignment to campaign) with rationale
  - Game-setting clock-purpose list defined; related-clock integrity rules specified
---

# SC-R3 — Clock taxonomy and ownership

## Target

Write ONE file: `docs/pages/contract/wave0/clock-taxonomy.mdx`. Read-only everywhere else. Do not edit `PAPERCLIPS.md`, `contract/`, `conformance/`, or any source.

## Inputs

- Governing decisions: `docs/pages/contract/spec-change-work-spec.mdx` section "Clocks" (read the whole file).
- Official taxonomy: <https://bladesinthedark.com/progress-clocks> (public Blades material — fetch it; purpose is descriptive, Paperclips never auto-resolves races/links).
- Reference implementation: `blades-in-the-sheets/Models/` — find `ProjectClock`, `RolloverClock`, and the character healing clock (read-only reference).
- Current contract: `contract/schemas/clock.json`, `contract/openapi.yaml` clock operations (project clock, healing clock ops).
- Game settings: `data/games/blades-in-the-dark.json`, `scum-and-villainy.json`, `data/games/game-settings-schema.json` — do clock-purpose lists exist today? If not, design the field and its values.

## Contract (interfaces produced for downstream cards)

- The DTO sketch feeds SC-C1 (standalone clock schema: `ownerKind`, `ownerId`, `purpose`, `behavior`, `relatedClockIds`), SC-C2 (clock operations), SC-O5 (clocks oracle), SC-A7 (clock core and API).
- The owner-deletion decision (default: reassignment to campaign, because it preserves campaign history; confirmation-guarded cascade is the alternative) is frozen here before the oracle.

## Red (questions the research must answer)

- Reconcile the official clock categories (progress, danger, racing, linked, mission, tug-of-war, long-term project, faction, score, custom) with the C# models and the current API. Which categories are representable with the three-concern model (storage ownership / narrative purpose / mechanical behavior)?
- What is the complete list of clock purposes for game settings? (e.g. `progress`, `danger`, `racing`, `linked`, `mission`, `tug-of-war`, `long-term-project`, `faction`, `score`, `custom` — verify against the official material and both games.)
- Embedded character healing clocks: how do they differ from standalone clocks (monitor state, implicit ownership, rollover healing behavior)? Confirm they must NOT be duplicated into `/api/clocks`.
- Owner deletion: reassign to campaign vs confirmation-guarded cascade — specify the chosen policy, the rationale, and the exact observable behavior (what happens to `ownerId`, `ownerKind`).
- Related-clock integrity: what happens when a related clock is deleted? (documented dangling reference vs cleanup — choose and justify).
- Rollover behavior: bounded vs rollover; progress adds new overflow to existing overflow; reset applies at most one clock size and retains remaining overflow. Sketch the SPARK contract shape (Post) for later proof.

## Green

`docs/pages/contract/wave0/clock-taxonomy.mdx` exists and contains:

1. The reconciled taxonomy table (category → ownership/kind → purpose → behavior), grounded in the official material and the C# models.
2. One DTO sketch covering all standalone clock kinds with the five metadata fields and their validation rules; embedded healing clocks explicitly excluded.
3. The game-setting clock-purpose list (exact values) and the settings-schema change SC-C3 needs.
4. The owner-deletion decision with observable behavior.
5. The related-clock integrity rule.
6. The rollover accumulation/reset semantics with a worked example (e.g. 4/6 → +5 → 9/6 overflow 3 → +2 → overflow 5 → reset → 1/6 remaining 4... adjust to the exact chosen semantics) and a SPARK `Post` sketch.

Acceptance: the taxonomy table covers every official category; the DTO sketch is a single schema sketch (not one per kind); the owner-deletion policy is a definite choice with the alternative rejected.

## Evidence

- The official material excerpt used for the taxonomy.
- C# model excerpts (`ProjectClock`, `RolloverClock`, healing clock).
- The worked rollover example.

## Metrics

`tasks/metrics/contract/SC-R3.json` is written by the orchestrator after review — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-R3.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
