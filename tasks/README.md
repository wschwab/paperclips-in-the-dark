# Task graph (spec §13)

One file per task, frontmatter: `id, title, deps, track, outputs, acceptance`.
Status and every dispatch/retry/gate decision go in each task's `## Log`
section, timestamped, written immediately — never held only in orchestrator
context. Per-task experiment metrics: `metrics/{track}/{task}.json` (spec §11).

Critical path: C0 → C1 → A0 → A1 → A2 → {F2, S0}. Z and F0/F1 parallelize.

Dispatch: Grok 4.5 (`pi`, openrouter) and GPT 5.6 Luna (`codex`, xhigh) only.
Orchestrator handles C0 itself; human decides contract freeze, Z0 go/no-go,
§10.3 escape hatch. A task is done only when its acceptance commands pass —
run them; never trust the implementer's claim. `contract/` and `conformance/`
are frozen for implementation tasks after C1.
