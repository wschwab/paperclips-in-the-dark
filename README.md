# Paperclips in the Dark

An **agent-first campaign sheet manager for Blades in the Dark** — the primary
client is an AI agent assisting a GM or player at the table; the human web UI
is a styled thin client of the same API. It is a *sheet manager, not a rules
engine*: it enforces structural constraints (bounded stress, harm slots, XP
tracks) and never dice mechanics, position/effect, or GM judgment.

> *"maximizing coin, not paperclips — probably."*

It is simultaneously a **language experiment**: two parallel backends are
built from one language-neutral contract by AI implementation agents, and
must pass the same black-box conformance suite.

- **Track A — Ada + SPARK**: domain invariants as compiler-checked proofs
  (`gnatprove`, 225/225 checks, gold functional contracts on the core types).
- **Track Z — Zero** ([zerolang.ai](https://zerolang.ai)): a pre-1.0 language
  designed for agents — graph-first source, JSON diagnostics, typed repair
  metadata.

The suite, not either implementation, is the source of truth. Experiment
metrics live in `tasks/metrics/`; the comparison memo lands with task E0.

## Layout

| Path | What |
|---|---|
| `PAPERCLIPS.md` | The spec. Read this first. |
| `contract/` | OpenAPI 3.1 + JSON Schemas — **frozen v1**, the single source of truth |
| `conformance/` | Black-box HTTP suite (TS + Effect + vitest), 131 tests, runs against any `BASE_URL` |
| `backend-ada/` | Track A: SPARK core (`core/`) + AWS server (`server/`) |
| `backend-zero/` | Track Z: Zero implementation |
| `frontend/` | Static thin client (Vite + TS + Effect, plain DOM) |
| `skill/` | Agent skill: `SKILL.md` + api-reference generated from the contract |
| `data/games/` | Game-settings JSON, salvaged verbatim from blades-in-the-sheets |
| `tasks/` | Orchestration task graph + per-task experiment metrics |
| `docs/` | Project docs (vocs site) |

## Quick start (Track A)

```sh
# build + prove + test
cd backend-ada && ./ci.sh && cd ..

# run (from repo root — data/games resolves relative to CWD)
backend-ada/server/bin/pitd --port 9657 --data ./campaign-data --static ./frontend/dist

# poke it
curl -s localhost:9657/api/health

# run the conformance suite against it
cd conformance && npm ci && BASE_URL=http://localhost:9657 npx vitest run
```

Toolchain: [Alire](https://alire.ada.dev) (`alr`), GNAT ≥ 16, gnatprove via
crate dependency. See `backend-ada/AGENTS.md` for the hard-won toolchain notes.

## Provenance & credit

Domain semantics, test cases, and game data are salvaged from
[blades-in-the-sheets](https://github.com/arazni/blades-in-the-sheets) by
**arazni** (license confirmation pending — see spec §14.1). SRD content is
CC-BY per the Blades in the Dark license; Blades in the Dark is by John
Harper / One Seven Design. This project reproduces no rulebook text.

## Mirrors

- GitHub: `wschwab/paperclips-in-the-dark`
- Radicle: `rad:z3bxKrbQdawdx41PrwtRF8X96w3sU`

Built by an orchestrated team of AI coding agents (task graph in `tasks/`,
ground rules in `AGENTS.md`) with human gates at contract freeze and
track go/no-go decisions.
