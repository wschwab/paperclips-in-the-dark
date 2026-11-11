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
| Frontend vitest | 1047/1047 tests, 45 files |
| Frontend TypeScript + production build | pass |
| Ada build (generated validator + sources) | pass; `pitd` rebuilt, no source newer than binary |
| Ada two-cycle managed conformance | 688 passed + 1 intentionally isolated recovery case skipped, per cycle, on managed ports 45901 and the second cycle |
| Conformance tooling | 233/233 |
| Conformance TypeScript | pass |
| Browser journeys (managed) | 6/6 |
| Chromium matrix probe | 27/27 surface/viewport/theme cases and 9 sheet-first journeys |
| Mutation campaign (isolated, pins refreshed) | 28/28 killed — P0 19/19, P1 9/9, green baseline, no survivors |
| Validators (metrics 193 files, traceability 231/231, reconciliation) | pass |
| Docs build | pass, 171 files generated |
| Impeccable detector on changed UI sources | no findings |
| Independent Sol 6.1 xhigh review | see commit record |

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
pins. Round 2 verdict is recorded at
`tasks/metrics/frontend/SCOUNDREL-CREATE-02-sol-verdict.txt`.
