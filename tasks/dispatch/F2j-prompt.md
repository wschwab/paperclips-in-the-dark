# Task F2j — crew undo action

You are DeepSeek v4 Pro, implementing task F2j of paperclips-in-the-dark.

This is a mirror of the just-accepted F2i slice. Read first:
`tasks/F2j-crew-undo.md`, `contract/openapi.yaml` `/crews/{id}/undo`
(FROZEN, read-only), and the pattern files: `frontend/src/api/client.ts`
(`undoCharacter` — mirror it exactly for Crew, including error typing),
`client.test.ts` (the `undoCharacter` describe block — mirror its 6 cases),
`frontend/src/pages/crew-detail.ts` (where the control goes; note it is
currently read-only — follow character-detail.ts's state/render structure
for the new mutation branch), `docs/pages/frontend/f2i-character-undo.mdx`
(docs template).

Verified live behavior you can rely on: NO_HISTORY arrives as HTTP 200 with
ok:false and error.code "NO_HISTORY"; the client surfaces it as an ApiError
whose body starts with "NO_HISTORY: ".

## Scope — frontend/ and docs/pages/frontend/ ONLY

1. RED: failing client tests for `undoCrew(id)` first (mirror the 6
   undoCharacter cases; decode returns Crew). Confirm they fail because the
   method does not exist. Then GREEN: minimal client method.
2. "Undo last change" control on the crew detail page: re-render with the
   returned Crew on success; NO_HISTORY as a visible non-error notice; other
   errors inline. Every branch must call the page's render function
   synchronously before any async continuation.
3. Docs page `docs/pages/frontend/f2j-crew-undo.mdx` matching the template.
   Describe only what is actually rendered.
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
