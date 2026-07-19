---
id: F0
title: "Frontend bootstrap: Vite + Effect, schema decoders, framework decision"
deps: [C0]
track: frontend
outputs:
  - frontend/ (Vite, TS + Effect; decoders from contract/schemas)
  - docs/pages/frontend/f0-framework-decision.mdx
acceptance:
  - "npm run build succeeds in frontend/"
  - "health-check page renders /api/health data"
  - "framework decision (plain DOM vs thin lib) documented"
---

Spec §12. Talks only to /api/*. Keep framework minimal.

## Log
- 2026-07-19: dispatched to Grok 4.5 (pi, openrouter x-ai/grok-4.5,
  non-interactive) in parallel with C1 (disjoint directories: frontend/ vs
  conformance/). Prompt: tasks/dispatch/F0-prompt.md.
- 2026-07-19: DONE. Acceptance run by orchestrator from clean install:
  npm ci + build green, 18/18 decoder tests green, decision doc present
  (plain DOM + helpers). Metrics: tasks/metrics/frontend/F0.json.
  Health-page-vs-stub check accepted from implementer's chromium dump-dom
  evidence; will be re-verified for real at A2 integration.
