# REVIEW-01-WRITE-REFERENCE-ADMISSION — shared live-document write admission

**Status:** Implementation acceptance passed: full suites, three validators and all 28 mutants. Independent corrective review remains pending.

- Track: ada
- Parent: REVIEW-01
- Source candidate: checkpoint ba03c32e
- Implementation agent: create-boundary-fix
- Independent review: pending

## Decision and implementation

Import apply bypassed reference validation; audit also found ordinary mutation, batch and secondary deletion could repersist already-dangling documents. The shared `Pitd_Common.Write_Entity` now enforces task-owned primary mutex, route identity, membership ownership for new rows, and complete character/clock reference validation before its private atomic writer. The registry and clock reference validator moved to Common; obsolete callback/ops definitions and the exported raw atomic-write API were removed. Existing complete-delete locksets and create membership ordering remain the shared race discipline: deletion of any referenced target must claim the referencing writer's primary mutex, and new rows cannot escape delete discovery.

Admission is performed before snapshots/history clearing; the primitive repeats it at physical persistence. Delete builds all secondary results and validates every result before the first write or root deletion. Batch validates final documents after all in-memory operations and reports a typed failed item without committing any entity/history.

### Approved repair-only exception

The user approved the contract-question branch: preserve repair's existing reference behavior, not seed a crew or invent clearing. `FV-MIGRATE-CHAR-001` expects repair 200 for golden-character's missing crew target but checks only purveyor, revision and byte identity, not crewId. PAPERCLIPS §7.1 and OpenAPI :769–777 require the previewed normalized result; SC-R0 D1–D10/L1–L8 do not define store-dependent missing-reference clearing. `Write_Repair_Preview` therefore preserves the confirmed preview, under the same task-owned mutex/identity checks, as an explicit exception. **No unconditional graph invariant across repair is claimed.** The categorized question is `docs/pages/contract/repair-reference-policy.mdx`.

Character/crew import declare 400 responses (OpenAPI :727/:1797), and existing `INVALID_ENTRY` describes import/repair content that cannot be normalized. Invalid import references return 400 INVALID_ENTRY with property-pointer issues before current/history changes. The pre-existing clock import route is undeclared, like clock undo; it remains an open API-surface decision, not a frozen contract addition.

## Complete write inventory (current source)

Paths below are relative to `backend-ada/server/src/`.

| Document/path | Source entry / physical write | Admission and locks |
|---|---|---|
| All create routes, including PC create | `pitd_callback.adb:375` | Membership then new-id mutex; shared guard before current/baseline/replay |
| Crew-delete character unlink | `pitd_callback.adb:1273` → planned commit `:1367` | Complete delete set; all planned documents admitted before any write |
| Clock-delete related unlink | `pitd_callback.adb:1318` → `:1367` | Same complete-plan admission |
| Character/crew-delete clock reassignment | `pitd_callback.adb:1350` → `:1367` | Same complete-plan admission |
| Undo | `pitd_callback.adb:1421` | Primary + snapshot-reference set; existing 404 policy; shared primitive before consumption |
| Import apply | `pitd_callback.adb:1669` | Primary mutex; full reference admission before history clearing/snapshot |
| Confirmed repair | `pitd_callback.adb:1985` | Named approved repair exception; primary mutex, identity, confirmed preview |
| Ordinary/composite entity mutation | `pitd_callback.adb:2031` | Primary mutex; shared admission before snapshot |
| Campaign batch | `pitd_callback.adb:2386` | All batch primary mutexes; final documents preflight before any write |
| Campaign initialization | `pitd_callback.adb:3114` → `pitd_common.adb:525` | Startup-only campaign mutex; no cross-entity fields |
| Ordinary live current.json primitive | `pitd_common.adb:407–411` | Mandatory shared lock/reference guard; raw atomic writer private |
| Repair current.json exception primitive | `pitd_common.adb:413–417` | Mandatory lock/identity guard; reference policy intentionally unchanged |
| History snapshot entity copies | `pitd_common.adb:618` and baseline `:682` | Historical copies, not live references; intentionally may refer to subsequently deleted entities |
| History sidecar/index writes | `pitd_common.adb:653,:734` | Metadata only, no live entity documents |
| Private filesystem atomic writer | `pitd_common.adb:255` | Only the enumerated Common-body callers can access it |

No other live entity write or raw atomic caller was found by the source-wide audit. Imports cannot create missing route targets (callback import admission returns 404); new live rows are therefore exclusively membership-gated creation. Unreadable secondary rows remain untouched per existing deletion behavior.

## Log

- Initial failing-first file: nine failures of ten cases; three clock cases and repair initially extracted preview tokens from the wrong envelope. Corrected only new tests to use `error.token` for normalization-required previews; no frozen edits. Initial artifact `artifact://10637`.
- Corrected red: nine failed cases, crew-import positive control passed. Eight strict reference-rejection failures cover character/clock import, post-preview target deletion, ordinary mutation, batch and secondary delete; the ninth exposed the repair policy question, later explicitly decided in favor of preserving behavior. Command `npm run test:ada -- --run suites/persistence/write-reference-admission.test.ts`, exit 1, Vitest 1.44 s, wall 2.01 s; `artifact://10639`.
- First implementation build passed in 3.28 s. Focused acceptance exposed the frozen repair conflict plus a new-test batch-envelope assumption (top-level success is the existing typed per-item protocol). Artifact `artifact://10641`; neither issue was suppressed.
- User-directed spec investigation completed: second branch selected and approved. Repair-only exception implemented and documented; new repair case now explicitly guards preserved behavior. Batch final-document rejection now reports a failed typed item. No seed/frozen changes.
- Resume: requested `jj diff --stat` inspected; inherited continuation change belongs to the user and is untouched. Current edits cover callback/Common/ops cutover, new regression file and contract issue page. Progress is recorded here before remaining acceptance work.
- Resume compile exposed an ambiguous `Set_Field` overload in the new batch error item; explicitly qualified `JSON_Value`. The completed repair-policy/batch correction then passed build and 41/41 focused tests across six files (`artifact://10649`, build 3.35 s, Vitest 10.01 s, wall 13.93 s).
- Removed redundant full preflight rechecks where no earlier side effect required them. An attempted removal of create's existing early membership-reference rejection produced `CROSS-LOCK-008` timeout (`artifact://10651`); restored that explicit typed early-return gate. Exact timeout mechanism was not established; no retry/concurrency/timeout change was made.
- Final source focused acceptance: build 2.02 s; 41/41 tests across six files including the new final-valid batch case, frozen repair, import history, create/delete races, and unretried burst; Vitest 10.02 s, combined wall 12.59 s, exit 0 (`artifact://10653`). Eleven new cases total; the repair case tests the approved exception, not strict rejection.
- Audited checksums of all 18 catalog source targets: exactly six callback and four ops restoration hashes stale; refreshed only those ten values. No mutation intent, killer, anchor, replacement or severity changed.
- Full sequential Ada → tooling → frontend → 28-mutant campaign started as `bg_63`; acceptance results pending. Source edits are complete; documentation/metrics continue while that command runs.
- Native filesystem audit found the server's only entity persistence primitives in private `Atomic_Write`: `pitd_common.adb:268` (temp create), `:279` (write bytes), `:304` (rename). No direct callback/ops create/write/rename or copy bypass appeared in the source-wide native-writer search. Historical snapshot and index callers are explicitly separated from live documents in the inventory.
- Final sequential acceptance completed, exit 0, combined wall 1928.41 s (`artifact://10656`): Ada **540/540 across 64 files** (529 baseline + 11 new; 73.87 s), tooling **221/221 across 14 files** (75.18 s), frontend **794/794 across 20 files** (15.31 s). These are observed Vitest durations, not task estimates.
- Full 28-mutant campaign passed: **28/28 killed, zero survivors, P0 19/19 and P1 9/9**; baselines 540 Ada / 221 tooling / 794 frontend. Revision `1140de1de41f`, timestamp `2026-10-05T11:21:01.710Z`; raw `agent-docs/test-audit/mutation-raw-2026-10-05T11-21-01-707Z.txt`. Harness verified all source restored to baseline and rebuilt clean backend after every Ada mutant. Ten catalog hash changes are restoration-only; original intents/killers unchanged.
- Observed acceptance now recorded in this corrective metrics file and additive MUT-02 correction; three audit validators are next. No source/tests changed during or after the final campaign.
- First validator invocation stopped at metrics schema: one missing `scaffoldingLocNote` for the deliberately unknown LOC value, exit 1, wall 0.07 s. Added the required explicit methodology note; traceability/reconciliation did not execute in that failed `&&` sequence. No measured values or source changed.
- Corrected final validator sequence passed, exit 0, wall 0.26 s: **159 metrics files**, **231 traceability checks**, **17 reconciliation checks**, zero errors/warnings; 1624 current rows retained. Reconciliation timestamp `2026-10-05T11:23:13.439Z`.
- Implementation acceptance complete. Every live writer, explicit approved repair exception, historical/index caller and private filesystem writer is enumerated in card + corrective metrics. Ops audit and categorized contract issue updated; MUT-02 correction is additive. Only observed status/evidence recorded after validator run; no source/test edits, frozen/seed edits, commits, campaign-data or .omo changes. Independent review remains the main agent's gate.
