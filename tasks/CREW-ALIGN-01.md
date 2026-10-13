---
id: CREW-ALIGN-01
title: Crew sheet two-column tops align under the masthead seam
deps:
  - PLAYTEST-UI-01
  - MODE-PANEL-ALIGN-01
track: frontend
outputs:
  - frontend/src/styles/components.css
  - frontend/src/styles/sheet-columns.test.ts
  - agent-docs/test-audit/browser-evidence/crew-align-01/
---

# CREW-ALIGN-01 — Crew sheet column tops

## Problem

On the wide crew sheet (two columns, `min-width: 900px`), the right-hand column's first card, Playbook, started at the masthead's bottom edge, directly under the torn seam. The left column's first card (Profile) started 18px lower. The masthead touched the Playbook card, and the seam overlapped its top border.

This was not the MODE-PANEL-ALIGN-01 cause. The crew route root already has the gutter padding (`.crew-detail` in the FV-031 rule, `components.css`), so the sheet's top offset is correct. The defect is in the two-column block.

## Cause

`frontend/src/styles/components.css`, `@media (min-width: 900px)` block (≈ line 704). The character sheet reserves the seam under its masthead (PLAYTEST-UI-01 item 7): `.character-detail > .character-header { margin-bottom: calc(var(--torn-depth-lg) + 18px) }` and `.character-detail > .character-header + * { margin-top: 0 }`. The crew sheet had only the shared `.crew-detail > *` rules. With `columns: 2`, the first card in column 2 takes its top margin truncated at the column break, so it sat at the masthead's bottom edge.

## Change

Mirror the character sheet's two rules for `.crew-detail > .crew-header` inside the same 900px block. Both columns now start `torn-depth-lg + 18px` beneath the masthead. Narrow widths are unchanged: the single-column stack is not affected.

## Red-green

- Red: `sheet-columns.test.ts` guard "reserves seam depth plus the column gap under the crew masthead" failed before the change (1 failed, 1 passed).
- Red geometry (Chromium, before, 1440px light): masthead bottom 271.9px; Playbook top 271.9px (0px below the masthead); left column top 289.9px; column difference −18px.
- Green (after, 1440px): both column tops 307.9px in light and dark, 294.9px in high contrast; masthead bottom 271.9px (light/dark) and 276.9px (high contrast); difference 0px in every wide combination.
- At 768px and 390px the sheet is a single column (`columnCount: auto`); those column tops are unchanged (289.9px and 333.5px light).

## Evidence

`agent-docs/test-audit/browser-evidence/crew-align-01/`:

- `check.mjs` and `check.json`: 9 rows (3 sizes × light, dark, high contrast), numeric geometry per row (column lefts and tops, masthead and app bar edges, overlap with the app bar, `scrollWidth` against `innerWidth`, page errors).
- `crew-<w>x<h>-<theme>.png`: full-page screenshot per combination.

Post-fix results (all 9 rows): no app-bar overlap; `scrollWidth == innerWidth`; no page errors. Wide rows: difference 0px.

## Gates (at 8a7cd0c1)

- `npx vitest run` (frontend): 935/935, 32 files. `npx tsc --noEmit`: exit 0. `npm run build`: exit 0.
- `npm run test:browser` (conformance): 6/6 journeys pass.
- Mutation campaign: not run by this card. `components.css` is pinned by M18 (`conformance/fixtures/mutation-catalog.json`); its sha256 was refreshed to `cf8ffef58fd1b1e53af14ca6c64f5ebdad867b61d217659a736e9d275b3c0ed3`. The pre-flight was blocked by another worker's in-progress backend-ada edits at `8a7cd0c1`. Main's later record (XP-TRACKER-04, `00afd99a`) reports a 28/28 campaign at `74843d82`, not at this card's commit. A rerun at a revision containing this card is still needed to pin M18 against the final `components.css`.

## Review

Sol 6.1 review (GPT-6.1 Sol, openai-codex, xhigh): **VERDICT: PASS** on `8a7cd0c1`. The reviewer exercised all nine viewport and theme combinations in Chromium, inspected the screenshots, confirmed that removing only the two CSS rules reproduces the -18px misalignment, and found no overlap, horizontal overflow, or page errors. Evidence: `agent-docs/test-audit/browser-evidence/crew-align-01/sol-6.1/verdict.md` (plus its probe, guard, and screenshot files).

Non-blocking P3 (not fixed here): `sheet-columns.test.ts` checks the CSS as source text, so it would still pass if the rules moved outside the media block. Replacing it with a behavioural browser regression is recommended as a follow-up.
