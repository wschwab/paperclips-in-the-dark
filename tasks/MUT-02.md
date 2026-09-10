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
  - conformance/fixtures/mutation-catalog.json
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
- 2026-09-16 (fresh-checkout correction): a blind REVIEW-01 clean-candidate pass (via disposable jj workspace) found `conformance/scripts/mutation-harness.mjs` eagerly required the gitignored `agent-docs/test-audit/mutation-catalog.json` at module load, breaking `conformance/src/mutation-harness.test.ts` and `conformance/src/sol-finding-1-3.test.ts` on any genuine fresh checkout (ENOENT before test collection). Fixed by relocating the catalog to tracked `conformance/fixtures/mutation-catalog.json` and updating `CATALOG_PATH` in the harness. Re-verified via fresh disposable jj workspace plus full regression: tooling 218/218 (incl. the two previously-broken files at 50/50), Ada 471/471, frontend 794/794.
- 2026-10-04 (create-boundary restoration refresh): after REVIEW-01-CREATE-JSON-BOUNDARY / REVIEW-01-CREATE-IDEMPOTENCY, reviewed all 28 mutation implementations against current source using an in-memory apply (no source writes). Every mutant still changes its intended target; uniquely anchored replacements still match exactly once. Confirmed stale-mutant sites: M05 changes the degraded-entity direct-access S422 after `Invalid_Entity_Result`; M07 skips the non-import/repair If-Match gate; M08 skips the snapshot-worthy pre-mutation snapshot; M09 skips undo's snapshot-file deletion; M11 replaces the live stress pending flag with trauma append; M12 clears retirement on trauma removal; M14 skips the W5 owner-deletion reassignment; M15 skips the W4 unlink sweep; M16 hardcodes the live `CrewTierMax` lookup; M27 disables all three claim dispatch arms. No mutation anchor, replacement, expected killer, severity, or semantic intent needed changing.
- Refreshed exactly ten stale restoration hashes: M05/M07/M08/M09/M14/M15 for `pitd_callback.adb`, `cab0848ee486d2d8f147276d3485071c4dec25eac15bf2cc9dde248a98dc5e8e` → `4db146dee4838fa2e8857e6b0b788362ac54540b1a15e0f4afe4bd00e4298a88`; M11/M12/M16/M27 for `pitd_ops.adb`, `72c644ec8933acdfd637c228f20f21baf109f038cd9801c852c8407e63ad4f36` → `4332891d78b478497721504a3daebc39111d18fb8f6bda457b114bf3ef65ea6e`. All other catalog hashes were already current. Historical campaign and correction entries above remain unchanged.
- Full `cd conformance && npm run test:mutation` completed successfully in **1557.00 s**, with green baselines **Ada 495 / tooling 220 / frontend 794**, then **28/28 killed**, **0 survivors** (**P0 19/19**, **P1 9/9**). The harness verified post-campaign byte-exact source restoration and rebuilt the clean backend after each Ada mutant. Result: `agent-docs/test-audit/mutation-results.json`, revision `2714c3e24c34`, timestamp `2026-10-04T07:07:17.843Z`; raw evidence: `agent-docs/test-audit/mutation-raw-2026-10-04T07-07-17-842Z.txt`, session output `artifact://10436`. Current evidence is appended as `correction2026-10-04` in the metrics record; historical results are preserved.
- Post-refresh validators: `node agent-docs/test-audit/validate-metrics.js && node agent-docs/test-audit/validate-finding-traceability.js && node agent-docs/test-audit/reconcile-audit.js`, exit 0: **155 metrics files**, **231/231 traceability checks**, **17/17 reconciliation checks**; **0 errors**, reconciliation **0 warnings**. All three reported `ALL CHECKS PASSED`.
