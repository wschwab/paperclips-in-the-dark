---
id: SAFE-01
title: Campaign-data manifest and enforced guard
deps: []
track: contract
outputs:
  - conformance/scripts/default-data-guard.mjs
  - conformance/src/default-data-guard.test.ts
  - agent-docs/test-audit/campaign-data-manifest.json
acceptance:
  - tooling test proves no-op passes; create, modify, delete, rename each fail
  - absent directory becoming present fails
  - real repository manifest byte-identical across a harmless wrapped command
  - campaign-data-manifest.json exists; no campaign byte changed
---

# SAFE-01 — campaign-data manifest and enforced guard

**Wave 0.** Findings AR-002 and UX-013.
**Status:** DONE (per `tasks/metrics/contract/SAFE-01.json`)
**Metrics:** `tasks/metrics/contract/SAFE-01.json` (canonical record; wave-0 scorecard with the original narrative at `tasks/metrics/contract/SC-SAFE-01.json`, numbers copied verbatim)

## Log

- 2026-08-23: initial implementation changed the guarded root from `data/games/` to repository-root `campaign-data/`; first focused run failed to parse at `default-data-guard.test.ts:244`.
- 2026-08-23: `openai-codex/gpt-5.6-luna` workers at effort `none` repaired syntax, manifest typing, immediate entity counts, root existence transitions, file/directory replacements, real rename coverage, non-destructive pollution wording, and real-root no-op stability coverage.
- 2026-08-23: independent reviews found missed empty-root/type-replacement cases and stale restoration wording; corrective slices landed.
- 2026-08-23: final focused acceptance passed 21/21 tests; `npm run typecheck` passed. The read-only real-root case compared complete fixed-timestamp manifests across an injected no-op child.
- 2026-08-23: wrote ignored local evidence `agent-docs/test-audit/campaign-data-manifest.json`. No campaign byte was changed or deleted.
- 2026-09-02: default-data guard tests 21/21 PASS; SAFE-01 guard EXIT 0 around a harmless child confirms zero writes to campaign-data during guarded runs. Manifest refreshed after post-VET-01 format-normalization drift in 1 file (entity semantically identical); `data/games` unchanged.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5 (`agent-docs/` mirrors must not carry the durable release record). No new implementation; no sessions/results invented.
