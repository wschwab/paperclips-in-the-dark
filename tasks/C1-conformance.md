---
id: C1
title: "Conformance suite + scoring harness + HTTP↔stdio shim"
deps: [C0]
track: contract
outputs:
  - conformance/ (TS + Effect + vitest; suites/contract, suites/semantics, suites/persistence, suites/lifecycle)
  - conformance scoring harness (`conformance run --against <url> --report json`, stable test IDs)
  - HTTP↔stdio shim (~200 LOC, neutral, for §10.3 escape hatch)
acceptance:
  - "cd conformance && npm test -- --run executes against BASE_URL and reports per-test pass/fail with stable IDs (all failing is expected — no server exists)"
  - "one suites/semantics file per §5.1 behavior (11 behaviors), cases mined from Persistence.Test"
  - "S&V-specific cases present (spec §14.4)"
  - "report json schema documented in docs/pages"
---

Black-box HTTP suite per spec §8. Runs against any BASE_URL. Effect for HTTP
client + effect/Schema decoding mirroring contract/schemas. Never edited by
implementation tasks afterward.

## Log
