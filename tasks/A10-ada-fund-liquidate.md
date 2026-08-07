---
id: A10
title: "Ada server: fund.spend stash-liquidation + fund.liquidate op"
deps: [A2]
track: ada
outputs:
  - backend-ada/server: fund.spend falls back to stash liquidation at 2 stash → 1 coin when satchel is short (contract description); fund.liquidate op (stash → satchel at 2:1, SATCHEL_FULL / INSUFFICIENT_FUNDS); both report applied
  - conformance: SEMANTICS-FUND-003..006 (orchestrator-written, red-verified)
acceptance:
  - "live probe: spend 2 with empty satchel liquidates 4 stash; spend beyond affordable → INSUFFICIENT_FUNDS; liquidate 2 → satchel +2, stash −4; liquidate with full satchel → SATCHEL_FULL; revision advance"
  - "full conformance suite green; gnatprove gate stays green"
---

Found 2026-08-07 during F2s live acceptance probing. Two gaps in Mutate
(server/src/pitd_callback.adb line ~497, the fund.gain/fund.spend branch):
1. fund.spend only spends from the satchel. The contract description promises
   "Satchel first, then stash liquidation at 2 stash → 1 coin. Insufficient →
   INSUFFICIENT_FUNDS with maxAffordable detail." The C# Fund.Spend does
   exactly that (Fund.cs: Spend → Satchel.SpendAsMuchAsAffordable(coins) then
   Stash.Liquidate(remainder * 2)).
2. fund.liquidate has NO branch — returns VALIDATION unknown operation.
   Contract: "Stash → satchel at 2 stash per 1 coin. Satchel can't fit →
   SATCHEL_FULL; stash short → INSUFFICIENT_FUNDS." C# Fund.Liquidate:
   satchel full → false; !WillFit(coins) → false; !Stash.Liquidate(coins*2) →
   false; Satchel.Gain(coins).
SIXTH instance of the shape-vs-semantics gap (A4/A5/A7/A8/A9/A10) — E0-relevant.
Existing SEMANTICS-FUND-001/002 only cover gain overflow and satchel-first
spend, so the suite was green. The F2s frontend (client + page + docs) already
implements fundLiquidate + the INSUFFICIENT_FUNDS/SATCHEL_FULL notices; it is
accepted and its live liquidate/stash-liquidation paths defer to this task.

## Log
- 2026-08-07: filed from F2s probe findings. Conformance test
  fund-liquidate.test.ts written by orchestrator (red 4-fail verified).
- 2026-08-07: DONE. Child (a10-fund-fixer) implemented the ops then died silently
  before replying; orchestrator took over: fixed precondition order (SATCHEL_FULL
  before INSUFFICIENT_FUNDS per contract), repaired the branch structure after an
  edit broke the else-chain, rewrote two test setups (gain fills satchel first;
  INSUFFICIENT_FUNDS case must fit satchel room), verified 160/160 conformance.
