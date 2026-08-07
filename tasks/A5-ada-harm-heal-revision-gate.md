---
id: A5
title: "Ada server: harm.heal + harm.healing-clock ops; revision-gate leak on failed ops"
deps: [A2]
track: ada
outputs:
  - backend-ada/server: implement harm.heal and harm.healing-clock per contract/openapi.yaml (healing clock fill heals per §5.1 semantics — clock full → clear one harm per fill, rollover, downshift)
  - backend-ada/server: fix Revision_Gate leak — a claimed revision must be released (or claimed only after success) when Mutate returns ok:false or the op is unknown
  - conformance additions covering both (via a sanctioned contract-task session)
acceptance:
  - "live probe: harm.healing-clock segments fill to size heals per contract; harm.heal works; revision advances only on success"
  - "live probe: a failed op (e.g. armor.set ARMOR_NOT_AVAILABLE, or unknown op) leaves the entity usable — the SAME If-Match that just failed domain-side succeeds on a subsequent valid op"
  - "full conformance suite green; gnatprove gate stays green"
---

Found 2026-08-07 during F2n live acceptance probing (orchestrator):

1. `harm.heal` and `harm.healing-clock` are absent from Mutate in
   server/src/pitd_callback.adb → 200 with ok:false VALIDATION "unknown
   operation". The contract (and the now-complete F2n frontend) requires both.
2. **Severe:** pitd_callback.adb line ~491 claims the revision via
   `Revision_Gate.Claim` BEFORE Mutate runs and never releases it on failure.
   Any failed op with If-Match (unknown op, ARMOR_NOT_AVAILABLE, ...)
   permanently wedges the entity: the string check (line 490) demands rev N
   while the gate demands N+1, so no If-Match value can ever succeed again.
   Repro: create char → armor.set used:true with no armor (fails correctly) →
   any subsequent op at the correct revision → 409 STALE_REVISION forever.
3. (Noted, not in scope: harm slot caps 2/2/1/1 and clock size are hardcoded
   in Mutate; spec §5 wants maxima from game-settings. Track separately if the
   game files differ.)

E0-relevant: the conformance suite is green against behavior 2 — another
black-box blind spot caught only by live probing.

## Log
- 2026-08-07: task created from F2n probe findings.
- 2026-08-07: DONE. Implemented by deepseek-v4-flash-0731 (prime-agent child
  a5-ada-fixer2; first attempt died silently on investigation — redispatch with
  pre-digested findings succeeded). Orchestrator acceptance (all independent):
  alr build green; heal downshift verified line-for-line against core Heal
  (monitors.adb 104-119, proven Post); live probe port 9679: clock overflow →
  rollover 2, heal (severe→moderate→lesser shift, clock := rollover), GET/rev
  agree; CANNOT_HEAL, ARMOR_NOT_AVAILABLE, and unknown-op failures no longer
  wedge the entity (same If-Match succeeds after each) while stale If-Match
  still 409s. Full conformance vs Ada: 138/11 — red set unchanged (C3 pending
  server support only), zero regressions. Item 3 (hardcoded harm caps) remains
  open, noted for a future task.
