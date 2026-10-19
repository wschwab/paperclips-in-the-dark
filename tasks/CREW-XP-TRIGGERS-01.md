# CREW-XP-TRIGGERS-01

Playtest feedback: the Resolution crew XP step should show all four SRD crew XP triggers.

## Finding

- The data (`frontend/src/data/crew-advancement.ts`, four `CREW_XP_CATEGORIES`) and the render were already correct. All four triggers were in the DOM.
- The defect was placement. The crew XP editor and intro text came first. At 768px and 390px the triggers sat below the first screen of the card, so a reader saw only the editor and, at most, the first trigger.
- CREW-XP-INFO-01 missed this because its tests asserted DOM presence (`getByText`-style) and not visibility at narrow sizes. Its Chromium evidence did not inspect the lower triggers in the card.

## Fix

- `frontend/src/pages/character-sections/gameMode.ts` (`case "crew-xp"`): the "Crew XP triggers" heading and the four-item list now come first. The intro, lead-in and max note follow the list, then the editor and the Advancement text.
- Red test first: `frontend/src/pages/game-mode-sheet.test.ts`, "the four crew XP triggers come before the crew XP editor". It failed before the change.

## Evidence

- Vitest: `game-mode-sheet.test.ts` and `crew-advancement.test.ts`, 83/83.
- Chromium probe (`agent-docs/test-audit/browser-evidence/crew-xp-triggers-01/probe.mjs`), Resolution → crew-xp, default theme, `tasks/metrics/frontend/CREW-XP-TRIGGERS-01-chromium.log`:
  - 1440×1000: heading at 182px, all four triggers inside the card.
  - 768×1024: heading at 182px, all four triggers inside the card.
  - 390×844: heading at 258px of a 470px card, first trigger starts at 293px. The heading and the first trigger line are visible on the initial view; triggers two to four need the card scrolled (wheel scroll verified, `wheelScrolls: true`).

## Residual

- At 390px the full list does not fit the initial view. Card height is unchanged, per the product decision. Triggers two to four are reached by scrolling the card.
