# Z2 narrow fallback: persistent ID allocation after deletion

Read `PAPERCLIPS.md`, repository `AGENTS.md`, `backend-zero/AGENTS.md`, and
`tasks/C2-repeatability-hardening.md` before editing.

DeepSeek's reviewed backend diff already changes:

- `z1_packed.0::roster` output buffer from 1,800 to 14,000 bytes;
- `config.0::data_dir` to honor `PITD_DATA`.

Do not revert or broaden those changes. The focused roster test passed twice,
and a fresh full conformance run passed 132/132. A second full run kept every
roster test green but exposed persistent ID reuse after deletion.

Fix only the new red regression:

```bash
cd conformance
BASE_URL=http://localhost:9657 npx vitest run suites/persistence/repeatability.test.ts
```

`PERSISTENCE-REPEATABILITY-002` is green on Ada and red on Zero. Root evidence:
`z1_packed.0::next_id` derives the next numeric suffix from current index line
count. Deleting an entity removes its index line, so a later create may reuse a
still-live ID and overwrite or lose that entity. Make allocation monotonic over
the persisted IDs; do not hardcode a small maximum.

Constraints:

- Edit only `backend-zero/`, `docs/pages/zero/`, `tasks/Z2-zero-server.md`, and
  `tasks/metrics/zero/` if needed.
- Do not edit `contract/`, `conformance/`, `data/`, or reference material.
- Minimal Zero 0.3.4 repair. Follow the required import/check/runtime loop.
- Do not use `rm`, `rm -rf`, `pkill`, `killall`, or broad process matching.
- If clean state is required, use a brand-new relative `--data` directory name.
  Do not delete or overwrite an existing data directory.
- Start and stop servers only with the exact PID you capture.
- Run only the focused repeatability test; the orchestrator will run broader
  acceptance after reviewing the diff.
- Do not perform VCS operations.

Report exact changes and results, and ensure no server remains running.
