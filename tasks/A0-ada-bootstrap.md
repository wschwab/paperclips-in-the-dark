---
id: A0
title: "Ada bootstrap: Alire project, AWS /api/health + static files, CI, AGENTS.md"
deps: [C1]
track: ada
outputs:
  - backend-ada/ (alire.toml pinned, core/ + server/ skeleton)
  - backend-ada/AGENTS.md + CLAUDE.md symlink
  - CI: alr build + gnatprove gates
acceptance:
  - "alr build clean in backend-ada/"
  - "server serves GET /api/health returning {status, implementation: 'ada', version, dataDir} on port 9657 and static files"
  - "conformance suites/contract health tests pass against it"
  - "gnatprove runs clean on (empty) core/"
---

Spec §9. GNAT FSF + gnatprove via Alire; crates aws, gnatcoll. AGENTS.md must
include Ada style crib sheet, gnatprove counterexample patterns, changed-unit
prove loop, AWS routing idioms.

## Log
- 2026-07-19: dispatched to GPT 5.6 Luna (codex, xhigh). Alire 2.1.1 + gnat_native 16.1.0 + gprbuild 26.0.1 preinstalled by orchestrator (~/.local/bin/alr); gnatprove left as project dep. Prompt: tasks/dispatch/A0-prompt.md.
- 2026-07-19: DONE. Orchestrator acceptance: ci.sh green (alr build + gnatprove --level=2 clean), live /api/health contract-shaped, conformance health green (86 fails expected pre-A1/A2). AGENTS.md substantive (AWS-21 pin story). Metrics: tasks/metrics/ada/A0.json.
