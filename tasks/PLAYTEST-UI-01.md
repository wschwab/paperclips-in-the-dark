---
id: PLAYTEST-UI-01
title: Playtest 2026-10 scoundrel sheet UI fixes (items 1, 5, 7, 9)
deps:
  - CHAR-05
track: frontend
outputs:
  - frontend/src/pages/character-sections/stress.ts
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/character-detail.test.ts
  - frontend/src/styles/components.css
  - frontend/src/styles/sheet-columns.test.ts
  - conformance/fixtures/mutation-catalog.json
  - docs/pages/backlog/playtest-2026-10-scoundrel.mdx
acceptance:
  - vice Edit button sits inline with the vice name; Permanent actions render last on the scoundrel sheet; two-column masthead seam stays out of both columns with equal column top spacing; deleting a clock does not re-render the sheet while the delete is pending; red-green frontend tests; real Chromium numeric evidence at 1440x1000, 768x1024, 390x844 in light and dark; independent Luna review
---

# PLAYTEST-UI-01 — playtest 2026-10 scoundrel sheet UI fixes

**Source:** `docs/pages/backlog/playtest-2026-10-scoundrel.mdx` items 1, 5, 7, 9.
**Status:** implemented and verified by the implementing agent. Independent Luna (openai-codex, xhigh) review run once: substantive checks PASS, verdict FAIL on candidate identity only (see log). Not reviewed-PASS; the task is not closed.
**Metrics:** `tasks/metrics/frontend/PLAYTEST-UI-01.json`
**Evidence:** `agent-docs/test-audit/browser-evidence/playtest-ui-fixes/` (`capture.mjs`, `summary.json`, six `<viewport>-<theme>.png` + `.json` pairs); Luna review under `playtest-ui-fixes/luna/` (`verdict.md`, `raw-output.txt`, `stderr.txt`, `review-prompt.md`, its own check scripts and matrix/flicker JSON).

## Log

- 2026-10-08: red — four failing tests confirmed for the right reason before any fix: clock delete re-rendered the sheet while the request was pending (sheet element identity changed); Edit Vice button had no `<p>` ancestor (on its own line); Permanent actions was not the last keyed section (`notebook` was); the CSS seam-clearance rule was absent.
- 2026-10-08: green — vice button moved into the vice-name paragraph; `renderHighImpactSection` moved after `renderNotebookSection`; `onClockDelete` no longer renders before its request (the list still re-renders once on success); `.character-detail > .character-header` reserves `--torn-depth-lg` at all widths, and inside the 900px+ column block it reserves seam depth plus 18px with `+ *` margin zeroed so both columns start level.
- 2026-10-08: layout measurement took three CSS iterations. First attempt put the rule only in the 900px block, and the base rule later in the file overrode it; second left the first left-column card with its own 18px margin (54px below the masthead against 36px on the right); final version fixes both.
- 2026-10-08: `mutation-catalog.json` restoration hashes refreshed for M18 (`components.css`) and M26 (`character-detail.ts`). The harness requires catalog-time hashes, so both were out of date after this change.
- 2026-10-08: verification: frontend suite 810/810 across 21 files (810 includes the four new tests); `tsc --noEmit` clean; mutation campaign 28/28 killed (P0 19/19, P1 9/9); browser journeys 6/6 PASS; numeric capture at all three viewports in light and dark: no horizontal overflow (`scrollWidth <= innerWidth`), zero seam overlaps, vice inline, permanent actions last.
- 2026-10-08: independent Luna review #1 (openai-codex/gpt-5.6-luna, xhigh; prompt `playtest-ui-fixes/luna/review-prompt.md`; raw output `luna/raw-output.txt`; verdict `luna/verdict.md`). Luna ran its own build (21 files, 810 tests), its own managed Chromium runs over 12 viewport×theme combinations (light, dark, light+high-contrast, dark+high-contrast at 1440x1000, 768x1024, 390x844), and two delete-flicker checks (1440 light, 390 dark). Item findings: item 1 PASS, item 5 PASS (no sheet identity change or disabled/"…" flash while the delete is in flight; one re-render on removal), item 7 PASS (zero seam overlaps; equal column tops; high-contrast seam height 0), item 9 PASS. Overall verdict: **FAIL on candidate identity only.** Luna's identity check required `jj log -r @` to equal the candidate commit `ea36a80b`; `@` had become `de135180` because the review's own evidence files were written into the working copy. `jj diff --from ea36a80b -- <four-fix paths>` was empty. No source finding was raised.
- Open: to clear the identity gate the candidate must be frozen as an immutable revision (a jj commit of the working copy), then Luna re-run against it. That is a VCS mutation and was not performed without approval. Out-of-scope files also present in the working-copy diff and not judged: `docs/pages/contract/gate-evidence*`, `tasks/VET-01.md`, `frontend/index.html`, `frontend/public/*`.
- Note: `Promise.withResolvers` is unavailable under the project's ES2022 lib, so the deferred in the clock-delete test uses the executor form.
