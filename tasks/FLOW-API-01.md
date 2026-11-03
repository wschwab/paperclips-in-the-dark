# FLOW-API-01 — Server-side guided score flow

Status: implementation complete; final acceptance/review recording in progress, not yet pushed. Contract and conformance changes authorized by the human on 2026-11-01.

Design: `docs/pages/contract/flow-api.mdx`.

## Approved scope

- Per-scoundrel pure GET flow projection with mode/kind/step/revision, ordered navigation, typed action inputs, completion operation and shared guidance.
- One atomic `flow.step.complete` operation applies explicit awards and advances the existing cursor.
- Check character and every touched linked-crew revision; dice and GM judgment stay external; ordinary operations are never mode-gated.
- Durable completion receipts prevent double awards across restarts and alternate idempotency keys.
- Recoverable cross-entity commit and guarded grouped undo keep awards, cursor, snapshots and receipts consistent.
- Shared guidance moves from frontend constants to served data/settings; no hardcoded maxima.
- Frontend clean cutover to the projection; remove duplicate step sequencing and shared text.

## Implementation decisions

- Extend the existing character mode/cursor, not a campaign-wide phase model.
- Explicit award values are deltas. Omitted/zero crew awards do not mutate the crew. Crew revisions are required when the crew is touched.
- One active receipt per flow instance/step. Back/direct navigation does not re-award a completed step.
- Undo checks all participants remain at the linked transaction tip, restores the whole group with fresh revisions and marks the receipt undone. Replays of an undone completion ID do not re-award; deliberate re-completion uses a new ID.
- Existing error envelopes/statuses only. Existing atomic XP/loadout validation reused.
- End Score cleanup and budget reset stay at Resolution entry. Session expression clear stays with successful Scoundrel XP completion, not skip.
- Preserve the exact `{kind,step}` modeFlow shape. New canonical root `flowProgress` stores `{instanceId,kind,planApproach,notes:[{step,text}]}`; legacy omission is a silent in-memory default.
- A receipted step projects navigation-only existing mode operations. A fresh completion ID cannot award it again (`VALIDATION`/400); exact old ID replay returns its durable receipt.
- Batch members add optional `revision`, required only for guided completion. The enclosing batch stages its side effects and receipts and commits them together.
- History wire fields remain unchanged; snapshot-to-transaction group metadata is external.

## Coordination

`playtest-ui-fixes` owns CREW-COHORTS-03 and Sol review slots. Initial integration used its `e4d73b3c` boundary. After the quota interruption, the human resumed this card on 2026-11-02; the current working-copy parent is already the landed cohort revision **`e224e50e`**. Its summary change is committed in that parent, not included in this card.

Freeze correction: the worker initially interpreted mutation freeze as pinned-target files only and added the contract/schema/oracle changes plus isolated new backend packages/shared data during the peer's campaign. The peer clarified that **all** contract/conformance/backend/frontend edits affect mutation oracles; all source edits then stopped and both children were notified. A campaign overlapping those schema changes must not be claimed as a clean baseline. The final FLOW campaign must run against a frozen, fully integrated tree.

Source release: the peer moved its clean campaign to isolated `/tmp/c3-mutation-ws` at `e4d73b3c` and explicitly released the main tree. Backend integration began only after the 16-case conformance red below; frontend integration began only after its 8-case red.

Durability evidence will include an opt-in managed two-cycle recovery oracle: first cycle completes Payoff while the existing crash-mid-write hook targets the crew publication after the character write; second cycle on the same harness-owned directory asserts both participants/cursor/receipt recover and the old completion ID cannot award twice. Keep this crash oracle isolated from the ordinary concurrently executed suites.

## Evidence and acceptance

Red conformance evidence, schema diff, additive frozen fixture/list amendments, generated artifact list and exact gate counts will be appended as exercised. Required gates: Ada + two-cycle; tooling; gnatprove; vitest; tsc; frontend build; browser 6/6; Chromium 3 sizes × 3 themes; validators; Vocs; full mutation 28/28 with refreshed pins. Independent Sol review is owned by `playtest-ui-fixes`, not this worker.

### Red-first evidence

- `npm run test:ada -- -- run suites/semantics/flow-api.test.ts`: **16 failed / 16**, every oracle reaches the missing GET projection and observes HTTP 404 instead of 200. Setup succeeds; no decoder/setup false red. Evidence: `tasks/metrics/contract/FLOW-API-01-red.log`.
- `FLOW_RECOVERY_ORACLE=1 npm run test:ada -- --cycles 2 -- run suites/persistence/flow-api-recovery.test.ts`: recovery oracle red at the same missing GET endpoint; canonical launcher controls both cycles. Evidence: `tasks/metrics/contract/FLOW-API-01-recovery-red.log`.
- `cd frontend && npx vitest run src/api/game-mode-client.test.ts src/pages/game-mode-sheet.test.ts -t FLOW-API-01`: **8 failed, 89 skipped / 97** (filter). Absent flow API methods/projection UI and missing required progress validation. Evidence: `tasks/metrics/contract/FLOW-API-01-frontend-red.log`.
- Additional red oracles were added and exercised before their implementation seams: `FLOW-API-017` typed required action schemas (1 failed/16 filtered), `FLOW-API-018` chained monotonic grouped undo (1 failed/17 filtered), `FLOW-API-019` shared-crew revision race (1 failed/18 filtered). Each fails at the absent GET endpoint, not setup. Logs: `FLOW-API-01-schema-red.log`, `FLOW-API-01-chained-undo-red.log`, `FLOW-API-01-concurrency-red.log` in the same metrics directory. Total new ordinary flow oracles: **19**; isolated crash/restart oracle: **1**.
- Resume added `FLOW-API-020`: legacy stored character omitting flowProgress must expose silent in-memory defaults at unchanged revision, and detail/projection reads must leave stored bytes untouched. Red observed HTTP 200 with missing progress instead of defaults (1 failed/19 filtered); `tasks/metrics/contract/FLOW-API-01-legacy-red.log`. Total now **20 ordinary flow cases plus 1 isolated recovery case**.

### Authorized contract/tooling amendments

- Character schema: previously required `mode`, exact `modeFlow` and `downtime`; add required `flowProgress` with silent legacy migration defaults. `modeFlow` shape is unchanged.
- OperationResult: previously no guided projection/receipt; add optional typed `flow` and `receipt`, retaining the exactly-one-entity DTO convention.
- OpenAPI paths: **116 → 118**, adding GET flow and POST flow.step.complete. ENDPOINT-MAP-001 exact count amended additively to 118.
- Batch member properties: `{entity,id,op,args}` → same plus optional `revision`, required for guided completion members only.
- Strict validator registry: existing schemas → same plus `flow.json` / named `flow`; conformance Effect mirror gains corresponding required stored progress and optional result fields.
- Golden character: no flowProgress → `{instanceId:\"\",kind:\"none\",planApproach:\"\",notes:[]}`; no existing assertion weakened.
- Human authorized the following semantic parity replacement on 2026-11-01: `characterXpResolve` disposition **human → agent**; `characterFlowStepComplete` added as **human**; PARITY-HUMAN-003 exact list replaces `characterXpResolve` with `characterFlowStepComplete`. The `xp.resolve` endpoint and its tests remain intact. The UI calls the new atomic completion rather than a separate XP award plus cursor chain.
- Human authorized on resume: GAME-MODE `gameplay()` bookkeeping exclusions **`revision,updatedAt,mode,modeFlow,canUndo,historyCount,lastSnapshotId` → same plus `flowProgress`**. Every equality assertion and every gameplay field comparison stays unchanged; only newly defined workflow bookkeeping is excluded like the existing cursor.
- Human authorized additive ERR-MISMATCH-006 registry amendment: local Ajv inputs **`operation-result,common,character,crew,clock` → same plus `flow`**. All error-union/mismatch assertions stay unchanged; the new referenced progress/result schemas now resolve.
- Human authorized lifecycle browser oracle cutover on 2026-11-02: expected successful POST **`/ops/xp.resolve` → `/ops/flow.step.complete`** and the adjacent explanatory comment only. Every checkpoint ID, UI action, status assertion and undo check stays unchanged. The separate xp.resolve endpoint tests remain intact.

### Integration observations

- First backend integration build/focused suite: **20/20 passed**.
- First frontend focused run: **96/97 passed**; the one failure expected pre-atomic wording `of 5 load committed` while the now-uncommitted draft correctly says `of 5 load proposed`. Updated only that wording assertion, retaining the selected allowance and not-absolute-max assertions.
- Full frontend suite passed; full tooling passed (exact final counts below). First full Ada run was **654 passed, 8 failed, 1 skipped**: four new-bookkeeping helper comparisons and one missing local schema registration (authorized fixes above), plus three stale cohort import/decode failures while the peer landed review fixes mid-run. This is not claimed as acceptance; final Ada reruns follow the peer's isolated commit/rebase and source freeze.
- Real Chromium exposed the passive GET-flow rerender seam: typed stress-clear amount 5 reset to current stress 3, so OVERINDULGED was never raised. A delayed-projection unit oracle failed red on that exact 5→3 reset. The fix snapshots/restores section-scoped ordinary form drafts only for passive projection renders, including numeric-input focus and text selection; mutations/navigation never restore old drafts. Two focused continuity cases pass; the untouched overindulgence assertions now pass in the full browser suite.
- Source review found grouped undo did not admit every secondary document: a deleted participant produced an invalid revision-0 stale envelope, while a malformed participant could be overwritten. `FLOW-API-021` and `022` failed red (409 instead of 404; 200 instead of 422), then passed after missing/degraded participant classification and existing status mapping. Final ordinary flow oracle count is **22**, plus the isolated recovery oracle.

### Exercised acceptance before isolated mutation/review

| Gate | Observed result | Evidence |
| --- | --- | --- |
| Full managed Ada two-cycle | **664 passed + 1 intentionally isolated recovery case skipped, per cycle (2 cycles)** | `FLOW-API-01-ada-two-cycle.log` |
| Isolated crash/recovery two-cycle | **1 passed in each cycle (2/2)**; crash after character/before crew publication, startup recovery and durable replay | `FLOW-API-01-recovery.log` |
| Full frontend Vitest | **1040/1040**, 43 files | `FLOW-API-01-frontend-vitest.log` |
| Frontend tsc + production build | **pass** | `FLOW-API-01-frontend-build.log` |
| Conformance tsc | **pass** | `FLOW-API-01-conformance-tsc.log` |
| Full tooling | **233/233**, 18 files | `FLOW-API-01-tooling.log` |
| Ada CI/core/launch/SPA/proof | **pass; 246 core proof checks** | `FLOW-API-01-ada-ci.log` |
| Real browser journeys | **6/6** (all checkpoint assertions retained) | `FLOW-API-01-browser.log` |
| Chromium flow matrix | **9 combinations, 126 states; zero document/popup horizontal overflow; zero page errors** | `FLOW-API-01-chromium.log`; `docs/public/evidence/flow-api-01/numeric.json` |

All logs above are under `tasks/metrics/contract/`. Chromium exercised Planning → Loadout → Engagement → Score → six Resolution steps → Downtime in every viewport/theme, asserting one Payoff POST applies crew Coin/Rep and personal share together with observed revisions. Personal remains present. Compact dialogs intentionally scroll vertically; separate XP-controls/Awards-Next captures prove bottom controls reachable. Screenshots are under `docs/public/evidence/flow-api-01/`, linked from the design page; the implementer inspected the nine-case contact sheet and representative full-size captures.

### Remaining acceptance recording

Final canonical generators and tooling parity pass (**233/233**), Vocs builds successfully, and metrics/traceability/audit-reconciliation validators all exit 0. Evidence: `FLOW-API-01-vocs.log`, `FLOW-API-01-metrics-validator.log`, `FLOW-API-01-traceability-validator.log`, `FLOW-API-01-audit-reconcile.log`. Isolated mutation 28/28, independent pinned review, final explicit-path record commit and both mirror pushes are still to be recorded. This is not a completed-card claim until those gates are observed.

Mutation pin preparation: observed SHA-256 values refreshed for **7 changed targets in 15 catalog entries** (callback, normalizer, ops, stored reader, endpoint-schema-map, frontend API client and character-detail). Mutation definitions and test commands are unchanged. The implementation commit is the immutable base for the isolated campaign; no source mutation will run in the main workspace.

### Quota checkpoint and resume

Both implementation workers stopped with `usage_limit_reached` after writing partial backend/frontend integration; no green gate or completion was claimed. The human reported a reset and instructed resume from the uncommitted tree. Backend/frontend owners were revived with the same slice ownership and no-verification instruction. Parent runs all integration gates after they finish. The final mutation campaign uses a separate `/tmp/flow-api-01-mutation-ws` jj workspace pinned to the completed immutable revision, never the peer's `/tmp/c3-mutation-ws` or the live working tree.

Commit only explicit owned paths through jj; no abandon, restore or force push. Push main to origin and rad-agent, then reconcile Radicle remote state.

### Combined-head gate record (FLOW on CREW head, pinned `70423dc5`)

FLOW-API-01 was rebased onto CREW-COHORTS-03 `09748d40` (linear history, catalog conflict resolved by recomputing pins). Gates in a fresh workspace, logs under `tasks/metrics/contract/FLOW-API-01-combined-*.log`:

- Ada CI `backend-ada/ci.sh`: exit 0, `all checks proved (246 checks)`. The first attempt failed on the launch-path port race (`ada-ci-attempt1-launchpath-flake`); a rerun was green.
- Tooling 233/233; conformance typecheck 0; Ada two-cycle green; recovery oracle (`FLOW_RECOVERY_ORACLE=1`) green; browser journeys 0; frontend vitest 1040/1040; frontend build 0; Chromium 3×3 probe 0; Vocs 0.
- Validators: `validate-evidence` green after a CREW card path citation fix; metrics, traceability, and audit reconcile 0.
- Isolated mutation 28/28 at `70423dc5`: P0 19/19, P1 9/9, 0 survived. Baselines green: backend-ada 671, conformance 233, frontend 1040. Log: `FLOW-API-01-combined-mutation.log`.
- Harness caveat: the backend-ada baseline counts skipped tests as non-green. The recovery oracle is skipped unless `FLOW_RECOVERY_ORACLE=1`, so the campaign was run with that variable exported; test commands and mutant definitions are unchanged. Two earlier campaign attempts failed the backend-ada baseline with a nonzero Ada test exit (`mutation-attempt1/2`). The third attempt passed with the same code. The failing test was not captured; treat it as an unexplained intermittent flake.
- Sol 6.1 xhigh independent review: pending (codex usage limit). It will run on this same head once codex resets. No acceptance is claimed beyond the gates above until that verdict is recorded.

## Review rounds and current gate record (supersedes the pending items above)

- Round 1 (Sol 6.1 xhigh) at `70423dc5`: FAIL, 8 findings. Fixed in `161e9b48` and `e462f32d`.
- Round 2 at `ffb78ab0`: FAIL, 6 findings. Fixed in `f320a85f`: flow completion mismatched Idempotency-Key returns 400 `VALIDATION` (`FLOW-API-025`); malformed stored crew no longer raises during lock discovery (`FLOW-API-026`); the roster is a publication-consistent snapshot via `Publication_Gate`; grouped undo refuses an out-of-bound cohort (`FLOW-API-024`); frontend draft identity includes the crew id and undo reloads linked crew passively. Recovery was rerun with `FLOW_RECOVERY_ORACLE=1` (`FLOW-API-01-r3-recovery.log`, two non-skipped passes). The identity and passive-reload fixes have no deterministic red test; the publication race has no deterministic oracle. These are judged by code review, not by a red test.
- Round 3 at `f21a6f00`: PASS, three P2 notes. (1) Roster isolation covers transactional publishes only. The non-flow batch write loop and delete's secondary writes are not bracketed by `Publication_Gate`. This is a known residual, not fixed. (2) Card lacked round history; recorded here. (3) Non-flow idempotency mismatch was unpinned; now asserted as 409 in `conformance/suites/persistence/idempotency.test.ts`.
- Round 4 at `2104ad6d`: PASS, three P2 notes, all addressed. (1) Ada counts were not recorded. Now: r3 two-cycle 677 passed + 1 skipped per cycle, r4 679 + 1, r5 680 + 1 (the +1 is WRITE-002 in r5). (2) Batch members were not covered by the crew cohort bound (CREW round-9 P1). Fixed in `Validate_Final` (`pitd_callback.adb`) with red test `CREW-COHORTS-03-WRITE-002`. Flow-containing batches re-verified at round 5. (3) The chromium probe lived outside the repo. Moved to `conformance/scripts/flow-api-01-chromium-probe.mjs`; the Chromium binary comes from `CHROMIUM_PATH`.
- Round 5 at `20c12483`: review pending on the final head; the verdict is recorded here once it lands.

Gate record at `20c12483` (logs `tasks/metrics/contract/FLOW-API-01-r5-*.log`): ada-ci, tooling, conformance-tsc, ada-two-cycle (680 passed + 1 skipped per cycle), recovery (`FLOW_RECOVERY_ORACLE=1`), browser-journeys, frontend-vitest 1041/1041 (43 files), frontend-build, vocs, validators, validate-evidence, and chromium-matrix (9 matrices, 126 states, zero failures) all exit 0. Isolated mutation 28/28 (`FLOW-API-01-r5-mutation.log`: P0 19/19, P1 9/9; pins refreshed for changed files).

Mutation baseline note: the older `FLOW-API-01-combined-mutation.log` 28/28 is invalid, because the recovery oracle killed the shared server during the campaign. The valid earlier baseline is `FLOW-API-01-r2-mutation.log` at `becd1c99`.
