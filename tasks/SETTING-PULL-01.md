# SETTING-PULL-01: pull Doskvol setting content pending permission

Status: pulled on head (pending permission from John Harper / One Seven Design).

## Scope

Remove the stock Doskvol setting content from the head in one commit, leaving the app working:

- `data/world/doskvol.json`: `factions` and `districts` emptied. `groups`/`holds` (generic labels) kept. `source` records the pull and the restore bookmark.
- `data/games/blades-in-the-dark.json`, `français-blades-in-the-dark.json`, `rus-blades-in-the-dark.json`: `Heritages` emptied to `[]`.
- `data/games/demo-character.json`: heritage name and description blanked.
- Frontend: the stock-faction picker and districts disclosure render only when world data is present (`crew-sections/doskvol-world.ts`); contacts keeps manual faction entry (`crew-sections/contacts.ts`); heritage uses free-form user text with no empty stock select (`character-sections/personal.ts`).
- About & licence copy states the pull (`about-licence.ts`, and its test expectation).
- Deleted `crew-world-02.test.ts` and `crew-world-03.test.ts` (their stock assertions no longer apply). Added red-first `frontend/src/data/setting-pull.test.ts` and `frontend/src/pages/setting-pull.test.ts`.
- Not touched: `blades-in-the-sheets/`, `campaign-data/`, Rolodex names in `data/games`.

## Restore point

Bookmark `setting-content` (both mirrors) = `dc73c0d9ce40a32a920d6f9c89834ebb773ef326`, which holds all withdrawn data. The pull sits on `main` at `f0c1022a`; its data and frontend files are identical to `dc73c0d9`. Restore steps are in `docs/pages/contract/setting-content-register.mdx` ("Pulled pending permission").

## Checkpoint adaptation (char02-option-editors.mjs)

Authorized adaptation. Checkpoint IDs and all other assertions are unchanged.

- Before: heritage edit selected canonical `Skovlan`; reload asserted the stock description; `Iruvia` re-select across rerender; fetch-failure fallback expected the `__custom__` option.
- After: heritage edit fills user text `Table-defined homeland`; reload asserts the text and that no stock description appears; rerender preserves `Another table-defined homeland`; fetch-failure fallback keeps that free text; no stock select exists.
- Reversal: restore the checkpoint from `setting-content` together with the data.

## Evidence

- Red: `tasks/metrics/frontend/SETTING-PULL-01-red.log` (7 failures, 2 preserved passes).
- Focused: `tasks/metrics/frontend/SETTING-PULL-01-focused.log`.
- Frontend: vitest 1012/1012, `tsc --noEmit` clean, `npm run build` clean.
- Browser: `conformance` `npm run test:browser` exit 0 (includes adapted char02).
- Chromium 3×3 (1440/768/390 × light/dark/high): `docs/public/evidence/setting-pull-01/pull-3x3.json`, 9/9 pass. Stock select and districts disclosure absent, manual faction entry present, zero overflow, zero console errors.
- Validators: `validate-metrics.js`, `validate-finding-traceability.js`, `reconcile-audit.js` exit 0. `validate:evidence` exit 0. Vocs `npm run build` exit 0.
- Ada: not run. No backend code changed; the Ada backend reads no setting heritage list.
- Mutation: campaign requires an empty working copy, so it runs on the committed head. Result is recorded in the follow-up records commit.

## Sol review

NOT-RUN: Codex `usage_limit_reached`. Review is deferred until the next Codex reset.

## Remaining setting names (not pulled)

- Playbook Rolodex friend and NPC names in `data/games/*.json` (served as game data; preload contacts).
- Heritage text in test and seed fixtures ("The Dagger Isles", "Iruvian", and similar). Test data only.
- Documentation: `crew-world-sources.mdx`, setting content open items, the README provenance paragraph, CREW-WORLD task cards, the historical CREW-WORLD-01 red log.
