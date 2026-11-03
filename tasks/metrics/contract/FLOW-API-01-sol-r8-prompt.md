# Independent review: FLOW-API-01 round 8 (pinned to ba9d3c0a)

Repo: /home/x/code/paperclips-in-the-dark. Review HEAD ba9d3c0a (code head 5d22adb2; ba9d3c0a only changes tasks/FLOW-API-01.md and a mutation log). Do not edit files. Output a verdict.

Scope: fixes for round-7 findings on the Payoff overflow path (round-7 verdict at tasks/metrics/contract/FLOW-API-01-sol-r7-verdict.txt).

Claims to verify:
1. Overflow notice placement: the Payoff overflow notice is rendered inside the active Resolution popup (frontend/src/pages/character-sections/gameMode.ts, GameModeUi.flowNotice, role=status), not under the Coin section. Check that the popup is the one visible at 1440x1000 and 390x844.
2. Timer: frontend/src/pages/character-detail.ts uses one payoffNoticeTimer handle; a new notice cancels the prior timer; clearNotices cancels it and clears payoffNotice. Confirm no path leaves a stale timer that clears a newer notice early, and the callback guards on cancelled as before.
3. Replay: backend-ada/server/src/pitd_transactions.adb Stage_Receipt now stores Side_Effects on the transaction wrapper item (not on the flow receipt); pitd_flow.adb replay restores sideEffects from the stored wrapper (Has_Field) and defaults to an empty array for legacy wrappers. Verify the flow receipt schema is unchanged (conformance/src/schemas.ts) and that the undo caller of Stage_Receipt (pitd_transactions.adb grouped undo) still compiles with the defaulted parameter and writes no spurious sideEffects into flow receipts.
4. Tests: conformance FLOW-API-028 and game-mode-sheet.test.ts popup-placement and Leave-flow timer tests actually exercise these paths (not vacuous).
5. Mutation pin for character-detail.ts in conformance/fixtures/mutation-catalog.json matches the current file.

Look for: stale or leaked timers, notice shown on a non-Payoff step, a replayed non-overflow completion gaining sideEffects, Ada type/default mismatches, and any transaction-recovery path that reads wrapper items and could break on the new field.

Verdict format: first line `VERDICT: PASS` or `VERDICT: FAIL`, then findings with file:line, each marked P0/P1/P2.
