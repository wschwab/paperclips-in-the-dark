---
id: F2ac
title: "Crew sheet: playtest features — reputation dropdown, rep/turf tracker, multi-notes, cohort dropdowns"
deps: [F2c, C4, A13]
track: frontend
outputs:
  - reputation dropdown from game data CrewTypes[].Reputations (the 8 values)
  - rep/turf tracker rework per SRD: rep fills left→right; turf measured right (max 6, grayed, unclickable); dev threshold 12−turf; turf add control (decrements threshold); develop action (weak→strong, or strong→pay newTier×8 coin to tier up, rep reset, hold→weak)
  - notes section: larger box + multiple notes
  - cohorts: gang type select only when gang (Adepts/Rooks/Rovers/Skulls/Thugs from game data); expert type select + custom when expert (Doctor/Investigator/Occultist/Assassin/Spy/Custom)
  - page tests + docs page
acceptance:
  - "npm test -- --run + npm run build green; live Ada probe for turf/note/develop paths"
---

## Log
- 2026-08-09: filed from playtest round 1 plan (#2, #19, #20, #21).
