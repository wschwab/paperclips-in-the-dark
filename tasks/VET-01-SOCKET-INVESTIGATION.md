---
id: VET-01-SOCKET-INVESTIGATION
title: Investigate accepted sockets and preserve failed-run server logs
deps:
  - VET-01
track: ada
outputs:
  - conformance/scripts/managed-run.mjs
  - conformance/src/managed-log-retention.test.ts
  - docs/pages/ada/socket-investigation.mdx
acceptance:
  - Cold original-candidate two-cycle runs preserve diagnostic evidence
  - Failed managed runs retain complete server logs and print the retained path
  - Success and failure still stop owned processes and remove temporary data
  - Fresh current-source two-cycle VET extra passes without client retries
---

# VET-01-SOCKET-INVESTIGATION — socket causality and failed-run evidence

- Track: ada
- Parent: VET-01
- Candidate: bc63af5f (original report); current corrective working copy
- Implementation agent: vet-fix-2.RecoverSocket (omp worker)
- Status: failed-run log retention fixed; focused red/green observed by orchestrator; original socket cause unresolved
- Independent review: pending
- Documentation: `docs/pages/ada/socket-investigation.mdx`
- Metrics: `tasks/metrics/ada/VET-01-SOCKET-INVESTIGATION.json`

## Log

### Investigation progress (2026-10-05)

Read root/backend guidance, previous vet-fail-fix history, original wave10 failure,
subsequent syscall traces, and pinned AWS 21.0.0 core sources. The original
port41011/PID104411 cycle has no retained server log, syscall trace, request
clock timestamps, or nested client socket details. Its earliest CROSS-LOCK-008
empty reply precedes the later burst timeout. Subsequent traced cycles are not
proof of the original cause.

Historical traces peak at66 live accepted sockets, below the derived256 close
threshold with64 workers. The first historical traced burst returns41 HTTP200
and23 HTTP400 headers within0.269s. Bounded batch lock admission plausibly
explains400s, but those response bodies were truncated; this remains inference.
AWS worker Force_Clean independently activates at zero free workers, with a
forced2s versus normal7s client-header timeout. Neither mechanism was observed
as an unexplained server shutdown in the supplied traces. Syscall entry time
alone can misorder a blocking accept with an earlier descriptor lifetime;
peer ports and syscall completion are necessary.

Temporary diagnostic observer and trace wrapper prepared under `/tmp`. Parent
owned all executions. Resumed old-binary traced2cycles passed540/540 each;
5414 starts/5413 responses and only one pre-readiness ECONNREFUSED. All280 batch
requests receive headers,276HTTP200/four intentional schema HTTP400. No bounded
contention400 occurs in this run. Observer-only8cycle attempt hit execution
deadline: three completed Vitest children exit0;217ECONNREFUSED errors comprise
three readiness polls and214 after interruption. No UND_ERR_SOCKET observed.
No eight-cycle or final current-source acceptance claim.

The interrupted run's server log was manually copied and SHA256 matched source
and archive: `0322f7649e62db69531e9d44a44f563325a59451ef9e1f05ca6bf1bb2e2b4354`.
After parent's ownership snapshot confirmed no owned process, removed only
`/tmp/pitd-managed/2026-10-05T15-50-16-759Z-05e20408`.

## User-requested evidence-loss correction

The original launcher actually deleted server.log on failure. Added nonfrozen
`conformance/src/managed-log-retention.test.ts` before changing launcher source.
Parent ran exact red command:

```sh
npm --prefix conformance run test:tooling -- src/managed-log-retention.test.ts
```

Observed red exit1: three expected failures for missing retainedLog (test
failure/readiness failure/SIGTERM), one success control. Evidence:
`agent-docs/test-audit/vet-evidence/bc63af5f-resumed-2026-10-05/managed-log-retention-red.log`.

Then changed `conformance/scripts/managed-run.mjs`: after owned children stop,
copy failed appended log to
`agent-docs/test-audit/managed-run-logs/<runId>-server.log`, print absolute
`[managed-run] retainedLog=...`, remove temporary run data/manifests. Ordinary,
setup, fatal, and signal failures share policy; earlier failed cycle remains
sticky. Successful runs retain nothing. Preservation errors surface while
finally cleanup removes temporary data. Existing cleanup/no-orphan expectations
are intentionally unchanged; no frozen tests or API behavior altered.

Parent ran the same green command:4/4, exit0,2.16seconds. Evidence:
`agent-docs/test-audit/vet-evidence/bc63af5f-resumed-2026-10-05/managed-log-retention-green.log`.
Worker ran no builds/tests/formatters. No pitd.adb change, arbitrary max bump,
unlimited keepalive thresholds, client retries, or unrelated260socket test.

## Exact next commands and unresolved acceptance

Parent owns serial execution. Original-candidate cold-build two-cycle
observations below replace the earlier unexecuted focused-loop proposal;
that temporary proposal script was removed. Recording the original finding
as unreproduced is an orchestrator decision, not human approval or a waiver.

Final current-source acceptance still requires:

```sh
npm --prefix conformance run test:ada -- --cycles 2 -- --run
```

And launcher/tooling integration verification:

```sh
npm --prefix conformance run typecheck
npm --prefix conformance run test:tooling
```

A future transport failure must be correlated to retained server log, request
path, client local port, socket lifetime, and process events, then receive a
cause-specific deterministic failing-first regression before a server fix.
The original socket ticket is not claimed fixed by retention or green reruns.

## Cold original-candidate reproduction (2026-10-05)

- Orchestrator executed three fresh disposable jj workspaces at `bc63af5f` serially in an exclusive window with the UI/Luna browser work paused. Each built the previously absent workspace server binary, then ran the first server start and two complete Ada cycles with preserved client timestamps/server logs. All six cycles passed **540/540** (**64/64 files**) and all three two-cycle commands exited 0. Build times **3.75 / 3.74 / 3.75 seconds**; two-cycle command times **153.97 / 151.14 / 152.25 seconds**. Background runner used timeout 0; no deadline interruption.
- Evidence: `agent-docs/test-audit/vet-evidence/bc63af5f-resumed-2026-10-05/cold-{1,2,3}/` (commands, cold-build logs, full two-cycle logs and observed request/server logs), plus `cold-summary.json`. All three owned workspaces were forgotten and removed; no unrelated workspaces touched. UI/Luna window released afterwards.
- Original failure remains **unreproduced**, per orchestrator disposition, not a human waiver or a proved server fix. No speculative AWS limit change landed. Next exact current-source acceptance command: `npm --prefix conformance run test:ada -- --cycles 2 -- --run`; it still must pass.

## Fresh current-source timeout escalation (2026-10-05)

The orchestrator's final first fresh Ada invocation passed540/540; the second
failed CROSS-LOCK-008 at15007ms (539/540), a test timeout rather than a reported
socket error. This invalidates final acceptance; previous green observations
are not a waiver. Evidence is `pass2-final-ada-cycle-2.log` in the resumed root.

Retention now makes the matching server log available:
`agent-docs/test-audit/managed-run-logs/2026-10-05T22-10-16-457Z-7535b1e3-server.log`.
Its CROSS-008 section records one clock create200, owner deletion200, and
fifteen clock create400 outcomes: all17 selected response outcomes were logged
before callback return. Neither actual callback return nor HTTP delivery to
each curl child is established; callback lock deadlock is not proved.

Prepared transparent diagnostic-only PATH curl wrapper (real/usr/bin/curl,
unique trace-ascii file and trace-time), precise server syscall trace
(-ff -ttt -T -s4096), and observer intercepting execFile itself, recording
spawn/stdin finish/stdout chunks/exit/close/callback completion. The old
spawn-only observer did not intercept execFile's internal spawn.

Exact next main-owned command,20fresh targeted invocations with no retries:

```sh
node /tmp/pitd-socket-phase-loop.mjs /home/x/code/paperclips-in-the-dark/agent-docs/test-audit/vet-evidence/bc63af5f-resumed-2026-10-05/cross008-wiretrace-20
```

Default selector is CROSS-LOCK-008; optional third argument `all` runs the
entire cross-entity file if preceding worker state matters. This is diagnostic
reproduction, not a deterministic cause-specific red test or an executed
result. Main owns execution. No server/startup/source change follows from the
new timeout without request/response IO evidence.

## Confirmed load-only validation defect and resume checkpoint

The full busy-roster body capture reproduced CROSS-LOCK-003's valid
`clock.progress` request rejected with **400 VALIDATION / unknown field**,
not a transport error. Evidence:
`crossfile-busy-roster-body-20/run-04/passive-client-3449058.jsonl`,
curl3449169 at1791241323.396, with unchanged revision1 and segments0.
The previous full-file busy run also rejected CROSS-LOCK-004 progress400;
neither valid-request rejection is waived or filtered out.

`pitd_ops.adb309–336` contains package-global `Allowed_Keys` and
`Allowed_Passed`. Every `Check_Fields` writes those variables, then its
JSON-map callback reads them. Concurrent validators can therefore use a
different request's allowed set and reject a valid field. The correction will
make the callback and state per-call, without locking or contention.
A deterministic two-task JSON-map rendezvous regression is being prepared
before any production edit; a separate read-only audit covers other
request-path package state and the canonical/key-table concern.

After quota reset, all64 exact owned orphan server tracees from prior
completed strace diagnostics were terminated and verified absent. Native
busy-roster run04's server3448948 and Vitest3449021 were already absent.
The development server56773 and human browser are intentionally untouched.
Source/heavy-job freeze is reaffirmed. Previous diagnostic results are not
final acceptance; all final gates will restart after red-green correction.

## Deterministic validator red-green

Added `validator_concurrency_tests.gpr`, Ada driver and test-only map adapter
under `backend-ada/server/tests/`, and additive tooling test
`TOOLING-VALIDATION-CONCURRENCY-001`. Initial harness-only executable ENOENT
was corrected by explicit test-project `Exec_Dir`; it is not the causal red.
The real red then failed **1/1** with **clock.progress: unknown field** for
the valid segments body, exit1 in0.95s; full output is
`validator-concurrency-red.log` under the resumed evidence root.

Moved the boolean and callback into `Check_Fields`, reading its existing
local `Allowed` accumulator. Removed both global variables and redundant
shared reset. No lock, contention, extra global copy, production hook,
schema/status/retry/deadline/frozen-suite changes.
The same focused command passed **1/1**, exit0 in4.06s: two deterministic
checks, **64-task / 64,000 valid-body hammer**, and preservation of real
unknown-field rejection. Structured observation:
`validator-concurrency-green-observation.json`.

Request-path package-state audit remains pending. Once resolved, refresh
every catalog-target restoration hash, execute full28 mutation campaign,
then fresh typecheck, full benchmark, two separate consecutive fresh Ada
commands, two-cycle extra, tooling, frontend and three validators.
The deterministic validator fix is not a proved cause for the original
transport failures or CROSS-LOCK-008 timeout; fresh gates remain necessary.

## Shared-state audit disposition

Read-only inventory of server/request packages found no additional unguarded
request-path package globals. Protected state includes entity/request locks,
idempotency/preview stores, snapshot/temp counters, crash hooks and the
generated validator's complete Reset/Validate/result sequence. Roots and
settings caches are initialized before listening. Startup-only
`S_Extra_Allowed/S_Extra_Bad` are intentionally unchanged: configuration runs
synchronously before `AWS.Server.Start`.

Direct GNATCOLL26 dependency review shows each JSON object owns an ordered
key map; key insertion/mapping does not use a process-global canonical table.
String refcounts are atomic and delegate to GNAT16 atomic Seq_Cst add/sub
intrinsics. This is ownership safety, not a blanket guarantee for concurrent
mutation of shared JSON containers. The scout's statement that callback
values are fresh/non-shared was overbroad; parent review explicitly qualifies
it. Evidence: `request-shared-state-audit.json` and
`request-shared-state-audit-parent-review.json`.

The deterministic causal regression invokes integer/boolean validators, not
N_Str/N_Str_Required. No further source correction is required from the audit.
The fresh corrected-source full28 campaign is running as bg_53; next exact
command after28/28 is `python /tmp/pitd-vet-final-gates.py pass3`.

## Fresh corrected-source acceptance

Full mutation **28/28**, P0 19/19/P1 9/9,0 survivors and source restoration
PASS. Fresh pass3 typecheck and all4 benchmark scales PASS; two separate
consecutive Ada commands **540/540 each**, two-cycle extra **540/540 twice**;
tooling **233/233**, frontend **806/806**; validators **163/231/17**,
errors0/warnings0. CROSS003/004/008 pass all four final Ada cycles;
008 times110/84/85/101ms.
Durable summary: `pass3-final-observed-summary.json`; full command records:
`pass3-final-gate-results.json`; individual logs and final benchmark copy
remain in the resumed evidence root.

The deterministic unknown-field defect is fixed. Original transport/timeout
causality remains unproved and prior failures are retained, not erased by
these fresh required gates. Broader release-review disposition is Main-owned.
All13 owned temporary scripts were archived under
`retired-diagnostic-scripts/` and removed; empty owned curl-wrapper directory
removed. The development server56773 was not stopped/restarted.
Final recorded-evidence validators subsequently PASS163/231/17, errors0/warnings0,
exit0 in2.40s; log `pass3-final-record-three-validators.log`. Assigned
corrective work is complete; broader release review remains Main-owned.
