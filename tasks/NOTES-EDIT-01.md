# NOTES-EDIT-01: edit notes in place (crew and character sheets)

Status: implementation complete; Sol 6.1 xhigh review pending.

## Outcome
- Users can edit an existing note on the Crew sheet and the Scoundrel sheet. Edit opens a textarea; Save and Cancel are 44px touch targets. Save is disabled when the trimmed text is empty.
- Contract: additive `note.update {index, text}` for characters and crews (0-based index; NOT_FOUND out of range; VALIDATION on empty text). Both are snapshotted, so undo restores the prior text. Retired characters may still edit notes (lifecycle rule).
- Shared focus fix: `frontend/src/lib/focus.ts` skips `data-focus-aside` controls, so the new Edit buttons do not shift the FV-012 focus ordinal.

## Evidence
- Commit `dc1e8476` (implementation), `719c2ac5` (endpoint map pin 118 -> 120).
- Chromium: `docs/public/evidence/notes-edit-01/` (36 PNGs: 1440x1000, 768x1024, 390x844 x light, dark, high-contrast x edit/saved/cancelled states).
- Mutation: `tasks/metrics/frontend/NOTES-EDIT-01-r1-mutation.log`, 28/28 killed.
- Metrics: `tasks/metrics/frontend/NOTES-EDIT-01.json`.

## Open risk
Two unmanaged conformance runs defaulted to `http://localhost:9657`. This is noted in the metrics incidents. All later conformance runs used the managed runners only.

## Remaining
- Sol 6.1 xhigh review loop until PASS, verdict in `tasks/metrics/frontend/NOTES-EDIT-01-sol-verdict.txt`.
- Rebase onto current `main`, then push to origin and rad-agent.
- Forget the workspace.
