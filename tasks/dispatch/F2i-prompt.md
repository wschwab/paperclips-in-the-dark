# Task F2i — character undo action

You are DeepSeek v4 Pro, implementing task F2i of paperclips-in-the-dark.

Read first: `tasks/F2i-character-undo.md` (your acceptance criteria),
`contract/openapi.yaml` — the `/characters/{id}/undo` path and
OperationResult schema (FROZEN, read-only), and the existing pattern files:
`frontend/src/api/client.ts` + `client.test.ts` (see `stressAdd` — mirror its
error typing: `StaleRevisionError` vs `ApiError` vs `DecodeError`),
`frontend/src/pages/character-detail.ts` (where the control goes),
`docs/pages/frontend/f2h-*.mdx` (docs template).

## Scope — frontend/ and docs/pages/frontend/ ONLY

1. RED: write failing client tests for `undoCharacter(id)` first — success
   (decodes returned Character), NO_HISTORY → typed ApiError, malformed body
   → correct error type. Run them; confirm they fail because the method does
   not exist. Then GREEN: minimal client method.
2. Add an "Undo last change" control to the character detail page: calls
   undoCharacter, re-renders with the returned character on success, surfaces
   NO_HISTORY as a visible notice (not a crash). Follow the exact render/state
   pattern of the existing stress control branches — every branch calls
   renderDetail() synchronously (F2h bug class; do not repeat it).
3. Docs page `docs/pages/frontend/f2i-character-undo.mdx` matching the
   f2b–f2h template. Describe only what is actually rendered.
4. Report: exact test counts per describe block, red evidence (failing run
   output), green evidence, files touched.

## Hard command constraints — violations end the session

- Do NOT run jj, git, or any VCS command. The orchestrator owns VCS.
- Do NOT delete anything (`rm -rf`, `rm` outside files you yourself created
  this session in /tmp). Do NOT modify contract/, conformance/, tasks/,
  backend-*/, blades-in-the-sheets/, docs outside docs/pages/frontend/.
- Do NOT kill processes by name (`pkill`/`killall` are forbidden). If you
  start a server, record its exact PID and kill only that PID; verify with
  `ss` that the port is free. Prefer not starting servers at all — the
  orchestrator runs the live probe.
- Allowed commands: file reads/edits, `npm test -- --run`, `npm run build`,
  `npx vitest run <file>` inside frontend/.
