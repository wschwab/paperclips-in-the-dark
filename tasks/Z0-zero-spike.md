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
