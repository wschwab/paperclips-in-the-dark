---
id: F2x
title: "Crew sheet: Crew XP"
deps: [F2c, F2y]
track: frontend
outputs:
  - client methods + red-green tests: crewXpAdd, crewXpClear
  - crew-detail.ts XP section per f2-sheet-plan.mdx (crew XP tracker w/ criteria text from ExperienceTrigger in crew data, add/clear)
  - page tests (happy-dom)
  - docs/pages/frontend/f2x-crew-xp.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "criteria text from crew game data ExperienceTrigger; no hardcoded text"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): crew xp.add/clear, revision advance"
  - "docs page present and accurate"
---

Per f2-sheet-plan.mdx: Crew XP→crewXpAdd/crewXpClear (criteria text from
`ExperienceTrigger`). Contract bodies: xp.add {delta}; xp.clear (no body).
Crew DTO: experience {points, max}.

## Log
- 2026-08-07: filed + dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE (frontend). deepseek-v4-flash-0731 child (f2x-crew-xp).
  Orchestrator verification: 366/366 tests + build green by rerun (355→366 =
  +6 client +5 page, counts match); docs page 98 lines; criteria text from game
  data (extractExperienceTrigger w/ graceful degradation); probe port 9735 —
  xp ops still VALIDATION unknown operation on current binary (A11 in flight).
  Child also fixed a pre-existing missing }); that had nested F2w inside F2v
  describes. Live xp paths defer to A11.
