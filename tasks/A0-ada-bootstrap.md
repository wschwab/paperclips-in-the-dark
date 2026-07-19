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
