---
id: UI-CREATE-01
title: Restore discoverable roster creation and hide exhausted pagers
deps:
  - BROWSER-02
track: frontend
outputs:
  - frontend/src/pages/roster.ts
  - frontend/src/pages/roster.test.ts
  - frontend/src/styles/components.css
  - frontend/src/main.ts
  - frontend/src/main.test.ts
  - agent-docs/test-audit/browser-evidence/ui-create-01/changed-frontend-files.json
  - conformance/suites-browser/checkpoints/empty-roster-creation.mjs
  - docs/pages/frontend/f2a-roster.mdx
  - agent-docs/test-audit/browser-evidence/ui-create-01/
acceptance:
  - Empty and populated roster creation reaches declared character/PC/crew operations and lands on visible created entities
  - Chromium 1440x1000, 768x1024, 390x844 in light/dark/high-contrast with screenshots, containment, keyboard-focus evidence
  - Independent openai-codex/gpt-5.6-luna xhigh correctness review independently exercises browser path and explicitly PASSes
  - Frontend vitest, npm run build, six BROWSER-02 journeys, metrics/traceability/reconciliation validators pass
  - All app-owned visible character(s) wording becomes scoundrel(s); technical identifiers, verbatim diagnostics/raw JSON and user content stay unchanged
---

# UI-CREATE-01 — roster creation

**Status:** DONE
**Metrics:** `tasks/metrics/frontend/UI-CREATE-01.json`

## Root cause

RECOVERY-01 moved the only roster creation links into closed Import disclosures. There was no standalone create action in either empty or populated state. Separately, `.btn-secondary { display: inline-block }` overrode the native `[hidden]` display of exhausted pagers; with zero rows those buttons had empty labels and clicks revealed nothing. These were the reported broken-looking boxes, not create controls. The declared `createCharacter`, `createPcCharacter` (`/characters/pc`), and `createCrew` clients and sheet-navigation callbacks already existed. Empty state amplified discoverability and ghost-pager symptoms; it did not disable the create API.

## Log

- 2026-10-05: Read AGENTS.md/spec; real Chromium reproduction against managed real Ada server with unseeded isolated data (`/tmp/pitd-managed/.../data`), never campaign-data. Evidence: `agent-docs/test-audit/browser-evidence/ui-create-01/reproduction.json` and `before-empty-roster.png`.
- Red: `npm test -- --run src/pages/roster.test.ts -t UI-CREATE-01` failed all three new regressions: absent direct create actions (empty/populated), hidden pager computed display was inline-block.
- Green: visible native create links styled with incumbent primary-button tokens, 44px targets, import separated from heading; button classes respect `[hidden]`. Same focused regression command passed 3/3; initial `npm run build` passed.
- Added an independently runnable checkpoint module under the existing browser checkpoint directory. BROWSER-02's loader deliberately freezes exactly six top-level journeys, so neither it nor frozen journey tests were edited. Checkpoint verifies all three create endpoints and both empty/non-empty creation, then 36 route/viewport/theme entries.
- First checkpoint run exercised creation successfully but exposed a checkpoint timing bug: roster-row assertion ran before asynchronous roster fetch. Changed it to wait for each visible row, not an instantaneous visibility assertion.
- Timing-sensitive backend worker requested exclusive Ada-loop/build/benchmark window; acknowledged browser run stopped and paused browser/Luna/heavy checks.
- While paused, source inspection found ink-on-paper `--focus-ring` inherited onto the inked band. After release, focused red confirmed 1.354:1 light and 1:1 light+HiC. Scoped the new actions' focus token to `--band-text`; focused green 7/7 and build passed. Evidence: `focus-red.log`, `focused-green.log`, `creation-build.log`.
- Managed checkpoint PASS: all three declared endpoints, four created sheet landings/roster links, 36 matrix entries. Document/body widths match actual viewport widths 1440/768/390; containers contain; create targets are 44px high with 3px (4px HiC) keyboard rings and minimum measured ring/band contrast 10.446:1. Evidence: `creation-results.json`, `creation-browser-pass.log`, `matrix-numeric/`, `screenshots/`. The checkpoint now matches and counts the exact incumbent BROWSER-02 favicon-only console-noise policy.
- Required Luna/openai-codex/xhigh correctness reviewer launched via detached `/dev/null` stdin, raw output `luna-review-raw.txt`. Before independent browser work began, backend worker requested a fresh exclusive cold-build/Ada window: suspended exact reviewer PID `347891` via SIGSTOP, confirmed process tree had no browser/backend child, acknowledged readiness. Next command after explicit release: `kill -CONT 347891`; await `bg_4`, fix any FAIL, then finish frontend vitest/build, six journeys, and all three validators.
- Backend cold-run timing window explicitly released; resumed the same exact reviewer PID via SIGCONT. Awaiting independent verdict; no source mutations during review. Next acceptance command after PASS: `node /tmp/ui-create-command.mjs final-vitest npm test -- --run` (frontend cwd), then final build/browser/validators.
- Human expanded scope to all app-owned character/scoundrel wording; boundary explicitly preserves routes/identifiers, verbatim backend diagnostics, raw JSON/pointers, and player-authored content. Implemented across the 26 frontend files listed in `changed-frontend-files.json`; focused wording red was 28 failures/625 tests, followed by 625/625 green after correcting four stale title selectors.
- CONF-WORDING-01 was separately authorized for exactly five frozen expected strings. Original six-journey browser suite red: character-create-edit, lifecycle, and roster-recovery failed; three others passed. After the five-string update all six passed. Reverse-replacement SHA-256 reconstruction proves every other byte unchanged (`frozen-wording-integrity.json`).
- Expanded the checkpoint to 72 entries including detail/history/import/crew-detail and app-owned visible/accessibility/document-title samples. Its first run exposed two missed detail/history document titles. Added parameterized router regressions: 2 failures/12 tests, then changed only those title strings and observed 12/12 green plus build PASS.
- Resumed after quota interruption: prior initial Luna reviewer processes no longer exist and raw output contains only `Working...`, so there is no verdict and no review claim. Preparing a fresh mandatory Luna xhigh combined review covering creation, the broad rename, and all five authorized frozen wording updates. Backend worker confirms no exclusive heavy window; it waits for explicit UI stable after review/gates.
- Expanded checkpoint now PASS: all declared endpoints/four sheet landings/visible roster rows, 72 matrix entries and app-owned scoundrel wording. Evidence: `final-creation-matrix.log`, current `creation-results.json`, `matrix-numeric/`, `screenshots/`; managed no-seed data was cleaned up.
- Final combined `openai-codex/gpt-5.6-luna` xhigh correctness review: **VERDICT: PASS**, no blocking findings. Independently authored/executed a real Ada/Chromium no-seed probe, exercised keyboard/touch empty creation and all three POST routes, populated creation, lifecycle/end-score/history/import, and visually inspected independent screenshots plus the 72-entry matrix. Evidence: `luna-review-final-raw.txt`, `luna-final-independent/independent-results.json` (13 screenshots, 12 geometry records).
- Closing gates after Luna PASS: frontend **806/806** tests in 20 files; `npm run build` PASS; frozen browser suite **6/6** PASS. Evidence: `final-vitest.log`, `final-build.log`, `final-browser.log`, complete `final-browser/` artifacts.
- Closing validators: metrics **163 files / 0 errors**, traceability **231/231**, strict reconciliation **all checks PASS / 0 errors / 0 warnings**. Evidence: `final-metrics-validator.log`, `final-traceability-validator.log`, `final-reconciliation-validator.log`.
- Source is stable; no browser/heavy jobs remain. All changes are ready for vet-fix-2's exclusive final hash-refresh/campaign/gate window. No commits/pushes or backend edits.
