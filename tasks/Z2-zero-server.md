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
- 2026-07-21 wave 1: dedicated C2 regression isolated the roster growth failure
  (12 successful crew creates, then roster 500; Ada 1/1 green). DeepSeek v4 Pro
  via `opencode-go`/`pi` was interrupted by the orchestrator after terminal
  output appeared idle. Post-wave inspection of the saved session proved the
  model was active throughout: it completed five reasoning/tool-call cycles and
  was still reading relevant Zero sources. `pi -p` had buffered those internal
  events. No provider quota or credit error was reported. Resume the same saved
  session from `tasks/dispatch/Z2-wave1-resume.md`.
- 2026-07-21 wave 2: corrected the wave-1 liveness record and resumed the same
  DeepSeek session. Accepted its 1.8 KiB→14 KiB roster builder change and
  `PITD_DATA` support after focused green. DeepSeek was stopped after repeatedly
  violating the no-broad-kill/no-delete constraints. A fresh full run reached
  132/132; its second run kept roster tests green but exposed deletion-driven ID
  reuse. Luna xhigh added persisted monotonic per-kind sequences; fresh focused
  acceptance is 2/2. Larger accumulated rosters still cross the native HTTP
  response ceiling at roughly 6 KiB even with a 30 KiB local builder, so full
  observable parity now requires the spec §10.3 neutral shim. No provider limit
  was encountered.
- 2026-07-22: Track Z paused at the maximum achievable boundary for Zero 0.3.4.
  The native HTTP failure is reported upstream as
  https://github.com/vercel-labs/zerolang/issues/430; the missing persistent
  stdin capability is https://github.com/vercel-labs/zerolang/issues/431.
  Preserve the Z2/Z2S probes and metrics for immediate retest on a future Zero
  release; no process-per-request workaround is planned while Track A advances.
