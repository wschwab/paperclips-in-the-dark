---
id: Z1
title: "Zero domain core + operations"
deps: [Z0]
track: zero
outputs:
  - backend-zero/ domain model + operations
acceptance:
  - "conformance suites/semantics green against backend-zero (directly or via the C1 shim, per Z0 decision)"
---

Spec §10. Same §5.1 semantics as Track A; maxima from game settings.

## Log
- 2026-07-19: human GO recorded on Z0; Z1 dispatched to Grok 4.5 (pi, openrouter). Prompt: tasks/dispatch/Z1-prompt.md. Acceptance = semantics suites green from cold start, run by orchestrator.
- 2026-07-19: attempt 1 FAILED — openrouter request timeout mid-session (pi exit 1). Retry via session resume (pi -c), attempt 2.
- 2026-07-19: attempt 2 FAILED — same provider timeout (openrouter reachable, model endpoint suspected; resumed-session context size possible factor). Attempt 3+: fresh session + 3x retry wrapper w/ 5-min backoff. If all fail: model swap needs human sign-off per AGENTS.md.
- 2026-07-19: attempts 3-5 FAILED (retry wrapper, 5-min backoff, all provider timeouts). Z1 BLOCKED pending human call: wait out the x-ai/grok-4.5 outage vs approve a substitute model.
- 2026-07-19: HUMAN INSTRUCTION: substitute GLM 5.2 (provider opencode-go, pi harness) as backup implementer. Grok probe still timing out. Attempt 6 dispatched to glm-5.2. Roster change flagged for E0 model-attribution.
- 2026-07-19: GLM session 1 ended at token budget, NOT complete (honestly reported, no false done-claim). Findings: prior Grok code unsalvageable (multi-line struct literals -> PAR100 in Zero 0.3.4, preserved under server/_prior-stalled/); toolchain footgun — zero check --json masks PAR100/NAM003 until `zero import .` succeeds (real loop: import -> stderr -> check). Handoff note: backend-zero/notes/z1-status.md. Both findings to go into backend-zero/AGENTS.md. GLM session 2 dispatched to resume from handoff.
- 2026-07-19: session 2 FAILED immediately — opencode-go 429 monthly quota (resets ~2h25m; same 429 killed F1 attempt 1). Auto-resume wrapper sleeping 2h35m then running Z1 session 2 and F1 sequentially. Human can short-circuit via balance-enable URL (in scratchpad logs) or by approving another provider.
