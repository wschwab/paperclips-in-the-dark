---
id: CREW-REP-TURF-01
title: Put Rep and Turf on one settings-driven crew tracker
track: frontend
deps: []
outputs:
  - frontend/src/pages/crew-sections/shared.ts
  - frontend/src/pages/crew-sections/trackers.ts
  - frontend/src/pages/crew-detail.ts
  - frontend/src/pages/crew-detail.test.ts
  - frontend/src/pages/crew-rep-turf.test.ts
  - frontend/src/styles/components.css
  - docs/pages/contract/crew-trackers-and-claims.mdx
  - tasks/metrics/frontend/CREW-REP-TURF-01.json
---

# CREW-REP-TURF-01

## Decision and implementation

- One Rep tracker: owned Turf reserves its last boxes in red; visible figures use `Rep current/available` and `Turf: total`. Remove the old separate Turf row and its CSS.
- Keep manual −1/+1 controls, labelled as the other/base Turf portion. Its maximum comes from the already-fetched core game's `TurfMax`, not the crew catalog or a literal six. Missing settings do not produce a guessed bound.
- Use existing `CrewCapabilities.effectiveTurf` and `developThreshold`. The Develop handler now uses the same value as the display; it previously ignored claim effects and could show an enabled button that did nothing.
- **Contract unchanged; one backend fix was required.** No new operation or contract field. `claim.set` already updates the owned-claim set atomically in one snapshot/revision. The read-only capability projection adds/removes the typed `derivedDelta` effects. Never append a second `turf.add`: that would double-count and introduce a partial-write seam. `turf.add` remains the manual/base counter. The Sol re-review at `60a57ba3` found that the projection read only the static game effects and ignored a claim's `claimOverrides.effects`, so a customized Turf claim still counted (Turf 1 where the override set effects to `[]`, expected base). Fixed in `backend-ada/server/src/pitd_capability.adb` (`Claim_Effects`); red-first conformance case `CLAIM-OVERRIDE-EFFECTS-001` (`conformance/suites/semantics/claims.test.ts`): red `expected 1 to be +0` on the old binary, green after rebuild.
- The projection-unavailable fallback uses canonical effects plus sparse override inheritance and is shared with the Develop guard. Text renaming does not determine Turf effects.
- Reserved boxes stay disabled native controls rather than changing the track's control count. This preserves existing focus-restoration identities when Turf changes. Their red color uses the incumbent theme's `data-stress="2"` styling.

Rules and API explanation: `docs/pages/contract/crew-trackers-and-claims.mdx`. SRD Turf/Development/Claims verified at https://bladesinthedark.com/faction-game. The human's manual-territory reference https://rpg.stackexchange.com/a/165950 was read through the public Stack Exchange answer API after its regular page returned 403.

## Red → focused green

- Four new tests in `crew-rep-turf.test.ts` failed **4/4** before implementation: combined figures, right-hand reserved boxes, settings-driven bound, and non-interactive Turf marks. Evidence: `CREW-REP-TURF-01-red.log`.
- A new mounted Develop test failed against the old handler: Rep 10 with two claimed Turf showed an enabled button but emitted no `hold.set`. Evidence: `CREW-REP-TURF-01-develop-red.log`.
- Focused integration caught two implementation seams: the existing `crewGameData` is the crew catalog, not core settings; changing Rep buttons into spans shifted ordinal focus onto Heat. Both were corrected using the existing core-game fetch and stable disabled box controls.
- Final affected tracker, Develop and focus selection: **38 passed, 65 unrelated tests skipped** (`CREW-REP-TURF-01-focused-green-2.log`). This is a focused result, not a full-suite claim.
- Existing separate-Turf expectations were replaced with combined-track assertions; the settings fixture now supplies `TurfMax`. No frozen conformance assertion changed.

## Integration and release boundary

The concurrent worker owns cohort and crew-XP changes. Its expected legacy cohort test changes are separate from this card. The focused implementation is committed separately before releasing `crew-detail.ts` for that worker's scoped cohort-handler integration.

Full Vitest/TypeScript/build/browser, Chromium 3×3, validators/Vocs, the pinned Sol 6.1 xhigh review, and mutation 28/28 are recorded at the frozen combined-tree acceptance boundary, before this card is delivered complete. All mutation campaigns are owned by this worker; none runs while the other worker edits pinned targets. No full gate or mutation result is claimed yet.

## Frozen-tree acceptance (takeover, tree `e360683e`)

- Vitest 1006/1006 (42 files); `tsc --noEmit` clean; `vite build` green. Browser suite 6/6 PASS (log in the takeover session; the `crew-create-trackers` rep/turf step now uses `Add 1 turf` and `.stress-box[data-turf="1"]`).
- Validators PASS: `tasks/metrics/frontend/CREW-REP-TURF-01-validators.log` (metrics "ALL CHECKS PASSED"; traceability and reconcile all PASS). The validator scripts live under the gitignored `agent-docs/test-audit/`, so the log is the committed record; the scripts are not in the commit. Vocs build 163 files.
- Chromium 3×3 (`docs/public/evidence/crew-rep-turf-01/probe.mjs`, log `tasks/metrics/frontend/CREW-3X3-takeover-chromium.log`, `probe.json`, 18 screenshots): 1440/768/390 × light/dark/high-contrast, 9/9 rows pass. Document overflow 0 in all nine. `.crew-rep` and `.crew-turf` overflow 0 in all nine. Rep text reads `Rep n/12`-style with the boxes, `Turf: n` and `Other turf: n` update. Manual "Add 1 turf" moves `Other turf` 0 → 1; a Turf claim moves `Turf` 1 → 2 with `Other turf` unchanged. The effective `Turf:` count updates from a separate caps refresh (~100 ms after the manual add, measured in a one-off run, not committed); it settles and is not a defect.
- 390px: `.claims-map` scrolls horizontally inside its bounded container (252–254 px), as designed. Nothing overflows the page.
- No product failure was found, so no red-first fix was needed.
- Layout change (requested after review of the 1440 screenshot): the 12-box Rep track wrapped to two rows inside a 493 px card. It now takes its own full-width line (`.crew-rep .stress-track`, grid) and shows 12 boxes on one row when the card is at least 430 px wide (`@container`), and 6 + 6 below that. Measured by `docs/public/evidence/crew-cohorts-01/forms-3x3-probe.mjs`: 1440 and 768 give one row (track width = card width); 390 gives 6 + 6. The takeover 3×3 re-run after the change: document overflow 0 in all nine rows; Turf text and claim turf unchanged.
- Mutation campaign 28/28 (P0 19/19, P1 9/9; `tasks/metrics/contract/MUTATION-28-final-combined.log`). Five stale pins refreshed in `e360683e`.
- Mutation campaign re-run at `e163eb36` after the cohort and Rep layout change: 28/28 killed, 0 survivors, P0 19/19, P1 9/9 (`tasks/metrics/contract/MUTATION-28-cohort-rep-e163eb36.log`). The `components.css` pin was refreshed to `887fe18c…e114`, the only stale pin.
- Sol 6.1 xhigh: **NOT-RUN** (Codex `usage_limit_reached`). The user will run it when quota resets.
- Sol 6.1 xhigh at `086cae52` returned FAIL: a failed capability refresh after a mutation left the pre-mutation projection on screen (`Turf: 3` where base Turf was 1; the card's own line 25 expects the fallback). Red: `crew-detail.test.ts` "drops a stale capability projection when the refresh after a mutation fails" failed with `expected 'Turf: 3' to be 'Turf: 1'`. Fix: `refreshCaps` in `crew-detail.ts` clears `crewCaps` on failure (guarded by the cancel and sequence checks). Green afterwards; vitest 1008/1008.
- Sol 6.1 xhigh at `60a57ba3` returned FAIL on two points, both fixed: (1) the capability projection ignored `claimOverrides.effects` (see Decision line 24; red `CLAIM-OVERRIDE-EFFECTS-001`, green after the Ada rebuild); (2) the validator line had no log, now `tasks/metrics/frontend/CREW-REP-TURF-01-validators.log`. Gates at the fix: vitest 1009/1009, Ada two-cycle 74/74 files 629/629 tests, browser 6/6, Vocs build 163 files, validators ALL CHECKS PASSED.
