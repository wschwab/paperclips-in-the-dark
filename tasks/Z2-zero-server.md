---
id: Z2
title: "Zero store + routes (or stdio harness)"
deps: [Z1]
track: zero
outputs:
  - backend-zero/ full server or stdio harness
acceptance:
  - "maximum achievable conformance green (conformance run --report json); any structurally unreachable tests enumerated + justified in docs/pages/zero/"
---

Spec §10/§10.3. Same §4 file-store rules where reachable.

## Log
- 2026-07-19: dispatched to GPT 5.6 Luna (codex, xhigh) after Z1 acceptance (Z1 was 3-model relay; Z2 single-model for cleaner metrics). Prompt inline in dispatch log. Mandates: startup-load data/games/*.json (retire game_data.0), delete dev _*.py scripts, cold-start full-suite scorecard.
- 2026-07-20: attempt 1 PARTIAL. Cold start 131/131 reproduced by orchestrator, BUT second consecutive suite run against the same instance -> roster 500s (CONTRACT-ROSTER-001, SEMANTICS-CROSS-LINKS-001): server crashes scanning its own persisted post-run state. Ada server survives back-to-back runs; robustness gap, bounced for targeted fix. Also recorded for E0: implementer disclosed batch is first-op-only (not all-or-nothing), import hydration incomplete, over-snapshotting vs x-snapshot — suite-parity != spec-parity.
- 2026-07-20: roster-fix dispatch to Luna FAILED — codex usage limit (resets Jul 25 or human applies a reset). GLM 5.2 quota window has reset; fix redispatched to GLM (approved backup).
- 2026-07-20: prior dispatches externally stopped; HUMAN INSTRUCTION: switch implementer to DeepSeek v4 Pro (opencode-go, pi) for generous limits, with extra orchestrator review passes. Roster fix dispatched to deepseek-v4-pro.
