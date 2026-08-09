---
id: F2aa
title: "Frontend bugs from playtest round 1 — launch route, history decode, talent names, ENTER/TAB, clock clicks, harm ×"
deps: [F2c, F2m]
track: frontend
outputs:
  - default route launches the roster (not health)
  - HistoryEntry.snapshotId schema accepts UUIDs (was C#-era ^[0-9]{17}- pattern)
  - talent action rows render one name (the underlined action-name; drop the duplicate)
  - ENTER submits inline-edit forms; fields tabbable in order; dropdowns/text inputs styled (theme)
  - project clock click interaction verified/fixed
  - harm remove × button de-emphasized (CSS: subtle ghost button, tooltip 'remove (clerical)')
  - page tests + docs page
acceptance:
  - "npm test -- --run + npm run build green; browser check: '/' shows roster, history pages render, talent rows single-name"
---

## Log
- 2026-08-09: filed from playtest round 1 plan (#1, #3, #12, #14, #15, #22, #10).
