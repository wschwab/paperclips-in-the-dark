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
- **No contract/backend change or new operation is necessary.** `claim.set` already updates the owned-claim set atomically in one snapshot/revision. The existing read-only capability projection adds/removes the corresponding typed `derivedDelta` effects. Never append a second `turf.add`: that would both double-count and introduce a partial-write seam. `turf.add` remains the manual/base counter.
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
