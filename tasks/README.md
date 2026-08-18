# Task graph (spec §13)

One file per task, frontmatter: `id, title, deps, track, outputs, acceptance`.
Status and every dispatch/retry/gate decision go in each task's `## Log`
section, timestamped, written immediately — never held only in orchestrator
context. Per-task experiment metrics: `metrics/{track}/{task}.json` (spec §11).

## Context-rollover checkpoint

At every green wave boundary, the task logs and metrics must collectively make
a fresh orchestrator sufficient. Before rolling context, record:

- the landed revision and both remotes' state;
- completed cards and their acceptance evidence;
- remaining cards and dependency state;
- frozen interfaces and decisions;
- active failures with exact reproduction commands;
- paths owned by any live workers; and
- the next dispatch batch.

The successor verifies this checkpoint against repository state and continues
automatically. A rollover is not a user-visible pause. Do not replace the
checkpoint with a prose recap held only in chat.

Critical path: C0 → C1 → A0 → A1 → A2 → {F2, S0}. Z and F0/F1 parallelize.

Dispatch: Grok 4.5 (`pi`, openrouter) and GPT 5.6 Luna (`codex`, xhigh) only.
Orchestrator handles C0 itself; human decides contract freeze, Z0 go/no-go,
§10.3 escape hatch. A task is done only when its acceptance commands pass —
run them; never trust the implementer's claim. `contract/` and `conformance/`
are frozen for implementation tasks after C1.
