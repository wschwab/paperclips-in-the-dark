---
id: A3
title: "Ada launch defaults independent of current working directory"
deps: [A2]
track: ada
outputs:
  - backend-ada launch-path regression
  - executable-relative default static and game-data paths
acceptance:
  - "a red integration check demonstrates the current binary fails from an unrelated cwd without explicit --static/--games"
  - "the same check passes after the minimal Ada fix"
  - "explicit --static, --games, and --data overrides remain unchanged"
  - "backend-ada/ci.sh stays green"
---

Remove the A2 launch wart without broadening into frontend feature work. Resolve
only default static/game-data paths relative to the installed development
binary/repository layout; keep explicit CLI overrides authoritative.

## Log

- 2026-07-22: 30-minute Claude subscription trial authorized by the human.
  Haiku receives the red-green implementation slice; Sonnet is reserved for a
  narrow review/repair if time permits. Orchestrator owns VCS and acceptance.
- 2026-07-22: Haiku reproduced the pre-fix failure from `/tmp` (`/` returned
  404 and the game endpoint returned 400), then made the Ada defaults
  executable-relative. Its scratch check passed green, explicit path overrides
  passed, and `backend-ada/ci.sh` proved all 225 checks.
- 2026-07-22: Sonnet review correctly identified that the scratch regression
  was not durable and that repo-root calculation was duplicated. The
  orchestrator added `backend-ada/test-launch-paths.sh` to `ci.sh`, collapsed
  the calculation, and reran the full gate green. Bare `$PATH` and symlinked
  invocation remain documented limitations outside this development-layout
  slice.
