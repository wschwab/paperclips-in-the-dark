---
id: A1
title: "Ada SPARK domain core (paperclips-core)"
deps: [A0]
track: ada
outputs:
  - backend-ada/core/ SPARK library, no IO
acceptance:
  - "gnatprove --level=2 --checks-as-errors green on core/"
  - "AoRTE (silver) whole core; gold functional contracts on BoundedInteger, Monitor, Fund, ExperienceTracker"
  - "unit checks green for each entity"
---

Spec §5.1/§5.2. Order: BoundedInteger → Monitor → Fund/XP → Gear/Armor →
Character → Crew → Clocks. Pre/Post stated first (contracts are the red step),
then implementation. All maxima parameterized from game settings — never
hardcoded.

## Log
