---
id: DOC-01
title: Vocs, metrics, artifact contract, and traceability
deps: []
track: contract
outputs:
  - agent-docs/test-audit/finding-traceability.md
  - agent-docs/test-audit/validate-finding-traceability.js
  - agent-docs/test-audit/validate-metrics.js
  - agent-docs/test-audit/doc01-report.md
  - docs/pages/frontend/
acceptance:
  - every card metrics file exists under the correct track directory; prior evidence renamed to work-spec section 5 names; every finding-traceability row complete with red, green, revision, tests, browser evidence, decision, review; Track Z expected-red recorded honestly, non-blocking
---

# DOC-01 — Vocs, metrics, artifact contract, and traceability

**Wave 9.** Finding AR-017. Runs throughout; closes after all implementation cards. Never hand-edit generated API reference.
**Status:** DONE (per `tasks/metrics/contract/DOC-01.json`)
**Metrics:** `tasks/metrics/contract/DOC-01.json` (implementation: omp main session + three read-only evidence scouts)

## Log

- 2026-08-28: Vocs updated for user-visible roster search/bounded rendering, recovery/import, PC creation decision, lifecycle labels/workflow, action-dot keyboard use, crew interactions, theme/navigation changes, performance/operational behavior (incl. new `operational-behavior.mdx` under `docs/pages/frontend/`); 24 new/created metrics records under `tasks/metrics/contract/`; artifact renames to work-spec §5 names. Self-verification: every referenced path checked on disk; metrics JSON validated; artifact names matched to work-spec §5; internal links validated.
- 2026-09-02: finding-traceability fix — AR-007 row repaired to 9 columns with Status=DONE; UX register expanded to the 10-column DOC-01 §17 schema (17/17 UX rows with grounded evidence); volatile-evidence note updated to the durable archives. Validators: `validate-finding-traceability.js` 231 checks 3× ALL CHECKS PASSED; metrics validator 149 files 0 errors 3× ALL CHECKS PASSED. See `agent-docs/test-audit/doc01-report.md`.
- 2026-09-04: refreshed to candidate 9879bf76 — current durable archives `9879bf76-pre-review/`, `9879bf76-luna-final/` (pre-gate diagnostic, session 01a06b5b), `9879bf76-luna-ordered/` (ordered REVIEW-02 PASS, session 01a06bad); authorized campaign cleanup recorded (characters 0, crews 0 post-cleanup).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
