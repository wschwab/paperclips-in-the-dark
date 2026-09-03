---
id: CONTRACT-03
title: Apply approved crew progression decision (DEC-04)
deps:
  - DEC-04
track: contract
outputs:
  - contract/openapi.yaml
  - contract/schemas/
  - agent-docs/test-audit/contract-coverage.json
  - agent-docs/test-audit/capability-manifest.json
acceptance:
  - red conformance and generator tests for the approved stress-fix correction path
  - backend implementation/proof; frontend correction toggle; generated docs regenerated from the contract
---

# CONTRACT-03 — apply approved crew progression decision (DEC-04)

**Wave 5.** Finding UX-007 (with DEC-04, CREW-01). Strict clean-cutover order: Vocs decision page → OpenAPI/schemas/settings → red tests → Ada → frontend → generated docs → evidence.
**Status:** complete — see metrics notes (per `tasks/metrics/contract/CONTRACT-03.json`)
**Metrics:** `tasks/metrics/contract/CONTRACT-03.json` (implementation `opencode-go/ox-alpha-free`, full-card brief)

## Log

- 2026-08-25: contract change adds `/characters/{id}/ops/stress.fix` (x-snapshot true, absolute-setter family, `{value}` integer ≥ 0 clamped into `[0, StressMax]`); correction never raises `traumaPending` and emits no sideEffects. Frontend exposes it only behind a session-local Enable-corrections toggle in the stress section.
- 2026-08-25: focused corrections 6/7 on the first green run (test-side snapshot-count assertion wrong: two snapshots exist before undo, one remains); assertion fixed, then all gates green.
- 2026-08-25: full `test:ada` first run caught a `REQUIRED_HUMAN_OPS` pin missing `stressFix` (`suites/parity/capability-parity.test.ts`); added to the frozen set with CONTRACT-03 provenance, rerun green 457/457.
- 2026-08-25: derived artifacts regenerated from the contract, not hand-edited: `contract-coverage.json`, `capability-manifest.json` (`stressFix` = human/correction), api-reference README.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
