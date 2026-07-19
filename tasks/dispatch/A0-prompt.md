# Task A0 — Ada bootstrap

You are GPT 5.6 Luna, implementing task A0 of paperclips-in-the-dark.

Read first: `PAPERCLIPS.md` §9 + §3 + §7.1, `tasks/A0-ada-bootstrap.md`
(acceptance), `contract/openapi.yaml` (FROZEN, read-only — you implement only
/api/health + static file serving in this task).

Environment: `alr` 2.1.1 is installed; toolchain gnat_native 16.1.0 +
gprbuild 26.0.1 already selected globally. `gnatprove` is NOT installed —
add it as a project dependency (`alr with gnatprove`) inside backend-ada.
Network access is available for Alire crate fetches.

Build under `backend-ada/` only:
- Alire project(s): `core/` (SPARK library crate, empty but proving) and
  `server/` (AWS binary crate). Pin versions in alire.toml.
- Server: AWS (Ada Web Server) serving `GET /api/health` returning
  `{"status":"ok","implementation":"ada","version":"0.1.0","dataDir":"<abs path>"}`
  per contract/schemas/campaign.json#/$defs/health, plus static files from a
  `--static <dir>` flag (default ./frontend/dist), port 9657 (`--port` flag),
  `--data <dir>` for dataDir (default ./campaign-data).
- Structured request logging: one JSON line per request to stdout.
- `backend-ada/AGENTS.md` (+ `CLAUDE.md` relative symlink to it): Ada style
  crib sheet, common gnatprove counterexample patterns and fixes, the
  "prove only the changed unit" loop (`gnatprove -u <unit>`), AWS routing
  idioms, alr command cheatsheet. Write it as you learn — every toolchain
  fight you hit goes in this file. It is load-bearing for A1/A2.
- `backend-ada/ci.sh`: alr build (both crates) + gnatprove --level=2
  --checks-as-errors on core/ + optional conformance health tests.

TDD: red first — run the conformance contract/health tests
(`cd conformance && BASE_URL=http://localhost:9657 npx vitest run
suites/contract/health.test.ts` or the matching file) against the dead port,
then make them pass with the server running.

Rules:
- Touch ONLY `backend-ada/`. Never contract/, conformance/, tasks/, frontend/,
  data/ (read-only), blades-in-the-sheets/.
- No git or jj commands.
- Kill any server process you start before exiting.

Acceptance (orchestrator-run):
- `cd backend-ada && ./ci.sh` green (build + gnatprove on core).
- Server starts; conformance health test(s) pass against it.
- AGENTS.md + CLAUDE.md symlink exist with real content.

When done print: file tree, how to build/run, gnatprove output summary,
anything you fought with (goes to AGENTS.md too).
