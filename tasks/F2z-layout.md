---
id: F2z
title: "Layout: page padding + horizontal trackers + better space use (sheet pages)"
deps: [F2c, F2m]
track: frontend
outputs:
  - themed page container for roster/character-detail/crew-detail (max-width, centered, padded — like .styleguide/.health already do)
  - horizontal trackers (stress track, action dots, XP/heat/wanted/rep boxes, clocks laid out horizontally per the sheet-plan idiom)
  - a two-column-ish layout for the detail pages that uses horizontal space (e.g. a main column + sidebar, or a responsive grid), keeping the printed-sheets aesthetic
acceptance:
  - "pages no longer render flush-left: themed container with padding + max-width"
  - "trackers render horizontally (rep/turf/heat/wanted/stress/xp)"
  - "npm test -- --run and npm run build green (page tests may need selector updates)"
  - "docs page docs/pages/frontend/f2z-layout.mdx"
---

Human report 2026-08-08: "Everything is rendering flush up against the left
side... needs some padding and would benefit from some layout design. Similarly,
the trackers (such as rep and turf) are rendering vertically... horizontally
would be more visually intuitive."

## Log
- 2026-08-08: filed from the human's live report; dispatched to deepseek-v4-flash-0731.
- 2026-08-08: DONE. deepseek-v4-flash-0731 child (f2z-layout). Orchestrator
  verification: 366/366 tests + build green by rerun; CSS diff review (themed
  container + card grid + horizontal stress-track with wrap); headless-Chrome
  computed-style probe — roster 920px / detail 1120px centered with 24px gutter,
  2-col grid at 1400px (527/427px tracks), 1-col at 800px, stress-track
  display:flex (horizontal), no horizontal overflow. CSS-only; no test-selector
  changes needed.
