# Task F2n — character sheet: Health section

You are DeepSeek v4 Pro, implementing task F2n of paperclips-in-the-dark.

Read first: `tasks/F2n-health.md`,
`docs/pages/frontend/f2-sheet-plan.mdx` (idioms + mapping),
`contract/openapi.yaml` for `harmAdd`, `harmHeal`, `harmRemove`,
`harmHealingClock`, `armorSet` (FROZEN — read each request body and the
harm-spillover description: applied.landedIntensity may differ from the
requested intensity), `frontend/src/api/client.ts` (the F2m
`characterMutate` helper — reuse it), `frontend/src/pages/character-detail.ts`
(F2m section structure — add Health as a sibling section),
`frontend/src/pages/styleguide.ts` (harm table + SVG clock components).

## Scope — frontend/ and docs/pages/frontend/ ONLY

1. RED-first client tests then minimal methods for the five ops (mirror
   F2m's error typing incl. StaleRevisionError where If-Match applies).
2. Health section on character detail:
   - Harm table: rows by intensity from the DTO, descriptions shown; add
     control = intensity select + free-text description + button; if the
     response's landedIntensity differs from requested, surface a notice
     ("spilled to …"). Remove/heal per entry per the contract ops.
   - Armor: checkboxes for standard/heavy/special + used states via armorSet.
   - Healing clock: SVG clock idiom, size from DTO, add-segment button via
     harmHealingClock; show what healing a filled clock did to the harm
     table after refetch/response.
   - F2h rule (synchronous render), stale-recovery pattern, no hardcoded
     maxima or clock sizes.
3. Page tests (happy-dom): add-harm flow incl. spillover notice, armor
   toggle, clock segment add. Mock fetch.
4. Docs page `docs/pages/frontend/f2n-health.mdx`.
5. Report: exact per-describe test counts (grep-verified at acceptance),
   red evidence, green evidence, files touched.

## Hard command constraints — violations end the session

- No jj/git/VCS. No deletions. No edits outside frontend/ and
  docs/pages/frontend/. No name-based process kills. No servers.
- Allowed: file reads/edits, `npm test -- --run`, `npm run build`,
  `npx vitest run <file>` inside frontend/.
