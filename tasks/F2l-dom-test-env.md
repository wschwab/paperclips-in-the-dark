---
id: F2l
title: "DOM test environment + page-level regression tests"
deps: [F2k]
track: frontend
outputs:
  - happy-dom (or jsdom) dev-dependency + vitest environment config for page tests
  - page-level tests for character-detail (stale-branch synchronous render — the F2h bug; undo NO_HISTORY notice) and crew-detail (undo control)
  - docs/pages/frontend/f2l-dom-test-env.mdx
acceptance:
  - "page-level tests written red-first against the F2h bug shape (revert the renderDetail() call in the stale branch to prove the test catches it), then green on current code; verified by grep"
  - "npm test -- --run and npm run build green in frontend/; existing 63 tests unaffected"
  - "no production code changes except what a genuinely red test forces"
  - "docs page present"
---

Follow-up recorded at F2h acceptance: the repo has no DOM test environment
(`vitest.config.ts` is `environment: "node"`), so no page component has unit
tests — the F2h stale-branch render bug shipped untested and was caught only
by review. This slice closes that gap. Fetch is mocked at the client boundary
as the existing client tests do; no live server in tests.

## Log
- 2026-07-29: dispatched to DeepSeek v4 Pro (pi, opencode-go, -p, stdin
  closed) after F2k acceptance. Prompt: tasks/dispatch/F2l-prompt.md (same
  hard command constraints; npm install of the DOM env dev-dependency is
  explicitly allowed this slice).
