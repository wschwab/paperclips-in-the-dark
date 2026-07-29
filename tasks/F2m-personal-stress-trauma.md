---
id: F2m
title: "Character sheet: Personal, Stress, Trauma, Vice sections"
deps: [F2l]
track: frontend
outputs:
  - client methods + red-green tests for dossierUpdate, stressClear, traumaAdd, traumaRemove (stressAdd exists)
  - character-detail.ts Personal section (name/alias/background/heritage/look, editable via dossierUpdate), Stress section (clickable stress track + +/− buttons, trauma list, add-trauma menu from game data, vice display, Indulge Vice button = stressClear), per f2-sheet-plan.mdx idioms
  - page tests (happy-dom) for the new controls
  - docs/pages/frontend/f2m-personal-stress-trauma.mdx
acceptance:
  - "client tests red-first then green for each new method; verified by grep"
  - "trauma menu populated from game-settings JSON (no hardcoded trauma list anywhere in the diff)"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): dossier update round-trip, stress track set/clear, trauma add from menu + remove, all with revision advance"
  - "docs page present and accurate"
---

Per docs/pages/frontend/f2-sheet-plan.mdx (§UI idioms, §mapping). Contract
ops are frozen and normative. Trackers: clickable boxes + +/− buttons, both
driving the same ops. Menus from game data only.

## Log
- 2026-07-29: dispatched to DeepSeek v4 Pro (pi, opencode-go). Prompt:
  tasks/dispatch/F2m-prompt.md.
