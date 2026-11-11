# NOTES-EDIT-01: edit notes in place (crew and character sheets)

Status: implemented; Sol 6.1 xhigh round 1 verdict PASS (see tasks/metrics/frontend/NOTES-EDIT-01-sol-verdict.txt).

## Outcome
- Users can edit an existing note on the Crew sheet and the Scoundrel sheet. Edit opens a textarea. Save and Cancel are 44px touch targets on the character sheet. The probe asserts Edit, Save and Cancel at 44px on both sheets. Crew labels (Edit, Save, Cancel, Remove) are 1-based like the character sheet; op indexes stay 0-based. Save is disabled when the trimmed text is empty.
- Contract: additive `note.update {index, text}` for characters and crews (0-based index; NOT_FOUND out of range; VALIDATION on empty text). Both are snapshotted, so undo restores the prior text. Retired characters may still edit notes (lifecycle rule).
- Shared focus fix: `frontend/src/lib/focus.ts` skips `data-focus-aside` controls, so the new Edit buttons do not shift the FV-012 focus ordinal.

## Evidence
- Commit `dc1e8476` (implementation), `719c2ac5` (endpoint map pin 118 -> 120).
- Chromium: `docs/public/evidence/notes-edit-01/` (36 PNGs: 1440x1000, 768x1024, 390x844 x light, dark, high-contrast x edit/saved/cancelled states).
- Mutation: `tasks/metrics/frontend/NOTES-EDIT-01-r1-mutation.log`, 28/28 killed.
- Metrics: `tasks/metrics/frontend/NOTES-EDIT-01.json`.

## Open risk
Two unmanaged conformance runs defaulted to `http://localhost:9657`. This is noted in the metrics incidents. All later conformance runs used the managed runners only.

## Open follow-ups (Sol round 1 P2, not blocking)
- Unpinned failure path: a failed or stale save must keep the editor open. Code is correct (character `runCharacterMutate` clearLoading, crew `afterSuccess` only on success); no test pins it.
- Dead class `note-editing` in both `notes.ts` renderers; no rule or selector uses it.
- Character Edit buttons use title only; the crew uses `aria-label="Edit note N"`. Matching the crew would help screen readers.
- Mutation campaign (28/28) is the standing MUT-02 set; no mutant targets `note.update` or the focus exclusion.

## Remaining
- Rebase onto current `main`, then push to origin and rad-agent.
- Forget the workspace.
