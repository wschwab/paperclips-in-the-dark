---
id: SC-F3
title: "Limits, capabilities, and clamp communication"
deps: [SC-F1, SC-A5, SC-A6, SC-C3, SC-O4]
track: frontend
outputs:
  - frontend/src/api/client.ts (capability fetches, requested/effective clamp notices, healing-clock delta fix)
  - frontend/src/pages/character-detail.ts and crew-detail.ts (capability-driven UI, clamp announcements)
acceptance:
  - UI uses server-computed capability projections (actions, upgrades, abilities, harm, load); no local formula joins
  - Requested/effective differences announced; stale capability refresh
  - FV-021, FV-029 closed; FV-007 frontend part closed (delta family)
---

# SC-F3 — Limits, capabilities, and clamp communication

## Target

Edit: `frontend/src/api/client.ts`, `frontend/src/pages/character-detail.ts`, `frontend/src/pages/crew-detail.ts`, and their tests. Do NOT edit `contract/`, `conformance/`, or schema-generated files.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` SC-F3; "Limits and capabilities" (capabilities advisory; mutations authoritative); "Numeric operation results" (families; clients report requested/effective differences).
- The fix-wave plan P21 (effective action cap), P29 (tracker clamp feedback), P07 (healing-clock delta) cards.
- Frozen contract: capability endpoints (SC-C3 shapes: effectiveActionCaps, harmCapacities, loadLimits, availableAbilityTakes; upgrades/abilities/effectiveTurf/developThreshold), numeric families per op.
- Frozen oracle: published-limits.test.ts, numeric-families.test.ts (server-side behavior the UI must mirror).

## Changes

1. **Capabilities consumption**: character-detail renders action dots/count from `effectiveActionCaps` (cap button absent/disabled at the effective cap; Mastery DTO exposes the higher cap) — FV-021; crew-detail renders upgrades/abilities with remaining takes/boxes from the crew capability catalog (remove the local game-data joins cited in the limit inventory: crew-detail.ts:378-400, 690, 703-726, 1047-1081); harm/load UI from the capability projections.
2. **Clamp communication**: when `requested ≠ effective` in an OperationResult, announce the clamp/partial application; bound controls disabled at limits (rep/heat/wanted/xp/turf/coin) — FV-029; persisted value equals UI after refresh.
3. **Stale capability handling**: on STALE_REVISION/maxed failures, refetch capabilities and refresh (never keep stale controls).
4. **Healing-clock delta**: the healing-clock +1 control sends a delta per the declared clock-progress family, not an absolute segment count — FV-007 frontend part; rollover UI shows overflow accumulation.
5. Tests: extend client.test.ts and the detail page tests per the fix-wave red assertions (P07/P21/P29).

## Red

P07/P21/P29 red assertions (run focused tests; record failures before starting).

## Green

- `(cd frontend && npm test -- --run src/api/client.test.ts src/pages/character-detail.test.ts src/pages/crew-detail.test.ts)` green.
- `(cd frontend && npm run build)` green.
- No contract/conformance edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/frontend/SC-F3.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/frontend/SC-F3.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
