---
id: F2
title: "Sheets UI: character, crew, roster, creation flow, history/undo"
deps: [F1, A2]
track: frontend
outputs:
  - frontend sheet pages, playable against Track A
acceptance:
  - "character sheet, crew sheet, roster, creation flow, history/undo all functional against backend-ada"
  - "stale-tab STALE_REVISION → refetch behavior demonstrated"
  - "npm run build green; served by backend as static files on 9657"
---

Spec §12. Single write path — operations API only, no whole-object PUT.

## Log
