---
id: SC-SAFE-02
title: Owned managed launcher and CI cutover
deps:
  - SC-SAFE-01
track: contract
outputs:
  - backend-ada/ci.sh
  - conformance/package.json
  - conformance/scripts/managed-run.mjs
  - conformance/scripts/workflow-isolation-guard.mjs
  - conformance/src/managed-run.test.ts
  - conformance/src/workflow-isolation-guard.test.ts
acceptance:
  - npx vitest run --config vitest.tooling.config.ts src/workflow-isolation-guard.test.ts src/managed-run.test.ts
  - npm run typecheck
  - npm run test:ada -- --run --passWithNoTests suites/__sc_o0_never__.test.ts
---

# SAFE-02 — owned managed launcher and CI cutover

**Wave 0.** Findings AR-003 and UX-013.
**Status:** complete
**Revision:** rzrqnlpu (working copy; finalized before next card)
**Governing:** `agent-docs/AUDIT-0-remediation-implementation-work-spec.md` §8 SAFE-02.

## Log

- 2026-08-23: confirmed red for wrong implementation/data directory readiness, failure cleanup, and canonical-boundary recognition.
- 2026-08-23: cut `backend-ada/ci.sh` over from fixed port 9657 and `/tmp/pitd-campaign-data` process management to the canonical guarded npm launcher.
- 2026-08-23: launcher readiness now requires the exact child to remain alive plus Ada health JSON naming the exact resolved owned data directory; owned children/process groups and run directories are removed on success, assertion failure, startup failure, timeout, SIGINT, SIGTERM, SIGHUP, and fatal errors.
- 2026-08-23: tooling added wrong-health, fixed-port listener, collision, timeout, SIGTERM, and exact cleanup coverage. Final focused acceptance passed 32/32 tests and typecheck.
- 2026-08-23: composed npm smoke passed through the campaign-data guard and isolation guard on owned port 46091, used `/tmp/pitd-managed/.../data`, and removed its run directory.
- 2026-08-23: independent Luna safety review first found arbitrary direct `--data` commands bypassed ownership. Red regressions proved the bypass; the guard now accepts only the exact canonical managed launcher in automated mode. Repeated review returned PASS.
