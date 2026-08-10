# paperclips-in-the-dark watchdog

Paperclips in the Dark (`pitd`) is a campaign sheet manager for Blades in the
Dark — a sheet manager, *not* a rules engine. Its real client is an AI agent,
and it is simultaneously a language experiment: Track A (`backend-ada/`, Ada +
SPARK) and Track Z (`backend-zero/`, Zero, currently halted) are two independent
implementations built from one frozen OpenAPI contract, judged only by one
shared black-box conformance suite (`conformance/`) — "the suite, not either
implementation, is the source of truth". There is no CI and no deployment; the
only deploy-like act is mirroring to GitHub *and* Radicle on every push point.
**This repo is under active human development right now** — Will is editing it,
so anything that looks half-finished is in-flux, not broken, and must not be
"fixed".

## Frozen contract/conformance — blocker
The whole experiment collapses if `contract/openapi.yaml`, `contract/schemas/*.json`,
or any `conformance/suites/*` test is edited "to make a failing test pass" or to
tweak an op shape. That silently re-targets both backends and the suite stops
being an independent oracle. Implementation agents never touch these; contract
changes go through a dedicated contract-change task (`AGENTS.md`, `PAPERCLIPS.md` §8/§13).
Advisor: flag ANY diff touching `contract/`, `conformance/suites/`, `data/`, or
`blades-in-the-sheets/` (reference checkout, never edited) as a contract-blob
violation unless it is an explicitly-scoped contract task.

## Live campaign data + CWD-relative default data dir — blocker
`campaign-data/` at the repo root holds REAL session state (`crews/`,
`characters/`, `campaign.json`). The server's default data dir is CWD-relative,
so `backend-ada/server/bin/pitd --port 9657 --data ./campaign-data` run from the
repo root reads/writes the actual game. Tests must use a throwaway dir
(`ci.sh` uses `/tmp/pitd-campaign-data`). `--test-hooks` is the ONLY switch that
enables destructive crash hooks — never on with real data (`backend-ada/AGENTS.md`).
Advisor: confirm any server/test invocation targets a scratch dir, never
`./campaign-data`.

## PITD_RESET=1 rm -rf in run.sh — blocker
`backend-zero/server/run.sh` (lines ~35-41) does `rm -rf -- "$reset_target"`
when `PITD_RESET=1`, where a relative `--data` resolves against `$ROOT` (the
server dir), an absolute one is wiped verbatim. A reviewer must resolve `--data`
before assuming any scope: a relative path like `campaign-data` wipes
`backend-zero/server/campaign-data`, not the root one — but an absolute path can
point anywhere. Zero tracks are halted; anyone enabling `PITD_RESET=1` on a
non-scratch dir is a red flag.

## Don't hand-edit on-disk entity JSON / history snapshots — concern
DTO JSON is the only format on wire *and* disk, but also the live source of
per-entity revisions and snapshot history. Direct file edits bypass the
same-dir `.tmp` → fsync → rename atomic-write path, the `revision` +
`If-Match`/`STALE_REVISION` 409 flow, and the max-50 snapshot history
(`PAPERCLIPS.md` §8, `backend-ada/AGENTS.md` server-boundary notes).
`formatVersion` (currently 1, empty migration pipeline) must never be bumped
without a transform step. Advisor: entity data is read-only reference for agents;
edits go through the API only.

## Game maxima must never be hardcoded — concern
"stress 9 / trauma 4"-style literals break bounded-integer / harm / XP semantics
for BOTH S&V and Blades, and they are what the SPARK proofs and the conformance
suite depend on. `data/games/*.json` is authoritative and copied verbatim from
the reference. `backend-ada/AGENTS.md` documents the right fix — a shared
proof-safe `Capacity` subtype that rejects absurd values at the boundary ("this
parameterizes game rules without hardcoding any game maximum"). Advisor: a
numeric literal appearing as a game rule, or a tightened `data/games/*.json`, is
a violation; the fix is a boundary-validated subtype, not a constant.

## Toolchain version pins are load-bearing — concern
`backend-ada/server/alire.toml` pins AWS 21.0.0 and GNATCOLL 26.0.0; `core/`
pins gnatprove 16.1.0. AWS 25.2.0's Debug default + libgpr 25.0.0 break under
GNAT 16.1 (`backend-ada/AGENTS.md` A0). "Upgrading a dependency" in `alire.toml`
likely breaks the build AND the gnatprove gate. Two spellings the advisor must
check, because they fail silently: the prove switch is `--checks-as-errors=on`
(bare form fails), and every `alr` invocation needs `XDG_RUNTIME_DIR=/tmp`
(here `/run/user/1000` is read-only, so `alr` hangs/fails). Keep `alire.lock`
checked in. Skip a "housekeeping" version bump.

## Push to BOTH mirrors, or tell a human why not — concern
The only deploy-like act is mirroring every push point. `main` upstreams to
**`rad`** (Radicle), not GitHub (`branch "main"` in `.git/config`), so an agent
that pushes only `origin` silently misses the required Radicle mirror and vice
versa. Radicle pushes go through the per-repo `paperclips-bot` delegate key /
ssh-agent; a passphrase prompt or missing-socket error means the node is down
(needs the once-per-boot `rad-radicle-up`), which must be surfaced, never
bypassed. Never force-push either mirror without human sign-off. Advisor: verify
BOTH `jj git push --remote origin` and the Radicle `git push rad-agent main`,
or an explicit note of which is unreachable.

## SPA serving: deep links vs real 404s — nit
The server serves `frontend/dist/` and must route `/roster` → `index.html`
(SPA fallback) while `/assets/does-not-exist.js` returns a genuine 404
(`backend-ada/test-spa-routes.sh`). A plausible "simplify routing" refactor that
turns asset misses into HTML responses (or breaks deep links) passes `ci.sh`
only if that test is run. Advisor: this is verified by `test-spa-routes.sh`
inside `ci.sh` — don't let routing changes drop that check.

## Conformance "green" is only meaningful against a live backend — concern
`npx conformance run` exits non-zero on ANY failure, including the EXPECTED
all-red state before a backend exists (`conformance/README.md`). A claimed green
requires a real backend and correct `BASE_URL` (and remember `CONFORMANCE_BASE_URL`
vs Vite's reserved `BASE_URL`). Reported counts drifts — README says 131 tests, a
task log claims "176/176" — so verify counts by grep, never by narrative
(`AGENTS.md`). Advisor: cite the actual command + suite output, not the agent's
summary.

## Generated files: never hand-edit — nit
`skill/api-reference/` is generated from `contract/openapi.yaml` by
`skill/generate-api-reference.mjs`; the vocs `docs/` API reference is emitted by
CI. Hand-editing a generated page is overwritten next regen and masks a stale
contract. These are the "generated, don't touch" files — the reverse trap is an
agent treating a half-generated page as a defect and "fixing" it by hand.

## Zero leftovers (halted track) — nit
`backend-zero/` leaves two landmines: `zero.graph` (gitignored, can be stale vs
sources) and the `server/zero` symlink that `run.sh` creates and normally removes
on exit — an interrupt can leave it behind and break a later `zero run`/build.
`zero check --json` alone can mask parse errors; use `zero import .` first.
Track Z is halted (`README.md`); do not re-open it without the escape-hatch
decision. Advisor: ignore `zero.graph` staleness and only clean the `server/zero`
symlink if it actually breaks a run.
