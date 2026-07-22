# Task F2a — Ada-backed roster page

You are Claude Haiku 4.5 working through the full interactive Claude Code CLI
on one bounded frontend TDD slice in `/home/x/code/paperclips-in-the-dark`.

Read `AGENTS.md`, `PAPERCLIPS.md`, `tasks/F2-sheets.md`,
`tasks/F2a-roster-page.md`, and the relevant existing frontend source before
editing. The orchestrator owns all VCS operations; do not mutate `jj` or Git.

Goal: add a `/roster` page that fetches the Ada backend's existing
`GET /api/campaign/roster` endpoint through Effect and the existing `Roster`
schema. It must show explicit loading, failure, empty, and populated states for
both characters and crews, and be reachable from the shared navigation.

Mandatory red-green sequence:

1. Add the smallest focused test for the missing `getRoster` client behavior.
   Mock `fetch`; prove it requests `/api/campaign/roster`, decodes a valid
   roster, and exposes API or decode failure. Run the focused test red for the
   expected missing behavior.
2. Add the minimal client and page implementation. Reuse the existing plain-DOM
   and Effect patterns; do not introduce a framework or broad dependency.
3. Run the focused test green, then `npm test -- --run` and `npm run build`.

Scope limits:

- Do not implement creation, character/crew detail sheets, editing, history,
  undo, or stale-revision handling. Those are later F2 slices.
- Do not change `contract/`, `conformance/`, either backend, or reference files.
- Do not delete data or use broad process-kill commands. If live verification
  is attempted, record and stop only the exact PID.
- Keep styling small and within the existing style system.
- Stop after this slice and report exact red/green commands, files changed,
  limitations, uncertainties, and any proposed follow-up work.
