---
id: SCORE-XP-REMOVAL-01
title: Remove the regular sheet's Score XP section and End downtime button (BLOCKED)
deps:
  - GAME-MODE-03
track: frontend
status: blocked
---

# SCORE-XP-REMOVAL-01 — status: blocked, not implemented

Nothing was removed. The removal is blocked on two items that need a human decision, and one of them touches a frozen journey.

## What the Score XP section is

`frontend/src/pages/character-sections/talents.ts` lines 136–197 render, under the Talents card:

1. The heading **Score XP** and the note "Desperate action XP is marked on the attribute XP tracks above." (text only).
2. The playbook's ExperienceCondition line. Game mode already shows it (GAME-MODE-03 R2-02).
3. **Three session expression tracks** (Playbook expressions, Scoundrel expressions, Struggle expressions). Each has a track, a −1 and a +1. They call `handlers.onSessionTrack` and `onSessionDelta`, which post `session.set` (`character-detail.ts` ~1706–1730; `api/client.ts` `sessionFieldsUpdate` ~1696).
4. The **End downtime** button and its text (lines 186–197). It calls `handlers.onEndDowntime` (`character-detail.ts` ~1412–1423), which posts `end-downtime` with `clearSessionExpressions: true`.

## Capability coverage in game mode (the gap)

| Regular-sheet capability | Game-mode equivalent | Status |
|---|---|---|
| ExperienceCondition text | Resolution → Scoundrel XP (R2-02) | covered |
| Increment playbook XP (+1) | Resolution → Scoundrel XP "+1 Playbook XP" (`gameMode.ts` ~609) | covered |
| Increment attribute XP (+1, desperate action) | Resolution → Scoundrel XP track marks; Score panel "+ Desperate action XP" | covered |
| Decrement or clear playbook / attribute XP | none in game mode | **gap** (the Playbook XP box and attribute trackers keep it; they are not Score XP) |
| **Increment or decrement the three session expression tracks** | **none** | **gap** |
| **Clear session expression tracks at end of downtime** | **none**: `end-score` does not clear them (`pitd_ops.adb` end-score apply, ~1737–1795); `end-downtime` is only reachable from the regular sheet | **gap** |
| End downtime (stress relief amount is GM-side) | Downtime mode activities; no `end-downtime` call | **gap** for the session clear; the stress part is not sent by the UI |

Removing the block as asked would remove the only UI for session expression tracks and for clearing them.

## Frozen dependency (stop, per instruction)

`conformance/suites-browser/lifecycle.journey.mjs` depends on the End downtime button:

- line 32: checkpoint `end-downtime-ok` ("End downtime committed (ops/end.downtime 200)")
- lines 192–197: `waitForResponse` on `/end-downtime` returning 200, then `page.locator('button[title^="End downtime"]').click()`

This is one of the six browser gates. Removing the button needs an explicit change to that journey, which is frozen.

## Tests that cover the block (not frozen; would go with the removal)

- `frontend/src/pages/character-detail.test.ts`: 2379–2504 (F2o Talents + Score XP), 232, 3118–3149 (session.set on tracks), 3344 (CHAR-06 heavy-box Score XP, which is the Playbook XP box).
- `frontend/src/api/client.test.ts`: 4259–4322 (`session.set`).

## Backend contract (stays)

`end-downtime`, `session.set` and the session fields are contract. Frozen conformance covers them: `conformance/suites/contract/endpoints.test.ts:106,163`; `request-validation.test.ts:59-64`; `numeric-families.test.ts:146-152`; `conformance/suites/semantics/session-set.test.ts`; `composites.test.ts:10`. Removing the frontend does not change these.

## Decisions needed from the human

1. **Session expression tracks.** Move them into game mode (for example Resolution → Scoundrel XP, or Downtime), or drop them deliberately? The tracks are a capability, so dropping them needs an explicit decision.
2. **Clear at end of downtime.** Where should "clear session expressions" happen in game mode (the Downtime flow, or the Downtime → Score transition)? `end-score` does not clear them today.
3. **Frozen journey.** Authorize a change to `conformance/suites-browser/lifecycle.journey.mjs` steps 6 (lines 192–197) and the checkpoint at line 32, so the journey no longer clicks the removed button, or keep the End downtime button until game mode covers the clear.

Until these are answered, the regular sheet keeps the Score XP section.
