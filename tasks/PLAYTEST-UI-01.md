---
id: PLAYTEST-UI-01
title: Playtest 2026-10 scoundrel sheet UI fixes (items 1, 5, 7, 9) and tab icon
deps:
  - CHAR-05
track: frontend
outputs:
  - frontend/src/pages/character-sections/stress.ts
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/character-detail.test.ts
  - frontend/src/styles/components.css
  - frontend/src/styles/sheet-columns.test.ts
  - frontend/index.html
  - frontend/public/favicon.svg
  - frontend/public/favicon-16.png
  - frontend/public/favicon-32.png
  - frontend/public/apple-touch-icon.png
  - frontend/public/site.webmanifest
  - backend-ada/server/src/pitd.adb
  - backend-ada/test-spa-routes.sh
  - conformance/fixtures/mutation-catalog.json
  - docs/pages/backlog/playtest-2026-10-scoundrel.mdx
  - docs/pages/ada/a3-launch-paths.mdx
acceptance:
  - vice Edit button sits inline with the vice name; Permanent actions render last on the scoundrel sheet; two-column masthead seam stays out of both columns with equal column top spacing; deleting a clock does not re-render the sheet while the delete is pending; tab icon and web manifest resolve and render; the server serves the manifest as application/manifest+json; red-green tests; real Chromium numeric evidence at 1440x1000, 768x1024, 390x844 in light, dark and high contrast; independent Luna review pinned to an immutable revision
---

# PLAYTEST-UI-01 — playtest 2026-10 scoundrel sheet UI fixes and tab icon

**Source:** `docs/pages/backlog/playtest-2026-10-scoundrel.mdx` items 1, 5, 7, 9, plus the tab icon note on the same page.
**Status:** DONE. Independent Luna (openai-codex, gpt-5.6-luna, xhigh) review PASS on the pinned immutable revision `d5847ce1b868363d4ebac6d6df8eba5bee71cdba` (review #3). Earlier review rounds are recorded below and are superseded by the PASS.
**Metrics:** `tasks/metrics/frontend/PLAYTEST-UI-01.json`
**Evidence:** `agent-docs/test-audit/browser-evidence/playtest-ui-fixes/` (implementer captures: `capture.mjs`, `summary.json`, six `<viewport>-<theme>.png` + `.json` pairs). Reviews: `luna/` (review #1), `luna-2/` (review #2), `luna-3/` (review #3, `verdict.md`, `raw-output.txt`, `stderr.txt`, `review-prompt.md`).

## Log

- 2026-10-08: red — four failing frontend tests confirmed for the right reason before any fix: clock delete re-rendered the sheet while the request was pending (sheet element identity changed); Edit Vice button had no `<p>` ancestor (on its own line); Permanent actions was not the last keyed section (`notebook` was); the CSS seam-clearance rule was absent.
- 2026-10-08: green — vice button moved into the vice-name paragraph; `renderHighImpactSection` moved after `renderNotebookSection`; `onClockDelete` no longer renders before its request (the list still re-renders once on success); the masthead reserves `--torn-depth-lg` at all widths, and inside the 900px+ column block reserves seam depth plus 18px with the following card's top margin zeroed so both columns start level. The layout took three CSS iterations, each caught by numeric Chromium measurement.
- 2026-10-08: `mutation-catalog.json` restoration hashes refreshed for M18 (`components.css`) and M26 (`character-detail.ts`), which the harness verifies before applying.
- 2026-10-08: verification of the four fixes: frontend suite 810/810 across 21 files (includes the four new tests); `tsc --noEmit` clean; mutation campaign 28/28 killed (P0 19/19, P1 9/9); browser journeys 6/6 PASS; implementer numeric capture at 1440, 768 and 390 in light and dark: no horizontal overflow, zero seam overlaps, vice inline, permanent actions last.
- 2026-10-08: history was rewritten into four commits by a split, not by a restore or abandon: the release-gate record (`7659c572`), playtest fixes (`12e62ff2`), tab icon (`aab6fa2a`), manifest MIME (`d5847ce1`).
- 2026-10-08: Luna review #1 (pinned to no revision; the working copy was `@`, prompt `luna/review-prompt.md`): items 1, 5, 7 and 9 PASS across 12 viewport×theme combinations including high contrast, and both delete-flicker checks clean. Verdict FAIL on candidate identity only: `@` had moved because the review's own evidence files were written into the working copy. Resolved by freezing the candidate as commits.
- 2026-10-08: Luna review #2 (pinned to `aab6fa2abf1a`; prompt `luna-2/review-prompt.md`): items 1, 5, 7, 9 and the tab icon PASS (links resolve, 16 and 32 px renders legible). Verdict FAIL on one finding: `GET /site.webmanifest` returned `Content-Type: application/octet-stream`. Cause: AWS's vendored MIME table has no `.webmanifest` entry.
- 2026-10-08: fix for the manifest finding. Red: `backend-ada/test-spa-routes.sh` gained an assertion that the manifest's Content-Type is `application/manifest+json`; it failed against the existing binary (`test application/octet-stream = application/manifest+json`). Green: `pitd.adb` registers the extension at startup with `AWS.MIME.Add_Extension ("webmanifest", "application/manifest+json")`. Verification: `backend-ada/ci.sh` exit 0 (core build and tests, server build, launch-path and SPA route checks, gnatprove 246 checks proved); Ada conformance suite `npm run test:ada -- --run` 64 files / 540 tests passed; `npm run test:tooling` 18 files / 233 tests passed; `pitd.adb` and `test-spa-routes.sh` are not mutation-catalog targets, so no hash refresh or campaign was required; the three validators pass. Docs note added to `docs/pages/ada/a3-launch-paths.mdx`.
- 2026-10-08: Luna review #3 (pinned to `d5847ce1b868363d4ebac6d6df8eba5bee71cdba`; prompt `luna-3/review-prompt.md`): **VERDICT PASS**. Frontend build and 810/810 vitest; SPA route and MIME checks pass; 12 viewport×theme combinations pass in real Chromium including high contrast; vice, clock delete (including failure paths and the double-delete guard), seam, permanent actions order, icons (16 and 32 px legible) and static media types all PASS. Evidence: `luna-3/verdict.md`.
- Note: `Promise.withResolvers` is unavailable under the project's ES2022 lib, so the deferred in the clock-delete test uses the executor form.
- Out of scope for this task and left untouched: `tasks/VET-01.md` and the release-gate files named in commit `7659c572`.
