# Task F2k — crew history page

You are DeepSeek v4 Pro, implementing task F2k of paperclips-in-the-dark.

Mirror of the accepted F2d character-history slice. Read first:
`tasks/F2k-crew-history.md`, `contract/openapi.yaml` `/crews/{id}/history`
(FROZEN, read-only), and the pattern files:
`frontend/src/api/client.ts` (`getCharacterHistory` — mirror for Crew),
`client.test.ts` (its describe block), `frontend/src/pages/character-history.ts`
(page structure), `frontend/src/pages/crew-detail.ts` (add the history link
the way character-detail links its history page), the router in
`frontend/src/` (wire `/crew/{id}/history`), and
`docs/pages/frontend/f2d-*.mdx` + `f2j-crew-undo.mdx` (docs templates).

## Scope — frontend/ and docs/pages/frontend/ ONLY

1. RED: failing client tests for `getCrewHistory(id)` first (success decode
   of historyEntry list, empty list, error typing — mirror the
   getCharacterHistory cases). Confirm red for the right reason, then GREEN.
2. crew-history.ts page rendering the entries (same fields/order presentation
   as character-history), router wiring for `/crew/{id}/history`, and a link
   from the crew detail page.
3. Docs page `docs/pages/frontend/f2k-crew-history.mdx`. Describe only what
   is actually rendered.
4. Report: exact test counts per describe block, red evidence, green
   evidence, files touched.

## Hard command constraints — violations end the session

- No jj/git/VCS commands; the orchestrator owns VCS.
- No deletions (`rm -rf` forbidden; `rm` only on files you created this
  session in /tmp). No edits to contract/, conformance/, tasks/, backend-*/,
  blades-in-the-sheets/, docs outside docs/pages/frontend/.
- No name-based process kills (`pkill`/`killall` forbidden). Do not start
  servers — the orchestrator runs the live probe.
- Allowed: file reads/edits, `npm test -- --run`, `npm run build`,
  `npx vitest run <file>` inside frontend/.
