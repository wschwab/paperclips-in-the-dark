# Agent ground rules — paperclips-in-the-dark

Read `PAPERCLIPS.md` (the spec) before doing anything. Reference implementation
context: `blades-in-the-sheets/` (symlink); fast full-repo context in
`blades-in-the-sheets/agent-docs/bits-repomix.md`.

## Version control: jj (Jujutsu)

This repo is jj-colocated (`.jj/` + `.git/`). **Use `jj`, not `git`, for all
VCS operations. Exception: pushing to the Radicle remote should use git.**

- `jj st` / `jj diff` / `jj log` instead of git equivalents.
- Start work with `jj new -m "<what this change will do>"`; describe with
  `jj describe -m`. No staging area — the working copy is the commit.
- Small, single-purpose changes. Use `jj split` if a change grew two concerns.
- Never run `git commit`, `git add`, `git rebase`, or anything that mutates
  the git side directly; jj owns the store. Read-only git commands are fine.
- Bookmarks track branches: `jj bookmark set main -r @-` before pushing.

**Exception: Pushing to Radicle**
- Radicle’s remote helper does not support the dry-run required by `jj git push`. Until that incompatibility is fixed, push Radicle with git:
  - Human: `SSH_AUTH_SOCK=~/.radicle/agent.sock git push rad main`
  - Agent/subagent: `env RAD_HOME=$HOME/.radicle-agents/paperclips SSH_AUTH_SOCK=$HOME/.radicle/agent.sock git push rad-agent main`
- Afterward, reconcile jj’s remote state with: `jj git fetch --remote rad`
- All other Git-side mutations remain prohibited.

## Mirroring: Radicle + GitHub

Code is mirrored to both. Push to Github via jj:

- Github: `jj git push --remote origin`
- Radicle: instructions above

  The agent push uses a **per-repo delegate key** (`paperclips-bot`, see
  `agent-docs/radicle-agent-keys.md`): agents can push in the human's name
  without ever seeing the master passphrase. The bot key is a delegate of this
  repo's identity; it can be revoked independently (never affects GitHub or
  other repos).

  If a push fails with a passphrase prompt or a missing-socket error, the
  ssh-agent or a node is down (e.g. after a reboot) — ask the human to run the
  once-per-boot ritual: `rad-radicle-up` (starts agent socket, registers both
  keys, starts both nodes; master prompts are silent but accept input).

- RID: `rad:z3bxKrbQdawdx41PrwtRF8X96w3sU`

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

## Is the spec the problem?

The contract is the source of truth, but it is not automatically right. When
implementation keeps snagging, stop and ask whether the spec is the defect
before writing more workarounds.

Trigger this check when any of these appear:

- Two or more findings share a root cause the contract does not describe.
- A fix requires inventing behavior the contract cannot express (an undeclared
  status code, an error with no code, a limit no DTO carries).
- A worker must choose between violating the spec and shipping something wrong.
- Effort is going into a scenario nobody actually needs — ask before building it.
- A capability exists in the contract but no client surfaces it.

Then produce a categorisation, not a patch list: group the findings by root
cause, condense to the fewest underlying spec issues, and recommend contract
changes. Record it as a vocs page under `docs/pages/contract/`. Two standing
goals decide ties — an API an AI agent can drive without guessing, and a sheet a
human can read and update quickly.

Watch for audit blind spots: enumerating what exists cannot find what was never
built. Check the contract for unimplemented capabilities explicitly.

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

| Agent | Provider | Harness | Role | Notes |
|---|---|---|---|---|
| Haiku 4.5 | Claude subscription | Claude Code CLI | small bounded implementation slices | verify its claimed test counts by grep, not narrative; check docs page landed |
| Sonnet 5 | Claude subscription | Claude Code CLI | skeptical review + acceptance | medium effort; high effort is disproportionate for narrow reviews |
| GPT 5.6 Luna | openai-codex | Codex | narrow cleanup/escalation only | reasoning effort: xhigh; expensive — reserve for correctness-sensitive blockers |
| Grok 4.5 | openrouter | pi | implementation (when provider healthy) | openrouter currently unfunded |
| DeepSeek v4 Pro | opencode-go | pi | low-cost implementation | needs command-level supervision; never unattended |

Active pairing (human-authorized 2026-07-29): **DeepSeek v4 Pro
(opencode-go via pi) as primary bounded-slice implementer, GPT 5.6 Luna
(codex, xhigh) for tasks that need it** — escalation, proof/toolchain work,
correctness-sensitive blockers. DeepSeek dispatches carry hard command
constraints (no broad kills, no deletions, exact-PID cleanup, no VCS); the
orchestrator reviews every diff and owns the live Ada probe.

The earlier Haiku/Sonnet pairing was human-authorized (2026-07) and delivered
F2a–F2h; metrics files naming Haiku as implementation agent are correct, not a
roster violation. Six-slice track record: Haiku's code and red-green discipline
are reliably sound, but its self-reports overclaim (phantom tests in F2e,
off-by-one counts, dropped docs pages) — Sonnet review plus an
orchestrator-owned live Ada probe are mandatory backstops, not formalities.

Record per-task metrics per spec §11 (`tasks/metrics/{track}/{task}.json`).

## Frontend work by models without vision

A model that cannot inspect visual output MUST NOT mark a frontend/UI change
done from unit tests, DOM structure, computed geometry, or its own screenshots
alone.

- Use a real Chromium viewport at every affected target size. CSS `max-width`
  emulation is not viewport verification.
- Prove responsive containment numerically with `window.innerWidth`,
  `document.documentElement.scrollWidth`, container `clientWidth` /
  `scrollWidth`, `getBoundingClientRect()`, and the relevant computed
  `overflow`, `min-width`, grid, or flex properties.
- Exercise every affected route in light and dark themes; include high contrast
  when theme or contrast behavior can be affected. Capture screenshots of the
  changed surfaces even though the implementing model cannot judge them.
- Before completion, obtain an independent review from **GPT 5.6 Luna** through
  the **openai-codex** provider at **xhigh** reasoning effort. The reviewer must
  inspect the source, numeric browser evidence, and screenshots, independently
  exercise the affected browser path, and return an explicit evidence-backed
  PASS or FAIL.
- A review from another model, provider, or effort level does not satisfy this
  gate. Every FAIL finding must be fixed, applicable checks rerun, and the same
  Luna/openai-codex/xhigh review repeated until PASS.

## General

- Never hardcode game maxima — everything numeric comes from game-settings
  JSON (spec §5).
- The C# `Models/` source is authoritative for domain semantics; verify
  against it, not memory.
- No edits inside `blades-in-the-sheets/` — it is reference material.
