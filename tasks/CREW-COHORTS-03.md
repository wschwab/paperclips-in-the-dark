# CREW-COHORTS-03

Two types per cohort. The SRD lets a gang or expert cohort carry a second type (for example through the Elite or second-type upgrade). A cohort can hold up to two types. The first type stays in the existing single-type field, and the second type is an optional extra.

Authorized by the human. The contract change below was approved in this session.

## Contract change (authorized)

Additive and backward-compatible. Existing single-type records still decode, and clients that send only `gangType` or `expertType` keep working.

Before (at the start of this card):

- `contract/openapi.yaml` `cohort.add` and `cohort.update` request bodies: `gangType: {type: string}`, `expertType: {type: string}`. No second-type field.
- `contract/schemas/crew.json` `cohorts` item: `required` lists `gangType` and `expertType`. `additionalProperties: false`. No second-type field.
- `data/games/crew-settings-schema.json`: no `CohortMaxTypes` key. `data/games/blades-in-the-dark-crews.json`: no `CohortMaxTypes` key.
- Ada `pitd_ops.adb` `cohort.add`/`cohort.update` store only `gangType`/`expertType`. `pitd_normalize.adb` `Allowed_Cohort` lists no second-type field, so it would be dropped on load.

After: the contract adds one optional `extraTypes` array of strings (`maxItems: 1` in `openapi.yaml` for `cohort.add` and `cohort.update`, and in `schemas/crew.json`). The limit equals `CohortMaxTypes - 1`, where `CohortMaxTypes` is a new game-settings key (2 in the Blades shipped data). The first type stays in `gangType` or `expertType`, so the array name carries no kind. The human's suggested `gangTypes`/`expertTypes` pair was not used, because it would duplicate the existing fields and leave two sources of truth.

Ordering note (recorded openly): the contract, data (`CohortMaxTypes`), and generated Ada validators (`skill/generate-ada-validators.mjs`) were edited before the red tests were run. The red-first rule applies to behavior, and the red evidence for behavior is below. The frontend edit-form test (`CREW-COHORTS-03 second type in the edit form`) was added after the frontend implementation, so it was not red-first. It caught a real bug (see After).

## Conformance authorization

`conformance/suites/semantics/cohort-extra-types.test.ts` is new, authorized by this card. Its cases are CREW-COHORTS-03-ADD-001..003, UPDATE-001, UNDO-001, and LIMIT-001 (contract `maxItems` equals `CohortMaxTypes - 1` in `schemas/crew.json` and both `openapi.yaml` declarations). The frontend red tests were appended to `frontend/src/pages/crew-cohorts.test.ts` under the authorization. No existing conformance test is edited.

## Red

Ada (`conformance/suites/semantics/cohort-extra-types.test.ts`):

- Run 1 (`/tmp/c3-red.log`): setup failed with `game settings (blades-in-the-dark-crews.json): unknown field "CohortMaxTypes"`. Fixed by adding `CohortMaxTypes` to the `Validate_Crew_Settings` allow-list.
- Run 2 (`/tmp/c3-green1.log`): ADD-002 got 200 where two extras must be rejected. UPDATE-001 failed (`expected undefined to deeply equal ['Adepts']`), because the `cohort.update` copy filter dropped `extraTypes`. Both fixed in `pitd_ops.adb`.
- Test-harness bugs fixed (not product bugs): ADD-002 first expected HTTP 400, but failures return 200 with `error.code`, so the test asserts `status 200` plus `error.code === "VALIDATION"`. The `cohortsOf` helper did not read bare GET responses, which would have made the assertions vacuous.

Frontend (`frontend/src/pages/crew-cohorts.test.ts`):

- Red run (`/tmp/c3-fe-red.log`): 4 failed, 8 passed. The four new tests (second-type picker with gang list plus Custom, `extraTypes` sent via `readCohortAddBody`, Custom text sent, picker hidden when `CohortMaxTypes` is 1) failed. The existing CREW-COHORTS-01 tests stayed green.

Edit form (added after implementation, not red-first): the first run failed because the Edit button title became `Edit cohort: Thugs + Rooks` once the second type was shown in the title. Fixed by keeping the title on the primary type and showing the second type only in the type text.

## After

Gate results at the implementation head (before the metrics commit):

- Frontend vitest: 1033/1033 (43 files; was 1028 before the five new tests). `npx tsc --noEmit`: exit 0. `npm run build`: exit 0.
- Conformance browser suite (`npm run test:browser`): exit 0.
- Ada `alr build`: exit 0. Ada two-cycle (`npm run test:ada -- --cycles 2 -- --run`): cycle 1/2 and 2/2 each 76/76 files, 636/636 tests (was 75/630 before this card).
- `cohort-extra-types.test.ts`: 6/6.
- Chromium 3×3 probe (`agent-docs/test-audit/browser-evidence/crew-cohorts-03/second-type-3x3-probe.mjs`, run under `managed-browser-smoke.mjs --seed-defaults`): 18/18 combinations (1440/768/390 × light/dark/high × gang/expert). The field is visible and inside the viewport in every combination; each select has 7 options. Output in `second-type-3x3.json`. The `agent-docs/` tree is gitignored in this repo, so this evidence is local, as with CREW-COHORTS-01.
- Docs: `cd docs && npm run build` exit 0 (`pages/frontend/f2w-cohorts.mdx` gained a CREW-COHORTS-03 paragraph).
- Validators: `validate-metrics.js`, `validate-finding-traceability.js`, `reconcile-audit.js`: all exit 0.
- Mutation pins: four whole-file pins were stale because the files changed (`pitd_normalize.adb` for M04; `pitd_callback.adb` for M05, M07, M08, M09, M14, M15; `pitd_ops.adb` for M11, M12, M16, M27; `frontend/src/api/client.ts` for M20). 12 pin strings were replaced in `conformance/fixtures/mutation-catalog.json`, with zero stale pins after. The full campaign (`npm run test:mutation`) refuses to run on a dirty working copy, so it runs after the implementation commit. Its result is recorded in `tasks/metrics/contract/` in a follow-up commit.

Shipped behavior:

- `cohort.add` and `cohort.update` accept `extraTypes` (at most `CohortMaxTypes - 1` entries). A request over the limit returns the OperationResult envelope with `error.code = "VALIDATION"`.
- `cohort.update` copies `extraTypes` even when the cohort had none before, so an update that sets only the second type keeps the first.
- Normalize keeps `extraTypes` on load.
- The frontend shows a "Second type" select on both add and edit forms when `CohortMaxTypes >= 2`, with Custom support. Cards show the second type after the first; button titles keep the primary type.
