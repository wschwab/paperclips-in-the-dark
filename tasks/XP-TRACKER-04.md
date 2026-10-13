---
id: XP-TRACKER-04
title: XP Tracker panel, Scoundrel XP split-allocation screen, and the Talents cutover (frontend)
deps:
  - XP-TRACKER-02
  - XP-TRACKER-03
track: frontend
outputs:
  - frontend/src/pages/character-sections/xp-allocation.ts
  - frontend/src/pages/character-sections/xp-tracker.ts
  - frontend/src/pages/character-sections/gameMode.ts
  - frontend/src/pages/character-sections/talents.ts
  - frontend/src/pages/character-sections/context.ts
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/character-sheet.ts
  - frontend/src/api/client.ts
  - frontend/src/styles/game-mode.css
  - frontend/src/pages/game-mode-sheet.test.ts
  - frontend/src/pages/character-detail.test.ts
  - conformance/suites-browser/lifecycle.journey.mjs
  - conformance/suites/parity/capability-parity.test.ts
  - skill/generate-capability-manifest.mjs
  - skill/api-reference/capability-manifest.json
  - conformance/fixtures/mutation-catalog.json
  - agent-docs/test-audit/browser-evidence/xp-tracker-04/ (evidence, gitignored)
---

# XP-TRACKER-04 — XP Tracker, allocation screen, Talents cutover

## Order of work: stated honestly

The UI was written **before** its tests, so the red-green order was not followed for this card. The tests in `game-mode-sheet.test.ts` (the `XP Tracker and Scoundrel XP completion (XP-TRACKER-04)` block) were added afterwards. To show that they bite, the mutation check below breaks each relevant piece of the UI and records which test fails.

## What changed

- **Talents cutover (clean):** the Score XP sub-section (the three session tracks, the playbook expression note and the **End downtime** button) is removed from `talents.ts`. The client `endDowntime` helper and its options type are removed. The detail-page handler, its loading flag, the sheet type entry and the `anyLoading` term are removed. The API operation `end-downtime` stays in the contract.
- **XP Tracker (Score only):** Desperate action XP (moved from the Score panel) and the three expression tracks. The rows reuse `stressTrack` with the same labels and handlers as the old Talents rows, so the markup is the same (`.session-track[data-session-track]` > `.stress` > `.stress-track`, label below the boxes). Wide screens show it under the Game mode panel. Compact screens show a footer **XP Tracker** tab with `aria-expanded` and `aria-controls`, which opens a bottom sheet (`role=dialog`, `aria-modal`, Close button, Escape, focus returns to the tab, drag down over 80 px as an extra, the sheet behind is `inert`).
- **Scoundrel XP, Resolution step 1:** the split-allocation screen. Four destination rows (Playbook, Insight, Prowess, Resolve) with steppers, filled, pending and empty boxes against the maximum, and the room left. The GM total starts from the three counters, is locked, and an **Adjust** toggle unlocks it. Live available and remaining. Completion is disabled while XP is unplaced, over the total, or over a track's room, and says why. A zero total is allowed, with the counter warning. **Complete Scoundrel XP** calls `characterXpResolve` (`xp.resolve`).
- **Fit at 1440×1000:** the wide tracker's copy is shortened; its stress padding and label margin are tightened (box size unchanged); the rows stay on one line; the allocation rows sit in two columns. Measured: all three expression rows inside the viewport (the lowest ends at 937 px); the completion control at 905 px (light and dark) and 962 px (high contrast).

## Decisions recorded (human-approved)

| Item | Before | After |
|---|---|---|
| Frozen parity `REQUIRED_HUMAN_OPS` (`conformance/suites/parity/capability-parity.test.ts`) | 28 entries including `endDowntime` (line 63) and, from XP-TRACKER-03, `characterXpResolve` | `endDowntime` removed; `characterXpResolve` kept. Its manifest disposition is now `agent` (the `downtime.reset` precedent: the API op stays, no UI control is required), with the description entry removed. Regenerated `capability-manifest.json` and API reference. |
| Journey `readStress` (`conformance/suites-browser/lifecycle.journey.mjs:56-60`) | `document`-wide `.stress-track[role="group"]` `.first()`, which reads the XP Tracker's two-box expression track | scoped to `.character-detail .stress-track[role="group"]` |
| Journey step-5 inline wait (`lifecycle.journey.mjs:165`) | same unscoped selector | scoped the same way |
| Journey `addStressUntil` wait (`lifecycle.journey.mjs:74`) | same unscoped selector | scoped the same way (found on the third pass; it passed by timing alone before the change, which is not reliable) |
| Journey step 6 (`lifecycle.journey.mjs:192-197`) | `button[title^="End downtime"]` click, waiting for `/end-downtime` 200 | Resolution Scoundrel XP completion with a zero total, waiting for `/ops/xp.resolve` 200 |
| Journey checkpoint (`lifecycle.journey.mjs:32`) | `end-downtime-ok` | `scoundrel-xp-completed` |

## Gate-blocking defect found by the browser run (fixed)

The completed allocation card intercepted pointer events over the sheet's "Add 1 stress" button, so the lifecycle journey could not click it. The Resolution dialog is non-blocking (human decision), so the card now passes clicks through except its own controls: `.game-mode-resolution .game-mode-popup-card` is `pointer-events: none`, and its buttons, inputs, selects, links, summaries and labels are `auto` (`frontend/src/styles/game-mode.css`).

## Mutation check: do the tests bite?

Script: `/tmp/bite/run.py` (each mutation applied to the source, `npx vitest run src/pages/game-mode-sheet.test.ts -t "XP Tracker and Scoundrel XP completion"`, source restored after each run; restoration verified).

| Broken piece | Result | Failing test |
|---|---|---|
| Tab `aria-expanded` removed | 1 failed | the compact tab opens the bottom sheet (aria-expanded …) |
| Escape closes nothing | 1 failed | the same test (Escape step) |
| Room check removed | 1 failed | a track beyond its room blocks completion |
| Request omits allocations | 1 failed | Complete posts xp.resolve with the total and the allocations |
| Expression tracks dropped (only two of three) | 1 failed | the tracker holds Desperate action XP and the three expression tracks |
| Adjust does not unlock | 1 failed | Adjust unlocks the GM total, and a zero total is allowed |
| Complete ignores remaining (only the completion condition) | 0 failed | **equivalent mutant**: the "unplaced" error already blocks completion, so the condition is redundant |
| Unplaced rule and completion gate both removed | 1 failed | completion is disabled until every XP is placed, then enabled |

The equivalent mutant is recorded, not hidden. The stronger mutant (both guards removed) is caught.

## Chromium evidence (3 sizes × 3 themes)

- `agent-docs/test-audit/browser-evidence/xp-tracker-04/check.mjs` → `check.json`, 9 rows. Screenshots `xp-tracker-{1440}-{theme}.png` and `xp-tracker-sheet-{768|390}-{theme}.png`.
- **Wide 1440 (light, dark, high):** tab hidden; panel shown; all three expression rows in the initial viewport; zero horizontal overflow.
- **Compact 768 and 390 (light, dark, high):** tab visible; mouse click opens with `aria-expanded="true"`; the sheet is `role=dialog` and `aria-modal=true`; the sheet behind it is `inert`; all three rows in the sheet; zero overflow. Escape closes (`aria-expanded` false) and returns focus to the tab. Enter opens. Close returns focus to the tab. Space opens. A touch tap opens. A downward drag over 80 px closes. Zero page errors.
- **Allocation screen at 1440×1000** (`resolution-fit.mjs` → `resolution-fit.json`): completion bottom 905 px (light, dark), 962 px (high); no overflow; no page errors.

## Gates

| Gate | Result |
|---|---|
| vitest | 940/940 (32 files) |
| tsc | exit 0 |
| build | exit 0 |
| browser journeys (`npm run test:browser`) | 6/6 PASS on the committed code (`tasks/metrics/frontend/XP-TRACKER-04-browser.log`) |
| Chromium 3×3 with keyboard and touch | 9/9 rows pass (see above) |
| full managed Ada suite, two cycles | 594/594 in both cycles (`tasks/metrics/ada/XP-TRACKER-04-full-suite-two-cycles.log`) |
| mutation campaign 28/28 | **28/28** (P0 19/19, P1 9/9) at `74843d82`; log in the campaign output, summarised in `tasks/metrics/frontend/XP-TRACKER-04.json` |

## Before / after for the journey (summary)

Before: step 6 clicked the sheet's End downtime button and waited for `/end-downtime` 200 (checkpoint `end-downtime-ok`). After: step 6 completes Scoundrel XP with a zero total through `/ops/xp.resolve` 200 (checkpoint `scoundrel-xp-completed`). Undo (step 7) still restores the state, because `xp.resolve` writes one snapshot.

## Sol 6.1 xhigh review of 74843d82: FAIL, four findings fixed

Verdict: `agent-docs/test-audit/browser-evidence/xp-tracker-04/sol-6.1/verdict.md` (Sol's own probe: 204/227 assertions; the layout, request body, zero-total and journey-selector checks passed). Findings, each confirmed in code, then fixed:

| Finding | Fix | Red test (`game-mode-sheet.test.ts`, XP-TRACKER-04 review) |
|---|---|---|
| R1 P1: the compact sheet left `.character-detail` inert after a widen or leaving Score | Inert is set only where the sheet renders; widening (`innerWidth > 1099`) and leaving Score (`onMode`) close the sheet | "widening…" and "leaving Score…" |
| R2 P2: focus escaped the modal (Shift+Tab reached the tab behind it) | Tab and Shift+Tab wrap inside the dialog; the mode panel and sheet behind it are inert while open | "traps Tab…" and "…inert" |
| R3 P1: wheel over the pass-through Resolution card scrolled the page underneath | A window wheel listener forwards wheel over the card's rectangle to the card's own scroll | Chromium only (jsdom has no layout) |
| R4 P2: the 390 footer clipped the XP Tracker opener | The tab sits before the scrolling panel content | "the compact XP Tracker tab comes before…" |

Red-first: the five unit tests failed on 74843d82's code before the fix. Gates after the fix: vitest 945/945 (32 files), tsc 0, build 0, browser 6/6 (`tasks/metrics/frontend/XP-TRACKER-04-browser-review.log`), Chromium `review-fixes-check.mjs` R1–R4 all pass with zero errors (`review-fixes-check.json`), the nine-combination tracker check 9/9, and the allocation fit (completion bottom 905/905/962).


## Sol 6.1 round 2 on 523483d2: FAIL, three findings fixed

Verdict: `agent-docs/test-audit/browser-evidence/xp-tracker-04/sol-6.1/round2/verdict.md`. Sol confirmed the round 1 fixes for R1 and R4 and the Tab trap, and found these open items:

| Finding | Fix |
|---|---|
| R3 P1: compact completion sat behind the footer; the wheel was swallowed by an invisible part of the card and by the footer | The compact card is capped at `calc(60vh - 2em)`, the visible overlay height (`game-mode.css`); wheel is forwarded only above the footer on compact screens. Chromium: card bottom 490 px, footer top 506 px; completion bottom 340 px, hit-testable after wheel-only scrolling; wheel over the footer leaves the card unchanged. |
| R2 P2: the global header (theme buttons) could take focus while the sheet was modal | While the compact sheet is open, every element outside the character page is inert, and restored on close or unmount (`setOutsideInert` in `character-detail.ts`). Chromium: the Dark header button cannot take focus; Escape still closes. Red test: "…the page outside the character … is inert too". |
| T1 P3: the DOM-order test pinned implementation structure, not visibility | Removed. The clipping is verified by the Chromium probe (`review-fixes-check.mjs` R4: tab 642–684 px inside 844 px, footer scrollTop 0), not by a unit test that cannot see layout. |

Gates after round 2: vitest 945/945 (32 files), tsc 0, build 0, browser 6/6 (`tasks/metrics/frontend/XP-TRACKER-04-browser-round2.log`). Chromium `review-fixes-check.mjs`: R1, R2, R3, R4 pass with zero page errors; nine-combination tracker check 9/9; allocation fit 905/905/962.

Still open by design: a pointer click on the header is blocked while the sheet is modal (inert), so the header is not clickable until the sheet closes. Touch scrolling over the pass-through Resolution card was not separately verified.

## Sol 6.1 round 3 on e2dbb60e: FAIL, one finding fixed

Verdict: `agent-docs/test-audit/browser-evidence/xp-tracker-04/sol-6.1/round3/verdict.md`. R3 (completion reachable above the footer) and the outside-inert regression test passed. R2 remained: a real pointer click on the blocked header (Dark) moved focus to the body, and Escape then did nothing, because the Escape handler was on the sheet and only worked while focus stayed inside it.

| Finding | Fix |
|---|---|
| R2 P2 (round 3): focus lost to the page after a blocked click; Escape missed the modal | Escape is a capture-phase `keydown` listener on the document, active while the compact sheet is modal (it works from any focus). Focus that leaves the open sheet (`focusout` with no related target) returns to its Close button. The sheet-local Escape branch is removed so Escape has one path. |

Red-first: two new unit tests ("Escape still closes… after focus was lost…" and "focus that leaves the open compact sheet returns to its Close button") failed before the fix. Gates after round 3: vitest 947/947 (32 files), tsc 0, build 0, browser 6/6 (`tasks/metrics/frontend/XP-TRACKER-04-browser-round3.log`). Chromium `review-fixes-check.mjs`: R1, R2 (including the pointer-click reproduction: focus returns to Close, theme unchanged, Escape closes and returns focus to the tab, header not inert after close), R3, R4 pass; nine-combination check 9/9; allocation fit 905/905/962.
