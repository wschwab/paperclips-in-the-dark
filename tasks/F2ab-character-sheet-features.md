---
id: F2ab
title: "Character sheet: playtest features — heritage/background dropdowns, vice in stress, trauma-on-full, heal picker, ability descriptions, notes, crew membership"
deps: [F2m, C4, A13]
track: frontend
outputs:
  - heritage dropdown from game data Heritages (description shown, custom allowed)
  - background dropdown from game data Backgrounds (example shown, custom allowed)
  - vice section merged into the Stress box: type, description, purveyor (menu from Vices[].Sources, description)
  - stress full → trauma picker prompt; picking a trauma clears stress
  - heal: pick which harm to remove (uses harm.heal targeting), clock consumed
  - taken playbook abilities display their description
  - notes section on the character sheet (multiple notes, identical to crew)
  - character ↔ crew membership: join a crew from the sheet/roster; create crew link
  - page tests + docs page
acceptance:
  - "npm test -- --run + npm run build green; live Ada probe for each op path"
---

## Log
- 2026-08-09: filed from playtest round 1 plan (#4, #5, #8, #9, #13, #16, #17, #18).
