---
id: CONTRACT-04
title: Apply approved crew contact/faction decision (DEC-05)
deps:
  - DEC-05
track: contract
outputs:
  - contract/schemas/
  - data/games/
  - agent-docs/test-audit/contract-coverage.json
acceptance:
  - red conformance and generator tests for tier/stash semantics
  - backend implementation/proof; frontend bounds; generated docs regenerated from the contract
---

# CONTRACT-04 — apply approved crew contact/faction decision (DEC-05)

**Wave 5.** Finding UX-009 (with DEC-05, CREW-03). Semantics card executing the DEC-04 human ruling (2026-08-24). Strict clean-cutover order per work-spec §13.
**Status:** complete (per `tasks/metrics/contract/CONTRACT-04.json`)
**Metrics:** `tasks/metrics/contract/CONTRACT-04.json` (implementation `opencode-go/ox-alpha-free`; card written in one session, continued after a context rollover whose second context verified every layer and regenerated stale derived artifacts)

## Log

- 2026-08-25: `CrewTierMax=4` and `CrewStashBaseCapacity=4` entered the game-settings schema + all four settings files; Vault upgrade in `blades-in-the-dark-crews.json` carries structured `StashCapacities` [4,8,16] validated by `crew-settings-schema.json`; `stashCapacity` is a write-time derived persisted canonical integer (never accepted as input); tier normalization clamps `[0, CrewTierMax]`; `tier.add`/`stash.add` clamp at settings/vault-derived ceilings with requested/effective reported.
- 2026-08-25: all gates green on the first continuation run (typecheck exit 0; crew-progression 4/4; full ada 461/461 across 58 files; frontend 665/665 across 19 files; vite build ok); artifact drift check by re-running all four generators.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
