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
- Sol 6.1 xhigh at `d902771f`: FAIL on two P2 draft losses. (1) Take ability and Mark upgrade selects reset on any sheet rerender (for example Edit claim), so the pick was lost. Fixed red-first: the picks are kept in the crew-detail controller (`abilityPick`, `upgradePick`) and restored by `crew-sections/playbook.ts` when still eligible; test `keeps the Take ability and Mark upgrade picks across a sheet rerender`. (2) A profile save that hit STALE_REVISION discarded the Lair draft, because the editor closed before the request. Fixed: the profile editor closes on success only (`crew-detail.ts`); test `keeps a profile draft when the save returns STALE_REVISION`.
- Sol 6.1 xhigh at `fc497585`: FAIL on three P2s in cohort editing (verdict `tasks/metrics/frontend/CREW-REVIEW-01-sol-6.1-verdict.txt`). Red-first tests and the failing output are in `tasks/metrics/frontend/CREW-REVIEW-01-r6-red.log`. (1) A retry after STALE_REVISION sent the open-time harm back over a concurrent change. Fixed: an edit draft keeps a `synced` snapshot of the server state it follows; a refresh moves only the fields the user has not changed (`frontend/src/pages/crew-sections/cohorts.ts`, `frontend/src/pages/crew-detail.ts` `CohortEditDraft`); test `a retry after STALE_REVISION sends only the field the user changed`. (2) The edit view showed the tier-derived Quality and Scale, but the save keeps the stored values. Fixed: the edit view shows the stored values; the add form keeps the tier-derived preview. The existing test `updates harm and armor through the edit form` now expects the stored quality (it previously asserted the derived "from Tier" label). Test: `the cohort editor shows stored quality and scale, not the current tier's`. (3) Saving an untouched expert with no type sent an invented `Custom` type. Fixed: an untyped expert keeps "" and offers a "(no type)" option; test `saving an untouched expert with no type sends no update`.
