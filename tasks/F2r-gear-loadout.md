---
id: F2r
title: "Character sheet: Gear / loadout section"
deps: [F2m]
track: frontend
outputs:
  - client methods + red-green tests: gearAdd, gearRemove, gearCommit, gearUncommit, gearLock, gearUnlock, gearSetCommitment, gearClearCommitments
  - character-detail.ts Gear section per f2-sheet-plan.mdx (loadout selector = commitment; item menu from playbook Items + SharedItems; bulk handling; commitment lock)
  - page tests (happy-dom)
  - docs/pages/frontend/f2r-gear-loadout.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "item menus from game data (playbook Items + SharedItems); load headroom derived display, no hardcoded maxima"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): gear add/remove, commit/uncommit, lock gating set-commitment, clear-commitments, revision advance"
  - "docs page present and accurate"
---

Per f2-sheet-plan.mdx: Gear→gearAdd/gearRemove/gearCommit/gearUncommit/
gearLock/gearUnlock/gearSetCommitment/gearClearCommitments (loadout selector =
commitment; item menu from playbook `Items` + `SharedItems`; playbook extras
are gear items — decision 2). Contract bodies: gear.add {name, bulk};
gear.remove (no body); gear.commit (no body); gear.uncommit (no body);
gear.lock (no body); gear.unlock (no body); gear.set-commitment {commitment};
gear.clear-commitments (no body). Character DTO: gear {loadout,
availableGear, commitment, isCommitmentLocked, maxBulk}.

## Log
- 2026-08-07: filed + dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE (frontend). deepseek-v4-flash-0731 child (f2r-gear2; first
  attempt died to a reboot with zero edits). Orchestrator verification:
  234/234 tests + build green by rerun (195→234 = +30 client +9 page, counts
  match); docs page 129 lines; child corrected the orchestrator's brief —
  gear.remove/commit/uncommit take Named {name} bodies (verified in openapi);
  probe port 9707: ONLY gear.lock/unlock/set-commitment exist server-side; the
  other five return VALIDATION unknown operation — filed tasks/A9-ada-gear-ops.md.
  Live gear paths deferred to A9. (C# reference: add→availableGear, commit→
  loadout w/ preconditions, clear→loadout+commitment reset.)
