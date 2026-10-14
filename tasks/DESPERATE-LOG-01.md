---
id: DESPERATE-LOG-01
title: Show the Desperate action XP marked this Score (XP Tracker) — DECISION POINT
track: frontend (contract change needed)
status: blocked-on-decision
deps:
  - XP-TRACKER-04
outputs: []
---

# DESPERATE-LOG-01 — Desperate action XP marked this Score

## Goal

The XP Tracker should list which Desperate action XP marks were already added this Score, for
example "+1 Insight XP", and the list should survive a reload.

## What is stored today (investigated, not changed)

- A Desperate action is `onAttributeXpDelta(attribute, 1)`
  (`frontend/src/pages/character-detail.ts`, `gmHandlers.onDesperate`). It writes an ordinary
  attribute XP change. Nothing records that the mark came from a Desperate action.
- **History / undo** (`GET /characters/{id}/history`, `historyEntry` in
  `contract/schemas/campaign.json`): each entry is `{snapshotId, takenAt, op}`, where `op` is the
  operation name only. It has no arguments. A Desperate mark and any other attribute XP change are
  the same `op`. Entries are capped (50 per the contract's history note) and removed by undo. Reading
  a snapshot (`GET /history/{snapshotId}`) returns the whole character, so a per-Score tally would
  mean diffing whole snapshots. That breaks as soon as history is capped or undone. **Not usable.**
- **`modeFlow`** (`score-start` / `resolution` plus a step): the cursor only. `mode.set` to Score
  sets `modeFlow={kind:score-start,step:planning}`. It has no bookkeeping fields. **Not usable as
  a store.**
- **Session counters** (`session.set`): the three expression tracks only. **Not usable.**
- **Operation results** (`OpResult`): returned to the caller and not persisted. **Not usable.**

Conclusion: nothing persisted can answer "Desperate XP marked since the Score started". A new
persisted field is needed, so this is a contract change, and per the brief I stopped before
building it.

## Options (decision requested)

**A. Frontend-session-only list (no contract change).** Keep the marks in the character page's
state, reset on Score start. Trade-offs: no backend or contract work, and it can ship in a card of
its own. The list is **lost on reload, on navigation away, and on another device**. A GM could read
it as the Score's record and be wrong. If chosen, the UI must say it is session-only.

**B. Derive from history.** Rejected for the reasons above (no arguments in history, capped,
undo-erased, and ordinary attribute XP looks identical).

**C. Dedicated op and persisted tally (recommended).**
- New op `desperate.mark` (`attribute` in the settings' attribute list). It adds +1 attribute XP,
  as today, and increments `session.desperateMarks[attribute]` in one snapshot and one history
  entry.
- New schema field `session.desperateMarks` (map attribute → integer ≥ 0), cleared by `mode.set`
  to Score, and not by `xp.resolve`, because the human wants "since the Score started".
- The ordinary attribute XP op stays unchanged.
- Work: OpenAPI path and schema; capability disposition in
  `skill/generate-capability-manifest.mjs`; regenerated manifest, API reference and coverage;
  parity list (`REQUIRED_HUMAN_OPS`, needs authorisation as before); Ada implementation in
  `pitd_ops.adb` / `pitd_callback.adb` with a semantics test; frontend client, UI and tests;
  mutation pins for the Ada file. Roughly the size of XP-TRACKER-02 plus 03.
- Trade-off: an extra op and an extra persisted field. Reload-safe, auditable, and it cannot
  disagree with the attribute XP it mirrors, because both change in one op.

**D. Optional field on the existing attribute XP op.** Add `source: "desperate"` to the existing
attribute XP op and store the same tally as in C.
- Trade-off: no new op, but the generic XP op gains a Desperate-specific meaning and the request
  schema gets an optional field. Any caller can then mark a Desperate XP without the desperate
  action, so the tally is only as trustworthy as the caller.

## Recommendation

Option C, and it needs your go-ahead for the contract change and the parity amendment. If you want
the feature without a contract change now, option A is buildable, but only with the session-only
label and an explicit note in this card that the list is lost on reload.

## Not done

No code, contract, test or pin was changed for this card. The desperate action still writes
attribute XP exactly as before.
