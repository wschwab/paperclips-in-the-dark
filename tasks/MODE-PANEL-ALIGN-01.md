---
id: MODE-PANEL-ALIGN-01
title: Game mode panel aligns with the sheet content top
deps:
  - GAME-MODE-03
track: frontend
outputs:
  - frontend/src/styles/game-mode.css
  - frontend/src/styles/game-mode-contrast.test.ts
---

# MODE-PANEL-ALIGN-01 — Game mode panel top

## Problem

At wide sizes the "Game mode" panel started at the top edge of the game-mode layout wrapper, which sits directly under the app bar. Its top was cut by the torn seam, while the identity card beside it started lower. The sheet (`.character-detail`) pads its content by `--gutter` so the masthead clears the seam (FV-031, `components.css`). The new `.game-mode-layout` wrapper had no such padding.

## Change

`frontend/src/styles/game-mode.css`, wide media block: `.game-mode-layout > .mode-panel` gets `margin-top: var(--gutter)`, the same offset as the sheet content. Narrow widths are unchanged: the panel is a fixed footer there, so it has no top to align.

## Red-green

- Red: `game-mode-contrast.test.ts` guard for the wide panel's `margin-top: var(--gutter)` failed before the change.
- Red geometry (Chromium, before the change, 1440px): panel top 57.8px, the app bar's bottom edge; masthead top 81.8px. Difference −24px, which is `--gutter`.
- Green (after): difference 0px at 1440px in light, dark and high contrast; no overlap with the app bar in any of the nine combinations.

## Evidence

- `agent-docs/test-audit/browser-evidence/mode-panel-align-01/check.mjs` and `check.json` (9 rows, 3 sizes × 3 themes; numeric geometry plus a screenshot per combination).
- Independent Sol 6.1 review: `agent-docs/test-audit/browser-evidence/mode-panel-align-01/sol-6.1/verdict.md`, **VERDICT: PASS** on `159c703d`. Its own probe, `sol-check.mjs`, measured Free Play and Score at the same nine combinations, 18 mode states. Panel top equals masthead top at wide sizes (81.766px). The torn edge ends at 71.766px, and the panel never overlaps the app bar.

## Gates at `159c703d`

- `npx vitest run`: 934/934 (32 files). `npx tsc --noEmit`: exit 0. `npm run build`: exit 0.
- `npm run test:browser`: 6/6 journeys pass.
- Mutation campaign: not required. `game-mode.css` is not a pinned target (`grep` of `conformance/fixtures/mutation-catalog.json` finds no entry).
