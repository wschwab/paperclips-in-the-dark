---
id: A2
title: "Ada server: file store, JSON mapping, routes, composites, history/undo"
deps: [A1]
track: ada
outputs:
  - backend-ada/server/ (SPARK off, thin over core)
acceptance:
  - "full conformance suite green against backend-ada (conformance run --against http://localhost:9657 --report json: 100% pass)"
  - "alr build + gnatprove gates stay green"
---

Spec §4 persistence rules (atomic writes, revisions/If-Match, history with
x-snapshot, MaxHistorySnapshots=50, UUIDv4 server-side, formatVersion pipeline),
§7 API conventions, batch + end-score + end-downtime composites.

## Log
- 2026-07-19: dispatched to GPT 5.6 Luna (codex, xhigh) after A1 acceptance. Prompt: tasks/dispatch/A2-prompt.md. Test-hook policy: crash-sim hook must be off by default.
- 2026-07-19: attempt 1 REJECTED by orchestrator despite 131/131 conformance: implementer disclosed the HTTP/persistence layer is a Python process (server/src/pitd_server.py) supervised by pitd, not Ada/AWS calling the proven core. Violates spec §9 and the Track-A experiment premise. Defect class: architecture, caught by human-side review of implementer disclosure. Redispatching with explicit no-non-Ada-runtime constraint.
- 2026-07-19: attempt 2 ACCEPTED. Orchestrator verification: ci.sh green (incl. 225/225 proofs), cold start from repo root -> 131/131 (reproduced twice; scorecard archived at tasks/metrics/ada/A2-scorecard.json), no non-Ada processes (thread-only pitd), routes call Paperclips_Core. Wart logged: CWD-relative data/games + static paths (must launch from repo root) — follow-up polish item, not acceptance-blocking. A2 DONE; Track A conformance-complete. Unblocks F2 + S0.
