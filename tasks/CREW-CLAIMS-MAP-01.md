---
id: CREW-CLAIMS-MAP-01
title: Let the crew claims map span both wide columns without horizontal scrolling
track: frontend
deps:
  - CREW-REP-TURF-01
outputs:
  - frontend/src/styles/components.css
  - frontend/src/pages/crew-sections/claims.ts
  - frontend/src/pages/crew-claims-map.test.ts
  - docs/pages/contract/crew-trackers-and-claims.mdx
  - tasks/metrics/frontend/CREW-CLAIMS-MAP-01.json
---

# CREW-CLAIMS-MAP-01

## Layout decision

The connected claims graph is one readable full-width section, a deliberate exception to the crew sheet's otherwise balanced print columns. Keep the incumbent style, graph topology and DOM/focus order. Use the available width, not content-preferred sizing; let graph tracks and long cell text shrink/wrap. Retain the bounded narrow-screen map panning rather than widening the document.

- Wide `.crew-detail > .crew-claims` uses `column-span: all` at the existing crew-column breakpoint.
- `.claims-grid` uses `width: 100%`; its column count still comes from game data and uses `minmax(0, 1fr)` tracks.
- Claim cells use `min-width: 0` and `overflow-wrap: anywhere`.
- The previous separate-Turf cleanup remains in CREW-REP-TURF-01; no API/backend change is needed here.

## Red → focused green

Three new `crew-claims-map.test.ts` tests failed **3/3** before implementation: no full-column span, fit-content grid width, and non-shrinkable graph tracks. Evidence: `tasks/metrics/frontend/CREW-CLAIMS-MAP-01-red.log`.

After implementation, the three new guards and both existing torn-seam layout guards passed **5/5** (`CREW-CLAIMS-MAP-01-focused.log`). The pre-edit layout detector reported no findings (`CREW-CLAIMS-MAP-01-layout-before.log`). This is source/DOM guard coverage only; it is not a claim of measured browser geometry.

## Acceptance boundary

The frozen-tree Chromium 3×3 check must include 1440×1000 with **map.scrollWidth === map.clientWidth**, and 768/390 containment plus bounded map panning in light, dark and high contrast. Full frontend/browser/validators/Vocs, refreshed mutation pins and **28/28**, and a pinned Sol 6.1 xhigh verdict are recorded at the combined-tree acceptance boundary before delivery. No full result is claimed at this scoped implementation commit.

## Frozen-tree acceptance (takeover, tree `e360683e`)

- Chromium probe (`agent-docs/test-audit/browser-evidence/crew-claims-edit-01/probe.mjs`, log `tasks/metrics/frontend/CREW-CLAIMS-EDIT-01-chromium.log`): at 1440×1000, `map.scrollWidth === map.clientWidth` and the document fits. At 768 both fit. At 390 the map pans inside its bounded container (`scrollWidth > clientWidth`), as designed.
- Vitest 1006/1006; `tsc` clean; `vite build` green; browser 6/6 PASS; validators PASS; Vocs build 163 files.
- Mutation campaign 28/28 (P0 19/19, P1 9/9; `tasks/metrics/contract/MUTATION-28-final-combined.log`).
- Sol 6.1 xhigh: **NOT-RUN** (Codex `usage_limit_reached`). The user will run it when quota resets.
- Sol 6.1 xhigh at `086cae52` returned FAIL: a 64-character claim name widened the document at 390px (726/390), because the Active claim benefits rows did not wrap. Red and green: `crew-claims-edit-01/long-claim-name-probe.mjs`, `long-claim-name.json`; fix in `components.css` (`.active-claim-list`). Document overflow is 0 at 1440, 768 and 390. The map itself was already bounded and is unchanged.
