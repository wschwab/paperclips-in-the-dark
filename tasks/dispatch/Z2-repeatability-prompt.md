# Z2 bounded repair: persisted roster repeatability

Read `PAPERCLIPS.md`, repository `AGENTS.md`, `backend-zero/AGENTS.md`, and
`tasks/C2-repeatability-hardening.md` before editing.

Fix the Zero backend so the new backend-neutral regression passes:

```bash
cd conformance
BASE_URL=http://localhost:9657 npx vitest run suites/persistence/repeatability.test.ts
```

Observed red state on a clean `backend-zero/server/campaign-data`:
12 successful crew creations followed by `GET /api/campaign/roster` returning
500 and Zero logging `http handler failed`. Ada passes the same test. The roster
implementation in `backend-zero/server/src/z1_packed.0` uses a fixed 1,800-byte
output buffer and enumerates all crew IDs. The inherited back-to-back full-suite
failure is the same class: `CONTRACT-ROSTER-001` and
`SEMANTICS-CROSS-LINKS-001` return 500 on the second pass.

Scope:

- Edit only `backend-zero/`, `docs/pages/zero/`, `tasks/Z2-zero-server.md`, and
  `tasks/metrics/zero/` if needed.
- Do not edit `contract/`, `conformance/`, `data/`, or reference material.
- Make the minimal robust repair, respecting Zero 0.3.4 runtime/stack/ABI limits.
- Also investigate the observed `run.sh --data /tmp/...` mismatch: the wrapper
  exported the path but `/api/health` still reported and runtime writes still
  used `campaign-data`. Fix it only if narrow and causally understood; otherwise
  document it as a remaining gap.
- Follow red-green. Run `zero import .`, `zero check --json`, the focused test,
  and an actual HTTP runtime. Do not run the broad full suite.
- Do not perform VCS operations. Do not touch unrelated inherited artifacts.
- Stop every server you start by its recorded PID/session before returning.

Report files changed, exact commands/results, and remaining gaps.
