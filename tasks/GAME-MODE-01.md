---
id: GAME-MODE-01
title: Per-scoundrel game mode and advisory downtime budget
deps: []
track: contract
outputs:
  - docs/pages/contract/game-mode-proposal.mdx
  - contract/openapi.yaml
  - contract/schemas/character.json
  - contract/schemas/operation-result.json
  - data/games/game-settings-schema.json
  - skill/api-reference/README.md
  - skill/api-reference/capability-manifest.json
  - backend-ada/server/src/generated/pitd_schema_validators.ads
  - backend-ada/server/src/generated/pitd_schema_validators.adb
  - conformance/generated/contract-coverage.json
  - tasks/metrics/contract/GAME-MODE-01.json
acceptance:
  - cd conformance && npm run test:tooling
  - cd conformance && npm run typecheck
  - cd docs && npm run build
---

# GAME-MODE-01 — contract-change red boundary

**Status:** RED STOP — contract and new oracles delivered; backend support is
intentionally deferred to the next card.

**Scope:** human-approved contract change and new failing black-box oracles only.
Stop after demonstrating red against the current Ada executable. Backend and
frontend implementation belong to later cards; a red contract oracle is not a
claim of feature implementation or a green conformance suite.

## Frozen decisions

- Every scoundrel owns `free-play`, `score`, or `downtime`; any choice at any time.
  Workflow cursors are advisory, not operation eligibility gates.
- Score begins Planning → Loadout → Engagement. End Score enters the six-step
  Resolution: Scoundrel XP → Payoff → Heat → Entanglements → Crew XP → Crew Rep.
- End Score clears out-of-action flags and only a completely full stress meter.
  Partial stress persists. Committed loadout is retained by default; existing
  optional `resetLoadoutCommitment` remains supported and defaults to false.
- End Score resets the activity budget after the completed score atomically.
  No mode switch or workflow navigation resets the budget.
- `DowntimeSettings.FreeActivities` is 2 in the games sharing the settings schema.
  The budget is uncapped, can run negative, and never hard-blocks an operation.
- Coin/gift adjustments record already-paid extras. No automatic funds charge.
- Existing error envelope and HTTP statuses only. No WRONG_MODE error, mode
  allowlist, campaign-wide state, or implicit XP/crew award.
- Every persisted mutation follows existing character revision, idempotency,
  snapshot, and undo conventions. Mode/workflow/free/paid/spent are stored
  Character fields; only operation-result suggestions are derived. No separate
  read projection or new character schema registry entry.

## Authorized scope and safety

No agent-run VCS commands. Test-internal VCS subprocesses are authorized.
Only contract, new conformance suite files, docs, tasks, game-settings JSON and
its schema/types, the capability classifier, and canonical generated artifacts
are changed. Managed launcher audit logs are authorized evidence. The launcher
uses throwaway data; `campaign-data/` remains untouched.

## Authorized tooling data updates

- `conformance/src/game-data.ts`: declare the required settings block; no
  runtime behavior change.
- `conformance/src/contract-validator.test.ts`: add `mode:"free-play"` to the
  positive character-summary fixture used by ORACLE-CAL-008 and its calibration
  controls. This tooling fixture update is separate from the expressly authorized
  LIFECYCLE-ENDSCORE-002 assertion amendment recorded below.
- `conformance/src/contract-validator.ts`: intentionally unchanged; Character
  retains its existing registry name and no additional projection is registered.

## Frozen-test reconciliation

**Only LIFECYCLE-ENDSCORE-002 remains an original frozen-semantic conflict with
the current server.** The human authorized this assertion amendment:

- **Before:** after `stress.add {delta:4}`,
  `expect(result.character?.monitor.stress.current).toBe(0)`.
- **After:** the same setup now asserts `.toBe(4)` — partial stress persists.
  The descriptive title was aligned. Both out-of-action flag assertions and
  the rest of this test’s behavior remain unchanged.

Restoring existing optional `resetLoadoutCommitment` (default false) removes
the contract conflicts in `LIFECYCLE-ENDSCORE-003`,
`SEMANTICS-COMPOSITES-003`, `LIFECYCLE-TRAUMA-003`, and
`CONTRACT-CHARACTER-END-SCORE-001`. Their explicit true requests and existing
cleanup/lock semantics remain supported; those frozen tests are unchanged.
The approved UI does not request this opt-in cleanup.

`PAPERCLIPS.md:169` still describes unconditional stress clearing, outside this
card’s authorized file scope. This is stale prose, not another frozen-test
conflict.

## Authorized path-count calibration

Existing ops such as `contact.add` have individual OpenAPI paths, so the five
new ops keep that same convention. `ENDPOINT-MAP-001` was updated **107 → 112**
with explicit human authorization. No second logical-op section or generic
endpoint convention was introduced. The focused endpoint-map tooling suite
passed **20/20** after this fixture update.

## Exercised evidence and stop boundary

- New game-mode oracle after excluding French creation: **34 tests, all red**.
  Final canonical compatibility run also selected the five frozen cases:
  **35 failed total (34 new + amended LIFECYCLE-ENDSCORE-002), 4 passed**.
  Exact per-ID failures/results are in the metrics JSON and red log.
  The four now-compatible frozen cases all passed unchanged:
  LIFECYCLE-ENDSCORE-003, SEMANTICS-COMPOSITES-003, LIFECYCLE-TRAUMA-003,
  and CONTRACT-CHARACTER-END-SCORE-001.
- Current Ada rejects the new `DowntimeSettings` field before readiness.
  Feature red used the canonical launcher with `--games` pointing to an owned
  temporary copy stripped only of that newly added block; oracle expectations
  still read the real repository settings. The copy was removed afterwards.
  No server shim, backend operation, or default-data edit was made.
- `GAME-MODE-ENDSCORE-004` asserts
  `expect(after.monitor.stress.current).toBe(stressMax - 1)`.
  Runtime settings give StressMax=9, so it expects **partial 8 to persist**;
  the current server instead returns 0. This is the intended behavioral red.
  Full/pending rejection is tested separately. Successful full/nonpending
  clearing is unreachable through current ordinary lifecycle mutations; the
  card does not invent an invalid fixture to pretend to exercise it.
- All generated-artifact parity tests and ORACLE-01 passed in the full tooling
  run. Canonical Ada validators, API reference, capability manifest and contract
  coverage were regenerated in place.
- Full tooling before count calibration: **224 passed, 9 failed / 233**.
  One was the authorized 107→112 count fixture, subsequently verified green.
  Eight managed-launcher failures stem from current Ada’s settings rejection
  (including a test timing out while waiting for readiness). The human accepted
  these as expected red at the backend boundary. No full-suite green is claimed;
  full tooling was not rerun after the count update.
- Final conformance TypeScript check passed. The settings type now also declares
  the existing `StressMax` property consumed by runtime-derived assertions.
- Final Vocs build passed after backlog/compatibility updates: **145 generated
  files**. Existing large-chunk warning remains non-fatal.
- The only amended frozen conformance case is human-authorized
  `LIFECYCLE-ENDSCORE-002` (before 0, after 4). No agent-run VCS command or
  backend/frontend runtime implementation was performed.

## Separate French bug (excluded from this card)

The human classified French creation HTTP 500 as a separate pre-existing bug.
`GAME-MODE-DEFAULT-4` was removed from the game-mode red list, not skipped or
special-cased. Exact request/body, HTTP 500 versus `error.status:400` versus
`retryable:true`, and the suspected ASCII-only stem mismatch are recorded in
`docs/pages/backlog/french-game-creation-500.mdx`.
The separate diagnostic log is retained as historical bug evidence, not a
GAME-MODE-01 acceptance failure.

## Final reconciliation verification

Canonical artifacts were regenerated after restoring the optional flag;
generator/coverage parity tooling passed **5/5**. Full managed tooling remains
at the expected settings-startup red boundary accepted by the human; backend
support has not been added.
