---
id: SC-SAFE-01
title: Campaign-data manifest and enforced guard
deps: []
track: contract
outputs:
  - conformance/scripts/default-data-guard.mjs
  - conformance/scripts/default-data-guard.d.mts
  - conformance/src/default-data-guard.test.ts
acceptance:
  - npx vitest run --config vitest.tooling.config.ts src/default-data-guard.test.ts
  - npm run typecheck
---

# SAFE-01 — campaign-data manifest and enforced guard

**Wave 0.** Findings AR-002 and UX-013.
**Status:** complete
**Revision:** ppxopowx (working copy; finalized before next card)

## Log

- 2026-08-23: initial implementation changed the guarded root from `data/games/` to repository-root `campaign-data/`; first focused run failed to parse at `default-data-guard.test.ts:244`.
- 2026-08-23: openai-codex/gpt-5.6-luna workers at effort `none` repaired syntax, manifest typing, immediate entity counts, root existence transitions, file/directory replacements, real rename coverage, non-destructive pollution wording, and real-root no-op stability coverage.
- 2026-08-23: independent reviews found missed empty-root/type-replacement cases and stale restoration wording; corrective slices landed.
- 2026-08-23: final focused acceptance passed 21/21 tests; `npm run typecheck` passed. The read-only real-root case compared complete fixed-timestamp manifests across an injected no-op child.
- 2026-08-23: wrote ignored local evidence `agent-docs/test-audit/campaign-data-manifest.json`: 1,457 files, 6,134,087 bytes, 252 character directories, 93 crew directories, 38 clock directories, 1,456 human-review candidates. No campaign byte was changed or deleted.
