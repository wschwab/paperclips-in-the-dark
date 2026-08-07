---
id: A6
title: "Ada server support for crew contacts & factions ops (+ FactionStatus game-settings)"
deps: [A2, C3]
track: ada
outputs:
  - backend-ada/server: implement contact.add, contact.remove, faction.set-status, faction.remove in Mutate for crews, per contract/openapi.yaml
  - data/games/*.json: add the FactionStatus {Min, Max} game-settings key per the C3 convention (conformance/src/game-data.ts reads it)
  - conformance: the 11 C3-red tests go green (SEMANTICS-CREW-CONTACTS-001..004, SEMANTICS-CREW-FACTIONS-001..006, PERSISTENCE-REVISION-004)
acceptance:
  - "live probe: contact add/remove + faction add/set-status/remove on a crew, revision advance, stale If-Match rejected"
  - "conformance suite vs Ada server: 0 failures (all 149 incl. the 11 formerly-red C3 tests)"
  - "full backend-ada ci.sh green (build + core tests + gnatprove gate)"
---

C3 landed the contract + conformance (2026-08-07); the new ops are red-by-design
until server support exists. Design notes from C3's docs page
(docs/pages/contract/c3-crew-contacts-factions.mdx):
- contacts: {name, profession?}; add/remove by exact name (DUPLICATE on re-add,
  NOT_FOUND on unknown remove — mirror rolodex ergonomics where sensible).
- factions: {name, status}; faction.add? — check the yaml for exact op set
  (operationIds crewContactAdd/crewContactRemove/factionSetStatus/factionRemove).
  set-status clamps status to the game-settings FactionStatus {Min,Max} range
  (server-clamped; the applied.effective reports the effective value) and
  upserts by name. remove by name -> NOT_FOUND for unknown.
- game-settings files (data/games/) need the FactionStatus key for the clamp
  range; conformance helper factionStatusRange(stem) throws if absent.
- Crew ops must work on crews (Kind="crew"), not characters — crew entity shape
  is in New_Crew (pitd_callback.adb ~line 345), which currently has NO
  contacts/factions fields: add them to the default crew JSON as empty arrays.

## Log
- 2026-08-07: filed after C3 acceptance + A5 landing; dispatched to
  deepseek-v4-flash-0731.
- 2026-08-07: DONE. Implemented by deepseek-v4-flash-0731 (prime-agent child
  a6-ada-contacts-factions) with pre-digested spec (10 red tests as the spec).
  Orchestrator acceptance (all independent): alr build green; diff review
  (clamp reads Game()/Int_Field FactionStatus from data — no hardcoded range);
  own live probe port 9687: DUPLICATE, NOT_FOUND x2, clamp hi/lo with
  applied.requested/effective, upsert keeps 1 entry, stale If-Match 409; all
  four game files parse with FactionStatus {-3,3} (French BOM + comment
  preserved); schema definition + required present; full conformance vs Ada:
  149/149 green (all 11 C3-red tests now green, zero regressions).
  Follow-up: crew-sheet Contacts & Factions UI slice (per C3 docs page).
