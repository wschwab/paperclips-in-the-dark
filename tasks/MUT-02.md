---
id: MUT-02
title: Complete current mutant catalog and baseline
deps:
  - MUT-01
  - ORACLE-01
  - EDGE-01
  - EDGE-02
  - A11Y-01
track: contract
outputs:
  - agent-docs/test-audit/mutation-catalog.json
  - agent-docs/test-audit/mutation-results.json
  - conformance/scripts/mutation-harness.mjs
acceptance:
  - mutation-catalog.json identifies severity, exact symbol, expected layer, expected stable test IDs, restoration hash per mutant
  - one complete run in mutation-results.json contains every catalog ID
  - P0/P1 kill rate 100% by mutant-specific delta
---

# MUT-02 — complete current mutant catalog and baseline

**Wave 2.** Finding AR-001. Catalog maintenance began early; closure waited on all target layers.
**Status:** DONE (per `tasks/metrics/contract/MUT-02.json`)
**Metrics:** `tasks/metrics/contract/MUT-02.json` (evidence-only card: catalog + campaign artifacts, no product LOC)

## Log

- Wave 3: 20 catalog intents; baseline 16/20 killed with M02/M03/M17/M18 surviving (recorded in `agent-docs/test-audit/wave3-summary.md`), driving 8 AR-001 catalog additions.
- Wave 8: full campaign brief per `/tmp/w8-mut02-brief.md` (orchestrator-owned).
- Wave 9: retargeted M01/M04/M06/M11/M12/M16/M27 to post-ARCH-01 package paths and re-ran to full kill; harness retarget and stale-bin/pitd rebuild trap documented in `agent-docs/test-audit/browser-evidence/reports/w9-arch01-report.md`.
- 2026-08-28: final full-catalog run 28/28 killed, 0 survived (P0 19/19, P1 9/9), `generatedAt 2026-08-28T10:47:18.534Z` in `mutation-results.json`.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
