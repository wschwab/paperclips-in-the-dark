---
id: GAME-MODE-03
title: Per-scoundrel game mode frontend (mode panel, Score, Resolution, downtime)
deps:
  - GAME-MODE-01
track: frontend
outputs:
  - frontend/src/schema/character.ts
  - frontend/src/schema/operation-result.ts
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
acceptance:
  - mode panel (sticky left gutter wide, footer narrow) with Free Play / Score / Downtime switching
  - Score start popups Planning, Loadout, Engagement; load limits read from settings
  - Score loadout display with change-after-confirm; Projects and Contacts collapsed in Score
  - + Desperate action XP (ordinary attribute XP); End Score with confirm
  - six-step Resolution stepper; Skip (optional steps and the whole Resolution) after a confirm; XP questions only in Scoundrel XP; crew editors carry the exact one-player warning
  - entanglements filtered by crew heat with Show all
  - downtime tracker (+1 coin, +1 gift, -1 correction; activity spends)
  - SRD links; Personal always visible; advise, never block
  - client ops named by operationId (PARITY-HUMAN-003)
  - frontend tests, typecheck and build green; Ada suite green
  - real-Chromium evidence at 1440x1000, 768x1024, 390x844 in light, dark, high contrast; Luna review; 28/28 mutation campaign
---

# GAME-MODE-03 — per-scoundrel game mode frontend

**Status:** IMPLEMENTED, NOT REVIEWED. Frontend suite 841 tests / 24 files, `tsc` clean, build
green. Ada conformance `npm run test:ada`: 66 files, 576/576, including PARITY-HUMAN-003. **Not
done yet:** real-Chromium evidence, the Luna review, and the 28/28 mutation campaign. These
are waiting on this round's stop; nothing has been run for them.

**Design source:** `docs/pages/contract/game-mode-proposal.mdx`, `tasks/GAME-MODE-01.md`, the
approved mockups in `docs/public/mockups/game-mode/`.

## Log

- Red first, domain and client: `pages/game-mode.test.ts` (module missing) and
  `api/game-mode-client.test.ts` (five ops missing). Green after `pages/game-mode.ts` and the client ops.
- Process deviation: the sheet integration was written before `pages/game-mode-sheet.test.ts`. Its
  three first-run failures were real (linked crew not loaded on first render) and were fixed.
- Skip confirms (red first): two tests failed, `confirm` never called. Green: optional-step Skip
  and a new "Skip Resolution" button both call `window.confirm` before `mode.flow.set`.
- Required fields (red first): a decode test required `mode`, `modeFlow` and `downtime`; it failed
  because `mode` decoded as missing-but-defaulted. Now all three are required in the decoder, matching
  `contract/schemas/character.json` `required`. The "not available" budget branch and its test are removed.
  This is wider than the request, which named downtime only: `mode` and `modeFlow` are also in the
  contract's required list, so they are required too.
- Client ops renamed to their OpenAPI operationIds (PARITY-HUMAN-003 looks them up by name):
  `characterModeSet`, `characterModeFlowSet`, `characterDowntimeSpend`, `characterDowntimeAdjust`,
  `characterDowntimeReset`. The wiring check requires the name and a listener in the routed page group,
  which `character-detail.ts` supplies.
- Hand-built character fixtures gained the required fields (`client.test.ts`, `character-detail.test.ts`,
  `character-history.test.ts`, `character-create.test.ts`). Crew fixtures are unchanged.
- Catalog pins refreshed: M19 `main.ts`, M20 `client.ts`, M26 `character-detail.ts`. Not yet
  re-run as a campaign.
- End Score confirm copy corrected to the approved rule (one existing assertion updated).
- Verification at this point: `tsc --noEmit` exit 0; `npx vitest run` 24 files / 841 tests passed;
  `npm run build` exit 0; `cd conformance && npm run test:ada` exit 0, 66 files / 576 tests passed.

## Design decisions in the code

- Nothing gates an operation. Every control is enabled except during an in-flight request.
- Score popups and the Resolution step come from the stored `modeFlow` cursor, so they survive reloads.
- Load limits come from `LoadMaxima.CommitmentMaxBulk`; desperate attributes come from `Attributes`.
- Desperate action XP is the existing attribute XP op (+1), marked immediately.
- "My share · coin" is the existing fund op on this scoundrel's own purse.
- Crew writes use the existing crew track ops with the observed crew revision as `If-Match`. A stale
  response shows a reconcile notice and reloads the crew. Every crew editor carries the exact one-player warning.
- Constants that are design content, not limits: approaches, the downtime activity menu, the entanglement
  bands, and the Payoff/Heat guide text.

## Known gaps (not yet verified)

- Browser behaviour is unverified: no Chromium run yet. The 1100px breakpoint and footer are unchecked.
- The stale-crew reconcile path is implemented, not covered by a test.
- Undo for End Score relies on the sheet's existing undo.
- The mutation campaign (28/28) has not run; the catalog pins are refreshed but unverified by a campaign.
- Routing of the GAME-MODE-01 metrics validator failure is handled by the other worker, not this card.
