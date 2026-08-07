---
id: A12
title: "Ada server: gear commitment uses contract enum 'none' (was ''), breaking frontend decode"
deps: [A2]
track: ada
outputs:
  - backend-ada/server: New_Character emits commitment "none"; gear.commit NO_COMMITMENT treats "" and "none" as unset; gear.clear-commitments resets to "none"
  - conformance: SEMANTICS-COMMITMENT-001..004 (orchestrator-written, red-verified); schemas.ts commitment tightened to the enum
  - campaign-data migration: existing characters' commitment "" → "none"
acceptance:
  - "live probe: fresh character commitment is 'none'; clear-commitments resets to 'none'; commit works after set-commitment; NO_COMMITMENT on unset"
  - "full conformance suite green incl. tightened commitment schema"
  - "frontend character sheet decodes and renders (was 'Invalid character response: decode failed: gear.commitment')"
---

Found 2026-08-08 by the human in live play: every character sheet fails with
"Invalid character response: decode failed: gear.commitment" — the frontend
schema (contract-mirroring) expects commitment in
["none","light","normal","heavy","encumbered"] but the Ada New_Character emits
"". Conformance schemas.ts used Schema.String (lenient) so the suite was green
— EIGHTH shape-vs-semantics gap (A4/A5/A7/A8/A9/A10/A11/A12). The C# reference
uses LoadCommitmentOption.None; the contract froze "none" as the string.
Existing campaign-data characters have commitment "" (2 files) — migrate them.

## Log
- 2026-08-08: filed from the human's live report; conformance test red-verified
  (3 fail on current binary).
- 2026-08-08: DONE. deepseek-v4-flash-0731 child (a12-commitment). Orchestrator
  verification: 3 server changes confirmed in source; build green; own probe
  port 9747 (fresh 'none', NO_COMMITMENT on unset, clear → 'none'); conformance
  168/168 by rerun; campaign-data migrated (2 characters '' → 'none', local
  only — gitignored runtime state); end-to-end check: a live-created+mutated
  character decodes through the frontend's real schema decoder (was the exact
  reported failure). Child flagged + updated the stale SEMANTICS-GEAR-OPS-003
  assertion (had hardcoded '' per the old bug; docstring said 'to none') —
  correct call, verified.
