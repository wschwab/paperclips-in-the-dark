# Task F2l — DOM test environment + page-level regression tests

You are DeepSeek v4 Pro, implementing task F2l of paperclips-in-the-dark.

Read first: `tasks/F2l-dom-test-env.md`, `frontend/vitest.config.ts`
(currently `environment: "node"`), `frontend/src/pages/character-detail.ts`
(the `onUndo` and stress `StaleRevisionError` branches),
`frontend/src/pages/crew-detail.ts`, and `frontend/src/api/client.test.ts`
(fetch-mocking pattern).

Background: F2h shipped a real bug — in the stress StaleRevisionError branch,
`renderDetail()` was not called synchronously before the async refetch, so
the UI kept a stale disabled state. Review caught it; no test could, because
there is no DOM test environment. Your job is to make that class of bug
testable and tested.

## Scope — frontend/ and docs/pages/frontend/ ONLY

1. Add `happy-dom` as a devDependency and configure vitest so page tests run
   in a DOM environment (per-file `// @vitest-environment happy-dom` pragma
   or environmentMatchGlobs — keep existing client/decoder tests in node).
2. RED-first proof: write a page-level test asserting that when stressAdd
   fails with StaleRevisionError, the DOM re-renders synchronously (button
   re-enabled / loading cleared) before the refetch resolves. Temporarily
   revert the `renderDetail()` call in that branch to confirm the test goes
   red for the right reason, restore it, confirm green. State this evidence
   explicitly in your report.
3. Add page-level tests for: undo success re-render, undo NO_HISTORY notice
   text, and the crew-detail undo control (mirror). Mock fetch; no servers.
4. No production code changes unless a genuinely red test forces one — if
   one does, report it loudly as a found bug.
5. Docs page `docs/pages/frontend/f2l-dom-test-env.mdx`: how to write a page
   test, the environment split, and why this exists (F2h lesson).
6. Report: exact test counts per file/describe, red evidence, green
   evidence, files touched.

## Hard command constraints — violations end the session

- No jj/git/VCS commands; the orchestrator owns VCS.
- No deletions (`rm -rf` forbidden). No edits to contract/, conformance/,
  tasks/, backend-*/, blades-in-the-sheets/, docs outside
  docs/pages/frontend/.
- No name-based process kills. Do not start servers.
- Allowed: file reads/edits, `npm install --save-dev happy-dom` (this slice
  only), `npm test -- --run`, `npm run build`, `npx vitest run <file>`
  inside frontend/.
