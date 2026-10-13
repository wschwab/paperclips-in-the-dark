---
id: XP-TRACKER-03
title: Ada backend for the atomic Scoundrel XP completion op (xp.resolve)
deps:
  - XP-TRACKER-02
track: ada
outputs:
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/pitd_callback.adb
  - conformance/suites/semantics/xp-resolve.test.ts
  - conformance/suites/parity/capability-parity.test.ts
  - conformance/fixtures/mutation-catalog.json
  - docs/pages/backlog/unknown-operation-status.mdx
---

# XP-TRACKER-03 — Ada backend for `xp.resolve`

## Implementation

- `pitd_ops.adb`, body validation: `total` (integer ≥ 0) and `allocations` object with exactly `Playbook`, `Insight`, `Prowess`, `Resolve`, each an integer ≥ 0. Checked with the existing `Check_Fields`.
- `pitd_ops.adb`, apply branch (shared downtime block, so the character-only and retired gates apply): every allocation is checked against its track's room (stored maximum minus current points), and the sum is checked against `total`, **before any write**. Failures return `VALIDATION` with `/allocations/<Name>` or `/total` pointers. On success it credits each track, then sets the three session counters to 0. One write, one snapshot.
- `pitd_ops.adb`, `Snapshots`: `xp.resolve` writes one snapshot (`x-snapshot: true`).
- `pitd_callback.adb`: for `xp.resolve` only, an apply-phase `VALIDATION` is answered **HTTP 400** with its issue pointers. Other apply-phase domain errors keep their existing 200 delivery; changing them globally would alter frozen behaviour.

## Conformance evidence

- `XP-RESOLVE-001..007` (`conformance/suites/semantics/xp-resolve.test.ts`): all **green** on the managed server (`tasks/metrics/ada/XP-TRACKER-03-xp-resolve-green.log`, 7/7).
- Full managed suite, two cycles: 593 of 594 pass in each cycle. The one failure before this card's frontend work was `PARITY-HUMAN-003`. See below.

## Frozen amendment (human-approved): `PARITY-HUMAN-003`

`conformance/suites/parity/capability-parity.test.ts`, `REQUIRED_HUMAN_OPS` at line 68.

- **Before:** the list ended `... "characterDowntimeSpend", "characterDowntimeAdjust",` (27 entries).
- **After:** the same list plus `"characterXpResolve"` with a comment (28 entries). The precedent is GAME-MODE-02, which added four human op IDs to the same list.

After this amendment the set check passes. The **reachability** half of `PARITY-HUMAN-003` still needs an exported client function that performs `/ops/xp.resolve`, referenced from a mounted page that wires an interactive control. That is XP-TRACKER-04. So this card's full-suite gate can go green only together with XP-TRACKER-04, and the two are pushed together.

## Gates

| Gate | Result | Evidence |
|---|---|---|
| `alr build` (server) | success | build log: `pitd_ops.adb` recompiled |
| `XP-RESOLVE-001..007` | 7/7 green | `tasks/metrics/ada/XP-TRACKER-03-xp-resolve-green.log` |
| full managed suite, 2 cycles | 593/594 at the B commit (the open item was the reachability half of PARITY-HUMAN-003); **594/594 in both cycles after XP-TRACKER-04** (`tasks/metrics/ada/XP-TRACKER-04-full-suite-two-cycles.log`) | `tasks/metrics/ada/XP-TRACKER-03-full-suite-two-cycles.log` |
| gnatprove, core project (`--level=2 --checks-as-errors=on`) | all 246 checks proved | `tasks/metrics/ada/XP-TRACKER-03-gnatprove.log` (core sources unchanged) |
| `npm run test:tooling` | 233/233 | `tasks/metrics/ada/XP-TRACKER-03-tooling.log` |
| validators (metrics, traceability, reconciliation) | pass | run output |
| mutation pins | refreshed: `pitd_callback.adb` (6 entries) to `b569a79e…2a89`, `pitd_ops.adb` (4 entries) to `4facde3b…e1a3` | `sha256sum` |
| mutation campaign 28/28 | run after the XP-TRACKER-04 commit; result in `tasks/metrics/frontend/XP-TRACKER-04.json` | — |

## Backlog

`docs/pages/backlog/unknown-operation-status.mdx`: unknown operation names answer HTTP 200 with a `VALIDATION` body. Logged at the human's request, not fixed.
