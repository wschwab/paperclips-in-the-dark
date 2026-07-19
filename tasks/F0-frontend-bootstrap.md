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
