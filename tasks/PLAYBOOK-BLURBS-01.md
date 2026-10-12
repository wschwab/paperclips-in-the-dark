---
id: PLAYBOOK-BLURBS-01
title: Playbook and crew type picker descriptions from game data
deps:
  - PLAYTEST-UI-02
track: frontend
outputs:
  - frontend/src/api/client.ts
  - frontend/src/api/client.test.ts
  - frontend/src/pages/character-create.ts
  - frontend/src/pages/character-create.test.ts
  - frontend/src/pages/crew-create.ts
  - frontend/src/pages/crew-create.test.ts
  - frontend/src/data/playbook-blurbs.test.ts
  - data/games/blades-in-the-dark.json
  - conformance/fixtures/mutation-catalog.json
---

# PLAYBOOK-BLURBS-01 — playbook and crew type picker descriptions

## Decision

Human decision: use the lines already present in the game data. Playbook pickers show each
playbook's `Hook`; crew type pickers show each crew type's `Hook`. Picker labels follow the
convention of PLAYTEST-UI-02 item 8: `Name - Description`, through `namedOptionLabel`, with the bare
name when the data has no description. No text is invented or hardcoded in the frontend.

## Search findings (before any writing)

- **The quoted Cutter line is not Cutter text.** "A dangerous and intimidating fighter. Play a
  Muscle…" is the Scum & Villainy Muscle hook (`blades-in-the-sheets/UI/wwwroot/data/scum-and-villainy.json:105`).
- **Blades playbook hooks already exist** in every edition in this repo: `data/games/blades-in-the-dark.json`,
  `français-blades-in-the-dark.json`, `rus-blades-in-the-dark.json` and `scum-and-villainy.json`, each with
  `Playbooks[].Hook` (7 per edition). The Blades hooks equal the reference sheet's text verbatim.
- **Blades crew hooks already exist** in `data/games/blades-in-the-dark-crews.json` (`CrewTypes[].Hook`, 6 types,
  verbatim with the reference `blades-in-the-sheets/UI/wwwroot/data/blades-in-the-dark-crews.json`). Scum & Villainy
  crews also have hooks (`data/games/scum-and-villainy-crews.json`, 3).
- **Nothing had to be copied** from `blades-in-the-sheets/`. Nothing in that tree was edited, and `campaign-data/` was not touched.
- **Backend and contract already accept the field.** The live `/api/games/blades-in-the-dark/playbooks` and `/crews` endpoints
  return `Hook` (checked with a managed server run). `data/games/game-settings-schema.json#PlaybookSetting` declares `Hook`
  and is not strict. `data/games/crew-settings-schema.json` declares `Hook`. So no Ada, contract or schema change, and no Ada gates.

## Changes

- **Data:** `data/games/blades-in-the-dark.json`: the Whisper hook typo "Play whisper a Whisper" is now "Play a Whisper".
  No other edition contained that typo.
- **Client:** `getPlaybookList` and `getCrewTypeList` return `PickerOption { name, description }`. `description` is the
  game-data `Hook`, or `null` when absent or blank.
- **Pages:** the scoundrel picker (validated PC flow and legacy form), the crew picker (crew create page and the presented
  crew flow) label each option with `namedOptionLabel(name, description)`. Option values stay the bare names.

## Red-green

- `client.test.ts`: decoders expected to return options. Red before the change; green after.
- `character-create.test.ts` and `crew-create.test.ts`: option labels `Name - Description` (and bare names when no description). Red before.
- `frontend/src/data/playbook-blurbs.test.ts`: every edition's playbooks carry a one-line `Hook`; every Blades crew type carries one;
  the Whisper typo is absent from all editions. Red on the typo before the data fix, green after.

## Chromium evidence

`agent-docs/test-audit/browser-evidence/playbook-blurbs-01/check.mjs` (`check.json`, 9 rows = 3 sizes × 3 themes). For each
combination it reads the live option text of `#pc-playbook` and `#crewType`, plus overflow and page errors.

- Playbook picker: 7 playbooks with labels, e.g. `Cutter - Cutters are good at winning fights, with violence and with intimidation. Play a Cutter…`.
- Crew picker: 6 crew types, e.g. `Assassins - You're professional murderers—death is your business.`
- No overflow (`scrollWidth` = `innerWidth`) and no page errors in all 9 combinations.
- Limitation: a native `<select>` dropdown cannot be captured headlessly, so the option text is recorded numerically and the
  screenshots show the closed form only.

## Scope note: other editions

The create routes are wired to `blades-in-the-dark` (`frontend/src/main.ts`). Descriptions are present for every edition's
playbooks in the data, but the picker is only reachable for Blades in the Dark. Changing the route is a separate decision.

## Gates

Recorded at commit `69baf006`; the card and metrics record commit follows it.

- `npx vitest run` (frontend): 926/926, 31 files.
- `npx tsc --noEmit`: exit 0. `npm run build`: exit 0.
- `npm run test:browser`: 6/6 journeys pass.
- Mutation pins: `frontend/src/api/client.ts` (M20) refreshed to `2a350771…decd09`, verified with `sha256sum`.
  **Also refreshed a stale pin:** `frontend/src/styles/components.css` (the `.action-dot` target) was still on `ccb12ed2…`.
  ERROR-SCREEN-01 appended rules to that file and its pin was not refreshed then. It is now `17ea466d…9e922`. The anchored rule
  the campaign mutates is unchanged.
- Mutation campaign `npm run test:mutation` at `69baf006`: **28/28 killed** (P0 19/19, P1 9/9), run on the human's go-ahead.
