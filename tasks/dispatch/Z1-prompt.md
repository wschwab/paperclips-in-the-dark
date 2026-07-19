# Task Z1 — Zero domain core + operations (full-parallel: human-approved)

You are Grok 4.5, implementing task Z1 of paperclips-in-the-dark. Z0 (yours)
got human sign-off for full-parallel: Zero serves real HTTP, stdio hatch is
insurance only.

Read first: `PAPERCLIPS.md` §5 (all of §5.1 — every numbered behavior gets
conformance-tested), §6, §7; `tasks/Z1-zero-core.md`; `contract/openapi.yaml`
+ `contract/schemas/` (FROZEN, read-only); your own Z0 memo
(`docs/pages/zero/z0-go-no-go.mdx`) for toolchain notes incl. the
std.http.listen PATH wart. Zero 0.3.4 is at ~/.zero/bin/zero.

Semantics source of truth: the conformance suite (`conformance/suites/`,
READ-ONLY — run it, never edit it) and, for intent, the C# reference
`blades-in-the-sheets/Models/` (read-only). Domain-semantics traps that are
already encoded in the suite — get these right:
- BoundedInteger clamps, never errors; report requested vs effective.
- Harm spillover rolls UPWARD (lesser request can land in fatal);
  remove never cascades; SLOT_FULL_FATAL only when everything at/above full.
- Stress at max: sideEffect advisory only, never auto-trauma.
- Armor availability derived from loadout/abilities; ARMOR_NOT_AVAILABLE.
- XP asymmetry: attribute.levelup clears that attribute track;
  ability.take never touches playbook XP.
- upgrade.unmark is BOX-WISE (deliberate divergence from C# reference).
- Fund partial gains surface remainders as sideEffects, never dropped.
- Retired: mutations → RETIRED except trauma-list edits; reads always work.
- All maxima from data/games/ JSON (S&V differs — suite checks it).

Build under `backend-zero/` (spike/ can stay or be absorbed):
- Domain model + ALL character/crew/clock operations from the contract,
  behind HTTP per the contract: uniform OperationResult, full entity DTO,
  typed error codes, POST-only mutations.
- Persistence: enough of §4 for the semantics suites (atomic writes,
  revision integers, If-Match → STALE_REVISION). Full history/undo/
  batch/import polish belongs to Z2 — but don't paint yourself into a corner.
- Target: `cd conformance && BASE_URL=http://localhost:9657 npx vitest run
  suites/semantics` — ALL GREEN. Red-green: run the suite first, watch it
  fail, implement, re-run. Iterate as many times as needed; use
  `zero check --json` / `zero fix --plan --json` output to self-correct and
  note in your summary how useful they actually were (experiment data).
- Keep a running `backend-zero/AGENTS.md` (+ CLAUDE.md symlink) of every
  toolchain fight — same role as backend-ada/AGENTS.md.

Rules: touch ONLY backend-zero/ (+ docs/pages/zero/ for notes). No git/jj.
data/, contract/, conformance/, frontend/, backend-ada/ read-only.
Kill any servers you start before exiting. Port 9657 may be contested by
the Ada track during acceptance — take a `--port` flag, default 9657.

Acceptance (orchestrator-run): semantics suites green against your server
from a cold start; contract/ and conformance/ untouched.

When done print: how to build/start the server, semantics pass count,
iterations used, and your honest read on Zero's agent-facing tooling.
