# Task A3 — Ada executable-relative launch defaults

You are Claude Haiku working through the full interactive Claude Code CLI on a
small, bounded TDD task in `/home/x/code/paperclips-in-the-dark`.

Read `AGENTS.md`, `PAPERCLIPS.md`, `tasks/A3-ada-launch-paths.md`, and
`backend-ada/AGENTS.md` before editing. Use `jj` for read-only inspection if
needed, but do not run any VCS mutation; the orchestrator owns VCS.

Goal: remove the known A2 wart where `backend-ada/server/bin/pitd` defaults
`./frontend/dist` and `./data/games` against the caller's cwd. The binary must
serve the built frontend and game data when launched from an unrelated cwd,
without requiring explicit `--static` or `--games`. Explicit `--static`,
`--games`, and `--data` arguments must remain authoritative.

TDD is mandatory:

1. Add the smallest deterministic integration regression and run it red against
   the current binary for the expected cwd-relative failure.
2. Make the smallest Ada change, preferably confined to
   `backend-ada/server/src/pitd.adb`, that computes development defaults from
   the executable location. Do not touch `contract/` or `conformance/`.
3. Run the focused regression green, then `backend-ada/ci.sh` if affordable.

Constraints:

- No Python or non-Ada runtime in the server.
- No frontend features.
- No broad process-kill commands and no deletion commands. Track the exact
  server PID and stop only that PID.
- Do not edit unrelated inherited files.
- Stop after this one slice and report exact commands, red/green evidence,
  changed files, limitations, and your own uncertainties.
