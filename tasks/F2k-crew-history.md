---
id: F2k
title: "Crew history page"
deps: [F2j]
track: frontend
outputs:
  - frontend/src/api client getCrewHistory method + red-green tests
  - crew-history.ts page + router wiring + link from crew detail
  - docs/pages/frontend/f2k-crew-history.mdx
acceptance:
  - "client tests for getCrewHistory written red-first (success decode, empty list, error typing), then green; verified by grep"
  - "npm test -- --run and npm run build green in frontend/"
  - "live Ada probe (orchestrator-run, fresh isolated instance): create crew, empty history, rep.add populates history, /crew/{id}/history SPA route serves, unknown id 404"
  - "docs page present, consistent with what is actually rendered"
---

Spec §12; contract `GET /crews/{id}/history` (historyEntry list). Mirror of
F2d's character-history slice. Read-only page; no snapshot-restore UI in this
slice (undo already covers the mutation path).

## Log
- 2026-07-29: dispatched to DeepSeek v4 Pro (pi, opencode-go, -p, stdin
  closed) after F2j acceptance. Prompt: tasks/dispatch/F2k-prompt.md (same
  hard command constraints).
