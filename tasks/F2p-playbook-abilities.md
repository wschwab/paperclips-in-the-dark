---
id: F2p
title: "Character sheet: Playbook abilities + playbook XP"
deps: [F2m]
track: frontend
outputs:
  - client methods + red-green tests: playbookXpAdd, playbookXpClear, abilityTake, abilityRemove
  - character-detail.ts Playbook section per f2-sheet-plan.mdx (ability list w/ timesTaken + descriptions from playbook SpecialAbilities, take/remove, playbook XP tracker)
  - page tests (happy-dom)
  - docs/pages/frontend/f2p-playbook-abilities.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "ability menu + descriptions from playbook SpecialAbilities (game data), no hardcoded lists"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): ability.take/remove incl. timesTaken increments, playbook-xp add/clear, revision advance"
  - "docs page present and accurate"
---

Per f2-sheet-plan.mdx: Playbook→playbookXpAdd/playbookXpClear, abilityTake/
abilityRemove (menu + descriptions from playbook `SpecialAbilities`; timesTaken
semantics server-side). Contract bodies: playbook-xp.add {delta};
playbook-xp.clear (no body); ability.take {name}; ability.remove {name}.
Character DTO: playbook {name, experience {points,max}, abilities
[{name,description,timesTaken}]}.

## Log
- 2026-08-07: filed + dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE (frontend). deepseek-v4-flash-0731 child. Orchestrator
  verification: 195/195 tests + build green by rerun (144→195 = +15 client +6
  page, counts match); docs page 95 lines; probe port 9699 — playbook-xp
  add/clear work, ability.take works, BUT ability.remove → VALIDATION "unknown
  operation" and take-limit not enforced (takeable-once taken twice, timesTaken
  1→2). Filed tasks/A8-ada-ability-remove-maxed.md; live remove/maxed paths
  deferred to A8.
