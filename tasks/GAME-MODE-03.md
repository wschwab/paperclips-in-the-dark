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

**Status:** NOT ACCEPTED. The implementation is complete for every finding raised so far, and
the gates are green, but the independent Luna xhigh review has NOT passed on any revision.
The latest review (`b3b3eff4`) did not run: the openai-codex provider returned
`usage_limit_reached`. It has to be re-run once the limit resets. Nothing here is marked reviewed.

**Current revision:** `b3b3eff450f413abae7bc034504788a25f8a1567` (change `utytlmwq`, round-4 fixes),
on top of the backend roster commit `654c3cff` (GAME-MODE-02) and the Ada commit `86ae8333`.

**Design source:** `docs/pages/contract/game-mode-proposal.mdx`, `tasks/GAME-MODE-01.md`, and the
approved mockups in `docs/public/mockups/game-mode/`.

## Verification at the current revision (`b3b3eff4`)

- `npx tsc --noEmit` exit 0.
- `npx vitest run` 25 files, 861 tests passed.
- `npm run build` exit 0.
- `cd conformance && npm run test:browser` 6/6 journeys PASS (run at `b3b3eff4`).
- Chromium capture `agent-docs/test-audit/browser-evidence/game-mode/capture.mjs` at `b3b3eff4`:
  117 rows (13 states x 3 viewports x 3 themes), 0 overflow, 0 page errors, minimum contrast
  at or above 4.5:1. Screenshots and `summary.json` are in that folder.
- The catalog pin for `frontend/src/pages/character-detail.ts` (M26) is `43e1bd6f…` and matches the file.
- **Not run:** the 28/28 mutation campaign. It is a required gate. Run `npm run test:mutation`
  in `conformance/` once the Luna review is settled.
- **Not run:** the Ada suite again at this revision. The backend commit reports Ada 577/577.

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
- Outstanding gates above: Luna PASS, 28/28 mutation campaign, and a fresh Ada run at the final revision.
