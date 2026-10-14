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
  - conformance/fixtures/mutation-catalog.json
  - docs/pages/frontend/f2x-crew-xp.mdx
  - tasks/metrics/frontend/CREW-XP-INFO-01-browser.log
  - agent-docs/test-audit/browser-evidence/crew-xp-info-01/ (evidence, gitignored)
---

# CREW-XP-INFO-01 — Crew advancement guidance in the Resolution Crew XP step

## Goal

The Resolution "Crew XP" step shows the crew advancement guidance from
https://bladesinthedark.com/advancement#crew-advancement as helpful information. It makes clear
that each crew XP category can yield up to 2 XP. It carries a CC-BY attribution and an SRD link, as
Entanglements does. The crew's own XP trigger comes from the crew type game data.

## Transcription rules (what the module now holds)

`frontend/src/data/crew-advancement.ts` holds the SRD wording exactly: case and punctuation as the
SRD prints them, with markdown emphasis removed. Entanglements keeps its text in a frontend module,
so the crew text follows that pattern rather than `data/games/*.json`.

- **Verbatim:** the crew XP rule, its lead-in "The crew xp triggers are:", the four trigger
  categories in SRD order (including the Smugglers' example in the first category), the advance
  rule, the origin prompt, and the Profits rule.
- **Omitted (the one permitted omission):** the SRD's Assassins example in the advancement
  paragraph. The crew's own trigger is shown from the crew type data (`ExperienceTrigger`).
- **App-written (one line, labelled in the module):** `CREW_XP_MAX_NOTE`, "Each category can yield
  up to 2 XP: 1 if it occurred, 2 if it occurred multiple times or in a major way." It states the
  per-category maximum that the human asked for.

## Sol 6.1 round 1 (pinned 1fb39421): FAIL, fixed

The first version was not verbatim. Sol checked it against the live page and found: `xp` changed
to `XP` in three places; the lead-in "The crew xp triggers are:" dropped; the period after
"Your crew-specific xp trigger." dropped; and the Smugglers' example dropped. The example is part of
the SRD category text, not the Assassins advancement example, so dropping it was an unauthorised
omission. The module comment also claimed that only emphasis was removed, which was wrong.

Fix: the module, its tests and R2-05 now pin the verbatim wording. The data tests failed on the
old module (2 failed, 3 passed) before the fix. The lead-in is rendered in the step, and R2-05
asserts it and the Smugglers' example.

## Red-green

1. `frontend/src/data/crew-advancement.test.ts` was written first against the SRD strings. Its
   first version failed with "Cannot find module". The verbatim version failed on the old module
   (2 failed, 3 passed).
2. R2-05 in `game-mode-sheet.test.ts` asserts the new wording, the lead-in, the Smugglers' example,
   the attribution and the anchored link. A second test asserts the crew type's trigger from the
   mocked crew data.
3. Each red step is shown above. The final tree passes the full frontend suite at 953/953
   (33 files), which is +5 data tests and +1 new R2-05 test over 947.

## Wiring

- `GameModeUi` gains `crewXpTrigger: string | null`. `character-detail.ts` sets it from the linked
  crew's `crewTypeName` and the loaded crew game data (`getCrewGameData`, then
  `extractExperienceTrigger`).
- `loadCrewGameTypes` is called when the linked crew loads. A failed load shows the generic wording
  "This crew’s trigger is on its crew type; check the crew sheet."
- The Crew XP step keeps the crew XP editor and the GM confirmation line, then the guidance, the
  advancement rules, the profits rule, the attribution and the SRD link.

## Chromium evidence (3 sizes × light, dark, high contrast)

`agent-docs/test-audit/browser-evidence/crew-xp-info-01/check.mjs` creates a real Assassins crew,
links a Cutter through `dossier.update`, sets Score and the Crew XP step, and checks each case.

- Before the transcription fix: 9/9 (`check.json` from that run was overwritten).
- After the transcription fix: 9/9 (final run). Each row confirms the crew type's trigger text, the
  "up to 2 XP" line, the four category titles, the CC-BY attribution, the SRD anchor link, a
  scrollable card, zero horizontal overflow, zero page errors, and that after wheel-only scrolling
  the SRD link is hit-testable with the page unscrolled.

## Gates (final tree)

| Gate | Result |
|---|---|
| vitest (frontend) | 953/953, 33 files |
| tsc | exit 0 |
| build | exit 0 |
| browser journeys (`npm run test:browser`) | 6/6 PASS (`tasks/metrics/frontend/CREW-XP-INFO-01-browser.log`) |
| Chromium 3×3 (`check.mjs`) | 9/9 |
| Sol 6.1 xhigh review | round 1 FAIL (fixed); round 2: see the record below |
| mutation campaign 28/28 | 28/28 (P0 19/19, P1 9/9) in the combined campaign at `2b36dd64` (`tasks/metrics/contract/LOADOUT-ATOMIC-01-mutation-combined.log`) |

Pins: M26 (`frontend/src/pages/character-detail.ts`) refreshed to `e8f7f30e9b12…` by the takeover. The
combined campaign ran after the other worker's commits and the pin refresh (`2b36dd64`); it did not
cover this card's text separately. `gameMode.ts` and `crew-advancement.ts` have no pin.

## Limits

- The README line "This project reproduces no rulebook text" is now out of date. Entanglements and
  this card both carry SRD text. It was not changed here; it needs a decision.
- The advancement text is shown in the Resolution step only, not in the crew page.

## Sol 6.1 round 2 (pinned 99c7c2b8): PASS

Verdict: `agent-docs/test-audit/browser-evidence/crew-xp-info-01/sol-6.1/round2/verdict.md`. 0 implementation findings. Live SRD transcription 13/13 strings verbatim; frontend commands pass (vitest, tsc, build); both regression faults detected; Chromium 18/18 (nine linked and nine unlinked cases). The initial probe read 0/18 only because the review probe joined two separate paragraphs into one substring, so the probe was corrected and rerun, and both results are kept. The campaign and repository-wide browser suite were not requested in this review.
