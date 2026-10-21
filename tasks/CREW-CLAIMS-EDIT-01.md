---
id: CREW-CLAIMS-EDIT-01
title: Remove claim rename from active claims; click to claim or relinquish; Edit claim rewrites a claim
track: frontend
deps:
  - CREW-CLAIMS-MAP-01
outputs:
  - frontend/src/pages/crew-detail.ts
  - frontend/src/pages/crew-sections/claims.ts
  - frontend/src/pages/crew-detail.test.ts
  - frontend/src/pages/crew-claims-map.test.ts
  - frontend/src/pages/crew-claims-edit.test.ts
  - conformance/suites-browser/checkpoints/crew02-claims.mjs
  - conformance/suites-browser/crew-create-trackers.journey.mjs
  - docs/pages/frontend/f2u-crew-profile-trackers.mdx
  - docs/public/evidence/crew-claims-edit-01/probe.mjs
  - docs/public/evidence/crew-claims-edit-01/probe.json
  - tasks/metrics/frontend/CREW-CLAIMS-EDIT-01-chromium.log
---

# CREW-CLAIMS-EDIT-01

## Spec

- Active claims have no rename, customize, reset, or relinquish buttons. Their benefits are plain text.
- Clicking a claim acquires it when unowned (existing out-of-sequence warning) and relinquishes it when owned (existing confirmation, `relinquishMessage`). One click does one thing.
- The "Edit claims" / "Done editing" toggle is removed.
- "Edit claim" opens a chooser. Clicking a claim then opens an inline form with its name and text. Save posts `claim.customize` with only the non-blank fields. "Reset to default" (shown only when an override exists) posts `claim.reset`. Cancel closes the editor. Ownership is not changed by editing.
- Saving with both fields blank is refused with "Enter a name or benefit text, or use Reset to default."
- The editor closes only after the server accepts the save (`runCrewOp` `afterSuccess`), so drafts survive a failed or in-flight request.
- No backend change. `claim.customize` and `claim.reset` already exist.

## Implementation

- `crew-detail.ts`: `RenderState.claimEditor: ClaimEditor | null` replaces `claimsEditMode`. Handlers `onClaimEditStart`, `onClaimEditSelect`, `onClaimEditCancel`, `onClaimSave`. `onClaimsEditToggle` and `onClaimCustomize` are removed.
- `crew-sections/claims.ts`: rewritten around the single click and the editor form.

## Evidence and status

- Red: **not captured by this takeover.** `crew-claims-edit.test.ts` was written by the previous worker, and no red log was saved. This card does not claim red-first for that file. Green is recorded below.
- Green (focused, takeover): `crew-claims-edit`, `crew-claims-map`, `crew-detail`, `crew-rep-turf`, `crew-cohorts`: 5 files, 118/118 at that point. Full vitest after the final changes: 42 files, 1006/1006.
- Full frontend: `tsc --noEmit` clean after removing one unused `vi` import in `crew-claims-map.test.ts`; `vite build` green.
- Browser suite (six journeys): 6/6 PASS.
- Chromium probe (`probe.mjs`, managed launcher, `probe.json`):
  - 1440×1000: `mapScrollWidth === mapClientWidth` (fits), document fits, 0 → 1 owned after a direct click, cancelled relinquish keeps 1, editor opens with the current name, 0 toggles, 0 active-list buttons.
  - 768×1024: map and document fit, direct acquire and cancelled relinquish behave the same.
  - 390×844: document fits, but the map `scrollWidth > clientWidth` (horizontal pan inside the bounded map container). This is the existing narrow-screen bounded panning from CREW-CLAIMS-MAP-01, not the 1440 acceptance point. Recorded, not changed.

## Journey adaptations (narrow, authorized)

- `checkpoints/crew02-claims.mjs`: removed the "Edit claims" toggle and the per-claim Relinquish button click. It now asserts `.claims-edit-toggle` count is 0, then relinquishes by clicking the owned cell (`ownedCell(page, "Vice Den").click()`). Confirmation text, POST, and count assertions are unchanged.
  - Before: toggle click → Relinquish button click.
  - After: toggle count 0 → owned-cell click.
- `crew-create-trackers.journey.mjs` (lines ~99–104): the rep/turf step selected `.turf-track .turf-slot[data-stress="1"]`, which no longer exists. It now clicks `Add 1 turf`, waits for `.turf-count` to read `Turf: 1`, then clicks `.crew-rep .stress-box[data-turf="1"]`. Checkpoint `rep-turf-bumped` is unchanged.
- `checkpoints/crew01-cohort-add.mjs`: declared the already-recorded `cohort-derived-stats-stored` checkpoint, which the journey reported as undeclared.

## Sol review

NOT-RUN. The codex quota returned `usage_limit_reached`. The user will run Sol 6.1 xhigh when it resets.

## Frozen-tree acceptance (takeover, tree `e360683e`)

- Vitest 1006/1006; `tsc` clean; `vite build` green; browser 6/6 PASS; validators PASS; Vocs build 163 files; mutation 28/28 (P0 19/19, P1 9/9; `tasks/metrics/contract/MUTATION-28-final-combined.log`). Ada two-cycle not re-run (no backend change in this takeover).
- Sol 6.1 xhigh: **NOT-RUN** (already recorded above).
- Chromium 3×3 (`docs/public/evidence/crew-claims-edit-01/crew-3x3-takeover/probe.mjs`, log `tasks/metrics/frontend/CREW-3X3-takeover-chromium.log`): 9/9 rows pass in light, dark and high contrast at 1440, 768 and 390. Dismissing the confirm on an unconnected claim leaves ownership unchanged; accepting acquires it and the dialog text contains "NOT connected". Edit claim: the chooser, the inline form, and Save all work, and the saved name appears in Active claim benefits. Document overflow 0 in all nine rows.
- Sol 6.1 xhigh at `086cae52` returned FAIL on two points, both fixed red-first:
  - Owned claim text became nearly invisible on hover (1.04–1.20:1, against 13.2:1 at rest). Red: `docs/public/evidence/crew-claims-edit-01/owned-hover-contrast-probe.mjs`. Fix: `components.css` `.claim-owned:hover, .claim-owned:active` keep the owned fill and inverse text. Green: 13.26 (light and high contrast) and 13.18 (dark) at hover, all nine rows (`owned-hover-contrast.json`).
  - A 64-character claim name widened the page to 726px at 390px (`docs/public/evidence/crew-claims-edit-01/long-claim-name-probe.mjs`, red). Fix: `components.css` `.active-claim-list` rows wrap and long names break inside them. Green: document overflow 0 at 1440, 768 and 390 (`long-claim-name.json`).
