---
id: F2w
title: "Crew sheet: Cohorts"
deps: [F2c, F2y]
track: frontend
outputs:
  - client methods + red-green tests: cohortAdd, cohortRemove, cohortUpdate
  - crew-detail.ts Cohorts section per f2-sheet-plan.mdx (cohort cards: kind, quality/scale, armor, edges/flaws, harm; add w/ kind select from game data, remove, edit fields incl. harm; vehicles are cohorts w/ edges/flaws text — decision 3)
  - page tests (happy-dom)
  - docs/pages/frontend/f2w-cohorts.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "cohort kinds from game data; no hardcoded lists or maxima"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): cohort add/update (incl. harm)/remove, revision advance"
  - "docs page present and accurate"
---

Per f2-sheet-plan.mdx: Cohorts→cohortAdd/cohortRemove/cohortUpdate. Contract
bodies: cohort.add {cohortKind (cohortType $ref), gangType?, expertType?,
quality?, scale?, hasArmor?, edges?, flaws?, description?}; cohort.remove
{cohortId}; cohort.update {cohortId, ...editable fields incl. harm}.
Crew DTO: cohorts [{id, cohortKind, gangType, expertType, quality, scale,
hasArmor, edges, flaws, harm, description}].

## Log
- 2026-08-07: filed + dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE (frontend). deepseek-v4-flash-0731 child (f2w-cohorts).
  Orchestrator verification: 355/355 tests + build green by rerun (340→355 =
  +9 client +6 page, counts match); docs page 129 lines; probe port 9733 —
  cohort ops still VALIDATION unknown operation on the current server binary
  (A11 in flight); UI is contract-correct and its live paths defer to A11.
