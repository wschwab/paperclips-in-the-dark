---
id: DESPERATE-LOG-01
title: Show the Desperate action XP marked this Score (XP Tracker)
track: contract + backend + frontend
status: implemented; mutation campaign and Sol 6.1 review recorded below
deps:
  - XP-TRACKER-04
outputs:
  - contract/openapi.yaml
  - contract/schemas/character.json
  - conformance/suites/semantics/desperate-mark.test.ts
  - conformance/src/schemas.ts
  - conformance/src/endpoint-schema-map.test.ts
  - conformance/suites/parity/capability-parity.test.ts
  - conformance/generated/contract-coverage.json
  - skill/generate-capability-manifest.mjs
  - skill/api-reference/README.md
  - skill/api-reference/capability-manifest.json
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/pitd_normalize.adb
  - backend-ada/server/src/pitd_callback.adb
  - backend-ada/server/src/generated/pitd_schema_validators.adb
  - frontend/src/api/client.ts
  - frontend/src/schema/character.ts
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/character-sections/xp-tracker.ts
  - frontend/src/pages/game-mode-sheet.test.ts
  - docs/pages/contract/xp-tracker-proposal.mdx
  - tasks/metrics/contract/DESPERATE-LOG-01-red.log
---

# DESPERATE-LOG-01 — Desperate action XP marked this Score

## Goal

The XP Tracker lists which Desperate action XP marks were added this Score ("+1 Insight XP"), and
the list survives a reload.

## Decision (human, option C)

The earlier investigation found nothing persisted that could answer "Desperate XP marked since the
Score started": history carries only op names, `modeFlow` is only a cursor, and the session counters
hold only the expression tracks. The human approved option C in `tasks/DESPERATE-LOG-01.md`'s
earlier version, including the contract change and the additive parity amendment. Options A
(session-only) and D (a source field on the attribute op) were not chosen.

## What was built

- **Contract.** `desperate.mark` (`characterDesperateMark`, `CharacterDesperateMark` body with
  `attribute`). `session.desperateMarks` is an array of attribute names, one per +1 mark. The
  array form is the representable one: Ada's generated validators support arrays of strings, not
  maps. `mode.set` documents the clearing rule.
- **Red first.** `conformance/suites/semantics/desperate-mark.test.ts` (7 cases) failed 7 of 7 on the
  pre-change backend (`tasks/metrics/contract/DESPERATE-LOG-01-red.log`).
- **Backend (Ada).** Body check (`attribute`, non-empty), a `desperate.mark` apply branch (one write:
  +1 on the named track and one tally entry; an unknown attribute or a track at its maximum is
  VALIDATION 400 at `/attribute` with no write), `mode.set` into Score clears the tally, the new-character
  template starts with `[]`, the normaliser fills a missing array with `[]` and reports bad entries,
  and the callback maps apply-phase VALIDATION to HTTP 400 for this op as it does for `xp.resolve`.
- **Parity and manifest.** `characterDesperateMark` in `REQUIRED_HUMAN_OPS` (additive, human-approved);
  human sheet-management disposition; route count 114 → 115.
- **Regenerated artefacts.** Ada validators, API reference, capability manifest, contract coverage.
- **Fixtures.** `desperateMarks: []` added to the golden character and 12 readable seed documents.
  Deliberately malformed seed documents (TOTAL-collection tests) and session-less seeds were left
  as they are.
- **Frontend.** The XP Tracker's Desperate control calls `characterDesperateMark` (the old attribute
  XP call is removed from this path). The tracker lists this Score's marks per attribute
  (`+2 Insight XP`), or says none are marked yet.

## Honest ordering note

The backend and contract were written red first. The frontend UI was written before its tests, as
happened with XP-TRACKER-04. The UI tests (three in a new describe, `DESPERATE-LOG-01 XP Tracker tally
and desperate.mark control`) pass, and were not seen failing first.

## Gates (this tree)

| Gate | Result |
|---|---|
| Ada two-cycle (`npm run test:ada -- --cycles 2 -- --run`) | 614/614 in each cycle (includes the 7 new cases) |
| tooling (`npm run test:tooling`) | 233/233 (TOOLING-MANAGED-025 passes with the full suite green) |
| conformance typecheck | exit 0 |
| gnatprove (`paperclips_core.gpr --level=2`) | 246 checks proved |
| vitest (frontend) | 961/961, 34 files |
| tsc / build | exit 0 / exit 0 |
| browser journeys (`npm run test:browser`) | 6/6 PASS |
| Chromium 3×3 of the tracker (`agent-docs/.../desperate-log-01/check.mjs`) | 9/9: two `desperate.mark` 200s per case, body `{"attribute":…}`, If-Match present, 0 attribute-XP requests, list `+1 Insight XP`, `+1 Prowess XP`, track points +1 each, tally `[Insight, Prowess]`, 0 overflow, 0 page errors |
| validators (metrics, traceability, reconciliation) and vocs | see the commit record |
| mutation campaign 28/28 with refreshed pins | see the commit record |
| Sol 6.1 xhigh review | see the commit record |

## Limits

- The tally is per character and survives reload (it is stored). It is cleared only by entering
  Score from another mode. A GM who wants a fresh Score tally must leave Score and re-enter it.
- Desperate marks made during Score are still ordinary attribute XP; `xp.resolve` does not change
  the tally, by design (the human asked for "since the Score started").
