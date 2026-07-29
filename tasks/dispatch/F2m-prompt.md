# Task F2m — character sheet: Personal, Stress, Trauma, Vice

You are DeepSeek v4 Pro, implementing task F2m of paperclips-in-the-dark.

Read first: `tasks/F2m-personal-stress-trauma.md`,
`docs/pages/frontend/f2-sheet-plan.mdx` (UI idioms + op mapping — follow
them exactly), `contract/openapi.yaml` for `dossierUpdate`, `stressAdd`,
`stressClear`, `traumaAdd`, `traumaRemove` (FROZEN, read-only — check each
op's request body and If-Match semantics), `frontend/src/api/client.ts` +
`client.test.ts` (patterns), `frontend/src/pages/character-detail.ts` and
its page tests (F2l), `frontend/src/pages/styleguide.ts` (existing stress
track / trauma stamp components — reuse, don't reinvent), and the game data
via the existing `getGame`-style client access for the trauma menu.

## Scope — frontend/ and docs/pages/frontend/ ONLY

1. RED-first client tests, then minimal methods: `dossierUpdate`,
   `stressClear`, `traumaAdd`, `traumaRemove` (mirror stressAdd's
   If-Match/StaleRevisionError typing where the contract has it).
2. Character detail page gains:
   - **Personal**: name, alias, background, heritage, look — inline
     editable (input + save via dossierUpdate), read view by default.
   - **Stress**: clickable stress track (click box N → delta to reach N via
     stressAdd) + +/− buttons; current/max from DTO, never hardcoded.
   - **Traumas**: list; add via `<select>` populated from game-settings
     JSON traumas; remove per entry.
   - **Vice**: name + description display; "Indulge Vice" button →
     stressClear.
   - Every mutation branch: synchronous render before async work
     (F2h rule), StaleRevisionError → refetch pattern, NO hardcoded maxima.
3. Page tests (happy-dom, per-file pragma) for: stress box click issues the
   right delta, trauma add/remove render, indulge button, dossier edit
   save. Mock fetch.
4. Docs page `docs/pages/frontend/f2m-personal-stress-trauma.mdx`.
5. Report: exact test counts per describe (they will be grep-verified),
   red evidence, green evidence, files touched.

## Hard command constraints — violations end the session

- No jj/git/VCS. No deletions (`rm -rf` forbidden). No edits outside
  frontend/ and docs/pages/frontend/. No name-based process kills. Do not
  start servers — the orchestrator runs the live probe.
- Allowed: file reads/edits, `npm test -- --run`, `npm run build`,
  `npx vitest run <file>` inside frontend/.
