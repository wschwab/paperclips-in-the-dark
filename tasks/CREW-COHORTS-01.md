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
- Red-first: `frontend/src/pages/crew-cohorts.test.ts` (5 tests, failing before the change).
- Skulls → Skulks in docs: `docs/pages/contract/c4-playtest-contract.mdx`, `docs/pages/frontend/f2ac-crew-sheet-features.mdx`, `docs/pages/frontend/f2w-cohorts.mdx` (rewritten for derived stats, pickers, name, textarea). Historical cards `tasks/C4-playtest-contract.md` and `tasks/F2ac-crew-sheet-features.md` still name Skulls. They record the spec at the time and are left as they are; the archived metrics logs too.
- Legacy tests in `frontend/src/pages/crew-detail.test.ts` updated to the new behavior: Skulks; derived quality and scale in cohort.add bodies (gang Tier 1 → 1/1; expert Tier 1 → 2/0); edit form posts no quality; the gang edge test uses the SRD picker. Also a `as unknown as typeof fetch` cast on one mock, which was failing `tsc` and the build before this change.

## Evidence

- Ada two-cycle (`cd conformance && npm run test:ada -- --cycles 2 -- --run`, after `alr build`): cycle 1 `74/74` files and `627/627` tests; cycle 2 same. Log `tasks/metrics/ada/CREW-COHORTS-01-ada-two-cycle.log`. Earlier failed runs (setup `unknown field "CohortEdges"`; 4 failures in total-collections, canonical-shape, completeness and missing-ops) were fixed before this run.
- Vitest: `crew-cohorts.test.ts` and `crew-detail.test.ts` 104/104 (`npx vitest run src/pages/crew-detail.test.ts src/pages/crew-cohorts.test.ts`); `crew-detail.test.ts` 99/99 after the cast.
- Full frontend vitest: 995/998. The 3 failures are `crew-claims-map.test.ts` (CREW-CLAIMS-MAP-01, `mode-mockups`' uncommitted work), not this change.
- `npx tsc --noEmit`: clean. `npm run build` (frontend): green.
- Browser, `cd conformance && npm run test:browser`: NOT GREEN. The failing journey is `crew-create-trackers`, which waits 10s for `.turf-track .turf-slot[data-stress="1"]`. Commit `6da06235` (CREW-REP-TURF-01) removed the separate turf track; `crew-detail.test.ts` now asserts `.turf-track` is null. The journey is stale against that commit and belongs to the Rep/Turf scope. Its declared cohort checkpoints are never reached, so `crew01-cohort-add.mjs` (before/after below) has NOT run in the browser gate. The runner has no per-journey filter.
- Checkpoint before/after, `conformance/suites-browser/checkpoints/crew01-cohort-add.mjs`:
  - Before: selects `Skulls`; `page.fill` on `input[aria-label="Cohort quality"]` = 3 and `Cohort scale` = 2; asserts the stored values.
  - After: selects `Skulks`; reads `.cohort-add .cohort-quality-derived` and `.cohort-scale-derived` before submit (fails on NaN); after add asserts `.cohort-entry[data-cohort-kind="gang"] .cohort-quality` = `Quality <derived>` and `.cohort-scale` = `Scale <derived>`; checkpoint `cohort-derived-stats-stored`.
- Chromium probe, `agent-docs/test-audit/browser-evidence/crew-cohorts-01/probe.mjs` (run via `managed-browser-smoke.mjs`), crew at Tier 0, log `tasks/metrics/frontend/CREW-COHORTS-01-chromium.log`, `probe.json` written by the probe:
  - 1440×1000: section 481px high, no horizontal overflow, first control 139px into the section, cohort section below the fold (`headingVisibleInitially: false` measured without scrolling). Derived quality/scale `0/0` (Tier 0), no quality input.
  - 768×1024: section 401px, no overflow, below the fold, same derived values.
  - 390×844: section 684px, no overflow, below the fold, same derived values.
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
- Equal-count follow-up: red test `blocks Add while edges and flaws differ…` failed before implementation; green after. `crew-detail.test.ts` gang-add test now adds a matching flaw. Full vitest 1006/1006.
- Sol 6.1 xhigh review of the follow-up: NOT-RUN (Codex usage limit). Needs a rerun before close.
- gameMode.ts: the uncommitted Crew XP intro reorder was adopted as the CREW-XP-TRIGGERS-01 follow-up (commit `5274eb1e`), not this card.
- Full vitest failures in `crew-claims-map.test.ts` were resolved by `mode-mockups`' commit `9a8a3812`; the full run is 998/998 on the current tree.
