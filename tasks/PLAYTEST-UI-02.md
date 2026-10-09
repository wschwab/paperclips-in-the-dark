---
id: PLAYTEST-UI-02
title: Playtest 2026-10 scoundrel sheet feedback, batch 2 (items 3, 6, 8)
deps:
  - PLAYTEST-UI-01
  - CONTRACT-CONTACTS-01
track: frontend
outputs:
  - frontend/src/api/client.ts
  - frontend/src/pages/character-domain.ts
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/character-detail.test.ts
  - frontend/src/pages/character-sections/personal.ts
  - frontend/src/pages/character-sections/playbook.ts
  - frontend/src/pages/character-sections/projects.ts
  - frontend/src/pages/character-sections/stress.ts
  - contract/schemas/common.json
  - contract/schemas/character.json
  - contract/openapi.yaml
  - docs/pages/contract/contract-contacts-closeness.mdx
  - conformance/suites/semantics/character-contacts-levels.test.ts
  - conformance/src/schemas.ts
  - backend-ada/server/src/pitd_normalize.adb
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/generated/pitd_schema_validators.adb
  - skill/api-reference/README.md
  - skill/api-reference/capability-manifest.json
  - conformance/fixtures/mutation-catalog.json
acceptance:
  - item 8 (B): option pickers for special abilities, heritage, background and vice read "Name - Description" from data/games; hint names the first option as a good default; no description invented
  - item 3 (A): Projects shows only the clocks owned by this scoundrel; a clock created from the sheet is bound to it through clock.create
  - item 6 (C): contact closeness gains confidante and enemy (contract, conformance, backend done); frontend decoders, creation preload of playbook contacts as "contact", bolder colours, a visibly clickable closeness control, and keep remove and add-custom: NOT DONE
---

# PLAYTEST-UI-02 — playtest 2026-10 batch 2

**Status:** IMPLEMENTATION COMPLETE, NOT REVIEWED. Items 8 (B), 3 (A) and 6 (C) are implemented and verified: Ada conformance 542/542, tooling 233/233, frontend 815/815, tsc clean, mutation 28/28, browser journeys 6/6, validators pass, Chromium evidence captured. Luna xhigh review pinned to the final revision: pending (see the Luna section below).

## Log

- Item 3 (default clocks), first investigation: the only clock a new scoundrel gets is the embedded healing clock (`backend-ada/server/src/pitd_ops.adb:153-157`, size from `data/games/blades-in-the-dark.json:1017`), by design per `docs/pages/contract/wave0/clock-taxonomy.mdx:95-99`. The real bug (human ruling): Projects listed every campaign clock. Evidence: `agent-docs/test-audit/browser-evidence/playtest-ui-02/probe-clocks.mjs`.
- Item 3 (A) red: two tests failed for the right reason. Green: `client.ts` `createClock` takes an owner (default campaign); the sheet creates with `{ ownerKind: "character", ownerId: characterId }`; `projects.ts` filters to `ownerKind === "character" && ownerId === ctx.c.id`. Contract support: `contract/schemas/clock.json:20-27`. Backend: `GET /api/clocks` already returns character-owned clocks (`probe-owner.mjs`), so no backend change. Chromium: `a-summary.json`, `a-projects-*.png`.
- Item 8 (B) red: two tests failed. Green: `character-domain.ts` adds `namedOptionLabel`; heritage, background, vice and special-ability options read `Name - Description`; playbook hint added. Data: `data/games/blades-in-the-dark.json` has descriptions for all 6 heritages, 7 backgrounds, 7 vices and 62 special abilities. Chromium: `b-summary.json`, `b-*.png`.
- Item 6 (C), contract: closeness is now `enemy | rival | contact | friend | confidante` (`contract/schemas/common.json:101-109`; `character.json:422`; `openapi.yaml:1465`; `docs/pages/contract/contract-contacts-closeness.mdx`). Red: `conformance/suites/semantics/character-contacts-levels.test.ts` (CONTACTS-LEVELS-001 failed: the server rejected `confidante`). The frozen three-level suite does not pin the exact vocabulary, so no stop was needed.
- Item 6 (C), backend: `pitd_normalize.adb:1290` and `pitd_ops.adb:524` accept the five values. `generate-ada-validators.mjs` regenerated `generated/pitd_schema_validators.adb`. The API reference and capability manifest were regenerated (`skill/api-reference/`), because the frozen tooling tests compare them byte for byte.
- Item 6 (C), conformance mirror: `conformance/src/schemas.ts:43` hard-coded the three literals in the conformance client's request-side enum. That is a schema mirror, not a frozen test. It was updated to the five values, and this is recorded as a deliberate exception.
- Verification at the current revision: Ada conformance `npm run test:ada -- --run` 65 files, 542/542 passing; tooling `npm run test:tooling` 233/233; mutation campaign 28/28 (P0 19/19, P1 9/9) after refreshing the hashes for `client.ts` (M20), `character-detail.ts` (M26), `pitd_normalize.adb` (1 mutant) and `pitd_ops.adb` (4 mutants). Frontend: character-detail and client tests 442/442; full frontend suite 812 passing after item 8; `tsc --noEmit` clean. Validators pass.
- Commit state: items B and A share one change (`zurxxsmx`), described "Picker option descriptions; Projects shows only this scoundrel's clocks", because their test hunks are interleaved. The contract change is `wslwwkyo`, the schema mirror is `mqwxtpyp`, the backend is `opulzpvt`. The other worker's game-mode WIP is in its own commit (`slrskqxt`).
- Still open for item 6 (frontend): decoders in `frontend/src/schema/common.ts:83` and `character.ts:140` (still three values); the creation preload of each playbook's contacts as `contact` from `data/games` Playbooks Rolodex data (the server's `New_Character` does not seed contacts today); the bolder colours for confidante and enemy that meet contrast in all themes; a visibly clickable closeness control; remove and add-custom kept. Then the frontend red tests, Chromium evidence, the mutation check if a catalog target changes, and the Luna xhigh review pinned to the final revision covering A, B and C.

## Log (contacts preload, human-authorized)

- Frozen test amended, `conformance/suites/semantics/character-contacts.test.ts` (SEMANTICS-CHAR-CONTACTS-009):
  - line 101 before `expect(character.contacts).toEqual([]);` after `expect(Array.isArray(character.contacts)).toBe(true);` plus the playbook Rolodex names assertion (from `data/games` via `gameSetting`, at closeness "contact").
  - line 106 before `expect(reloaded.contacts).toHaveLength(1);` after `expect(reloaded.contacts).toHaveLength(expected.length + 1);`.
  - a static `import { gameSetting } from "../../src/game-data.js";` replaces the dynamic import.
- Red: before the preload, line 101 failed with `expected [] to deeply equal [ 'Marlane, a pugilist', ... ]`. Green: after `New_Character` preloads (`pitd_ops.adb`), line 101 passes; line 106 failed until it was amended.
- Full Ada conformance after the preload: 541/542 passing. One failure caused by the preload: SEMANTICS-CHAR-CONTACTS-001 (adds `Marlane, a pugilist`, already on the Cutter Rolodex). Not amended, pending a decision. No other failures.
- Preload is in `backend-ada/server/src/pitd_ops.adb` `New_Character` (CONTRACT-CONTACTS-01).

## Log (contacts, completed)

- Frozen test amendments, human-authorized, all in `conformance/suites/semantics/character-contacts.test.ts`, before/after in `docs/pages/contract/contract-contacts-closeness.mdx`:
  - SEMANTICS-CHAR-CONTACTS-009 line 101: `expect(character.contacts).toEqual([]);` to the Rolodex-names assertion (from `data/games`, closeness "contact").
  - SEMANTICS-CHAR-CONTACTS-009 line 116: `toHaveLength(1)` to `toHaveLength(expected.length + 1)`.
  - Import: dynamic `await import` to a static `import { gameSetting }` (line 6).
  - SEMANTICS-CHAR-CONTACTS-001 lines 22 and 25: `"Marlane, a pugilist"` to `"Test Contact Unlisted"` (on the Cutter Rolodex; test data only, assertions unchanged).
- Full Ada conformance after the preload and the 001 data change: 542/542 (the preload broke only 001, which is now amended).
- Frontend: five-level decoders, cycle through `CONTACT_CLOSENESS_ORDER`, five bold badges (`contact-closeness`). Red: 2 tests failed (decode failure for confidante; no badge). Green: frontend 815/815, tsc clean.
- Chromium (`playtest-ui-02/capture-c.mjs`, `c-summary.json`, `c-badges-*.png`): 3 viewports x light, dark, high-contrast light and dark. Minimum white-text contrast 4.54:1 (>= 4.5). Overflow ok, no page errors, one click advances "contact" to "friend" on the server.
- Verification: Ada conformance 542/542; tooling 233/233; mutation 28/28 after refreshing pins for `pitd_ops.adb` (4 mutants + the normalize pin) and `character-detail.ts` (M26); browser journeys 6/6 PASS; validators pass.
- Commits: contract `opulzpvt` (588ecc1c), backend `yooxkzxm` (1108884f), frontend and records are the working change `vnlsswlv`. A+B remains one change (`zurxxsmx`).

## Luna review (final, pinned)

- Independent review: gpt-5.6-luna (openai-codex, xhigh), pinned to `41945594690dc67cc6a6446a4ab31b3387e8189f` (change `vnlsswlv`; ancestry `ed3d98e8` → `wslwwkyo` → `mqwxtpyp` → `opulzpvt` → `yooxkzxm` → `vnlsswlv`).
- **VERDICT: PASS.** Verdict: `agent-docs/test-audit/browser-evidence/playtest-ui-02/luna-final/verdict.md`; raw output and 12 Chromium screenshots alongside it.
- Luna's checks: `npm run build` exit 0; vitest 21 files / 815 tests; `tsc --noEmit` exit 0; 12/12 viewport x theme combinations in Chromium; minimum badge contrast 4.54:1; overflow ok; five-level badges; a server-recorded click; remove and add-custom work; picker text `Name - Description`; Projects ownership (campaign clock hidden, character-owned clock shown).
- No findings. The frozen-test amendments were checked against the docs page's before/after table.
- Status: PASS on the pinned revision. Records are final at that revision.
