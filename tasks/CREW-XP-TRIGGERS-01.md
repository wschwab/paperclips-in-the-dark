# CREW-XP-TRIGGERS-01

Playtest feedback: the Resolution crew XP step should show all four SRD crew XP triggers.

## Finding

- The data (`frontend/src/data/crew-advancement.ts`, four `CREW_XP_CATEGORIES`) and the render were already correct. All four triggers were in the DOM.
- The defect was placement. The crew XP editor and intro text came first. At 768px and 390px the triggers sat below the first screen of the card, so a reader saw only the editor and, at most, the first trigger.
- CREW-XP-INFO-01 missed this because its tests asserted DOM presence (`getByText`-style) and not visibility at narrow sizes. Its Chromium evidence did not inspect the lower triggers in the card.

## Fix

- `frontend/src/pages/character-sections/gameMode.ts` (`case "crew-xp"`): the "Crew XP triggers" heading and the four-item list now come first. The intro, lead-in and max note follow the list, then the editor and the Advancement text.
- Test: `frontend/src/pages/game-mode-sheet.test.ts`, "the four crew XP triggers come before the crew XP editor". Its failing run before the original change is not saved, so the original red-first chronology is NOT evidenced and is not claimed.
- Red/green guard for the list-first order (added in the re-review round): "the trigger list comes before the crew XP intro paragraph". Green on the committed order (`1 passed`). Red after temporarily moving the intro above the list: `expected 360 to be less than 162`. Order restored; the file is 84/84.

## Evidence

- Vitest: `game-mode-sheet.test.ts` (83) and `crew-advancement.test.ts` (5), 88/88 together (`npm test -- --run src/pages/game-mode-sheet.test.ts src/data/crew-advancement.test.ts`). The earlier "83/83" counted only the sheet file.
- Chromium probe (`docs/public/evidence/crew-xp-triggers-01/probe.mjs`), Resolution → crew-xp, default theme, `tasks/metrics/frontend/CREW-XP-TRIGGERS-01-chromium.log`:
  - 1440×1000: heading at 182px, all four triggers inside the card.
  - 768×1024: heading at 182px, all four triggers inside the card.
  - 390×844: heading at 258px of a 470px card, first trigger starts at 293px. The heading and the first trigger line are visible on the initial view; triggers two to four need the card scrolled (wheel scroll verified, `wheelScrolls: true`).

## Residual

- At 390px the full list does not fit the initial view. Card height is unchanged, per the product decision. Triggers two to four are reached by scrolling the card: by wheel (`docs/public/evidence/crew-xp-triggers-01/probe.mjs`) and, after the touch fix below, by a touch swipe (`docs/public/evidence/crew-xp-triggers-01/touch-swipe-probe.mjs`, `touch-swipe.json`: card `scrollTop` 0 → 390 → 780 → 1170 over three swipes, page `scrollY` 0).
- Review fix (Sol 6.1 xhigh at `086cae52`, FAIL): a touch drag over the non-blocking Resolution card scrolled the page underneath and left triggers two to four unreachable. Red: `docs/public/evidence/crew-xp-triggers-01/touch-swipe-probe.mjs` before the fix, `cardScrolledAfterTouch: false`, page scrolled 633–2075px. Fix: `character-detail.ts` forwards touch moves to the card (`resolutionCardAt`, shared with the wheel path), with touch listeners cleaned up on teardown.

## Follow-up: list-first order

- The committed fix (713bc772) left the intro, lead-in and max note between the heading and the list. The working copy that the 390 evidence above was measured on moved the list directly under the heading; the intro paragraphs follow it. This follow-up commit records that order in `frontend/src/pages/character-sections/gameMode.ts`.
- `game-mode-sheet.test.ts` and `crew-advancement.test.ts`: 88/88 together with the order in place (83 sheet + 5 advancement).
- Probe rerun (`docs/public/evidence/crew-xp-triggers-01/probe.mjs`, log `tasks/metrics/frontend/CREW-XP-TRIGGERS-01-followup-chromium.log`): 390×844 heading at 258px, first trigger at 293px of a 470px card. The first trigger's line runs past the card's bottom edge (`inCard: false` for all four, from the probe's full-box test), so it is partly visible in the initial view. Triggers two to four still need the card scrolled.
- The list-before-intro order is now locked by the guard in line 15. Before that guard, the existing test checked only list-before-editor. The red-first claim for the original order (committed as 713bc772) is not evidenced; only the current order is covered by the probe JSON above.

## Frozen-tree acceptance (takeover, tree `e360683e`)

- Vitest 1006/1006 at `e360683e`; 1007/1007 on the current tree (`086cae52`). `tsc` clean; `vite build` green; browser 6/6 PASS; validators PASS (metrics 190 files, traceability 231/231, reconcile 17/17); Vocs build 163 files, all re-run on the tree before `e163eb36`.
- Mutation campaign 28/28 (P0 19/19, P1 9/9; `tasks/metrics/contract/MUTATION-28-final-combined.log`).
- The 390px first-trigger partial visibility above is unchanged by this acceptance; it is recorded for the user, not a blocker.
- Sol 6.1 xhigh: **NOT-RUN** (Codex `usage_limit_reached`). The user will run it when quota resets.
