---
id: REVIEW-01-B1
title: Fix happy-dom MutationObserver GC flake (test runtime dependency)
deps:
  - REVIEW-01
track: contract
outputs:
  - frontend/package.json
  - frontend/package-lock.json
  - agent-docs/test-audit/inventory.json
  - agent-docs/test-audit/flake-raw-frontend-happydom-2026-09-09.txt
  - agent-docs/test-audit/runtime-flake-frontend-happydom.json
acceptance:
  - exact forced-GC probe FAILs before, PASSes after
  - roster file 5/5 green, full frontend 3/3 green (794/794)
  - no product/test-source change, no WeakRef monkeypatch
---

# REVIEW-01-B1 — happy-dom observer GC flake

**Status:** complete (2026-09-09)

## Log

- Root cause: happy-dom 20.11.0 `MutationObserverListener` keeps its
  forwarding closure only through `new WeakRef(...)` with no strong
  referent; GC drops the callback while observer and target live. Roster
  needs-input transitions (roster-recovery.ts:75-83) intermittently never
  fire. Test-runtime defect, not a product defect.
- Smallest upstream fix: 20.11.2 retains the closure as `#listenerCallback`
  (WeakRef wraps the retained field). Probe-verified: 20.11.1 FAIL,
  20.11.2 PASS. No upstream patch-package path needed.
- Fix: `frontend/package.json` happy-dom `^20.11.0` → `^20.11.2` (caret
  convention; floor = first fixed release). Lockfile resolves to 20.12.2,
  whose installed source carries the identical retention fix (verified by
  probe on the installed tree).
- Evidence: probe before FAIL (1 vs 2) / after PASS (2 vs 2); roster file
  5× 43/43; full frontend 3× 794/794 across 20 files.
- Inventory: 12 `roster.test.ts` rows mislabeled `real-server` → `mock`
  (file is `@vitest-environment happy-dom` + mocked `global.fetch`; 31
  sibling rows already `mock`). Counts and all other claims untouched.
- Raw log: `agent-docs/test-audit/flake-raw-frontend-happydom-2026-09-09.txt`;
  structured record: `agent-docs/test-audit/runtime-flake-frontend-happydom.json`.
- Untouched per work split: B2 files (gate-evidence.mdx, final-verdict.md,
  tasks/REVIEW-01.md, metrics REVIEW-01.json) owned by muse-sol-provenance;
  B3 managed-root residue; VET-01.json; `.omo`; campaign data; budgets.

## Protocol

- Changes: package.json floor bump, lockfile 20.11.0 → 20.12.2, 12-row
  inventory environment correction, three new evidence/task files above.
- Outputs: probe FAIL→PASS; roster 5/5; full 3/3 at 794/794.
- Contradictions: only the inventory `real-server` label vs the test source;
  corrected. No other instruction/codebase contradiction met in this slice.
- Guesses: none load-bearing (fix read from installed upstream source +
  demonstrated by probe).
- Missing inputs: none; Luna/VET gates separately scheduled, not claimed.
