# Agent ground rules — paperclips-in-the-dark

Read `PAPERCLIPS.md` (the spec) before doing anything. Reference implementation
context: `blades-in-the-sheets/` (symlink); fast full-repo context in
`blades-in-the-sheets/agent-docs/bits-repomix.md`.

## Version control: jj (Jujutsu)

This repo is jj-colocated (`.jj/` + `.git/`). **Use `jj`, not `git`, for all
VCS operations.**

- `jj st` / `jj diff` / `jj log` instead of git equivalents.
- Start work with `jj new -m "<what this change will do>"`; describe with
  `jj describe -m`. No staging area — the working copy is the commit.
- Small, single-purpose changes. Use `jj split` if a change grew two concerns.
- Never run `git commit`, `git add`, `git rebase`, or anything that mutates
  the git side directly; jj owns the store. Read-only git commands are fine.
- Bookmarks track branches: `jj bookmark set main -r @-` before pushing.

## Mirroring: Radicle + GitHub

Code is mirrored to both. Push via jj:

- GitHub: `jj git push --remote origin`
- Radicle: `SSH_AUTH_SOCK=~/.radicle/agent.sock jj git push --remote rad`
  (the Radicle key lives in an ssh-agent on that socket; if the push prompts
  for a passphrase or the socket is missing, the agent died — ask the human
  to rerun `ssh-agent -a ~/.radicle/agent.sock; set -x SSH_AUTH_SOCK
  ~/.radicle/agent.sock; rad auth`).
- RID: `rad:z3bxKrbQdawdx41PrwtRF8X96w3sU` (jj has no `--all-remotes` for
  push — push each remote separately).

Push to **both** remotes at every push point, or note explicitly which one
you couldn't reach. Never force-push either mirror without human sign-off.

## TDD: red-green, no exceptions

All implementation work is red-green:

1. **Red** — write the failing test first (conformance test, unit test, or
   gnatprove contract, per track). Run it; confirm it fails for the right
   reason.
2. **Green** — minimal code to pass.
3. Refactor with the suite green.

Corollaries from the spec (§8, §13):

- A task is done when its acceptance commands pass, not when you say so.
- The conformance suite is the source of truth; implementation tasks never
  edit `contract/` or `conformance/`. Contract changes go through a
  dedicated contract-change task.
- For Track A, gnatprove contracts count as tests: state the `Pre`/`Post`
  first, then make the proof go through.

## Documentation: vocs

All project documentation lives in a [vocs](https://vocs.dev) site under
`docs/` (vocs project rooted there; pages in `docs/pages/`).

- New feature or decision ⇒ docs page or update in the same change.
- Generated API reference (from `contract/openapi.yaml`) is emitted into the
  vocs tree by CI — never hand-edit generated pages.
- `EXPERIMENT.md`-style memos and ADR-like notes are vocs pages, not loose
  markdown, except the files the spec explicitly places elsewhere
  (`PAPERCLIPS.md`, `skill/SKILL.md`, per-track `AGENTS.md`).

## Implementation agents

Primary implementation agents for task-graph work (§13):

| Agent | Provider | Harness | Notes |
|---|---|---|---|
| Grok 4.5 | openrouter | pi | — |
| GPT 5.6 Luna | — | Codex | reasoning effort: xhigh |

Orchestrators dispatch tasks in `tasks/` to these two; other models only by
explicit human instruction. Record per-task metrics per spec §11
(`tasks/metrics/{track}/{task}.json`).

## General

- Never hardcode game maxima — everything numeric comes from game-settings
  JSON (spec §5).
- The C# `Models/` source is authoritative for domain semantics; verify
  against it, not memory.
- No edits inside `blades-in-the-sheets/` — it is reference material.
