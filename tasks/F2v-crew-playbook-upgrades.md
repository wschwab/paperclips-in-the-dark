---
id: F2v
title: "Crew sheet: Playbook abilities + upgrades + lair chart"
deps: [F2c, F2y]
track: frontend
outputs:
  - client methods + red-green tests: crewAbilityTake, crewAbilityRemove, upgradeMark, upgradeUnmark
  - crew-detail.ts Playbook section per f2-sheet-plan.mdx (crew special abilities w/ take/remove; upgrades list w/ mark/unmark; the lair advancement chart is a rendering of playbook-specific Upgrades data — not a new domain concept)
  - page tests (happy-dom)
  - docs/pages/frontend/f2v-crew-playbook-upgrades.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "ability/upgrade menus + descriptions from crew data (data/games/*-crews.json via /api/games/{stem}/crews/{crewType}), no hardcoded lists"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): crew ability.take/remove, upgrade.mark/unmark (boxesMarked, re-add), revision advance"
  - "docs page present and accurate"
---

Per f2-sheet-plan.mdx: Crew Playbook→crewAbilityTake/crewAbilityRemove,
upgradeMark/upgradeUnmark (training, mastery, quality items, and the lair
advancement chart are all views over the same playbook-specific `Upgrades`
data). Contract bodies: ability.take {name}; ability.remove {name};
upgrade.mark {name}; upgrade.unmark {name}. Crew DTO: specialAbilities
[{name,timesTaken}], upgrades [{name,boxesMarked}].

## Log
- 2026-08-07: filed + dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE (frontend). deepseek-v4-flash-0731 child (f2v-crew-playbook).
  Orchestrator verification: 340/340 tests + build green by rerun (313→340 =
  +17 client +10 page, counts match); docs page 140 lines; probe port 9731 —
  ability take/maxed/remove + upgrade mark/unmark all correct; child flagged and
  verified: GET /api/games/{stem}/crews/{crewType} is 404 on the Ada server
  (contract-defined; conformance accepts [200,404] so green) — the page uses
  getCrewType preferred + getCrewTypes find-by-name fallback via Effect.either.
  Lair chart renders from the same Upgrades data per plan decision.
