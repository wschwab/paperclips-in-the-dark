---
id: PLAYTEST-UI-02
title: Playtest 2026-10 scoundrel sheet feedback, batch 2 (items 3, 6, 8)
deps:
  - PLAYTEST-UI-01
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
  - conformance/fixtures/mutation-catalog.json
acceptance:
  - item 8 (B): option pickers for special abilities, heritage, background and vice read "Name - Description" from data/games; hint names the first option as a good default; no description invented
  - item 3 (A): Projects shows only the clocks owned by this scoundrel; a clock created from the sheet is bound to it through clock.create
  - item 6 (C): contacts. STOPPED at the contract (closeness is friend | contact | rival). Dedicated card CONTRACT-CONTACTS-01 is authorized by the human (scale enemy < rival < contact < friend < confidante) and has NOT started.
---

# PLAYTEST-UI-02 — playtest 2026-10 batch 2

**Status:** IN PROGRESS. Items 8 (B) and 3 (A) are implemented and verified in Chromium. Not reviewed. Item 6 (C) waits on CONTRACT-CONTACTS-01. No Luna review has run.

## Log

- Item 3 (default clocks), first investigation: the only clock a new scoundrel gets is the embedded healing clock (`backend-ada/server/src/pitd_ops.adb:153-157`, size from `data/games/blades-in-the-dark.json:1017`), by design per `docs/pages/contract/wave0/clock-taxonomy.mdx:95-99`. `campaign-data/clocks/` is empty. Real bug (human ruling): Projects listed every campaign clock. Evidence: `agent-docs/test-audit/browser-evidence/playtest-ui-02/probe-clocks.mjs`.
- Item 3 (A) red: two tests failed for the right reason. Projects listed the crew and campaign clocks; the create body still said `ownerKind: "campaign"`.
- Item 3 (A) green: `client.ts` `createClock` takes an owner (default campaign, so existing callers are unchanged); the sheet passes `{ ownerKind: "character", ownerId: characterId }`; `projects.ts` filters the list to `ownerKind === "character" && ownerId === ctx.c.id`. Contract support: `contract/schemas/clock.json:20-27` (`ownerKind` campaign | character | crew; `ownerId` is the UUID). Backend: `GET /api/clocks` already returns character-owned clocks (`probe-owner.mjs`), so no backend change.
- Item 3 (A) evidence: `playtest-ui-02/capture-a.mjs` → `a-summary.json`, `a-projects-*.png`. At 1440x1000, 768x1024 and 390x844, in light and dark: the list shows only the scoundrel's own clock, the campaign clock is hidden, no overflow, no page errors.
- Item 8 (B) red: two tests failed (option text was the bare name; the hint was missing). Green: `character-domain.ts` adds `namedOptionLabel` and lets `gameDataDescription` take `vice`; heritage, background and vice options read `Name - Description` (heritage Description, background Example, vice Description); the special-ability option reads `Name - Description`; the playbook shows "If you're unsure which one to pick, the first is considered a good default choice." Data: `data/games/blades-in-the-dark.json` has descriptions for all 6 heritages, 7 backgrounds, 7 vices and 62 special abilities. Other game files were not checked (different top-level shape).
- Item 8 (B) evidence: `playtest-ui-02/capture-b.mjs` → `b-summary.json`, `b-*-*.png`. 3 viewports x light and dark: no overflow, hint present, no page errors.
- Item 6 (C): STOPPED. `contract/schemas/common.json:101-106` closeness enum = friend | contact | rival; `contract/schemas/character.json:422, 440-441`; `contract/openapi.yaml:1465`. Authorized later as CONTRACT-CONTACTS-01.
- Verification: frontend suite 812 passing before the A tests were added (the full suite was run after B: 812); the character-detail and client test files pass 442/442 after A; `tsc --noEmit` clean. Mutation catalog: M20 (`client.ts`) and M26 (`character-detail.ts`) hashes refreshed; campaign 28/28 (P0 19/19, P1 9/9). Validators pass.
- Commit state: items B and A are in ONE change (`zurxxsmx`). Their test hunks are interleaved in `character-detail.test.ts`, and `jj split` by path cannot separate them without interactive hunk selection. The game-mode WIP from another worker is in its own commit (`slrskqxt`).
- Open: CONTRACT-CONTACTS-01 (contract, backend, frontend, then mutation and Luna) and the Luna xhigh review pinned to the final revision.
