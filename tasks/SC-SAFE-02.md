---
id: SC-SAFE-02
title: Owned managed launcher and CI cutover
deps:
  - SC-SAFE-01
track: contract
outputs:
  - backend-ada/ci.sh
  - conformance/package.json
  - conformance/scripts/managed-browser-smoke.mjs
  - conformance/scripts/managed-run.mjs
  - conformance/scripts/workflow-isolation-guard.mjs
  - conformance/src/managed-browser-smoke.test.ts
  - conformance/src/managed-run.test.ts
  - conformance/src/workflow-isolation-guard.test.ts
  - vitest.tooling.config.ts
acceptance:
  - npx vitest run --config vitest.tooling.config.ts src/workflow-isolation-guard.test.ts src/managed-run.test.ts src/managed-browser-smoke.test.ts
  - npm run typecheck
  - npm run test:ada -- --run --passWithNoTests suites/__sc_o0_never__.test.ts
  - npm run test:browser
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
- 2026-08-31: corrected SAFE-02 to `managed-browser-smoke.mjs` — the browser-smoke launcher did not clean its exact owned run directory on child nonzero/failure, startup failure, readiness timeout, SIGINT, or SIGTERM. Aligned cleanup with `managed-run.mjs`: always removes the exact owned run dir in the finally block, registers `activeRunDirRef` before `isMain`, and removes it in both the fatal and signal handlers. Added 7 red-then-green tests (TOOLING-BROWSER-009 through 015) covering all exit paths. Preserved `pitd-browser` artifacts distinct from the launcher temp run dir. Full tooling suite 197/197 pass, typecheck pass, browser smoke pass.
