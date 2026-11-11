---
id: SCOUNDREL-CREATE-02
title: Pick a playbook, finish starting Talents on the sheet, and show attribute ratings
deps: [TALENT-HELP-01]
track: frontend
outputs:
  - contract/schemas/character.json
  - contract/openapi.yaml
  - backend-ada/server/src/
  - frontend/src/pages/character-create.ts
  - frontend/src/pages/character-sections/talents.ts
  - docs/pages/contract/scoundrel-create-02.mdx
acceptance:
  - Frontend vitest, TypeScript and production build pass
  - Ada build, conformance and two-cycle gates pass
  - Browser journeys pass after authorized sheet-first updates
  - Isolated mutation campaign kills 28 of 28 mutants with refreshed pins
  - Chromium three viewports by three themes passes with screenshots
  - Independent openai-codex/gpt-6.1-sol xhigh review returns PASS
  - Metrics, traceability, audit reconciliation and docs build pass
---

# SCOUNDREL-CREATE-02

## User authorization and isolation

The user explicitly authorized an additive attribute-rating contract change and
updates to frozen conformance/browser tests for sheet-first creation. Work is in
`/tmp/scoundrel-create-02-ws`, created with `jj workspace add ... -r main` from
`e8e6af4f`. Other workers' original workspace and the default/9657 playtesting
server are not used. No edits to `campaign-data/` or the reference tree; no push
of `setting-content-local`. All servers must be managed, temporary-data servers
on independently selected unused ports, with exact-owned-PID cleanup.

## Verified rule

Reference `Models/Characters/TalentAttribute.cs:27-28` computes
`ActionsByName.Values.Count(a => a.Rating > 0)`. The official SRD
https://bladesinthedark.com/actions-attributes states that attribute rating is the
number of first-column dots. Therefore an action contributes either zero or one
to its attribute regardless of whether its own rating is one or more. No maxima
are copied into the implementation or schema.

## Authorized before / after

- Before: validated PC creation required final `actionRatings`, assigned on an
  intermediate screen. After: omission creates a durable pending PC with only
  playbook defaults; existing complete-map API creation remains valid.
- Before: no durable starting-allocation state. After: `talent.allocationPending`
  controls settings-derived default locks, per-action cap and total budget on
  the sheet; `talent.allocation.complete` validates exact allocation and ends
  draft restrictions explicitly. Legacy/experienced/NPC records are not guessed
  to be new PCs from their ratings.
- Before: attributes had name, experience and actions only. After: read-only
  `rating` counts positive action ratings, recomputed through canonical writes;
  pure GET/export byte identity is retained.
- Before: creation browser journeys filled the intermediate dots. After: they
  create from playbook alone, assign/finish on the sheet and verify persistence.
- Attribute headings gain prominence and show rating; TALENT-HELP-01 summaries
  remain visible next to sheet actions. Obsolete intermediate-dot rendering and
  evidence probe are removed; prior screenshots remain historical evidence.

Design and source attribution: `docs/pages/contract/scoundrel-create-02.mdx`.

## Red-first evidence

Backend, against the previous server binary through the managed launcher
(`node conformance/scripts/managed-run.mjs --server <original pitd> -- run suites/contract/sheet-allocation.test.ts`):
**2 failed** — `expected undefined to be 1` (no derived `attribute.rating`) and
`expected 400 to be 200` (draft `POST /characters/pc` without `actionRatings`
rejected). After implementation the same suite is 4/4 green and the existing
`pc-creation.test.ts` complete-map path is 13/13.

Frontend: 3 focused failures on the incumbent UI — creation still rendered the
intermediate action dots, and the sheet had no unspent counter, no fixed-default
row and no completion control. After implementation those regressions pass.

## Acceptance gates

| Gate | Result |
| --- | --- |
| Frontend vitest | 1054/1054 tests, 45 files |
| Frontend TypeScript + production build | pass |
| Ada build (generated validator + sources) | pass; `pitd` rebuilt, no source newer than binary |
| Ada two-cycle managed conformance | 700 passed + 1 intentionally isolated recovery case skipped, per cycle |
| Conformance tooling | 240/240 |
| Conformance TypeScript | pass |
| Browser journeys (managed) | 6/6 |
| Chromium matrix probe | 27/27 surface/viewport/theme cases and 9 sheet-first journeys, including the no-reload post-completion cap assertion |
| Mutation campaign (isolated, pins refreshed) | 28/28 killed — P0 19/19, P1 9/9, green baseline, no survivors at the rebased revision `a23a1297` |
| Validators (metrics, traceability, reconciliation) | this change's records pass; 14 metrics errors are pre-existing on main in other workers' cards (`BUGFIX-1111.json`, `NOTES-EDIT-01.json`) and reproduce from `f48ee745` |
| Docs build | pass, 173 files generated |
| Impeccable detector on changed UI sources | no findings |
| Independent Sol 6.1 xhigh review | **PASS** (round 4 at `a23a1297`, after the rebase onto main); rounds 1 and 2 were FAIL, both fixed |

Chromium evidence: `docs/public/evidence/scoundrel-create-02/` — creation,
pending-allocation sheet and completed sheet at 1440×1000, 768×1024 and
390×844 in light, dark and high contrast, with `numeric.json` geometry
(document/container/hint widths, computed styles, heading vs action font size,
zero page errors). Every journey creates from the playbook alone, allocates on
the sheet, confirms the draft survives reload, finishes explicitly and verifies
that the attribute ratings equal the count of positive action ratings.

No gate is claimed from design alone; counts above come from the recorded runs.
All servers were managed launchers on independently selected free ports with
temporary data directories; the default/9657 playtesting server was never used.

## Independent review rounds

**Round 1 — FAIL** at `73cb8234` (record:
`tasks/metrics/frontend/SCOUNDREL-CREATE-02-sol-r1-verdict.txt`). The reviewer
independently exercised HTTP and real Chromium and confirmed the rule, the draft
semantics, legacy read identity, the frontend cutover, containment and the
heading hierarchy, then raised three P2 defects:

1. Finishing allocation left the sheet's creation-era action caps cached: Hunt
   kept two dots although the server already reported `effectiveMax` 3, and only
   a manual reload added the third. Fixed by refreshing the capability
   projection on successful completion (`character-detail.ts`), with a red-first
   vitest case and a new browser assertion that the rendered dot count equals the
   server `effectiveMax` immediately after finishing, with no reload.
2. A rejected pending-allocation write returned the mutated candidate in
   `error.entity` (Skirmish 3 / XP 0) while storage and GET still held Skirmish 2
   / XP 6. Fixed by cloning the incoming entity in `Mutate` and returning that
   current DTO from the late allocation gate (`pitd_ops.adb`).
3. Allocation validation failures were delivered as HTTP 200 although the body
   and the contract say 400. Fixed by extending the HTTP-400 delivery to
   `talent.allocation.complete`, `action.set-rating`, `attribute.levelup` and
   their batch members (`pitd_callback.adb`); unrelated operations keep their
   existing delivery.

Red-first evidence for the fixes: the strengthened conformance suite failed
2/4 tests (eight assertions: seven transport-status mismatches plus the mutated
`error.entity`), and the frontend regression failed with `expected …(2) to have
a length of 3 but got 2`. After the fixes: focused conformance 17/17, frontend
1048/1048, Ada two-cycle 688 + 1 skipped per cycle, browser 6/6, Chromium 27/27
with the new no-reload cap assertion, isolated mutation re-run with refreshed
pins (28/28, revision `01c872d5`).

**Round 2 — FAIL** at `01c872d5` (record:
`tasks/metrics/frontend/SCOUNDREL-CREATE-02-sol-r2-verdict.txt`). All three
round-1 runtime fixes passed independent verification; the remaining P2 was that
the newly delivered HTTP 400 allocation rejections were not declared on the
affected endpoints: `attributeLevelup` and `actionSetRating` listed only
200/404/409/500, and `batch` listed only 200/500 while its prose promised HTTP
200 for admitted batches with failed members. The repository's own
response validator therefore rejected real responses with
`no response schema for endpoint … status 400`. Fixed by declaring `400 →
OpResult` on those three operations, stating the allocation-validation exception
in the batch description while preserving the aggregate HTTP 200 convention for
unrelated member failures, and extending the regression suite to validate actual
responses through the existing endpoint/status validator (red first: 3 failed,
2 passed with eight missing-schema assertions). Contract-derived artifacts were
regenerated; the capability manifest stayed byte-identical. After the fix:
focused conformance 18/18, Ada two-cycle 689 + 1 skipped per cycle, tooling
233/233, browser 6/6, Chromium 27/27, pins unchanged (contract-only edit).

**Round 3 — PASS** at `30d7d2a9` (superseded in the verdict file by round 4): no
remaining findings. The reviewer validated 22 real responses against the declared
endpoint/status schemas on its own managed server, reproduced the nine pre-fix
validator failures against the pre-fix contract (read via `jj file show`), proved
that only those three operations' response tables changed, byte-compared all
three regenerated artifacts, and confirmed in a native Chromium tab that
completion raises the action controls to the server cap with no reload
(`performance.timeOrigin` unchanged).

**Rebase and round 4 — PASS** at `a23a1297`. `main` advanced while this change
was under review (BUGFIX-1111 "isolate conformance runs from live servers; make
history maintenance atomic", NOTES-EDIT-01 and follow-ups), so the stack was
rebased onto `f48ee745` as the user requires before pushing. Six files conflicted:
`backend-ada/server/src/pitd_common.adb`, `conformance/fixtures/mutation-catalog.json`,
`conformance/src/endpoint-schema-map.test.ts`, `frontend/src/api/client.test.ts`
and the two generated `skill/api-reference/` files. Resolutions kept both sides —
the history-maintenance procedures and the Talent-allocation helpers now coexist
in `pitd_common.adb` (the first rebase attempt compiled-failed on missing
BUGFIX-1111 bodies, which is why the file was rebuilt from `main` plus this
change's three additions), the route-count assertion became 121
(118 → 120 by NOTES-EDIT-01 → 121 by this change), the client test imports both
sets of wrappers, and the generated artifacts were regenerated from the merged
contract. Contract-derived artifacts (coverage, API reference, capability
manifest, Ada validators) were re-generated and verified reproducible; the
mutation pins were refreshed (14 entries) and the full campaign re-run. A
conformance type error surfaced by the merge (`error.entity` on a union branch
that does not declare it) was fixed with `in` narrowing, and `skill/SKILL.md`'s
operation counts were corrected to the generated truth (91 agent / 33 human of
124 operations). Round 4 confirmed merge fidelity symbol by symbol, artifact
reproducibility, the counts, the behavioural rechecks and all gates.
