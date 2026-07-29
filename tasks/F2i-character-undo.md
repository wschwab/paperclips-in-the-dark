---
id: F2i
title: "Character undo action on detail page"
deps: [F2h]
track: frontend
outputs:
  - frontend/src/api client undoCharacter method + red-green tests
  - character-detail.ts undo control wired to POST /characters/{id}/undo
  - docs/pages/frontend/f2i-character-undo.mdx
acceptance:
  - "client tests for undoCharacter written red-first (success, NO_HISTORY ApiError, decode of returned Character), then green; verified by grep, not narrative"
  - "npm test -- --run and npm run build green in frontend/"
  - "live Ada probe (orchestrator-run, fresh isolated instance): create character, stress.add, undo restores prior state (stress back, revision advances per contract), second undo with no history returns NO_HISTORY error surfaced in UI state"
  - "docs page present, consistent with what is actually rendered"
---

Spec §12; contract `POST /characters/{id}/undo` — restores newest snapshot and
deletes it; consecutive undos walk backwards; no history → NO_HISTORY.
Single write path: operations API only. No crew undo in this slice; no undo
from the history page (detail page only).

## Log
- 2026-07-29: slice created under new roster (DeepSeek v4 Pro primary, Luna
  escalation — human-authorized this session). Radicle mirror push deferred:
  agent.sock dead, human to restart; GitHub current at 3cbfebca.
- 2026-07-29: dispatched to DeepSeek v4 Pro (pi, opencode-go, -p, stdin
  closed). Prompt: tasks/dispatch/F2i-prompt.md — embeds hard command
  constraints (no VCS, no deletions, no name-based kills). Orchestrator will
  review full diff, grep-verify test counts, and run the live Ada undo probe
  independently before acceptance.
- 2026-07-29: DONE. Orchestrator acceptance: 6 undoCharacter tests verified by
  grep (claimed count exact); 53/53 frontend tests + build green on rerun;
  diff read in full — follows stressAdd error-typing pattern, every branch
  calls renderDetail() synchronously (no F2h bug class). Live Ada probe on
  fresh isolated instance (port 9811, PID 156924, killed + port verified
  clean): stress 0→2 (rev 2), undo restores stress 0 (rev 3), second undo →
  HTTP 200 ok:false NO_HISTORY — confirming the client's startsWith
  ("NO_HISTORY") check matches real server behavior. Docs page present and
  accurate. No forbidden paths or forbidden commands. Metrics:
  tasks/metrics/frontend/F2i.json. Status: accepted.
