---
id: SC-O4
title: "Limits and numeric operation oracle"
deps: [SC-C2, SC-C3, SC-R4]
track: contract
outputs:
  - conformance/suites/semantics/published-limits.test.ts (NEW)
  - conformance/suites/contract/numeric-families.test.ts (NEW)
acceptance:
  - Every SC-R4 bound and numeric operation family covered, including two supported games where values differ
  - Capability values asserted; authoritative mutation enforcement; signed effective deltas; absolute setters; partial quantities; clamp notices; stale capability handling
  - Red against current source; existing unrelated conformance green
---

# SC-O4 — Limits and numeric operation oracle

## Target

Create exactly: `conformance/suites/semantics/published-limits.test.ts`, `conformance/suites/contract/numeric-families.test.ts`. Do NOT edit other suites, contract, or fixtures. Read-only elsewhere.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` sections "Limits and capabilities", "Numeric operation results"; SC-O4 list.
- `docs/pages/contract/wave0/limit-inventory.mdx` — the full bound table (56 rows) with values per game, the derived/service lists, and the gaps list (upgrade.mark TotalBoxes unenforced, levelup/set-rating cap mismatch, etc.).
- Frozen Wave 2 contract: capability endpoints (SC-C3), numeric families per op (SC-C2), settings fields.
- Two games: `BLADES`/`SCUM` helpers; values differ (action cap 4 vs 3, recovery clock 4 vs 6, etc.).

## Changes (freeze these cases red; mark guards where current behavior is already correct)

`published-limits.test.ts`:
- `LIMIT-CAP-001` service capabilities endpoint exposes maxPayloadBytes 1048576, maxHistorySnapshots 50, batch 50 (fails: no endpoint).
- `LIMIT-CHAR-002` character capabilities expose effective action caps matching settings+Mastery derivation for crewless/Mastery characters (fails).
- `LIMIT-CREW-003` crew capabilities expose the full upgrade catalog with totalBoxes/marked/remaining and ability catalog with maxTakes/taken (fails).
- `LIMIT-RATING-004` `action.set-rating` and `attribute.levelup` enforce the SAME effective cap (cap+1 rejected identically) for crewless/non-Mastery/Mastery (fails: mismatch — FV-022).
- `LIMIT-UPGRADE-005` `upgrade.mark` enforces settings TotalBoxes → `UPGRADE_MAXED` at cap+1; boxes stay at settings cap for two crew types (fails: unenforced — FV-005).
- `LIMIT-XP-006` XP tracks clamp at the settings-published lengths; per-game values (blades 8/6/10; scum same) (guard/red as applicable).
- `LIMIT-STRESS-007` stress max from settings; `LIMIT-TRAUMA-008` trauma max; `LIMIT-HARM-009` per-level harm capacities (2/2/1/1) with spillover (guards where current behavior matches; red only where settings linkage is absent).
- `LIMIT-FUND-010` satchel/stash caps + 2:1 conversion from settings (guard).
- `LIMIT-LOAD-011` per-commitment max bulk enforced from settings (fails: unenforced).
- `LIMIT-SESSION-012` session expressions clamp at `SessionExpressionMax` (fails today: Ada max 3, settings field 2 — FV gap).
- `LIMIT-IDEMPOTENCY-013` Idempotency-Key > 128 chars rejected with `VALIDATION` (fails: documented only).
- `LIMIT-IMPORT-014` import cannot set trackers above settings maxima (fails: import bypasses).
- `LIMIT-STALE-015` capability response is advisory: mutation after state change returns typed stale/maxed failure (fails until backend).
- `LIMIT-SERVICE-016` payload just over 1 MiB → `413 PAYLOAD_TOO_LARGE`; just under → accepted (guard).

`numeric-families.test.ts` (per the four families; assert requested/effective/visibleApplied/overflowAdded shapes):
- `NUM-SIGNED-001` signed delta family: XP ops accept -1 (effective -1 above zero), clamp at zero (effective 0, no negative), positive unchanged (fails: no-op negatives — FV-011).
- `NUM-ABS-002` absolute setter family (e.g. session.set, hold.set): requested = target, effective = stored target (guard).
- `NUM-QTY-003` quantity family (coin/harm/heat): requested = amount, effective = processed; clamps reported (guard/red per op).
- `NUM-CLOCK-004` clock progress family: requested, effective incl. rollover, visibleApplied/overflowAdded split when nonzero (fails: field names absent).
- `NUM-NONUM-005` non-numeric ops omit numeric fields (guard).
- `NUM-FAIL-006` a failed operation never claims applied; typed error carries current/limit data (fails: error union absent).
- `NUM-CLAMP-007` requested ≠ effective (clamp) — both clients must be able to detect from the result (guard where the server already reports).

## Green (this card's own gate)

- New files exist with frozen case names; red cases fail for the documented reasons (cite the FV/gap each pins); guards pass.
- `(cd conformance && npm run test:ada -- --run suites/semantics/published-limits.test.ts suites/contract/numeric-families.test.ts)` shows the red set.
- Uses both BLADES and SCUM where values differ.

Report exact commands and outputs.

## Metrics

`tasks/metrics/contract/SC-O4.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
