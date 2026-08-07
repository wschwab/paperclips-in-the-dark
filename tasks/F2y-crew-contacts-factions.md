---
id: F2y
title: "Crew sheet: Contacts & Factions section (C3 follow-up UI slice)"
deps: [F2c, C3, A6]
track: frontend
outputs:
  - client methods + red-green tests for crewContactAdd, crewContactRemove, factionSetStatus, factionRemove
  - crew-detail.ts Contacts & Factions section (contacts list w/ profession + add/remove; factions list w/ status + set/remove), mirroring the character-detail mutation-runner pattern
  - page tests (happy-dom, F2l)
  - docs/pages/frontend/f2y-crew-contacts-factions.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "crew schema decodes contacts/factions (optional for backward compat); no hardcoded status range in the frontend (server clamps per game-settings)"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): add/remove contact, set faction status incl. clamp, revision advance throughout"
  - "docs page present and accurate"
---

C3 (contract) + A6 (Ada server support) landed 2026-08-07; conformance 149/149.
This closes the loop per the C3 docs page's follow-up list. Op semantics (from
the C3 conformance tests — authoritative):
- contact.add {name, profession} → append; duplicate name → DUPLICATE
- contact.remove {name} → drop by exact name; unknown → NOT_FOUND
- faction.set-status {name, status} → upsert by name; server clamps status to
  game-settings FactionStatus {Min,Max} and reports applied.requested/effective
- faction.remove {name} → NOT_FOUND for unknown
The Ada server now always emits contacts/factions arrays in the crew DTO, but
decode must tolerate absence (older snapshots/backends).

## Log
- 2026-08-07: filed after A6 acceptance; dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE. Implemented by deepseek-v4-flash-0731 (prime-agent child
  f2y-crew-contacts). Orchestrator verification (all independent): npm test
  144/144 + build green by rerun; diff review (crew schema optional fields,
  Faction.status no min/max — no hardcoded range in frontend; FactionSetStatusResult
  carries requested/effective; crewMutate mirrors characterMutate with
  STALE_REVISION handling); 12 client tests (3 per method) + 9 F2y page tests +
  schema decode tests present; docs page 135 lines with lineage + clamp note;
  live probe port 9691: contact add/remove, faction set-status clamp 99->3 with
  applied.requested/effective, faction remove, NOT_FOUND, revision 1->5.
  Report fully accurate.
