---
id: SC-O6
title: "Lifecycle oracle"
deps: [SC-C2, SC-C4, SC-R5]
track: contract
outputs:
  - conformance/suites/lifecycle/lifecycle-state-machine.test.ts (NEW)
acceptance:
  - The 25 frozen LIFECYCLE-* cases from the SC-R5 matrix all present; additional cases allowed but none removed
  - Red against current source for the documented reasons; existing unrelated conformance green (superseded cases noted, not deleted)
---

# SC-O6 — Lifecycle oracle

## Target

Create exactly: `conformance/suites/lifecycle/lifecycle-state-machine.test.ts`. Do NOT edit other suites (superseded cases in existing files are replaced only in Wave 7 after the behavior lands — leave them), contract, or fixtures. Read-only elsewhere.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section "Character lifecycle"; SC-O6 list.
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` — the frozen transition table (§3), gates (§2.3), end-score rules (§4), deadish design (§5), allow/deny lists (§6), cleanup effects (§7), sequence (§8), and the 25 frozen case names (§10).
- Frozen Wave 2 contract: retire op, end-score optional body, trauma.add resolution semantics, typed attention token `"stress full — trauma pending"`, OUT_OF_ACTION code.

## Changes (freeze exactly the 25 named cases red; mark any that pass as guards with a note)

The 25 cases (from the matrix §10 — names are frozen; copy the table):
LIFECYCLE-STRESS-001 (stress max sets traumaPending + typed attention), STRESS-002 (never auto-trauma), STRESS-003 (stress.add while pending → TRAUMA_REQUIRED), STRESS-004 (stress ops while out of action → OUT_OF_ACTION), TRAUMA-001 (resolution keeps stress full, clears pending, sets out-of-action + stressClearPending), TRAUMA-002 (trauma.add without pending → VALIDATION), TRAUMA-003 (duplicate → DUPLICATE), ENDSCORE-001 (end-score while pending → TRAUMA_REQUIRED), ENDSCORE-002 (clears stress + both flags), ENDSCORE-003 (one snapshot; undo restores), RETIRE-001 (confirm:true required → CONFIRM_REQUIRED), RETIRE-002 (explicit retirement below max trauma succeeds), RETIRE-003 (cleanup field effects), RETIRE-004 (voluntary and final-trauma retirement identical post-cleanup), RETIRE-005 (retired readable + deletable), RETIRE-006 (dossier/name/notes/notebook edits allowed when retired), RETIRE-007 (gameplay mutations → RETIRED), RETIRE-008 (trauma.remove never clears isRetired), RETIRE-009 (undo restores pre-retirement state), DEADISH-001 (fatal harm triggers deadish cleanup: clears stress + pending, preserves harm), DEADISH-002 (deadish only from fatal harm; isDeadish write-derived), DEADISH-003 (removing fatal harm ends deadish), DELETE-001 (delete requires confirmation; removes entity + history), DERIVED-001 (canUndo/historyCount derived, never persisted), INVARIANTS-001 (no traumaPending∧isOutOfAction; stressClearPending ⟺ isOutOfAction).

Current-behavior notes (from the matrix §11 — the red reasons): retired gate denies too much (notebook.set → RETIRED today), trauma.remove un-retires, trauma.add is a free toggle, no retire endpoint, end-score flags-only + requires ≥1 flag, no pending/out-of-action flags anywhere.

## Green (this card's own gate)

- All 25 names present exactly; each fails or passes-for-the-documented-reason (report per case).
- `(cd conformance && npm run test:ada -- --run suites/lifecycle/lifecycle-state-machine.test.ts)` shows the red set.
- Existing lifecycle suites untouched.

Report exact commands and outputs.

## Metrics

`tasks/metrics/contract/SC-O6.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
