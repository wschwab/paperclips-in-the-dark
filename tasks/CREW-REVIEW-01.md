# CREW-REVIEW-01

End-to-end review of the whole crew page. Single-feature cards were each reviewed in isolation. This card checks that the features work together, looking for cross-feature bugs that the per-card reviews could not see.

## Scope

The crew page is exercised with these features together, in one session per viewport and theme:

- Rep and Turf, including claims (CREW-REP-TURF-01).
- Undo of a Rep/Turf change, then the refreshed capability projection (the undo refresh fix in CREW-REP-TURF-01).
- Claim edit, including an out-of-sequence edit and the out-of-sequence claim confirmation (CREW-CLAIMS-EDIT-01).
- Claims map layout (CREW-CLAIMS-MAP-01).
- Cohorts add and edit, including the equal edges-and-flaws gate on both forms (CREW-COHORTS-01, CREW-COHORTS-02).
- Crew XP triggers (CREW-XP-TRIGGERS-01).
- Manual factions (F2y, CREW-WORLD-01 to CREW-WORLD-03), with districts hidden when the setting content is absent (SETTING-PULL-01).

## Matrix

- Viewports: 1440x1000, 768x1024, 390x844.
- Themes: light, dark, high contrast.
- Pinned head: the review runs against an immutable commit revision recorded in the verdict; a fix changes the head and requires a re-review.

## Method

- A reviewer runs the scenarios through the managed Chromium launcher, one session per viewport and theme. Each session must do a cross-feature sequence, not a per-feature check. For example: claim a Rep/Turf entry, edit a claim out of sequence, undo the Rep/Turf change, then confirm the claims map, cohorts and XP triggers still agree with the stored state.
- Each session records: document horizontal overflow, console errors, the displayed state after each step, and the stored state after each step.
- The reviewer checks that displayed state matches stored state after each step, and that undo leaves no stale projection in any feature.

## Acceptance

- Across the 9 viewport-theme combinations, every cross-feature sequence completes with displayed state matching stored state at each step.
- No horizontal overflow at any combination.
- No console errors at any combination.
- Any cross-feature bug found is recorded in the verdict with the reproduction steps. A FAIL is fixed red-first and re-reviewed.

## Artifacts

- Verdict: `tasks/metrics/frontend/CREW-REVIEW-01-sol-6.1-verdict.txt`, first line `VERDICT: PASS` or `VERDICT: FAIL`.
- Probe and evidence: `docs/public/evidence/crew-review-01/`, written when the review's probe is committed.

## Round log

- Sol 6.1 xhigh at `ed383b21`: FAIL on one P2. `onCohortUpdate` closed the editor and deleted its draft before `cohort.update` succeeded, so a STALE_REVISION conflict discarded the edits. Fixed red-first: the cohort update clears the editor and draft only on success (`frontend/src/pages/crew-detail.ts`), with the regression test `keeps the cohort editor and its unsaved draft when cohort.update returns STALE_REVISION` (`frontend/src/pages/crew-detail.test.ts`).
- Sol 6.1 xhigh at `b8e311f8`: FAIL on a stale capability projection. Develop could validate against a projection fetched before a mutation or undo changed the crew. Fixed red-first: each projection is bound to the crew revision it was fetched for, and `projectionFor` (`frontend/src/pages/crew-sections/trackers.ts`) drops it once the revision changes. Test: `frontend/src/pages/crew-sections/trackers.test.ts`.
- Sol 6.1 xhigh at `563545e3`: FAIL on unsaved reputation choice lost by Edit claim; fixed in `8e9a2ce9`.
