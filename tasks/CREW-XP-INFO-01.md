---
id: CREW-XP-INFO-01
title: Resolution Crew XP step shows the SRD crew advancement guidance (frontend)
track: frontend
deps: []
outputs:
  - frontend/src/data/crew-advancement.ts
  - frontend/src/data/crew-advancement.test.ts
  - frontend/src/pages/character-sections/gameMode.ts
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/game-mode-sheet.test.ts
  - agent-docs/test-audit/browser-evidence/crew-xp-info-01/ (evidence, gitignored)
  - tasks/metrics/frontend/CREW-XP-INFO-01-browser.log
---

# CREW-XP-INFO-01 — Crew advancement guidance in the Resolution Crew XP step

## Goal

The Resolution "Crew XP" step shows the crew advancement guidance from
https://bladesinthedark.com/advancement#crew-advancement as helpful information. It must
make clear that each crew XP category can yield up to 2 XP, not just 1. It carries a CC-BY
attribution and an SRD link, as Entanglements does. The crew's own XP trigger comes from the
crew type game data.

## Source and transcription

The SRD page was fetched and the Crew Advancement section transcribed into
`frontend/src/data/crew-advancement.ts`, following the Entanglements module
(`frontend/src/data/entanglements.ts`): the module holds the SRD wording with markdown emphasis
removed, plus the attribution and the URL.

- Transcribed: the crew XP rule ("mark 1 crew XP for each item…; mark 2 crew XP for it"), the four
  trigger categories in SRD order with their SRD text, the advance rule, the "say how you've
  obtained" prompt, and the Profits rule.
- Omitted: the SRD's Assassins example quote in the "Your crew-specific xp trigger" item. The
  crew's own trigger is shown instead, from the crew type data (`ExperienceTrigger`).
- Added by the app: one summary line, "Each category can yield up to 2 XP: 1 if it occurred, 2
  if it occurred multiple times or in a major way." It is labelled in the module as an app
  summary, not SRD text. It states the per-category maximum the human asked for.

The text is not in `data/games/*.json`. Entanglements keeps its text in a frontend module, so
the crew text follows that pattern. The crew-specific trigger is data-driven: the character page
loads the crew game data (`getCrewGameData`), and `extractExperienceTrigger` reads the linked
crew type's `ExperienceTrigger`.

## Red-green

1. `frontend/src/data/crew-advancement.test.ts` was written first. It failed with "Cannot find
   module './crew-advancement.js'".
2. R2-05 in `game-mode-sheet.test.ts` was updated to the new wording, attribution and anchored
   link, and a second test asserts the crew-type trigger from the mocked crew data. Both failed on
   the old copy (2 failed, 3 passed).
3. The implementation followed. The full frontend suite is 953/953 (33 files). The earlier count
   was 947, which is +5 data tests and +1 new R2-05 test.

## Wiring

- `GameModeUi` gains `crewXpTrigger: string | null`. `character-detail.ts` sets it from the linked
  crew's `crewTypeName` and the loaded crew game data.
- `loadCrewGameTypes` is called when the linked crew loads. A failed load leaves the generic
  wording "This crew's trigger is on its crew type; check the crew sheet."
- The Crew XP step keeps the existing crew XP editor and the GM confirmation line, then shows the
  guidance, the advancement rules, the profits rule, the attribution and the SRD link.

## Chromium evidence (3 sizes × light, dark, high contrast)

`agent-docs/test-audit/browser-evidence/crew-xp-info-01/check.mjs` creates a real Assassins crew,
links a Cutter to it through `dossier.update`, sets Score and the Crew XP step, and checks each
combination.

Result: 9/9 pass (`check.json`). Each row confirms the crew type's trigger text ("Execute a
successful murder, ransom, or assassination operation."), the "up to 2 XP" line, the four
category titles, the CC-BY attribution, the SRD anchor link, a scrollable card, zero horizontal
overflow, and that after wheel-only scrolling the SRD link is hit-testable with the page not
scrolled. Zero page errors. Screenshots: `crew-xp-<width>-<theme>.png`.

## Gates

| Gate | Result |
|---|---|
| vitest (frontend) | 953/953, 33 files |
| tsc | exit 0 |
| build | exit 0 |
| browser journeys (`npm run test:browser`) | 6/6 PASS (`tasks/metrics/frontend/CREW-XP-INFO-01-browser.log`) |
| Chromium 3×3 (`check.mjs`) | 9/9 |
| mutation campaign 28/28 | see `tasks/metrics/frontend/CREW-XP-INFO-01.json` |

Pins: `frontend/src/pages/character-detail.ts` (M26) refreshed to
`3c1ad11bad21…`. No other catalog target changed; `gameMode.ts` has no pin.

## Limits

- The README line "This project reproduces no rulebook text" is now out of date. Entanglements
  and this card both carry SRD text. It was not changed here; it needs a decision.
- The advancement text is shown in the Resolution step only, not in the crew page.
