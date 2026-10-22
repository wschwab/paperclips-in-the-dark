# CREW-COHORTS-01

Playtest feedback (Cohorts): Gang and Expert fields follow the selected kind; the Expert custom-type box appears only for Custom; Quality, Edges and Flaws come from game data; both kinds can be named; the description is a longer textarea. Source: `docs/pages/backlog/playtest-2026-10-scoundrel.mdx`.

## Finding

- The crew sheet's cohort form did not follow the SRD. Gang types were spelled "Skulls" (SRD: Skulks). Quality and scale were typed numbers, but the SRD derives them from the crew Tier.
- Edges and flaws were free text. The SRD lists them, so the form now offers the SRD lists with Custom.
- The expert description and name fields were missing or not shaped like the gang fields.

## SRD basis

Verified 2026-10-19 against `https://bladesinthedark.com/crew`, "Cohorts" section:

- Gang: "A gang has **scale** and **quality** equal to your current crew Tier."
- Expert: "An expert has **quality** equal to your current crew Tier +1. Their scale is always zero (1 person)."
- Edges and flaws: "give them one or two **edges** and an equal number of **flaws**."
- Gang types: Adepts, Rooks, Rovers, Skulks, Thugs.
- Expert types: Doctor, Investigator, Occultist, Assassin, Spy.

## Fix

- Game data: `data/games/blades-in-the-dark-crews.json` gains top-level `CohortSource` (CC-BY), `CohortGangTypes`, `CohortExpertTypes`, `CohortEdges`, `CohortFlaws` (names and descriptions from the SRD text).
- Derived values (read-only): gang quality = scale = Tier; expert quality = Tier + 1, scale = 0. The add handler sends the derived values; the card displays stored values.
- Add form: kind select, gang-type select (gang) or expert-type select with Custom (expert), armor checkbox (gang only), edge and flaw pickers (SRD lists plus Custom, max two each), description textarea, optional name.
- Edit form: harm, armor, name, description. Quality is shown as derived, not posted.
- Contract (approved by the human as an additive change): optional `name` string on `cohort.add` and `cohort.update` (`contract/schemas/crew.json`, `contract/openapi.yaml`). Ada writes `name` only when supplied (`pitd_normalize.adb`, `pitd_ops.adb`), so canonical shapes are unchanged. Validators regenerated: `backend-ada/server/src/generated/pitd_schema_validators.adb`, `skill/api-reference/README.md`.
- Server settings allow-list (`pitd_callback.adb`, `S_No_Extra`) accepts the five new top-level keys. Without it the server refused to start with `unknown field "CohortEdges"`.
- Frontend: `frontend/src/pages/crew-domain.ts` (types, fallbacks, extractors), `frontend/src/pages/crew-sections/cohorts.ts` (form, picker, `readCohortAddBody`), `frontend/src/pages/crew-detail.ts` (`onCohortAdd` now calls `readCohortAddBody`), `frontend/src/api/client.ts`, `frontend/src/schema/crew.ts`, `conformance/src/schemas.ts`.
- Tests: `frontend/src/pages/crew-cohorts.test.ts` (7 tests, green at `5dd77430`). The original pre-change red run for the first five tests was not retained as an artifact, so the failing-before chronology is not claimed.
- Skulls → Skulks in docs: `docs/pages/contract/c4-playtest-contract.mdx`, `docs/pages/frontend/f2ac-crew-sheet-features.mdx`, `docs/pages/frontend/f2w-cohorts.mdx` (rewritten for derived stats, pickers, name, textarea). Historical cards `tasks/C4-playtest-contract.md` and `tasks/F2ac-crew-sheet-features.md` still name Skulls. They record the spec at the time and are left as they are; the archived metrics logs too.
- Legacy tests in `frontend/src/pages/crew-detail.test.ts` updated to the new behavior: Skulks; derived quality and scale in cohort.add bodies (gang Tier 1 → 1/1; expert Tier 1 → 2/0); edit form posts no quality; the gang edge test uses the SRD picker. Also a `as unknown as typeof fetch` cast on one mock, which was failing `tsc` and the build before this change.

## Evidence

- Ada two-cycle (`cd conformance && npm run test:ada -- --cycles 2 -- --run`, after `alr build`): cycle 1 `74/74` files and `627/627` tests; cycle 2 same. Log `tasks/metrics/ada/CREW-COHORTS-01-ada-two-cycle.log`. Earlier failed runs (setup `unknown field "CohortEdges"`; 4 failures in total-collections, canonical-shape, completeness and missing-ops) were fixed before this run.
- Vitest: `crew-cohorts.test.ts` and `crew-detail.test.ts` 104/104 (`npx vitest run src/pages/crew-detail.test.ts src/pages/crew-cohorts.test.ts`); `crew-detail.test.ts` 99/99 after the cast.
- Full frontend vitest: 995/998. The 3 failures are `crew-claims-map.test.ts` (CREW-CLAIMS-MAP-01, `mode-mockups`' uncommitted work), not this change.
- `npx tsc --noEmit`: clean. `npm run build` (frontend): green.
- Browser, `cd conformance && npm run test:browser`: 6/6 PASS on the tree before commit `e163eb36` (the earlier `crew-create-trackers` failure was fixed in CREW-REP-TURF-01).
- Checkpoint before/after, `conformance/suites-browser/checkpoints/crew01-cohort-add.mjs`:
  - Before: selects `Skulls`; `page.fill` on `input[aria-label="Cohort quality"]` = 3 and `Cohort scale` = 2; asserts the stored values.
  - After: selects `Skulks`; reads `.cohort-add .cohort-quality-derived` and `.cohort-scale-derived` before submit (fails on NaN); after add asserts `.cohort-entry[data-cohort-kind="gang"] .cohort-quality` = `Quality <derived>` and `.cohort-scale` = `Scale <derived>`; checkpoint `cohort-derived-stats-stored`.
- Chromium probe, `docs/public/evidence/crew-cohorts-01/probe.mjs` (run via `managed-browser-smoke.mjs`), crew at Tier 0, log `tasks/metrics/frontend/CREW-COHORTS-01-chromium.log`, `probe.json` written by the probe:
  - 1440×1000: section 409px high (refreshed by `probe.mjs` at `086cae52`), no horizontal overflow, first control 139px into the section, cohort section below the fold (`headingVisibleInitially: false`). Derived quality/scale `0/0` (Tier 0), no quality input.
  - 768×1024: section 329px, no overflow, below the fold, same derived values.
  - 390×844: section 612px, no overflow, below the fold, same derived values.
  - Card height: the probe did not measure card height before and after. Not verified.
- Validators and vocs: run at the end (see Hand-off).

## Gaps (recorded, not in scope of this card)

- Equal edge/flaw count is enforced in the Add form only: Add is disabled with a visible message while the counts differ, and `readCohortAddBody` returns null on mismatch. The edit form does not enforce it yet (residual).
- SRD "A given cohort can have up to two types" is not modelled. The contract stores a single `gangType` or `expertType` string each (`contract/schemas/crew.json`). Two types need a contract change, so this is recorded and not built.
- Armor is shown for gangs only. The SRD cohort section does not mention armor for experts; the expert card keeps "No armor". Judgement call.
- Expert Custom appends a single "Custom" option in the UI (`expertOptions()`); the game-data fallback still lists it.
- The Chromium probe ran on a Tier 0 crew, so derived values show `0`. The Tier-dependent values are covered by the vitest suites, not the probe.

## Hand-off

- Browser gate: six journeys 6/6 after the `crew-create-trackers` adaptation (see CREW-CLAIMS-EDIT-01).
- Equal-count follow-up: test `blocks Add while edges and flaws differ…` is green. Full vitest was 1010/1010 at `bcba18d7` and is 1011/1011 at head `8f3ab619` (the TOUCH-SCROLL-01 work added no vitest test; the count difference comes from the CREW-COHORTS-02 edit-form test). The pre-implementation red run was not retained, so the red-first chronology is not claimed. `crew-detail.test.ts` gang-add test now adds a matching flaw.
- Kind-field display fix: the initial gang render showed the expert type select, the custom type input and both "Type" fields, because `.cohort-field { display: flex }` overrode the `hidden` property. Fix: `.cohort-field[hidden] { display: none }`. Test `initial gang render under the real stylesheet…` (`crew-cohorts.test.ts`) attaches the mounted form, loads `components.css`, and asserts computed `display`; it is green at the current tree. The unfixed-CSS red run was not retained, so the red-first chronology is not claimed.
- Layout: the Custom picker row wraps (`.cohort-trait-controls`, see the 390px fix at line 71); the Add button sits at the row end (`.cohort-add-submit`, `margin-left: auto`).
- Chromium 3×3 (`docs/public/evidence/crew-cohorts-01/forms-3x3-probe.mjs`, `forms-3x3.json`, `add-gang-*` / `add-expert-*` screenshots): gang shows Kind, Name, Type, Quality, Scale, Armor, Edges, Flaws, Description, with one Type field and no expert or custom fields. Expert shows Kind, Name, Type, Quality, Edges, Flaws, Description. Both kinds at 1440, 768 and 390, light, dark and high contrast: doc overflow 0; Add right gap 0; picker "+" on its select's row in every case.
- Mutation campaign at `e163eb36` (after this fix and the layout change): 28/28 killed, 0 survivors, P0 19/19, P1 9/9 (`tasks/metrics/contract/MUTATION-28-cohort-rep-e163eb36.log`).
- Sol 6.1 xhigh review of the follow-up: NOT-RUN (Codex usage limit). Needs a rerun before close.
- gameMode.ts: the uncommitted Crew XP intro reorder was adopted as the CREW-XP-TRIGGERS-01 follow-up (commit `5274eb1e`), not this card.
- Sol 6.1 xhigh at `086cae52` returned FAIL on three points; each is fixed:
  - Naming a cohort created without a name was silently dropped (HTTP 200, name absent). Fix: `backend-ada/server/src/pitd_ops.adb` `Copy` lets `name` be introduced on `cohort.update`; other fields still copy only when present. Conformance `SEMANTICS-COHORT-002` (`conformance/suites/semantics/missing-ops.test.ts`) is green on the rebuilt server. The round-1 failing run (`expected undefined to be 'Mercy'`) was reported in the review and is not retained as an artifact. Ada two-cycle at the current tree: 74/74 files, 629/629 tests (`tasks/metrics/ada/CREW-COHORTS-01-ada-two-cycle-claims-override.log`; the count includes `CLAIM-OVERRIDE-EFFECTS-001` added for the Rep/Turf fix, and the Ada source for cohorts is unchanged since `a1c09199`).
  - At 390px, choosing Custom in the Edges picker widened the page (16–23px overflow; the edge "+" ended at 405.9px). This came from my `nowrap` picker row. Red: `docs/public/evidence/crew-cohorts-01/custom-picker-probe.mjs` (`custom-picker.json`). Fix: `.cohort-trait-controls` wraps and its controls shrink (`components.css`). Green: document overflow 0 in all nine rows. The edge "+" right edge, by row (`plusRight`, `custom-picker.json`): 1440 light/dark/high 565.9 / 565.9 / 572.9 px; 768 460 / 460 / 467 px; 390 281.3 / 281.3 / 286.3 px. (The earlier "281.3 px in all nine rows" was wrong; corrected after the re-review.)
  - The cited geometry (481/401/684px) was stale. `probe.mjs` was re-run: 409/329/612px, now recorded above (`probe.json`).
- Full vitest failures in `crew-claims-map.test.ts` were resolved by `mode-mockups`' commit `9a8a3812`. Historical counts: 1009/1009 (42 files) before the undo-refresh regression test; 1010/1010 at `bcba18d7`; 1011/1011 at head `8f3ab619`.
- Re-review status (2026-10-21): Sol 6.1 xhigh at `5dd77430` returned FAIL, on evidence completeness rather than behavior: the red-first execution claims lacked retained failing-run artifacts. Those claims are rewritten to what is retained (lines 30, 62, 63, 70), and the stale no-wrap picker statement (line 64) is corrected. Verdict record: `tasks/metrics/frontend/CREW-COHORTS-01-sol-6.1-verdict-5dd77430.txt` (latest on file). The `637a89c6` re-review did not run (`usage_limit_reached` for about 6 hours). This card is NOT PASS on the current head until that review returns PASS.
- Sol 6.1 xhigh at `bcba18d7`: FAIL on one stale count (1009, corrected to 1010 at that revision; the current head count is recorded above). All behavioral checks PASS. Verdict: `tasks/metrics/frontend/CREW-COHORTS-01-sol-6.1-verdict.txt` (first line `VERDICT: FAIL`, scoped to `bcba18d7`). This card is NOT PASS on head `8f3ab619` until a re-review at that revision returns PASS; the re-review is pending the Codex reset.
