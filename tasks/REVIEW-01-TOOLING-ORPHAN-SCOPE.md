---
id: REVIEW-01-TOOLING-ORPHAN-SCOPE
title: Scope managed launcher orphan assertions to owned server PIDs
deps:
  - REVIEW-01
  - SAFE-02
track: contract
outputs:
  - conformance/src/managed-browser-smoke.test.ts
  - conformance/src/managed-run.test.ts
  - conformance/src/managed-orphan-regression.ts
  - tasks/metrics/contract/REVIEW-01-TOOLING-ORPHAN-SCOPE.json
  - agent-docs/test-audit/inventory.json
  - agent-docs/test-audit/finding-traceability.md
  - agent-docs/test-audit/reconcile-audit.js
  - agent-docs/test-audit/reconcile-audit-summary.json
  - agent-docs/test-audit/p0p1-sampling-manifest.json
  - docs/pages/frontend/operational-behavior.mdx
acceptance:
  - TOOLING-BROWSER-019 and TOOLING-MANAGED-027 fail under the original host-wide pgrep assertions
  - each actual orphan assertion rejects a live launcher-owned server and accepts its stopped PID while an unrelated argv match stays alive
  - cd conformance && npm run test:tooling -- src/managed-browser-smoke.test.ts src/managed-run.test.ts
  - cd conformance && npm run test:tooling
  - node agent-docs/test-audit/validate-metrics.js tasks/metrics
  - node agent-docs/test-audit/validate-finding-traceability.js
  - node agent-docs/test-audit/reconcile-audit.js agent-docs/test-audit/inventory.json conformance/fixtures/mutation-catalog.json agent-docs/test-audit/mutation-results.json agent-docs/test-audit/complete-audit.json
---

# REVIEW-01-TOOLING-ORPHAN-SCOPE — exact-owned orphan assertions

**Status:** implementation and tooling acceptance passed; traceability and inventory validation passed. Global metrics validation is blocked by eight errors in the two separately owned clock-correction metrics; this card's metric passes. Independent review remains pending and was not started.

**Source:** independent blind review finding 3 against corrected candidate `48b19881405fb59d351d2d45037151ca636eca2b`. This descriptive corrective card follows the parent-linked REVIEW-01 precedent; it does not allocate an AR/FV finding number. User explicitly included the sibling managed-run assertion.

## Ownership and scope

Both launchers already announce each spawned server's `pid` before readiness, including startup retries and managed-run restart cycles. Their test assertions now consume that run's complete stdout and check every announced PID, rejecting absent or invalid ownership evidence rather than accepting an empty process set. They do not search host-wide argv. Product launchers and their process-management behavior are unchanged.

The permanent shared regression calls each suite's actual assertion while its launcher-owned server remains live (the leak-detector positive control), then after exact launcher cleanup while a separately spawned `pitd-managed-review01-unrelated` process remains alive. A no-op assertion or a helper that merely ignores all matches fails the positive control. Temporary fake servers never touch user data. Cleanup uses the retained ChildProcess instances and awaits their exits; no broad process kill is used.

The EPIPE case captures the complete server PID announcement before closing stdout, then checks only that PID and its announced run directory. The interrupted-build case has no server yet: it retains the recorded build-PID cleanup check and verifies no server PID was announced. No unrelated tests were rewritten.

## Log

- 2026-09-24: read PAPERCLIPS.md, root AGENTS.md, task conventions, launcher spawn/readiness metadata and both test helpers. Confirmed ownership is available safely; no product metadata change needed.
- 2026-09-24: added TOOLING-BROWSER-019 and TOOLING-MANAGED-027 before changing the pgrep assertions. Preliminary red (`artifact://10360`) exposed a truncated assertion-message issue in the managed-run positive control; reordered fixture startup, retaining the original assertion logic, and reran the definitive paired red.
- 2026-09-24: definitive red command `npm run test:tooling -- src/managed-browser-smoke.test.ts src/managed-run.test.ts -t 'TOOLING-BROWSER-019|TOOLING-MANAGED-027'` failed **2/2** (`artifact://10362`). Browser received unrelated PID `1695630` instead of empty output; managed-run received `1695689 /usr/bin/node -e setInterval(() => {}, 1000) pitd-managed-review01-unrelated`. Both owned servers had already stopped. Exact-owned fixture cleanup completed in finally.
- 2026-09-24: replaced both global assertions with exact PID checks and migrated callers. Initial focused green passed 4 cases (`artifact://10364`). First full tooling run exposed three missed interrupt/build callsites (`artifact://10366`); corrected them, without suppressing their owned process checks.
- 2026-09-24: final focused command `npm run test:tooling -- src/managed-browser-smoke.test.ts src/managed-run.test.ts` passed **46/46 tests, 2/2 files**, 46.34 s (`artifact://10368`). Final full `npm run test:tooling` passed **220/220 tests, 14/14 files**, 64.53 s (`artifact://10371`). Existing fixture-driven guard violation diagnostics are expected negative cases, not user-data modifications.
- 2026-09-24: external-process smoke kept separately owned PID `2736690` with matching argv alive across existing TOOLING-BROWSER-018 and TOOLING-MANAGED-004: **2 passed, 44 skipped**. Confirmed the unrelated process remained alive after both assertions, then terminated and awaited only that exact ChildProcess.
- 2026-09-24: registered two inventory keep rows (1624 current, 136 stale preserved; 220 tooling rows). Updated reconciliation's documented counts and generated manifest to include the two new pending-review rows without claiming historical review covers them. Traceability validator: **231/231 checks passed**. Reconcile validator: **17/17 checks passed**, 0 errors, 0 warnings; 101 new non-P0/P1 rows (2 pending, 99 reviewed), 195 P0/P1 rows unchanged.
- 2026-09-24: global metrics validator inspected **153 files**. After correcting this card's scaffolding methodology field, **8 errors remain exclusively in `tasks/metrics/ada/REVIEW-01-CLOCK-CREATE-{JSON,REPLAY}.json`**: each has null wallClockMinutes, missing scaffoldingLocNote, missing method, missing source. Reported to the parent; clock-owned files deliberately untouched per user instruction. This is an external documentation blocker, not a tooling failure.
- 2026-09-24: no frontend verification needed (no UI changes); no additional review, commit, push, bookmark movement, or unrelated correction performed.
