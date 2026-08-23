---
id: MUT-01
title: Mutation harness methodology
deps:
  - SC-GATE-01
track: contract
outputs:
  - conformance/scripts/mutation-harness.mjs
  - conformance/scripts/mutation-harness.d.mts
  - conformance/src/mutation-harness.test.ts
  - conformance/package.json
acceptance:
  - cd conformance && npm run test:mutation
  - cd conformance && npm run test:tooling
  - cd conformance && npm run typecheck
---

# MUT-01 — mutation harness methodology

**Status:** complete
**Revision:** nsvruuly (working copy; finalized before next card)

## Log

- 2026-08-23: the original harness executed immediately when imported, classified every non-zero exit as killed, restored through VCS rather than byte snapshots, and overwrote the full baseline on targeted runs.
- 2026-08-23: red calibration exposed the import side effect by starting a real mutant; the orchestrator stopped it immediately and restored only the harness-mutated backend file from the parent revision.
- 2026-08-23: the reusable methodology now requires a green identified baseline, unique byte-changing anchors, expected new test IDs, distinct infrastructure/test states, byte-exact finally restoration, and atomic full/targeted artifact separation.
- 2026-08-23: M01 targets Crew_Summary's `History_Count`, M06 injects a real write into `Classify_Stored`, and M17 matches both typed exported focus functions. Temp-only anchor calibration proved all three against current source without touching it.
- 2026-08-23: green proved the permanent mutation command 12/12, full tooling 150/150, typecheck, and a clean source status containing only MUT-01 files.
