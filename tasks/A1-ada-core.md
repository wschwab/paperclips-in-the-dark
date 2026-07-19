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
- 2026-07-19: dispatched to GPT 5.6 Luna (codex, xhigh) after A0 acceptance. Prompt: tasks/dispatch/A1-prompt.md. Gold-contract honesty check: orchestrator reads .ads Post conditions at acceptance.
- 2026-07-19: DONE. Orchestrator acceptance: ci.sh green (build + tests + 225/225 proofs, checks-as-errors). Gold contracts verified non-vacuous by reading .ads (Add_Harm ladder Post et al). No weakened contracts; one contract BUG caught by gnatprove (Progress_Healing) — logged as thesis evidence. Metrics: tasks/metrics/ada/A1.json.
