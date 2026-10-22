# CREW-COHORTS-02

The SRD rule of an equal number of edges and flaws was enforced only in the cohort add form. The cohort edit form let a cohort be saved with unequal counts.

## Finding

- `crew-sections/cohorts.ts` gated Add on `edges === flaws` (CREW-COHORTS-01 follow-up). The edit form had no gate, so a cohort could be saved with 2 edges and 1 flaw.

## Change

- `countMismatchMessage(edges, flaws)` in `crew-sections/cohorts.ts` is the single source of the explanation. The add form uses it.
- The edit form shows the same message in `.cohort-count-mismatch` and disables Save while the counts differ. Its pickers report every change through a late-bound `syncEditGate`, because `traitPicker` also reports initial chips during construction, before Save exists.

- Test fixture: `crew-detail.test.ts` "updates harm and armor through the edit form" used a Bravos cohort with 2 edges and 1 flaw. That cohort is invalid under the SRD rule, so the gate blocked its Save. The fixture gets a second flaw (`Frail`). The display assertion `Flaws: Loud` still matches as a substring. Full vitest: 1011/1011.
## Red and green

- Red: `frontend/src/pages/crew-cohorts.test.ts` "edit form blocks Save while edges and flaws differ, says why, and unblocks once they match". Failed with `AssertionError: expected false to be true` (Save still enabled at 2/1).
- Green: `npx vitest run src/pages/crew-cohorts.test.ts`: 8/8 passed.
- Chromium 3×3: `docs/public/evidence/crew-cohorts-02/edit-gate-probe.mjs` (run through `conformance/scripts/managed-browser-smoke.mjs --seed-defaults`) covers 1440/768/390 × light/dark/high contrast. Output: `edit-gate.json`, 9 rows, 0 failures. Each row: Save enabled at 1/1, Save disabled with the message at 2/1, Save enabled again at 2/2, and document overflow 0. Screenshots are `edit-<width>-<theme>-mismatch.png`.
- Note: the first probe run failed because the managed server serves the built frontend. The frontend was rebuilt (`npm run build`) before the passing run.

## Acceptance

- Add and edit forms use the same message. Save is disabled while counts differ, and enabled once they match.
- Frontend gates and the Chromium 3×3 pass at the card's revision.
