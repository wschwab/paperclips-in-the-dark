---
id: SC-A6
title: "Limits and requested/effective semantics"
deps: [SC-A5, SC-C2, SC-C3, SC-R4, SC-O4]
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb (settings-driven enforcement, unified caps, signed deltas, result families)
  - backend-ada/core/src/ (parameterized SPARK funds/limits where required, with proofs)
acceptance:
  - O4 limits and numeric cases green (published bounds enforced from settings; unified effective cap; upgrade TotalBoxes; signed XP deltas; clamp reporting)
  - No game-domain literal remains in server or core
---

# SC-A6 — Limits and requested/effective semantics

## Target

Edit: `backend-ada/server/src/pitd_callback.adb` (+ `.ads`), and `backend-ada/core/src/` ONLY where a proven primitive must be parameterized (e.g. `paperclips_core-funds` conversion rate, capacity handling) — with gnatprove green on every changed unit. Do NOT edit `contract/` or `conformance/`.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Limits and capabilities", "Numeric operation results"; SC-A6.
- `docs/pages/contract/wave0/limit-inventory.mdx` — full bound table, gaps list (upgrade.mark TotalBoxes unenforced; levelup/set-rating cap mismatch; per-commitment load unenforced; Idempotency-Key 128 unenforced; import bypasses settings maxima; session max 3 vs settings 2; literals at pitd_callback.adb:1076-1115,1499,1601-1606,1659).
- Frozen contract: settings fields (SC-C3), numeric families per op (SC-C2), capability endpoints (SC-A5).
- Frozen oracle: `published-limits.test.ts`, `numeric-families.test.ts`.
- `backend-ada/AGENTS.md` — gnatprove loop.

## Changes

1. Remove every game-domain literal from creation templates and enforcement: stress/trauma/XP/fund/heat/wanted/rep/turf/load/session/harm capacities all read from the validated settings (loaded by SC-A5). Session max now 2 (W7).
2. Unified effective action cap: `action.set-rating` and `attribute.levelup` enforce the SAME cap (settings ActionCap Base/Mastery + crew Mastery derivation) — the same function SC-A5 exposes.
3. `upgrade.mark`: enforce settings `TotalBoxes` → `UPGRADE_MAXED` at cap; unmark stays box-wise.
4. Per-commitment load: enforce max bulk per commitment option (incl. ability raises) from settings.
5. Idempotency-Key: reject > 128 chars with `VALIDATION`.
6. Import: validate against settings maxima (import cannot set trackers above settings values).
7. Signed XP deltas: playbook/attribute/crew XP ops apply negative deltas (clamp at zero, effective 0 never negative).
8. Result families: populate `requested`/`effective` per the declared family for every numeric op; clock-progress family (SC-A7); failed ops never claim applied — typed error carries current/limit.

## Red

O4 red cases (run and record before starting).

## Green

- `(cd conformance && npm run test:ada -- --run suites/semantics/published-limits.test.ts suites/contract/numeric-families.test.ts)` — limits/numeric cases green.
- Changed core units prove: `(cd backend-ada/core && env XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -u <unit>.ads --level=2 --checks-as-errors=on)` per changed unit.
- Server build green; no game-domain literal remains (grep check: the inventory's cited literal lines are gone).
- No contract/conformance edits.

Report exact commands and outputs; list any O4 case still red and why.

## Metrics

`tasks/metrics/ada/SC-A6.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/ada/SC-A6.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
