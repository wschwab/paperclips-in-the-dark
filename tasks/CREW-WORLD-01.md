---
id: CREW-WORLD-01
title: Crew world data: licensed scope, user-entered factions, explicit starting ally and rival
track: contract + backend + frontend + docs
status: implemented; campaign and publication recorded in the commit record
deps:
  - CREW-WORLD-DATA-01
  - CONTRACT-02
outputs:
  - contract/openapi.yaml
  - contract/schemas/crew.json
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/pitd_normalize.adb
  - backend-ada/server/src/pitd_callback.adb
  - backend-ada/server/src/generated/pitd_schema_validators.adb
  - conformance/suites/semantics/crew-starting-factions.test.ts
  - conformance/suites/contract/endpoints.test.ts
  - conformance/suites/parity/capability-parity.test.ts
  - conformance/src/schemas.ts
  - conformance/src/endpoint-schema-map.test.ts
  - conformance/generated/contract-coverage.json
  - skill/generate-capability-manifest.mjs
  - skill/api-reference/README.md
  - skill/api-reference/capability-manifest.json
  - frontend/src/api/client.ts
  - frontend/src/schema/crew.ts
  - frontend/src/pages/crew-detail.ts
  - frontend/src/pages/crew-detail.test.ts
  - frontend/src/pages/crew-sections/contacts.ts
  - frontend/src/pages/crew-world.test.ts
  - frontend/src/styles/components.css
  - README.md
  - docs/pages/contract/crew-world-sources.mdx
  - tasks/metrics/frontend/CREW-WORLD-01.json
---

# CREW-WORLD-01 — Licensed crew world scope, user-entered factions, explicit starting ally and rival

## Frozen decisions (human, licensing verified at bladesinthedark.com/licensing)

- The SRD is licensed under **CC-BY 3.0 Unported**. The licence **excludes** the Duskwall/Shattered Isles setting,
  NPCs and maps, so official faction and district names, descriptions and locations are **not shipped** in the
  app or in game data.
- Publisher links only. No stock faction list, district list or district text ships.
- Build a manual faction editor, one row per faction (name, optional tier, status), with status bounded by the
  game settings through `faction.set-status`.
- One optional `crew.startingFactions {ally, rival}` with a `faction.set-starting` op. It sets the full pair with no
  side effects, and it is an additive parity entry. The ally and rival pickers draw only from the crew's own factions.
- The README carries the official attribution text, CC-BY 3.0 Unported.
- The options for the human are written up in `docs/pages/contract/crew-world-sources.mdx`.

## What was built

- **Contract.** `faction.set-status` takes an optional `tier` (a nonnegative integer, not bounded by CrewTierMax; `null`
  clears it, omission preserves it). New `faction.set-starting` (`factionSetStarting`) takes `{ally, rival}`: both
  required, an empty string clears a choice, each nonempty name must exactly match one of the crew's own tracked factions,
  both are validated before any write, an unknown name is VALIDATION 400 at `/ally` or `/rival` with no write. The crew
  schema gains an optional `startingFactions` object, and each faction gains an optional `tier`. Absence of
  `startingFactions` means an unrecorded legacy crew; choices are never inferred from status.
- **Backend (Ada).** Body validation, the apply branch for `faction.set-starting`, tier handling, normalization of the
  optional fields, removal clearing only matching references, and the callback's HTTP 400 mapping for the new op.
- **Frontend.** The Factions section gets a one-row add form (name, optional tier, status) and per-faction rows
  (tier, status, Set, Remove). The status inputs carry the settings bounds (`FactionStatus` Min/Max, shown as text).
  Ally and rival pickers list only this crew's factions, plus None. A stale choice that is no longer tracked is kept
  and labelled rather than silently replaced. Validation messages are shown in the editor and no request is sent for
  an invalid entry.
- **Nothing stock.** The editor says "no setting catalogue is bundled" and offers no faction or district picker. No
  district is displayed anywhere in the app. The research draft was moved out of the repository (see below).
- **Parity and manifest.** `factionSetStarting` in `REQUIRED_HUMAN_OPS` (additive, human-approved); human
  sheet-management disposition; route count 115 → 116.
- **README.** Replaces the earlier "CC-BY 4.0" sentence with the official attribution paragraph, CC-BY 3.0 Unported,
  and a statement that the Duskwall setting and official faction or district catalogues are not bundled.

## Research draft: moved out of the repository

`data/world/doskvol-draft.json` (the research transcription of the factions sheet, with its names) was **moved out of
the repository**, not deleted, to `/home/x/code/private-crew-world/doskvol-draft.json`. The working tree no longer
contains it, and the move is committed as a deletion.

**Still open, needs the human's decision.** The research commit `8b40e51f` (local, not pushed) contains the draft.
It sits between `main` (`ec078eb2`, already pushed) and this card's commits, so pushing `main` would publish the
names in that commit's history. Removing it needs a history rewrite of an unpushed local commit, which this card does
not perform. The push of this card is therefore **held**. See the commit record.

## Pre-existing data finding (not changed by this card)

`data/games/blades-in-the-dark.json` already contains district names (Brightstone, Charterhall, Whitecrown) and NPC
names inside playbook Rolodex friend entries. The licence excludes NPCs and setting content, so this should be
reviewed. It predates this card, and changing playbook content is outside the frozen decision, so it was left
unchanged. It is flagged for a decision.

## Red-green

- Ada: `crew-starting-factions.test.ts` (11 cases) covers the new op, validation, the write-free failure paths, tier
  semantics, removal clearing, and legacy documents.
- Frontend: `crew-world.test.ts` plus `crew-detail.test.ts` cover the add row, bounds, the pickers, the stale choice,
  validation, and the request bodies.
- Endpoint and parity counts were updated with each added op.

## Chromium 3×3 (`agent-docs/test-audit/browser-evidence/crew-world-01/check.mjs`)

9/9 at 1440×1000, 768×1024 and 390×844 in light, dark and high contrast. Each case: a fresh Assassins crew with two
factions and an explicit starting pair; the add row (name, tier 3, status 2) yields a third entry with the right body;
the status inputs carry bounds −3 and 3; the picker options are None and the crew's two factions; saving a new rival
sends exactly `{"ally":"Alpha Syndicate","rival":"Gamma Guild"}`; an empty name shows the message and sends no request;
zero page errors; zero horizontal overflow.

## Gates (this tree, before the campaign)

| Gate | Result |
|---|---|
| Ada two-cycle (`npm run test:ada -- --cycles 2 -- --run`) | 627/627 in each cycle |
| tooling (`npm run test:tooling`) | 233/233 |
| conformance typecheck | exit 0 |
| gnatprove (`paperclips_core.gpr --level=2`) | 246 checks proved |
| vitest (frontend) | 972/972, 35 files |
| tsc / build | exit 0 / exit 0 |
| browser journeys (`npm run test:browser`) | 6/6 |
| Chromium 3×3 factions editor | 9/9 |
| mutation campaign 28/28 (`npm run test:mutation`, run once, log `tasks/metrics/contract/CREW-WORLD-01-mutation-combined.log`) | 28/28: P0 19/19, P1 9/9, on the pinned tree `a8bf6b39` after the pin refresh; five stale pins refreshed first (pitd_callback.adb, pitd_normalize.adb, pitd_ops.adb, client.ts, components.css) |
| Sol 6.1 xhigh review | **NOT-RUN**: the Codex CLI returned `usage_limit_reached` at once (`agent-docs/test-audit/browser-evidence/crew-world-01/sol-6.1/stderr.txt`). No other reviewer was substituted. |

## Publication: held

Not pushed. The research commit `8b40e51f` (local, unpushed) holds the research draft with the official names, and it sits below every commit of this card. Pushing `main` would publish those names in history. Removing them needs a rewrite of that unpushed local commit, which needs the human's approval. Once that is decided, the push is origin then radicle, as usual.

## Limits

- The Factions editor is user-entered. The app does not know any official faction, so there is no stock list and no
  district display.
- Status bounds come from the game settings and are enforced by the server. The editor shows them and checks only
  that the value is an integer.
- The ally and rival are explicit records. They are never derived from status.
- Pre-existing fixtures that already name Ironhook Prison and similar setting names (crew and character seeds) were
  left unchanged, because they predate this card and are test data, not game data.
