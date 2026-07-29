---
id: F2j
title: "Crew undo action on detail page"
deps: [F2i]
track: frontend
outputs:
  - frontend/src/api client undoCrew method + red-green tests
  - crew-detail.ts undo control wired to POST /crews/{id}/undo
  - docs/pages/frontend/f2j-crew-undo.mdx
acceptance:
  - "client tests for undoCrew written red-first (success, NO_HISTORY ApiError, decode of returned Crew, malformed-body error typing), then green; verified by grep"
  - "npm test -- --run and npm run build green in frontend/"
  - "live Ada probe (orchestrator-run, fresh isolated instance): create crew, apply a snapshotting crew op via API, undo restores prior state, further undo with no history returns NO_HISTORY surfaced in UI state"
  - "docs page present, consistent with what is actually rendered"
---

Spec §12; contract `POST /crews/{id}/undo` — same semantics as character undo
(restore newest snapshot, delete it, NO_HISTORY when empty; arrives as HTTP
200 ok:false per live-verified Ada behavior). Mirror of F2i. Crew detail page
is otherwise read-only; the undo control is the slice's only mutation. No
crew mutation ops UI in this slice.

## Log
- 2026-07-29: dispatched to DeepSeek v4 Pro (pi, opencode-go, -p, stdin
  closed) immediately after F2i acceptance. Prompt:
  tasks/dispatch/F2j-prompt.md (same hard command constraints).
- 2026-07-29: DONE. Orchestrator acceptance: 6 undoCrew tests verified by
  grep; 59/59 tests + build green on rerun; diff read — faithful mirror of
  F2i (error typing, synchronous renderDetail in every branch). Live Ada
  probe (port 9813, PID 251266, killed + port verified clean): rep.add 0→3
  (rev 2), undo restores rep 0 (rev 3), second undo → HTTP 200 ok:false
  NO_HISTORY. Docs page present and accurate. No forbidden paths/commands.
  Metrics: tasks/metrics/frontend/F2j.json. Status: accepted.
