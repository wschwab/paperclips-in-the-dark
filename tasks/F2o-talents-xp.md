---
id: F2o
title: "Character sheet: Talents + XP + Score XP section"
deps: [F2m]
track: frontend
outputs:
  - client methods + red-green tests: actionSetRating, attributeXpAdd, attributeXpClear, attributeLevelup, sessionSet
  - character-detail.ts Talents section per f2-sheet-plan.mdx (attribute groups w/ action dot-rows, attribute XP trackers w/ levelup, score-XP session tracks)
  - page tests (happy-dom)
  - docs/pages/frontend/f2o-talents-xp.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "action dot rows + XP trackers reuse styleguide idioms; menus/descriptions from game data (Attributes + playbook ExperienceCondition), no hardcoded lists or maxima"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): action.set-rating clamp to maxRating, attribute-xp add/clear, levelup spend, session.set, revision advance"
  - "docs page present and accurate"
---

Per docs/pages/frontend/f2-sheet-plan.mdx:
- Talents→actionSetRating (clickable dots set value; +/− buttons too),
  attributeXpAdd/attributeXpClear, attributeLevelup (spends XP, raises one action).
- Score XP→sessionSet: three expression tracks (playbook/character/struggle),
  playbook-specific text from playbook ExperienceCondition; desperate-action XP
  lands on attribute XP trackers (display-only note).
Contract bodies (frozen openapi.yaml):
- action.set-rating {action, rating} — server clamps rating to action maxRating
- attribute-xp.add {attribute, delta}; attribute-xp.clear {attribute}
- attribute.levelup {attribute, action}
- session.set {playbookExpressions?, characterExpressions?, struggleExpressions?} (minProperties 1)
Character DTO: talent.attributes[].actions[] {name,rating,maxRating},
talent.attributes[].experience {points,max}, session {playbookExpressions,
characterExpressions, struggleExpressions, max}.

## Log
- 2026-08-07: filed + dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE (frontend). deepseek-v4-flash-0731 child. Orchestrator
  verification: 174/174 tests + build green by rerun; probe port 9693 —
  set-rating clamp 99->4, attr-xp add/clear, levelup (clamped at maxRating);
  docs page 133 lines; components reused (actionDots/stressTrack). CHILD FLAGGED
  and probe CONFIRMED: session.set is missing from the Ada Mutate handler
  (ok:false VALIDATION unknown operation) — conformance only checks op shape,
  so it was green anyway. Filed tasks/A7-ada-session-set.md; Score-XP live
  acceptance deferred to A7.
