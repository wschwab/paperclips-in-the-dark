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
- Chromium 3×3 probe (scratch script kept in the gitignored local evidence tree, run under `managed-browser-smoke.mjs --seed-defaults`): 18/18 combinations (1440/768/390 × light/dark/high × gang/expert). The field is visible and inside the viewport in every combination; each select has 7 options. Output in `second-type-3x3.json`. The local evidence tree is gitignored in this repo, so this evidence is local, as with CREW-COHORTS-01.
- Docs: `cd docs && npm run build` exit 0 (`pages/frontend/f2w-cohorts.mdx` gained a CREW-COHORTS-03 paragraph).
- Validators: `validate-metrics.js`, `validate-finding-traceability.js`, `reconcile-audit.js`: all exit 0.
- Mutation pins: four whole-file pins were stale because the files changed (`pitd_normalize.adb` for M04; `pitd_callback.adb` for M05, M07, M08, M09, M14, M15; `pitd_ops.adb` for M11, M12, M16, M27; `frontend/src/api/client.ts` for M20). 12 pin strings were replaced in `conformance/fixtures/mutation-catalog.json`, with zero stale pins after. The full campaign (`npm run test:mutation`) refuses to run on a dirty working copy, so it runs after the implementation commit. Its result is recorded in `tasks/metrics/contract/` in a follow-up commit.

Shipped behavior:

- `cohort.add` and `cohort.update` accept `extraTypes` (at most `CohortMaxTypes - 1` entries). A request over the limit returns the OperationResult envelope with `error.code = "VALIDATION"`.
- `cohort.update` copies `extraTypes` even when the cohort had none before, so an update that sets only the second type keeps the first.
- Normalize keeps `extraTypes` on load.
- The frontend shows a "Second type" select on both add and edit forms when `CohortMaxTypes >= 2`, with Custom support. Cards show the second type after the first; button titles keep the primary type.

## Review round 1 (Sol 6.1 xhigh, pinned head f2bb33c2): FAIL, fixed

Findings and fixes, each red-first unless noted:

- P1 import admitted an over-limit `extraTypes`. The contract declares `maxItems`, but the generated validators check element types only, and the import path did not gate array length. Red: `CREW-COHORTS-03-IMPORT-001` (apply returned 200). Fix: `Settings_Maxima_Issues` (`pitd_normalize.adb`, crew branch) now reports `/cohorts/<i>/extraTypes` when the length exceeds `CohortMaxTypes - 1` (default 1, same as `cohort.add`). Green: 8/8 in `cohort-extra-types.test.ts`, and `published-limits.test.ts` still passes.
- P1 a missing `CohortMaxTypes` hid the second-type control, and an unrelated edit then sent `extraTypes: []`, which cleared a valid second type. Red: frontend `CREW-COHORTS-03 hidden second type keeps the saved value` (sent `extraTypes`). Fix: the control's `read()` returns `null` when hidden, and save skips the field then. Green: 14/14 in `crew-cohorts.test.ts`.
- P2 the over-limit `cohort.update` path had no behavioral test. Added `CREW-COHORTS-03-UPDATE-002`. It passes at once because `cohort.update` already enforced the limit. This is a coverage gap, not a behavior change.

## Gate results after the fixes (pinned head before the metrics commit)

- Frontend vitest 1034/1034, `tsc` 0, `npm run build` 0.
- Conformance browser suite 0.
- Ada `--cycles 2`: cycle 1/2 and 2/2 each 638/638 tests.
- Chromium 3×3 probe (`second-type-3x3-probe.mjs`): 18/18, none out of the viewport.
- Docs build 0. Validators: `validate-metrics`, `validate-finding-traceability`, `reconcile-audit` all 0.
- Mutation pins: `pitd_normalize.adb` changed, so M04's pin was refreshed (1 string). With the earlier refresh, the pins are current.
- Mutation campaign: see the metrics log `tasks/metrics/contract/CREW-COHORTS-03-mutation.log`. The results JSON is in `agent-docs/` (gitignored) and is not in `tasks/metrics/`, because the metrics validator treats every JSON there as a task record.
- Regenerated `skill/api-reference/README.md` was required by TOOLING-GEN-002 (see the commit `CREW-COHORTS-03: regenerate API reference for extraTypes`).

## Review round 2 (Sol 6.1 xhigh via omp, pinned head e224e50e): FAIL, fixed

Findings and fixes, each red-first:

- P1 the import gate read `CohortMaxTypes` from the base game file (`Game(Stem)`), where it is absent, so the default 1 gave a bound of 0 extras. A valid one-extra import was refused. Red: `CREW-COHORTS-03-IMPORT-002` (apply returned 400). Fix: `Settings_Maxima_Issues` reads `CohortMaxTypes` from `Game(Stem & "-crews")`, and `Cohort_Item` does the same. Green.
- P1 the stored or repair path kept an over-limit `extraTypes` unchanged. Red: `CREW-COHORTS-03-REPAIR-001` (the import preview had no clamp change for `/cohorts/0/extraTypes`). Fix: `Cohort_Item` clamps to the first `CohortMaxTypes - 1` entries and records an `Add_Change` with the reason "settings-derived clamp". The preview is a 409 `NORMALIZATION_REQUIRED` carrying that change. The same shape as the CONTRACT-04 tier clamp.
- A clamp applied before the apply gate would hide an over-limit import, so the apply gate now runs on the submitted entity (`Entity_V`), not the normalized preview document. Without this, `CREW-COHORTS-03-IMPORT-001` returned 200. Green: 400 `INVALID_ENTRY`.
- P2 the conformance cohort decoder rejected `extraTypes` (the strict struct). Red: `CREW-COHORTS-03-DECODE-001` (`ParseError` on `cohorts[0]`). Fix: optional `extraTypes` in `conformance/src/schemas.ts`. Green.
- P2 `CREW-COHORTS-03-IMPORT-001` accepted any 4xx and fell back to a fake token. It now requires a token issued by the preview, status 400, and code `INVALID_ENTRY`.

Known gap, recorded and not fixed here: `skill/generate-ada-validators.mjs` emits no `maxItems` check for any field. The generated `pitd_schema_validators.adb` therefore admits any array length. The bound is enforced in the normalizer (repair) and at import apply, not by the generated validator. Adding `maxItems` to the generator would change validators across the whole contract and is a separate change.

Evidence: cohort-extra-types 11/11 and published-limits 16/16 (27/27 in one run), each new test red before its fix.

## Review round 3 (Sol 6.1 xhigh via omp, pinned head 3d4bd24b): FAIL, addressed

- P1 "caller-supplied replacement for a needs-input pointer can persist an over-limit array". Not reachable through the import API: the import body is limited to `entity`, `previewToken`, and `confirm` by `Only_Fields` (pitd_callback.adb ~1521 and ~1527), so the pre-existing caller-value block (~1800) never receives a value. Guard test `CREW-COHORTS-03-IMPORT-003` pins this: an extra key is refused with `VALIDATION`, and the record is unchanged. No code change for this path.
- P1 "undo restores the over-limit array removed by repair". Fixed: undo of a crew refuses (400 `INVALID_ENTRY`, nothing written) when the restored snapshot violates the settings-derived maxima (pitd_callback.adb ~1453). Not covered by a conformance test: the API has no route that stores an over-limit cohort, so the snapshot cannot be produced through the public surface. Verified by build and review trace only.
- P2 "omitting gameStem bypasses the import gate". Red: `CREW-COHORTS-03-IMPORT-004` returned 200 for an over-limit apply that omitted gameStem. Fix: the apply gate (pitd_callback.adb ~1683) gates a clone of the submitted entity, with gameStem taken from the normalized preview document when the submitted entity lacks it. Green: 400 `INVALID_ENTRY`.
- P2 "IMPORT-002 does not prove the import applies". Fixed: IMPORT-002 now imports a different second type (`["Adepts"]`) and asserts `ok === true`, a revision advance, and the readback value.

Evidence: cohort-extra-types 13/13 plus published-limits 16/16 (29/29 in one run). IMPORT-004 red on the round-2 build.

## Review round 4 (Sol 6.1 xhigh via omp, pinned head fdb366a9): FAIL, addressed

Correction to round 3: the caller-supplied-value block (pitd_callback.adb ~1822) is reachable through `POST crews/{id}/repair-preview`, which accepts pointer-keyed values. The import body rules (`Only_Fields`, ~1521/1527) do not apply to that route. Round 3 wrongly called the block unreachable.

- P1 "repair-preview accepts an over-limit caller value for a needs-input extraTypes". Fixed: repair-preview refuses (400 `INVALID_ENTRY`, nothing written, no token) when a supplied `extraTypes` exceeds the bound (pitd_callback.adb ~1861). Red: `CREW-COHORTS-03-REPAIR-002` returned 409 instead of 400 on the round-3 build. Green: 400 `INVALID_ENTRY`, and a within-limit value still reaches the 409 preview token.
- P2 "the undo refusal blocks legacy single-type crews with unrelated tracker maxima". Fixed: undo uses `Cohort_Type_Issues`, which keeps only issues whose pointer ends in `/extraTypes` (package-level helper, pitd_callback.adb ~249). Red: `CREW-COHORTS-03-UNDO-001` returned 400 on the unscoped check (round-3 behavior, reproduced by temporarily reverting the call). Green: 200 with the scoped check.

Evidence: cohort-extra-types 15/15, published-limits 16/16.

## Review round 5 (Sol 6.1 xhigh via omp, pinned head 57a4b422): FAIL, addressed

- P1 "repair-preview persists schema-invalid extraTypes elements (e.g. [7])". Fixed: the normalizer's `Cohort_Type_Issues` refuses any non-string element; repair-preview refuses 400 `INVALID_ENTRY` before minting a token. Red: `REPAIR-003` returned 409 on the round-4 build. Green: 400.
- P2 "unresolved game settings bypass the cohort bound". Fixed: the bound is computed directly from `Settings_Int` with the `CohortMaxTypes` default 1, so an unresolvable game gives zero extras. The cohort check moved out of the early-return path in `Settings_Maxima_Issues`, so it no longer depends on the game resolving. Red: `REPAIR-004` returned 409 on the round-4 build. Green: 400.

Evidence: cohort-extra-types + published-limits 33/33 (round-4 build: 2 new reds, 2 passing).
