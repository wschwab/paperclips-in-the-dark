---
id: Z0
title: "Zero feasibility spike: HTTP / JSON / filesystem"
deps: [C1]
track: zero
outputs:
  - backend-zero/ scaffolding
  - docs/pages/zero/z0-go-no-go.mdx (written go/no-go; decision is HUMAN — orchestrator prepares evidence, user decides)
acceptance:
  - "spike demonstrates (or refutes, with evidence) that Zero can serve HTTP or be trivially fronted, parse/emit JSON, and touch the filesystem"
  - "go/no-go memo written; escape-hatch (§10.3) recommendation explicit"
  - "human sign-off recorded in this file's Log before Z1 dispatch"
---

Spec §10. If HTTP is impractical, Track Z narrows to domain core + stdio
harness behind the C1 shim. Wire Zero's JSON diagnostics/repair metadata into
the dispatch feedback loop.

## Log
- 2026-07-19: dispatched to Grok 4.5 (pi, openrouter). No Zero toolchain on host; acquisition is explicitly part of the spike. Prompt: tasks/dispatch/Z0-prompt.md. Go/no-go decision reserved for human.
- 2026-07-19: spike complete. Zero 0.3.4 clears all four bars; orchestrator
  independently verified hello-world and live GET /api/health (:9658).
  Memo: docs/pages/zero/z0-go-no-go.mdx. Recommendation: full-parallel
  (stdio hatch kept as insurance). Metrics: tasks/metrics/zero/Z0.json.
  AWAITING HUMAN GO/NO-GO before Z1 dispatch.
