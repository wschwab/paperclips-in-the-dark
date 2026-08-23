---
id: TEST-02
title: Claim operation coverage closure
deps:
  - ORACLE-01
track: contract
outputs:
  - conformance/suites/semantics/claims.test.ts
  - agent-docs/test-audit/contract-coverage-map.json
acceptance:
  - cd conformance && npm run test:ada -- suites/semantics/claims.test.ts
  - cd conformance && npm run typecheck
  - cd conformance && npm run test:ada
  - each claim mutant killed by the focused suite (controlled red/green)
---

# TEST-02 — claim operation coverage closure

**Status:** complete
**Revision:** urzwoxkx (working copy; finalized before next card)

## Log

- 2026-08-24: added `conformance/suites/semantics/claims.test.ts` with three
  named observable guards — CLAIM-SET-001, CLAIM-CUSTOMIZE-002,
  CLAIM-RESET-003. Each covers request schema rejection (400 on malformed
  bodies), response schema via strict `OperationResult` decode, state
  transition (`claimedClaimIds` / merged then deleted `claimOverrides`),
  snapshot/history (`crews/{id}/history[0].op`), reload persistence,
  stale-revision no-write (409 STALE_REVISION leaves state unchanged), and
  unknown-claim VALIDATION with no write.
- 2026-08-24: claim identities are read from `data/games/blades-in-the-dark-crews.json`
  CrewTypes[].Claims.Nodes (excluding the lair) — nothing hardcoded.
- 2026-08-24: mutation check — three controlled single-change mutants in
  `pitd_callback.adb` were each built and killed by the focused suite:
  claim.set acquisition suppressed (`claimedClaimIds` stayed empty),
  claim.customize name merge dropped (override lost `name`),
  claim.reset filter inverted (override survived). Source restored from jj
  after each; clean rebuild green 3/3.
- 2026-08-24: acceptance — focused suite 3/3 under managed-run; typecheck
  pass; canonical Track A 56 files/433 tests. Coverage map regenerated to
  108/108 operations with an empty uncoveredList.
