# REVIEW-01-CROSS-ENTITY-LOCKS-UNDO — secondary writes and historical references

- Track: ada
- Parent: REVIEW-01
- Candidate: checkpoint e019e0ff
- Implementation agent: create-boundary-fix (omp worker)
- Independent review: not yet performed for this corrective diff

## Findings and implementation

Two review findings were confirmed: delete's secondary writes did not own the target mutex, and full historical undo could resurrect references to deleted entities. The source write audit covered every `Write_Entity`/`Atomic_Write` caller. Secondary entity writes are crew-member unlinking, related-clock unlinking, and owned-clock reassignment; other entity writes are protected primary mutations, batch writes, gated creation, or pre-server campaign initialization.

Deletion now atomically acquires a complete ordered `kind/id` set, then reads and writes all affected entities under those same mutexes. No partial set is held while waiting on a batch. An unbounded ordered registry replaces the fixed 64-slot registry and its unused revision-at-claim argument. A private membership gate freezes the creation/deletion footprint; create repeats cross-reference admission while holding it. Its `|` suffix cannot alias a valid path id. Import, repair, mutation, batch, and the idempotency guard have migrated to the revised claim interface; no compatibility shim remains.

Undo discovers reference locks, then reselects the actual newest snapshot under the root/reference locks. A changed footprint causes complete release before reacquisition. It checks character crew links and clock owner/related links before writes or snapshot consumption. Clock restoration also reuses the existing clock reference validator for owner shape, self-links, and duplicate links. Missing targets return existing 404 `NOT_FOUND`; invalid clock reference definitions retain existing 400 `VALIDATION`. Rejection leaves entity bytes, revision, history listing, and every historical snapshot unchanged.

The user approved rejection instead of silent reference normalization: OpenAPI character undo lines 823–832 and crew undo lines 1893–1902 promise full snapshot restoration and declare 404. Clearing fields would violate that promise and PAPERCLIPS §5.1.11/§5.4 require non-dangling links. Local crew cohort/contact ids and embedded healing clocks are not external entity references.

### Open contract decision: clock undo

The generic `/clocks/{id}/undo` route predates this change but has no OpenAPI operation. The user explicitly approved retaining it with the same validation/404 policy and documenting the contract gap separately. The frontend has no clock undo caller: `frontend/src/api/client.ts` calls `clockMutate` only for progress, reset, and delete. Character and crew undo callers remain. No frozen contract response or operation was changed.

## Regression evidence

New file: `conformance/suites/persistence/cross-entity-boundary.test.ts`.

- `CROSS-LOCK-001`: crew deletion versus 16 member note mutations.
- `CROSS-LOCK-002`: clock deletion versus 16 related-clock progress mutations.
- `CROSS-LOCK-003` / `004`: character/crew deletion versus 16 owned-clock progress mutations.
- `CROSS-LOCK-005`: deletion with 65 affected clocks.
- `CROSS-LOCK-006`: overlapping delete/batch lock footprints.
- `CROSS-LOCK-007`: public path id cannot collide with the private membership gate.
- `CROSS-LOCK-008`: delete versus 16 new owned-clock creates.
- `UNDO-REF-001`–`004`: deleted crew, character owner, crew owner, and related-clock references reject undo without consuming state/history.
- `UNDO-REF-005`: valid clock references permit exact restoration and one snapshot consumption.
- `UNDO-REF-006`: crew deletion versus 16 member undos never leaves dangling crew links.

Transport matches the existing synchronized curl concurrency regressions: all children spawn before request bodies are released; there are no retries or reduced concurrency. Initial new-test requests accidentally used `{delta: 1}` for progress and `{name: ...}` for clock update; only those new requests were corrected to the frozen `{segments: 1}` and supported `purpose` shapes. No frozen suite was edited.

Corrected pre-fix red: focused regression file exited 1 (`artifact://10587`, underlying output `artifact://10586`); acknowledged related/owned clock writes were lost and undo restored deleted references. After implementation, four focused files passed 39/39, then a new private-key isolation regression exposed a genuine 15-second self-deadlock before the `|` suffix fix (`artifact://10592`). Focused acceptance after that fix: build 2.07 seconds; 41/41 tests across four files, Vitest 8.76 seconds; combined command 11.41 seconds (`artifact://10594`). A subsequent small refinement reused the existing full clock-reference validator and rejected unsafe historical owner ids before filesystem lookup; the requested full acceptance sequence covers that final source.

## Approved HTTP burst capacity correction

The investigation was initially read-only. Source evidence identified AWS 21.0.0's convenience Start overload assigning default `Max_Connection = 5` (`aws-server.adb:968–993`), regardless of any ini value for that parameter. Zero-valued force/close settings derive 10/20 sockets (`aws-config.adb:393–413`); the acceptor adds two auxiliary sockets, giving 12/22. The listen/back queue is 64, not 32. Above the force threshold, first-header/idle timeouts shorten to two seconds.

`aws-net-acceptors.adb:114–120` puts newly accepted sockets into the same set as idle keep-alive sockets. At `:283–286`, overload removes the non-ready socket nearest its timeout; `:352–356` / `:600–607` shut it down without an HTTP response. This is a real accepted-socket shedding mechanism. The exact approximate-32/23-success/9-drop outcome is timing-dependent; source does not establish a fixed 32-request cap. No live diagnostic was rerun merely to confirm the user's report. AWS's lazy ini loading was also traced; no repository or default-home AWS ini overrides were found.

After receiving this evidence, the user explicitly approved `Max_Connection => 64` at the existing Start call and an unretried failing-first burst regression. Default derived force/close thresholds become 130/258 including auxiliaries; the backlog stays 64. Each default line stack reserves 1,376,256 bytes, so 64 lines reserve approximately 84 MiB of stack capacity versus 6.56 MiB for five, plus scheduling/per-connection overhead. This is not measured resident memory or an unbounded-overload guarantee.

New `AWS-BURST-001` in `conformance/suites/persistence/aws-connection-burst.test.ts` launches 64 normal-client concurrent batch requests without retries, asserts an HTTP 200/success result for every request, and checks all coin/revision increments. The earlier acceptance campaign was already running when approval arrived; final capacity acceptance is run only after that campaign restores its source, to avoid treating a mutant build as the failing-first control.

Failing-first control, before the setting change: `npm run test:ada -- --run suites/persistence/aws-connection-burst.test.ts` exited 1 with **43 of 64** requests failing `UND_ERR_SOCKET`; the test waited for every request to settle and retried none. Vitest 0.578 seconds, command 1.12 seconds (`artifact://10601`). The normal conformance client makes exactly one `fetch` per request (`conformance/src/api.ts:48–65`).

After the one-line Start setting change, the explicit Ada build passed in 0.87 seconds and the five-file focused suite passed **42/42**, including **64/64 HTTP 200/success responses, zero transport failures**, and all 64 coin/revision increments. Vitest 9.30 seconds, combined build/test command 10.77 seconds (`artifact://10603`).

The earlier pre-capacity full acceptance also passed: **528/528 Ada (62 files), 221/221 tooling (14 files), 794/794 frontend (20 files), 28/28 mutants killed**, source restoration PASS. Its combined sequence took 1907.36 seconds (`artifact://10599`); campaign revision `0b0c6647b70e`, timestamp `2026-10-05T08:46:56.114Z`, raw `agent-docs/test-audit/mutation-raw-2026-10-05T08-46-56-106Z.txt`. This is preserved historical evidence, not acceptance of the later capacity setting.

## Final acceptance

The final-source four-command sequence passed (`artifact://10605`):

- `npm --prefix conformance run test:ada -- --run`: **529/529**, **63 files**, Vitest **73.09 s**; baseline 514 plus 15 new regression cases.
- `npm --prefix conformance run test:tooling`: **221/221**, **14 files**, Vitest **74.76 s**.
- `npm --prefix frontend test -- --run`: **794/794**, **20 files**, Vitest **15.37 s**.
- `npm --prefix conformance run test:mutation`: **28/28 killed**, **0 survivors**, **P0 19/19 / P1 9/9**; all three baselines green at 529/221/794; byte-exact source restoration PASS and clean backend rebuilt after each Ada mutant.

The combined sequence took **1914.05 s**, not a standalone campaign or total task duration. Campaign revision `a0089ed51a38`, timestamp `2026-10-05T09:20:14.715Z`; generated `agent-docs/test-audit/mutation-results.json`, raw `agent-docs/test-audit/mutation-raw-2026-10-05T09-20-14-709Z.txt`. Independent review remains pending; no claim of review acceptance is made.

Audit command `node agent-docs/test-audit/validate-metrics.js && node agent-docs/test-audit/validate-finding-traceability.js && node agent-docs/test-audit/reconcile-audit.js` passed, exit 0: **158 metrics files**, **231/231 traceability**, **17/17 reconciliation**, **0 errors**, reconciliation **0 warnings**, **1624 current rows** retained. All three reported `ALL CHECKS PASSED`; command wall time **0.23 s**. Evidence metadata was then updated with these observed results.

## Mutation bookkeeping and constraints

Exactly six callback restoration hashes were stale: M05, M07, M08, M09, M14, M15. They now use SHA-256 `4fb01161fd458f983e58907168dd20465e67aab8c87570ac0807829c6d93d262`; all other catalog hashes were current. Mutation intent, killer tests, and anchors are unchanged. Historical MUT-02 evidence is preserved with an additive correction record.

No commits or VCS mutations; no contract/frozen-test, campaign-data, or inherited `.omo` edits. The only HTTP configuration change is the explicitly user-approved 64-connection Start argument; no new CLI/config surface, statuses, retries, or dependency fork. Documentation is in `docs/pages/contract/ops-audit.mdx`; structured measurements are in `tasks/metrics/ada/REVIEW-01-CROSS-ENTITY-LOCKS-UNDO.json`.
