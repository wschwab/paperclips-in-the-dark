---
id: GAME-MODE-02
title: Ada per-scoundrel advisory game mode
deps:
  - GAME-MODE-01
track: ada
outputs:
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/pitd_common.adb
  - backend-ada/server/src/pitd_error.adb
  - backend-ada/server/src/pitd_normalize.adb
  - backend-ada/server/src/pitd_stored.adb
  - backend-ada/server/src/pitd_summary.adb
  - backend-ada/server/src/pitd_callback.adb
  - docs/pages/contract/game-mode-proposal.mdx
  - tasks/metrics/ada/GAME-MODE-02.json
acceptance:
  - cd conformance && npm run test:ada -- --run
  - cd conformance && npm run test:tooling
  - cd backend-ada/core && XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -P paperclips_core.gpr --level=2 --checks-as-errors=on
  - cd conformance && npm run test:mutation
  - node agent-docs/test-audit/validate-metrics.js
  - node agent-docs/test-audit/validate-finding-traceability.js
  - node agent-docs/test-audit/reconcile-audit.js
  - cd docs && npm run build
---

# GAME-MODE-02 — Ada backend

## Scope and implementation

Implement the approved per-scoundrel contract, not the frontend. Reuse existing
atomic entity writes, history, revisions, keyed retries, undo and batch paths.
Mode assistance never gates operations. New characters initialize stored mode,
workflow and budget from game settings. Legacy absent root fields receive silent
migration defaults. Budget resets occur after successful End Score or explicit
reset, never mode changes. Results supply advisory mode/suggestedOps without
persisting suggestions.

End Score preserves partial stress; only completely full stress clears. Existing
out-of-action cleanup remains, Resolution starts at Scoundrel XP, and budget
reset joins the same atomic mutation. Existing optional resetLoadoutCommitment
remains default false, with true preserving its old cleanup and lock checks.

## Red-green record

- RED prerequisite is the committed GAME-MODE-01 evidence: 34 new game-mode
  failures plus the amended LIFECYCLE-ENDSCORE-002; not rerun merely to confirm
  human-reported ground truth.
- First implementation build passed. First focused run with real settings:
  28 passed / 7 failed. Six revealed an invented delta=1 contract restriction
  conflicting with frozen gift-2/gift-3 inputs; one revealed legacy missing-field
  defaults being classified as confirmation-required normalization.
- The human authorized removing that invented API restriction and treating
  absent new top-level fields as silent migration defaults. Integer/reason
  validation and no automatic charge remain. Existing frozen test inputs are
  unchanged. The self-correction is recorded in the proposal page.
- Focused corrected green: 35 passed (34 new cases plus amended partial-stress
  lifecycle case). Full first acceptance: 428 passed / 148 failed of 576; strict
  Effect DTO decoders still rejected approved new fields. The human authorized
  `conformance/src/schemas.ts` bindings as the same exception used by
  CONTRACT-CONTACTS-01: character stored fields, optional readable-summary mode,
  and optional result mode/suggestedOps. No frozen assertions were weakened.
- Tooling first acceptance: 231 passed / 2 failed of 233 because M06’s incumbent
  single-parse Read → Canonicalize source seam had moved. Restored the seam
  while applying legacy defaults after canonicalization; no mutation assertions
  or test IDs changed. SPARK proof passed all 246 checks.
- Additional human-authorized contract fixtures are additive only:
  `golden-character.json` before omitted mode/workflow/budget; after adds
  free-play, none/empty cursor, and `{free:2,paid:0,spent:0,activities:[]}`
  (2 matches its game settings). No old fields or assertions change.
  `PARITY-HUMAN-003` exact human list before 24 IDs; after 28 adds
  characterModeSet, characterModeFlowSet, characterDowntimeSpend and
  characterDowntimeAdjust. Exact equality/reachability checks remain intact.
- `downtime.reset` remains agent/maintenance by design: the approved panel has
  no separate reset button; completed End Score resets automatically. Existing
  spend and signed-adjust controls are the human-facing budget actions.
- Legacy crew-deletion unlink now uses the same read-only stored classifier,
  so absent new fields do not disqualify a readable linked scoundrel. Missing
  or unreadable files remain isolated; writes still join the atomic delete.
- Repaired GAME-MODE-01’s missing required metrics metadata without changing
  its historical RED evidence. Unmeasured retrospective counters/time/LOC are
  labeled explicitly rather than fabricated.

## Mutation authorization history and final full campaign

Initially the human deferred the full campaign while frontend work was active
and authorized the existing `--backend-only` filter (15 mutants). That filtered
campaign **was not started**: the frontend landed first, both trees froze, and
the human explicitly superseded the deferral with the full campaign.

Refreshed five changed backend files’ hashes in 13 catalog entries. The frontend
worker supplied its own target hash updates; all 18 unique target hashes matched
the frozen working tree before the full run. Actual canonical command:

```sh
PITD_REVISION=GAME-MODE-02-working XDG_RUNTIME_DIR=/tmp npm --prefix conformance run test:mutation
```

**28/28 killed: P0 19/19; P1 9/9.** All baselines green: Ada 576,
frontend 841, tooling 233. Harness post-campaign source verification passed and
clean Ada rebuilds ran after backend mutants. The historical deferral is now
closed, not outstanding. No mutation anchors/tests were weakened.

Evidence: `tasks/metrics/ada/GAME-MODE-02-mutation.log`,
`agent-docs/test-audit/mutation-results.json`, and
`agent-docs/test-audit/mutation-raw-2026-10-09T12-56-48-210Z.txt`.

## Managed tooling fixture warning

The prior timed-out SC-O0 tooling case leaked
`conformance/suites/__sc_o0_blocker__.test.ts`. Another worker owns removing
that fixture. **Managed-runtime tooling timeouts can leave temporary suite
fixtures behind**, even when server/process cleanup succeeds. Inspect owned
fixture cleanup at timeout hand-off; never delete a sibling’s active fixture.
No testcase exclusion or weaker acceptance is introduced to hide this leak.

## Safety

No agent-run VCS commands. Canonical launcher uses isolated managed data and
real data/games settings; no compatibility settings copy for green acceptance.
No permanent frontend source changes and no French creation bug fix. The human
authorized full-harness temporary mutations after frontend freeze; the harness
verified exact source restoration. Provenance uses an explicit working-candidate
label, not a fabricated commit ID.

## Final acceptance

- Canonical real-settings Ada: **576/576**, all 66 files; all 35 card reds green.
- Controlled two-cycle managed Ada run: **576/576 in each cycle**
  (1,152 passed executions), including unchanged human reachability assertions.
  `ci.sh` itself invokes the default single-cycle command when conformance is
  enabled; the two-cycle run was exercised additionally for restart coverage.
  Exact command: `npm --prefix conformance run test:ada -- --cycles 2 -- --run`,
  with `PITD_REVISION=GAME-MODE-02-working`.
- `backend-ada/ci.sh` passes core build/tests, server build, executable-relative
  launch and SPA route regressions, and SPARK proof: **246/246 checks**.
- Full tooling: **233/233**; conformance TypeScript check passes.
- Full mutation campaign: **28/28**, including observed frontend **841/841**
  baseline. Every target restored.
- Canonical validator/reference/manifest/coverage regeneration succeeded.
- Metrics validation: **168 files, 0 errors**, including repaired GAME-MODE-01
  and completed GAME-MODE-02. Traceability: **231/231**; reconciliation:
  **17/17**, 0 errors/warnings.
- Vocs build passes: **145 files generated**. Commands and logs are recorded
  in the metrics JSON; no independent review or VCS-derived LOC is claimed.

## Follow-up — live roster consumer parity

Mode on readable character summaries was intended in GAME-MODE-01. It was
already declared in `campaign.json` characterSummary.properties.mode and
mirrored by conformance. It is **not in the schema required array**, and there
is no conditional JSON Schema required clause. The description requires it
on readable rows; degraded rows omit it. The frontend’s corrected optional
enum matches that schema, and the new live test asserts readable-row presence.

The browser failure was the independent frontend Effect mirror omitting mode.
The conformance decoder was not lax: it rejects excess properties, and existing
collection-schemas coverage already validates getRoster through the contract
and its strict mirror. That cannot detect an independently stale frontend
mirror; the new test exercises that actual consumer against the same live body.

NEW `GAME-MODE-ROSTER-001` strictly validates the entire live roster through
AJV and conformance Effect, checks each mode, rejects an undeclared row key and
an invalid mode, then invokes the actual frontend decoder. The frontend worker’s
fix landed before the properly registered new test ran, so no original live
RED is claimed. The human authorized historical temp-only reproduction:

- Exact authorized read: `jj file show -r 23d54b38 frontend/src/schema/campaign.ts`.
- Copied historical decoder into `/tmp`; temporary Vitest aliases redirect only
  the consumer module/common import. Live Ada, contract and real frontend stay
  untouched. Temporary directory is removed automatically.
- Historical **RED: 1/1 failed**, `mode is unexpected` at the frontend decoder,
  after contract/conformance validation and strict negative controls passed.
- Correct current consumer: **GREEN: 1/1**; full Ada **577/577** in 67 files;
  tooling **233/233** and conformance typecheck pass. Canonical artifacts
  regenerated. No backend/contract/mirror change or summary hash refresh was
  necessary; the conditional mutation rerun was not triggered (prior 28/28
  remains historical evidence, not a new run).

Logs: `tasks/metrics/ada/GAME-MODE-02-roster-{red,green,ada,tooling,typecheck,generation}.log`.
No real frontend edits; only the single specifically authorized read-only jj
command was run. No other VCS commands.

Follow-up records validation passes: 168 metrics files / 0 errors, 231/231
traceability checks and 17/17 reconciliation checks. Vocs build passes with
145 generated files. `pitd_summary.adb` remains SHA-256
`2e85d41d8131c744226ec5dc1eef7e0c69327694526a7b10407349d336a3bd14`,
the existing refreshed M01 target hash.
