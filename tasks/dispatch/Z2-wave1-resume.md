# Z2 wave 1 resumption note

## State

- Working-copy change: `Z2: harden repeated conformance runs`.
- New cross-backend regression:
  `conformance/suites/persistence/repeatability.test.ts`.
- Ada result: 1/1 green after creating 12 crews.
- Zero result on a clean default data directory: all 12 creates succeed, then
  `GET /api/campaign/roster` returns 500 and Zero logs `http handler failed`.
- Suspected boundary: `roster` in
  `backend-zero/server/src/z1_packed.0` has an 1,800-byte response buffer while
  enumerating every persisted crew.
- Secondary observed gap: `backend-zero/server/run.sh --data /tmp/...` exported
  the requested directory, but health and persisted writes still used
  `campaign-data`. This was not repaired in wave 1.
- DeepSeek v4 Pro was active in the saved session despite producing no terminal
  output: between 04:51:32Z and 04:51:58Z it completed five reasoning/tool-call
  cycles while reading the spec, task, launcher, and Zero sources. `pi -p`
  buffered these events. The orchestrator interrupted it based on a false
  liveness diagnosis. No quota/credit limit was reported.

## Next command

Start the next separately authorized wave by reviewing the clean diff and then
resuming the existing session:

```bash
jj diff
pi --session 019f8303-bd37-7ded-a87a-58f59ca0bcc5 -p \
  "Continue the bounded Z2 repair. The prior interruption was an orchestrator liveness mistake; retain your investigation and follow the original prompt."
```

Expected result: a backend-only repair, successful `zero import .`, successful
`zero check --json`, and the focused repeatability test green against a live
Zero HTTP process. Do not run the broad suite until the focused test is green
and the diff has been reviewed.

The pre-wave generated-data snapshot is preserved at
`/tmp/pitd-zero-data-backup.IR6XA9/campaign-data`. The clean wave-1 reproduction
is preserved separately at
`/tmp/pitd-zero-wave1-repro.VV3BkO/campaign-data`. No generated default data
directory remains in the working tree.

For liveness, inspect growth and timestamps in the saved JSONL session. Do not
infer inactivity from an empty `pi -p` terminal stream.
