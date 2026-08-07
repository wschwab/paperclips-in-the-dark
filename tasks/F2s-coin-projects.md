---
id: F2s
title: "Character sheet: Coin + Projects (clocks)"
deps: [F2m]
track: frontend
outputs:
  - client methods + red-green tests: fundGain, fundSpend, fundLiquidate, stashAdd, createClock, clockProgress, clockReset, deleteClock
  - character-detail.ts Coin + Projects sections per f2-sheet-plan.mdx (satchel/stash coin display + gain/spend/liquidate; project clocks list w/ create (name/kind/size), progress, reset, delete)
  - page tests (happy-dom)
  - docs/pages/frontend/f2s-coin-projects.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "clock sizes/names from user input + game data where available; no hardcoded maxima; derived lifestyle = stash÷10 display-only"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): fund gain/spend/liquidate clamp, stash.add, clock create/progress/reset/delete, revision advance"
  - "docs page present and accurate"
---

Per f2-sheet-plan.mdx: Coin→fundGain/fundSpend/stashAdd/fundLiquidate;
Projects→createClock/clockProgress/clockReset/deleteClock. Contract bodies:
fund.gain {coins}; fund.spend {coins}; fund.liquidate {coins, minimum 1};
stash.add {delta}; clock create POST /clocks {name, clockKind (project|
rollover), size minimum 1}; clock.progress {segments}; clock.reset (no body);
clock delete POST /clocks/{id}/delete. Derived: Lifestyle = stash ÷ 10
(display-only). Clock DTO: {kind, id, revision, name, clockKind, segments,
size, rollover, createdAt, updatedAt, formatVersion}.

## Log
- 2026-08-07: filed + dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE (frontend). deepseek-v4-flash-0731 child (f2s-coin-projects).
  Orchestrator verification: 278/278 tests + build green by rerun (after fix;
  child reported 283 — five tests removed by orchestrator); docs page 163
  lines; probe port 9715/9717 — fund.gain/spend + clocks (create/progress/
  reset/delete) work; fund.liquidate + stash.add are VALIDATION unknown
  operation server-side. ORCHESTRATOR FIX: the F2s brief wrongly asked for a
  character stashAdd (contract has stash.add only for crews) — removed the
  client method, its 4 tests, page handler + UI + 1 page test (278 green).
  Filed tasks/A10-ada-fund-liquidate.md for the server gaps (spend stash-
  liquidation at 2:1 + fund.liquidate op); live fund paths deferred to A10.
