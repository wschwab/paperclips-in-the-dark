---
id: INTERNAL-ERROR-01
title: Formalize INTERNAL500 for server defects
track: ada
deps:
  - FRENCH-CREATE-01
outputs:
  - contract/schemas/common.json
  - contract/schemas/operation-result.json
  - contract/openapi.yaml
  - backend-ada/server/src/pitd_error.ads
  - backend-ada/server/src/pitd_error.adb
  - backend-ada/server/src/pitd_common.adb
  - backend-ada/server/src/pitd_callback.adb
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/generated/pitd_schema_validators.adb
  - skill/generate-api-reference.mjs
  - skill/api-reference/README.md
  - skill/api-reference/capability-manifest.json
  - conformance/src/schemas.ts
  - conformance/suites/contract/internal-error.test.ts
  - conformance/suites/contract/error-union.test.ts
  - conformance/generated/contract-coverage.json
  - docs/pages/contract/internal-errors.mdx
  - docs/pages/backlog/french-game-creation-500.mdx
  - tasks/metrics/ada/INTERNAL-ERROR-01.json
acceptance:
  - cd conformance && npm run test:ada -- --run
  - cd conformance && npm run test:ada -- --cycles 2 -- --run
  - cd conformance && npm run test:tooling
  - cd conformance && npm run typecheck
  - cd backend-ada/core && XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -P paperclips_core.gpr --level=2 --checks-as-errors=on
  - node agent-docs/test-audit/validate-metrics.js
  - node agent-docs/test-audit/validate-finding-traceability.js
  - node agent-docs/test-audit/reconcile-audit.js
  - cd docs && npm run build
---

# INTERNAL-ERROR-01

## Human-approved contract change

The human approved a new INTERNAL error and HTTP500 after FRENCH-CREATE-01
proved the registered-stem defect and separately recorded the missing internal
classification. This is the authorized exception to the previous status set.

- Common error-code enum **26 → 27**, adding only `INTERNAL`.
- Strict operation-result union adds INTERNAL with literal `status: 500`,
  `retryable: false`, empty details, and canonical recovery:
  **This is a server defect. Report it; do not change the request.**
- No entity, preview, or token is exposed on that branch. Controlled safe
  messages are allowed; raw exception diagnostics remain server-side.
- All **115** declared routed operations gain the shared `OpResult` 500
  response, since the generic callback can fail on reads as well as writes.
  No path or operation ID is added. Generated coverage contains **485 rows**,
  including exactly **115** new 500 rows.
- Conformance's strict mirror gains the identical literal INTERNAL variant.
- Canonical Ada validators, API reference, capability manifest and coverage
  are regenerated in place. The API-reference generator's curated recovery
  registry now includes the canonical INTERNAL guidance; its drift gate stays on.

## Red → green evidence

Initial canonical real-settings RED: **2 failed / 1 passed (3)**, before any
contract/backend implementation, in the new `internal-error.test.ts` suite:

- `INTERNAL-ERROR-SCHEMA-001`: the old strict envelope rejects INTERNAL500.
- `INTERNAL-ERROR-FAULT-001`: a valid stress operation under the existing
  guarded crash-mid-write seam returns **400**, expected **500**.
- `INTERNAL-ERROR-CLIENT-001`: the invalid client request remains VALIDATION400
  and already passes, protecting the client/server distinction.

After implementation, the client control also covers raw malformed JSON, and
`INTERNAL-ERROR-OPENAPI-001` guards all routed operations' shared 500 declaration.
Focused GREEN is **4/4**. Strict schema and typed mirror accept the exact
variant and reject inconsistent status, retryability, recovery or extra details.
The fault case checks HTTP500, error.status500, non-retryability, no exception
leak, byte-identical old document/revision, service usability and released
resources through an explicit subsequent operation. No automatic retry or new
production fault-injection endpoint is introduced.

Evidence: `tasks/metrics/ada/INTERNAL-ERROR-01-red.log` and `-focused.log`.
Managed RED run: `2026-10-12T10-35-47-976Z-ae8f5767`.

## Backend classification and request boundary

- `Pitd_Error.Internal_Error` is the typed, non-retryable INTERNAL500 constructor.
  `Error_Result` dispatches the existing INTERNAL label explicitly rather than
  falling through to Validation_Error.
- `Persist_Create`'s existing server-generated-invalid-DTO path keeps INTERNAL500;
  failed single-mutation result validation does the same. Batch generated-DTO
  invariant failure propagates through existing cleanup to the generic500 path.
- Unexpected callback/storage faults and unexpected mutation exceptions are no
  longer converted wholesale to client VALIDATION400. Server diagnostics are
  logged, while the response carries only controlled safe text.
- Known malformed-JSON exceptions are classified at the narrow parsing boundary
  as VALIDATION400; request type/rating checks retain their existing client-input
  semantics. Payload-too-large stays413. Full existing conformance remains green.
- Existing atomic-write test hook is reused, not widened. No production injection
  seam or error code other than the approved INTERNAL is added.

The first compilation exposed AWS's overloaded `Binary_Data` return type in a
`'Length` prefix. Use `Ada.Strings.Unbounded.Length` directly, avoiding a
`To_String` allocation; the confirmed idiom is recorded in backend-ada/AGENTS.md.
One API-reference generation failed honestly on the missing curated recovery
entry, then succeeded after adding it without disabling the drift check.

## Authorized frozen amendment — additive only

`ERR-MISMATCH-006` in `conformance/suites/contract/error-union.test.ts` pins an
exact STATUS_TABLE. Before, its final entry was `OUT_OF_ACTION: 200`; after,
that entry and every previous entry remain unchanged and `INTERNAL: 500` is
appended. No assertion is weakened or removed. No other frozen test needed an
amendment. This before/after is also recorded on the contract documentation page.

## Exercised acceptance

- Ada build succeeds; focused new suite **4/4**.
- Full canonical real-settings Ada **587/587**, **69 files**.
- Managed controlled restart **587/587 in each of two cycles**: 1,174 executions.
- Full tooling **233/233**, **18 files**.
- Conformance TypeScript check passes.
- SPARK **246/246** checks proved; no core source changed.
- Canonical generation succeeds with 115 operations and 485 response rows.

Command evidence is retained in `tasks/metrics/ada/INTERNAL-ERROR-01-*.log`.
Metrics report measured wall time and unknown token/LOC counts honestly; no
independent review or unrun campaign result is claimed.

## Frontend record (commit `94d9cd86`)

Contract and backend are at `8d24d530`; the frontend change and the catalog refresh are at `94d9cd86`.

- Decoder (`frontend/src/schema/operation-result.ts`): an INTERNAL branch with `code` INTERNAL, `status` 500, `message` string, `retryable` literal `false`, the exact recovery text as a literal, and `details` as a strict empty object. `Schema.Struct({})` does not reject extra keys under `onExcessProperty: "error"`, so `details` uses `Schema.Record({ key: Schema.String, value: Schema.Never })`. Other codes are unchanged.
- `ErrorCode` (`frontend/src/schema/common.ts`) includes `INTERNAL`.
- Display (`frontend/src/api/client.ts`, `OP_ERROR_COPY.INTERNAL`): "The server hit a problem and couldn't finish that. Please report it.", followed by the server's recovery text. No retry wording.
- Red-green tests: `frontend/src/schema/internal-error.test.ts` (6 tests). The positive decode and display tests failed before the change. The extra-details rejection passed through until the strict-empty record replaced `Struct({})`.
- Gates at `94d9cd86`: vitest 913/913 (29 files), tsc exit 0, build exit 0, browser journeys 6/6, combined mutation campaign 28/28 (P0 19/19, P1 9/9). The campaign was run by the coordinator on the committed state, which needs an empty working copy.
- Pins refreshed in `conformance/fixtures/mutation-catalog.json` (verified with `sha256sum`): `pitd_callback.adb` = `52c19974…340d97` (6 entries), `pitd_ops.adb` = `21fca1ba…932e99` (4 entries), `frontend/src/api/client.ts` = `07f6c0be…bbc00db` (1 entry, M20).
- Metrics: `tasks/metrics/frontend/INTERNAL-ERROR-01.json`.

## Coordination and combined mutation hand-off

The other worker owns the frontend INTERNAL decoder and the combined mutation
campaign. No frontend edits or VCS commands were made here. No mutation campaign
was started by this worker. Backend sources are frozen and the stable target
hashes were handed to the parent for the combined campaign's catalog refresh:

- `pitd_callback.adb`: `52c19974a0297c67d931ee5badfc6fd658a0fa8e027eefbc1da7beb28f340d97`
- `pitd_ops.adb`: `21fca1ba8033d647b466eadc7336039d5f2412d47c2b3e98af5074f47e932e99`

The shared catalog is left with that owner to avoid concurrent edits. The other
changed Ada files and generated validators are not catalog targets. A combined
28/28 outcome must come from the campaign owner, not from this card's evidence.
Managed-runtime tooling timeouts can leave temporary fixtures behind; the normal
full tooling suite completed successfully here without such a timeout.

Final record gates pass: metrics **170 files / 0 errors**, traceability
**231/231**, reconciliation **17/17**. Vocs passes with **147 files generated**.
The backlog's historical exchange is preserved and the independent internal
classification gap is explicitly marked resolved.
