---
id: SC-F4
title: "Lifecycle UI"
deps: [SC-F1, SC-A8, SC-C6, SC-O6]
track: frontend
outputs:
  - frontend/src/pages/character-detail.ts (pending-trauma prompt, out-of-action explanation, end-score, retire, undo/history)
  - frontend/src/api/client.ts (retireCharacter, endScore, deleteCharacter exports)
  - frontend tests
acceptance:
  - Full-stress trauma prompt; pending-trauma blocking state; out-of-action explanation; end-score affordance + confirmation; explicit retirement confirmation independent of trauma; deadish/retired distinction; allowed retired dossier editing; undo/history from canUndo/historyCount
  - FV-028 closed (positive undo feedback + NO_HISTORY distinct)
---

# SC-F4 — Lifecycle UI

## Target

Edit: `frontend/src/pages/character-detail.ts`, `frontend/src/api/client.ts`, related components (trauma picker, retire/undo controls, notices), and their tests. Do NOT edit `contract/`, `conformance/`, or schema-generated files.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` SC-F4; "Character lifecycle" (client obligation: explain out-of-action for the remainder of the score); W13-W16.
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` — §8 sequence (the UI must mirror), §6 allow/deny lists, §9 canUndo/historyCount, and §11 frontend conflicts (items 19-22: trauma-from-stress chains stress.clear — remove; trauma picker copy; Indulge Vice gating; missing exports).
- The fix-wave plan P28 (undo feedback) card.
- Frozen contract: retire/end-score/trauma/stress ops and the union codes (TRAUMA_REQUIRED/RETIRED/OUT_OF_ACTION/CONFIRM_REQUIRED/NO_HISTORY).

## Changes

1. **Pending-trauma prompt**: when stress lands at max (typed attention), show the trauma choice prompt; resolving records trauma, keeps stress FULL, and explains out-of-action for the remainder of the score (remove the stress.clear chain at character-detail.ts:2432-2460 and the "take a trauma to clear it" copy at :678-709 — Q42 violation).
2. **Blocking states**: pending trauma blocks gameplay/end-score with TRAUMA_REQUIRED copy; out-of-action blocks stress ops with OUT_OF_ACTION copy; Indulge Vice gated by both.
3. **End-score**: affordance + confirmation; explains inherent stress clear + flag resets; one-snapshot note.
4. **Explicit retirement**: confirmation dialog independent of trauma; explains cleanup effects (heals harm, clears stress) and the undo recovery path; deadish vs retired distinction in UI (deadish preserves harm).
5. **Retired editing**: dossier/name/notes/notebook controls remain enabled when retired; gameplay controls disabled with RETIRED copy.
6. **Undo/history**: controls + state from canUndo/historyCount (derived fields on summaries/operation results); success notice names the restored state; NO_HISTORY stays distinct — FV-028.
7. Exports: retireCharacter, endScore, deleteCharacter in client.ts (reachable controls — client parity).
8. Tests: extend the detail page tests per P28 and the new flows.

## Red

P28 red assertions + new-flow tests fail before your change.

## Green

- `(cd frontend && npm test -- --run src/pages/character-detail.test.ts src/pages/crew-detail.test.ts src/api/client.test.ts)` green.
- `(cd frontend && npm run build)` green.
- No contract/conformance edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/frontend/SC-F4.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/frontend/SC-F4.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
