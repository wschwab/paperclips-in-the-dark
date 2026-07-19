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
