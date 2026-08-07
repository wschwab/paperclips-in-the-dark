---
id: A11
title: "Ada server: remaining missing ops — cohorts, crew coin/stash/tier/XP, rolodex.remove"
deps: [A2]
track: ada
outputs:
  - backend-ada/server: implement cohort.add/remove/update, coin.add (crew), stash.add (crew), tier.add, xp.add/xp.clear (crew), rolodex.remove
  - conformance: red-green semantics tests for the missing ops
acceptance:
  - "live probe: each op round-trips per contract (cohort create/update/remove incl. harm; crew coin/stash/tier/xp deltas; rolodex.remove); revision advance"
  - "full conformance suite green; gnatprove gate stays green"
---

Found 2026-08-07 during F2u live acceptance probing — an op-inventory diff of
Mutate vs contract/openapi.yaml. Missing from the Ada Mutate:
- crew: cohort.add, cohort.remove, cohort.update (F2w scope), coin.add,
  stash.add, tier.add (F2u scope), xp.add, xp.clear (F2x scope)
- character: rolodex.remove (character Contacts/rolodex — F2q never shipped a
  UI for it, but the contract op is missing server-side)
All return 200 ok:false VALIDATION "unknown operation" today; conformance's
shape-only endpoint tests stay green against that. SEVENTH instance of the
shape-vs-semantics gap (A4/A5/A7/A8/A9/A10/A11) — E0-relevant.
Semantics sources: C# reference where it exists (blades-in-the-sheets/Models/
Characters/ — Cohort, FundStash, Crew Xp), the frozen contract descriptions in
openapi.yaml, and the existing dense Mutate idioms. Contract bodies:
- cohort.add {cohortKind (cohortType $ref: gang|expert? read common.json),
  gangType?, expertType?, quality?, scale?, hasArmor?, edges?, flaws?,
  description?} → returns crew with cohorts + new cohort id
- cohort.remove {cohortId}; cohort.update {cohortId, gangType?, expertType?,
  quality?, scale?, hasArmor?, edges?, flaws?, harm?, description?}
- coin.add {delta} / stash.add {delta} / tier.add {delta} / xp.add {delta}
  (crew, clamp to DTO max like heat.add); xp.clear (no body)
- rolodex.remove {entry} (character; NOT_FOUND for unknown, mirror contact.remove)
The F2u frontend (client methods crewTierAdd/crewCoinAdd/crewStashAdd + page
tests + docs) is accepted; its live tier/coin/stash paths defer to this task.

## Log
- 2026-08-07: filed from F2u probe findings + op-inventory diff.
- 2026-08-08: DONE. Dispatch 1 (implement + write tests) went silent ~14h with
  zero edits; orchestrator wrote missing-ops.test.ts (red 4-fail verified),
  redispatched server-only (a11-missing-ops2) → complete. Orchestrator
  verification: build green; branch review (cohort add/remove/update with
  New_Id + harm default; crew-scoped coin/stash/tier with floor 0; xp clamp;
  rolodex.remove NOT_FOUND); own probe port 9739 — all ops incl. crew-only
  VALIDATION on character, NOT_FOUND paths; conformance 164/164.
