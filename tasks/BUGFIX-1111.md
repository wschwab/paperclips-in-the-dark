---
id: BUGFIX-1111
title: Conformance test-run isolation and history failure atomicity
deps: []
track: contract
outputs:
  - conformance/scripts/target-guard.mjs
  - conformance/scripts/target-guard.d.mts
  - conformance/bin/conformance.mjs
  - conformance/src/api.ts
  - conformance/src/report.ts
  - conformance/vitest.config.ts
  - conformance/src/target-guard.test.ts
  - conformance/src/skill-counts.test.ts
  - conformance/suites/persistence/history-failure-atomicity.test.ts
  - backend-ada/server/src/pitd_common.ads
  - backend-ada/server/src/pitd_common.adb
  - backend-ada/server/src/pitd_callback.adb
  - backend-ada/server/src/generated/pitd_schema_validators.ads
  - backend-ada/server/src/generated/pitd_schema_validators.adb
  - contract/schemas/campaign.json
  - skill/SKILL.md
  - docs/pages/conformance/bugfix-1111.mdx
  - docs/pages/conformance/report-json.mdx
acceptance:
  - Conformance tooling suite green (target guard, skill counts, generators)
  - npm run typecheck (conformance) and frontend build green
  - Managed Ada conformance run green over two cycles
  - Browser suite green on an isolated managed server
  - Ada ci.sh green (core build/tests, launch paths, SPA routes, gnatprove)
  - Mutation campaign 28/28 on isolated ports
  - Evidence-path validator and vocs documentation build green
---

# BUGFIX-1111

Items 1, 5, 6 and 7 of the 2026-11-11 playtest bug report
(`~/Documents/otto/fable-bitd/reports/paperclips-bugs-2026-11-11.md`). Items
2–4 (crew game data, crew creation defaults, scoundrel starting coin) belong to
another card and are untouched here.

**Status:** see `tasks/metrics/contract/BUGFIX-1111.json`
**Docs:** `docs/pages/conformance/bugfix-1111.mdx`

## Incident response (before any code change)

A conformance run without an explicit target fell back to
`http://localhost:9657` and wrote fixture entities into the live campaign's data
directory between 15:49:28 and 15:51:52 UTC on 2026-11-11.

1. Inventory: the three real entities are characters
   `518f7136-f851-4bf5-828f-1a0134c475a8` (Aigan Murktooth, alias "Bowler") and
   `c3278141-099a-4bb2-85f8-3b26561f7e41` (Munia Lamplight, alias "The Maid"),
   both in crew `76f77122-9492-4d5f-8118-99e689449ac7` ("Barnacles"). Everything
   else was created inside the pollution window (17:49:26–17:51:52 local,
   +0200) or carries a fixture id/name (`10000000-…`, `Webweaver`,
   `Brenda Hilton`, `createdAt 2026-07-19T12:00:00Z`).
2. Full backup: `~/Documents/otto/fable-bitd/sheets-archive/pre-cleanup-20261111T161231Z/sheets`.
3. The live `pitd` (PID 3379974) was stopped with SIGTERM (exact PID); 454
   characters, 187 crews, 192 clocks, 22 flow-groups and 19 flow-receipts were
   MOVED to `~/Documents/otto/fable-bitd/sheets-archive/conformance-pollution-20261111T161231Z/`;
   the server was relaunched detached with the same command (PID 10292,
   appending to `~/Documents/otto/fable-bitd/log/pitd-9657.log`).
4. Verification: `GET /api/characters` returns exactly 2 rows, `GET /api/crews`
   1 row, all three entities load `200`. The three entity trees and
   `campaign.json` were byte-identical to the pre-cleanup backup; the only
   later change is the user's own `note.add` on Munia at 18:15:18 local.

## Implementation

**Item 1 — no default target, and test hooks required.**
`conformance/scripts/target-guard.mjs` is the single rule shared by the CLI
runner, the Vitest config and the API client: a target must be named
(`--against`, `CONFORMANCE_BASE_URL`, `BASE_URL`), and the target's
`GET /api/health` must report `testHooks: true` before any request is sent.
The runner exits `2` before spawning Vitest when either check fails; `PitdApi`
verifies once per process before its first request. `normalizeVitestJson` now
requires the target as an argument. The contract change (additive optional
`testHooks` on `#/$defs/health`) is authorized by the card and recorded
before/after in the docs page; the generated Ada validators were regenerated.

**Items 5 and 6 — history maintenance cannot half-apply.**
Retention (`Prune_History`) and snapshot consumption share one deletion path
that reports failures; retention logs and continues, and when it could not
remove anything `Snapshot` rebuilds the sidecar index from the files on disk so
`historyCount` and `GET .../history` keep describing disk. Write paths discard
the snapshot they just took when the entity write raises (operation, batch,
import, repair). The single-entity undo consumes its snapshot best-effort and
rebuilds the index best-effort, so a refused unlink completes the undo with
truthful history instead of returning `500`; grouped (flow) undo consumption is
best-effort for the same reason, which also removes the fail-closed commit path
as an unlink-failure exit. `POST /api/test-hooks/fail-unlink` (armed only with
`--test-hooks`) is the test seam.

**Item 7 — skill counts and launch flags.**
`skill/SKILL.md` now states 90 agent / 31 human of 121 operations, derived by
`conformance/src/skill-counts.test.ts` from
`skill/api-reference/capability-manifest.json` and the generated reference; the
launch section documents `--games` and `--test-hooks`.

## Red evidence

| Test | Red (probe present, fixes absent) | Green |
| --- | --- | --- |
| `BUGFIX-1111-TARGET-003` | `src/api.ts` etc. still contained the `localhost:9657` fallback | pass |
| `BUGFIX-1111-TARGET-004/005` | runner spawned Vitest against the guessed/untested target | exit `2`, no report |
| `BUGFIX-1111-UNDO-001` | `expected 500 to be 200` | pass |
| `BUGFIX-1111-PRUNE-001` | `expected false to be true` (write blocked) | pass |
| `BUGFIX-1111-WRITE-001` | `expected [ Array(1) ] to deeply equal []` (orphan snapshot) | pass |
| `TOOLING-SKILL-001` | `expected { count: 86, total: 110 } to deeply equal { count: 90, total: 121 }` | pass |

The items 5/6 red run used a scratch build at `/tmp/bugfix-1111-red` carrying
only the `fail-unlink` probe (pre-fix behavior), driven by
`node scripts/managed-run.mjs --server <red>/backend-ada/server/bin/pitd -- --run suites/persistence/history-failure-atomicity.test.ts`.

## Gates

| Gate | Result |
| --- | --- |
| `npm run test:tooling` (conformance) | PASS — 240/240 in 20 files |
| `npm run typecheck` (conformance) | PASS |
| `npm run build` (frontend) | PASS (`tsc --noEmit && vite build`) |
| `alr build` (Ada server) | PASS |
| `npm run test:ada -- --cycles 2 -- --run` | PASS — cycles 1/2 and 2/2, 687 passed / 1 skipped each |
| `npm run test:browser` | PASS — 6/6 journeys, launcher cleanup asserted |
| `backend-ada/ci.sh` | PASS — core build + tests, launch paths, SPA routes, gnatprove (246 checks) |
| `npm run test:mutation` | PASS — 28/28 killed (P0 19/19, P1 9/9), post-campaign source verification PASS |
| `npm run validate:evidence` | PASS |
| `npm run build` (docs, vocs) | PASS — 171 files generated |

Mutation catalog maintenance: the `pitd_callback.adb` restoration hash was
refreshed for M05/M07/M08/M09/M14/M15 (the file changed), and the M08 and M09
anchors were retargeted to the new seams — M08 now skips the rollback-bound
snapshot call, M09 skips the shared best-effort consumption in the undo
handler. Both are still killed by their intended tests.

## Live-data follow-up (2026-11-11, after the cleanup)

A recheck of `~/Documents/otto/fable-bitd/sheets` found no conformance fixture
entity created after the cleanup: 2 characters, 1 crew, 0 clocks, 0 flow
groups/receipts. Two new characters did appear at 16:42:31Z (50 ms apart,
`63330166-…` "Knock" and `f614914c-…` "Plumb"), both attached to the real crew
`76f77122-…` and carrying real playbook data, server-generated ids and no
fixture id or name, so they were NOT moved and the server was not restarted.
Their provenance is unconfirmed (user play versus a peer driving the live API).

