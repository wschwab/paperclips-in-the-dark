---
id: XP-TRACKER-02
title: Atomic Scoundrel XP completion op (xp.resolve) — contract
deps:
  - XP-TRACKER-01
track: contract
outputs:
  - contract/openapi.yaml
  - conformance/suites/semantics/xp-resolve.test.ts
  - conformance/src/endpoint-schema-map.test.ts
  - conformance/generated/contract-coverage.json
  - skill/generate-capability-manifest.mjs
  - skill/api-reference/README.md
  - skill/api-reference/capability-manifest.json
  - docs/pages/contract/xp-tracker-proposal.mdx
  - docs/public/mockups/game-mode/xp-tracker-score.html
  - docs/public/mockups/game-mode/xp-tracker-expanded.html
  - docs/public/mockups/game-mode/xp-tracker.css
---

# XP-TRACKER-02 — `xp.resolve` contract (red)

Authorized contract change. One atomic character op completes Scoundrel XP:
GM-confirmed total allocated across Playbook and the Blades attribute tracks, then
the three session counters cleared, in one revisioned write.

## Decisions (see the proposal's "Decided" section)

- Body: `total` ≥ 0 and `allocations` with `Playbook`, `Insight`, `Prowess`, `Resolve`, each ≥ 0 integer.
- Sum of allocations must equal `total` (needed for "no discard, no invention"; the total stays free relative to the counters).
- Zero total allowed: awards nothing, still clears the counters on success (explicit GM choice).
- Room overflow, negative and non-integer values, and a sum mismatch: HTTP 400 `VALIDATION`, nothing changes, revision unchanged.
- Stale `If-Match`: existing `STALE_REVISION` 409.
- `end-downtime` with `clearSessionExpressions` stays in the API (only its UI button is removed, in XP-TRACKER-04).

## Changes

- `contract/openapi.yaml`: path `/characters/{id}/ops/xp.resolve` (`characterXpResolve`, `x-snapshot: true`) and schema `CharacterXpResolve`.
- `skill/generate-capability-manifest.mjs`: description and disposition `human` / `sheet-management` for `characterXpResolve`; regenerated `skill/api-reference/capability-manifest.json`.
- `skill/api-reference/README.md`: regenerated from the contract.
- `conformance/generated/contract-coverage.json`: regenerated.
- `conformance/src/endpoint-schema-map.test.ts`: route count 112 → 113.
- `conformance/suites/semantics/xp-resolve.test.ts`: XP-RESOLVE-001 to 006.
- `docs/pages/contract/xp-tracker-proposal.mdx`: "Decided" section.
- Mockups: a visible note on the Score and expanded frames: "Simplified sheet: only some cards shown. The real sheet stays complete during Score; the Talents XP bars stay as they are."

Ada validators (`skill/generate-ada-validators.mjs`) and the frontend completeness file did not change: they cover the JSON schemas, not operation bodies.

## Red evidence

`tasks/metrics/contract/XP-TRACKER-02-red.log`, run with `npm run test:ada -- --run suites/semantics/xp-resolve.test.ts` against the unchanged backend:

- XP-RESOLVE-001 to 005 **fail**. The unimplemented op answers HTTP 200 with a `VALIDATION` body ("unknown operation"), so the expected 200 success and 400 rejections are not met.
- XP-RESOLVE-006 passes already: the existing revision check rejects a stale `If-Match`. It is a regression guard, not a new behaviour.

**Finding (pre-existing, not changed here):** an unknown operation name returns HTTP 200 with a `VALIDATION` error body, not 404. Other tools may rely on this. Reported, not fixed in this card.

## Gates

- `npm run test:tooling`: 18 files, 233/233 (`tasks/metrics/contract/XP-TRACKER-02-tooling.log`).
- Contract validators and reconciliation: see the metrics record.
- The Ada and browser gates belong to XP-TRACKER-03 and XP-TRACKER-04.
