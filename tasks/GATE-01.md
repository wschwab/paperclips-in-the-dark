---
id: GATE-01
title: Make npm run test:ada canonical and seeded
deps:
  - SAFE-02
track: contract
outputs:
  - conformance/package.json
  - conformance/scripts/managed-run.mjs
acceptance:
  - cd conformance && npm run test:ada passes all registered conformance tests from fresh owned data
  - tooling test proves seed omission would make fixture-dependent tests fail
---

# GATE-01 — make `npm run test:ada` canonical and seeded

**Wave 1.** Finding AR-004.
**Status:** DONE (per `tasks/metrics/contract/GATE-01.json`)
**Metrics:** `tasks/metrics/contract/GATE-01.json` (canonical record; wave-0 scorecard with the original narrative at `tasks/metrics/contract/SC-GATE-01.json`, numbers copied verbatim)

## Log

- 2026-08-23: red — 4/5 selected cases failed (`npm run test:ada` produced the known setup failure while `node scripts/managed-run.mjs --seed-defaults --` was green); forwarding already passed.
- 2026-08-23: `openai-codex/gpt-5.6-luna` workers (effort `none`) wired `test:ada` to the seeded managed invocation, parsed optional launcher flags before `--`, printed run metadata (revision, base URL, owned data directory, seed set, child PID, test command), and labeled setup failures as setup failures.
- 2026-08-23: green — managed tooling 26/26; typecheck pass; canonical Track A 55 files/422 tests; calibrated independent review PASS.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
