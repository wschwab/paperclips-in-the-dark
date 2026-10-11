---
id: GAME-MODE-03
title: Per-scoundrel game mode frontend (mode panel, Score, Resolution, downtime)
deps:
  - GAME-MODE-01
  - GAME-MODE-02
track: frontend
outputs:
  - frontend/src/schema/character.ts
  - frontend/src/schema/operation-result.ts
  - frontend/src/schema/campaign.ts
  - frontend/src/schema/campaign-summary.test.ts
  - frontend/src/api/client.ts
  - frontend/src/api/game-mode-client.test.ts
  - frontend/src/pages/game-mode.ts
  - frontend/src/pages/game-mode.test.ts
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/character-detail.test.ts
  - frontend/src/pages/character-sheet.ts
  - frontend/src/pages/character-sections/gameMode.ts
  - frontend/src/pages/game-mode-sheet.test.ts
  - frontend/src/pages/character-create.test.ts
  - frontend/src/pages/character-history.test.ts
  - frontend/src/api/client.test.ts
  - frontend/src/styles/game-mode.css
  - frontend/src/main.ts
  - conformance/fixtures/mutation-catalog.json
  - agent-docs/test-audit/browser-evidence/game-mode/
acceptance:
  - mode panel (sticky left gutter wide, fixed footer narrow); Free Play / Score / Downtime switching
  - Score popups Planning, Loadout, Engagement as aria-modal overlays; load limits from settings; approved copy and factor table
  - Score committed loadout; Change loadout proposal that commits only on Confirm change; Projects and Contacts collapsed in Score
  - + Desperate action XP (ordinary attribute XP); End Score confirm with the approved notice
  - six-step Resolution stepper of direct-selection controls; Skip after a confirm on optional steps and Skip Resolution; Next: Downtime on the last step
  - XP questions only in Scoundrel XP; direct crew editors with the exact one-player warning and approved labels
  - entanglements filtered by crew heat with Show all
  - downtime budget in the panel; activity menu in the panel (wide) or the sheet (narrow)
  - SRD links; Personal always visible; advise, never block
  - roster summary decodes mode (campaign.json characterSummary)
  - client ops named by operationId (PARITY-HUMAN-003)
  - frontend tests, typecheck and build green; 6/6 browser journeys; real-Chromium evidence; Luna review PASS on the final revision; 28/28 mutation campaign
---

# GAME-MODE-03 — per-scoundrel game mode frontend

**Status:** NOT ACCEPTED. Every reachable gate is green at `b3b3eff4` (below), including the
full 28/28 mutation campaign. The independent Luna xhigh review has NOT passed on any revision.
The latest review (`b3b3eff4`) did not run: the openai-codex provider returned
`usage_limit_reached`. It has to be re-run once the limit resets. Nothing here is marked reviewed.

**Current revision:** `5fcb5325e91c9f5739dacc534e66f29dd4e5daf4` (change `wysqlwpo`, F1 and F10 fixes),
on top of `b3b3eff4` (round-4 fixes), the backend roster commit `654c3cff` (GAME-MODE-02) and `86ae8333`.
Luna has not reviewed `5fcb5325`; it runs once the openai-codex usage limit resets.

**Design source:** `docs/pages/contract/game-mode-proposal.mdx`, `tasks/GAME-MODE-01.md`, and the
approved mockups in `docs/public/mockups/game-mode/`.

## Verification at the current revision (`3c6a4658`; code at `5f19ee2b`)

Code changes since `5fcb5325`: Sol round-1 fixes (`74f9ecc7`), Sol round-2 fixes (`94a98001`), and the
Entanglements rework (`5f19ee2b`). `3c6a4658` is the backlog record commit (docs only).

- `npx tsc --noEmit` exit 0; `npx vitest run` 27 files, 884 tests passed; `npm run build` exit 0.
- `npm run test:browser` 6/6 journeys PASS (on the entanglement build).
- `npm run test:mutation` 28/28 killed, P0 19/19, P1 9/9 (exit 0). Pins: `frontend/src/pages/character-detail.ts`
  (M26) `f4b99f8a…`; `frontend/src/main.ts` and `frontend/src/api/client.ts` unchanged. No pin covers the entanglement files.
- Entanglements Chromium check (`browser-evidence/game-mode/entanglements-check.mjs`, output
  `entanglements-check.json`, 9 rows = 3 sizes x 3 themes): heat 4 selects band 4–5; reminder above the
  table (top 235/206/282 px light at 1440/768/390); five disclosures collapsed, first expands on click;
  Show all shows 4 rows; no horizontal overflow; mode switch reachable; attribution present; summary
  contrast at least 12:1; 0 page errors. Screenshots `entanglements-<w>x<h>-<theme>.png`.

## Sol 6.1 review history (openai-codex, gpt-6.1-sol, xhigh)

| Pin | Result | Findings and fix |
|---|---|---|
| `7c158df3` | FAIL, eight findings (F1–F8) | Mode switch covered by the narrow Resolution card (F1); load totals used absolute max not commitment allowance (F2); Cutter condition missing (F3); crew editor copy contradicted delta behaviour (F4); high-contrast hover 3.58:1 (F5); approved content missing (F6); approved layouts (F7); End Score confirm wording (F8). Verdict `sol-6.1/verdict-7c158df3.md`. Fixed in `74f9ecc7`: F1 (narrow overlay `inset: 0 0 40vh 0`, cascade order fixed), F2 (`loadLimitFor` maps the contract key to the settings level name), F4, F5, F8. F3, F6, F7 were only partly addressed (see Known gaps). |
| `74f9ecc7` | FAIL, seven findings (R2-01–R2-07) | Pressed planning/load choices had no selected state (R2-01); Scoundrel XP showed the Lurk example, not the playbook condition (R2-02); no track totals beside XP marks (R2-03); Entanglements lacked the highest-die rule and the bring-into-play reminder (R2-04); Crew XP and Crew Rep lacked guidance and SRD links (R2-05); End Score tooltip contradicted the flow (R2-06); mode switch wrapped to two rows (R2-07). Verdict `sol-6.1/verdict-74f9ecc7-round2.md`. The round-2 reviewer ran on the round-1 prompt text (`review-prompt-round2-74f9ecc7-as-run.md`); its findings were still valid for `74f9ecc7`. Fixed in `94a98001` (gates: browser 6/6, mutation 28/28). |
| `3c6a4658` | FAIL, four findings (R3-01–R3-04); round-2 fixes and the Entanglements rework passed (ENT-01–ENT-05 PASS) | R3-01 first-step Resolution Back disabled (approved 06a links it to the Score sheet). R3-02 narrow Downtime budget not in the activities card; activity menu not a two-column grid with Other spanning. R3-03 Planning choices were label buttons with a detached description, not selectable cards. R3-04 approved reminders missing: Scoundrel XP (success and track assignment), Heat (the crew's heat-maximum reminder), Entanglements (the GM generates the entanglement). Verdict `sol-6.1/verdict-3c6a4658-round3.md`. Fixed in `c6b76439`: first Back returns to the Score sheet; each approach is one `.approach-card` button, two columns wide and one column at 760px; the Downtime budget has one copy per layout, the sheet copy in the activities card, and the menu is a CSS grid (its inline display had overridden the grid, found by the Chromium check and fixed); the three reminders are present, with the heat maximum read from the crew, never a literal. Gates at `c6b76439`: vitest 894/894, tsc 0, build 0, browser 6/6, mutation 28/28; Chromium `round3-check.mjs` 9/9 rows (`round3-check.json`). |
| `c6b76439` | blocked: `openai-codex` returned `usage_limit_reached` on two attempts (stderr `sol-6.1/stderr-c6b76439.txt`). No verdict. | Round 4 checks R3-01–R3-04 and regressions. Rerun when the provider limit resets: `omp -p --model openai-codex/gpt-6.1-sol --thinking=xhigh --no-session --no-lsp --approval-mode yolo "@agent-docs/test-audit/browser-evidence/game-mode/sol-6.1/review-prompt.md" "<msg>" < /dev/null`. |

## Entanglements (round-3 direction from the human)

- The table and the twelve SRD descriptions are in `frontend/src/data/entanglements.ts`, transcribed from
  <https://bladesinthedark.com/entanglements> (CC-BY). `data/games/blades-in-the-dark.json` has no entanglement
  table, and adding one would need a settings-schema change through the Ada loader, so a frontend data module
  is the home (the existing planning and engagement tables are frontend modules too). The descriptions are the
  SRD main paragraphs; the SRD's example quotes are omitted.
- The table selects the column for the crew's current heat (unchanged behaviour).
- The reminder "Before you roll: check that nobody else on the crew is already rolling entanglements for this score." sits at the top of the step.
- Under the table, each of the five entanglements in the crew's heat column is a `<details>` disclosure with its SRD text.
  No roll input exists, so there is no highlight or auto-expand; the disclosure list is the design.
- Show all still shows the full matrix. The attribution line and an SRD ↗ link are under the step.

## Verification at the previous revision (`5fcb5325`)


Code is identical to the verified revision of the F1/F10 fix; the records commit adds no code.

- `npx tsc --noEmit` exit 0; `npx vitest run` 25 files, 862 tests passed; `npm run build` exit 0.
- `npm run test:browser` 6/6 journeys PASS (after the non-blocking Resolution backdrop, see F1 below).
- `npm run test:mutation` 28/28 killed, P0 19/19, P1 9/9 (exit 0). M26 pin refreshed to `b73c5658…`.
- Chromium capture at `5fcb5325`: 117 rows, 0 overflow, 0 page errors, contrast >= 4.5:1. Resolution
  entanglements screenshots show the overlay and the matching band table.

The verification below is for the previous revision `b3b3eff4`; its Ada and tooling counts still hold
because no backend file changed.

## Verification at `b3b3eff4`

- `npx tsc --noEmit` exit 0.
- `npx vitest run` 25 files, 861 tests passed.
- `npm run build` exit 0.
- `cd conformance && npm run test:browser` 6/6 journeys PASS (run at `b3b3eff4`).
- Chromium capture `agent-docs/test-audit/browser-evidence/game-mode/capture.mjs` at `b3b3eff4`:
  117 rows (13 states x 3 viewports x 3 themes), 0 overflow, 0 page errors, minimum contrast
  at or above 4.5:1. Screenshots and `summary.json` are in that folder.
- The catalog pin for `frontend/src/pages/character-detail.ts` (M26) is `43e1bd6f…` and matches the file.
- `cd conformance && npm run test:ada`: 67 files, 577/577 passed (exit 0).
- `cd conformance && npm run test:tooling`: 18 files, 233/233 passed (exit 0).
- `npm run test:mutation` (conformance): 28/28 killed, P0 19/19, P1 9/9; post-campaign source
  verification PASS (exit 0).
- Only `tasks/GAME-MODE-03.md` and `tasks/metrics/frontend/GAME-MODE-03.json` differ from `b3b3eff4`
  in code-free paths; the code verified is the code at `b3b3eff4`.

## Luna review history (openai-codex, gpt-5.6-luna, xhigh)

Each round pinned a revision and returned FAIL with specific findings. Each finding was fixed
red-green and committed, then the review was repeated.

| Pin | Result | Findings and fix |
|---|---|---|
| `9f18cdcf` | FAIL (superseded before the next pin) | Planning, loadout, End Score, crew, Crew Rep and Downtime defects. Its verdict is `luna/verdict-9f18cdcf-superseded.md`. |
| `654c3cff` | FAIL, nine findings | Overlay popups; Planning descriptions; Engagement footer and reminder; Change-loadout replacement flow; End Score notice; crew labels; Crew Rep Skip and footer; Downtime menu on narrow. Its original `verdict.md` was overwritten; the findings are recorded in `luna/verdict-654c3cff-FINDINGS.md` from the output read before the overwrite. Fixed in `e16bd9bb`. |
| `e16bd9bb` | FAIL, two findings | Downtime menu should be in the panel on wide screens (fixed by showing a panel copy and a sheet copy, one per layout). Stepper showed enum ids (fixed with approved names). Fixed in `0ee1bbc3`. |
| `0ee1bbc3` | FAIL, one finding | Committed gear listed twice in the checklists (the server lists a committed item in both `gear.loadout` and `gear.availableGear`). Fixed in `d90fea3a`, keyed by name. |
| `d90fea3a` | FAIL, three findings | Planning Back disabled (now returns to the score sheet); Engagement factor table missing (added with approved wording); Resolution steps not selectable (now six direct-selection controls). Fixed in `b3b3eff4`. Verdict: `luna/verdict-d90fea3a.md`. |
| `b3b3eff4` | NOT RUN | `openai-codex` returned `usage_limit_reached`. No verdict. |

Raw outputs: `luna/raw-output-<pin>.txt` for each round, and `luna/stderr-<pin>.txt`.

## Process notes

- Red-first is recorded for each finding (a new test per finding, run and failing for the stated reason).
- Process deviation (round 1): the sheet integration was written before its DOM tests. Three first-run
  failures were real (linked crew not loaded on first render) and were fixed.
- Decoders: `mode`, `modeFlow` and `downtime` are required on Character, matching the contract's
  required list. `mode` on the roster summary is optional, matching `campaign.json` (absent on degraded rows).
  `OperationResult` gains `mode` and `suggestedOps`.
- Client ops are named by their OpenAPI operationIds (`characterModeSet`, `characterModeFlowSet`,
  `characterDowntimeSpend`, `characterDowntimeAdjust`, `characterDowntimeReset`), as PARITY-HUMAN-003 requires.
- The Change-loadout proposal commits only on Confirm change, as explicit gear writes (level first, then
  removals, then additions), each using the revision from the previous write.
- Confirmations: Skip on optional steps and Skip Resolution each ask first.
- End Score notice says partial stress was kept unless stress was full (the contract rule).

## Known gaps

- A partial-failure in the Change-loadout chain (for example, a write fails midway) leaves earlier writes applied. The sheet shows the gear error, but no rollback exists.
- The stale-crew reconcile path is implemented, not covered by a test.
- The Engagement factor table and the Loadout copy are the approved mockup wording; they are not from game data.
- Fixed after `9f18cdcf` (superseded review, `luna/verdict-9f18cdcf-superseded.md`):
  - F10: the entanglement table now matches mockup 06d. The initial view shows the matching heat band (Result | Heat band). "Show all" reveals the full matrix (Result | Heat 0–3 | Heat 4–5 | Heat 6+). The text is transcribed from the mockup because `data/games` has no entanglement table. Red tests: `game-mode-sheet.test.ts` round-5 and `game-mode.test.ts` band mapping.
  - F1: the Resolution surface is an aria-modal dialog outside the sheet, titled with the step name and "Score resolution · N of 6", like the Score popups. Its backdrop does not capture pointer events, so the sheet stays operable beneath it. Without this, the frozen `lifecycle` journey failed (the overlay intercepted the stress control after End Score).
- Decided by the human: the Score popups (Planning, Loadout, Engagement, Change loadout) stay blocking, consistent with each other. Resolution is the deliberate non-blocking exception. Do not report the blocking Score popups as defects.
- Outstanding gate: a Sol 6.1 PASS on `c6b76439` (round 4) is still required. The reviewer returned `usage_limit_reached` on two attempts, so there is no verdict. Rounds 1 to 3 returned FAIL (see the Sol table). The earlier Luna gate on `5fcb5325` is superseded: the reviewer is now GPT 6.1 Sol per AGENTS.md.
- Round-1 layout items (Sol F7) re-checked in round 3 only for the Planning cards and the narrow Downtime card (R3-02, R3-03). Still unverified: the Score popup subtitle "Start a Score · N of 3" and header Close, the footer split, the mode-panel equal cells, and the Payoff/Heat reference tables. Round 4 must confirm each, or report it still open.
- Round-1 F6 items fixed in round 2 (`94a98001`): Crew XP and Crew Rep guidance and SRD links, the Entanglements highest-die rule and reminder. Round 3 confirmed them (R2-05 PASS, ENT-04 PASS).
