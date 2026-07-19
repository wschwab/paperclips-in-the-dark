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
