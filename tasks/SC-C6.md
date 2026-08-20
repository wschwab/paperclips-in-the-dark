---
id: SC-C6
title: "Retained contract corrections"
deps: [SC-C1, SC-C4, SC-R4, SC-R5, SC-S1]
track: contract
outputs:
  - contract/openapi.yaml (targeted corrections in assigned regions only)
  - contract/schemas/campaign.json (canUndo/historyCount in summaries — after SC-C1 lands)
acceptance:
  - dossier.update vice uses $defs.vice; cohort.add accepts hasArmor/edges/flaws/description and rejects true unknowns
  - action set-rating and attribute.levelup declare the same effective cap; upgrade.mark declares TotalBoxes enforcement; XP ops declare signed deltas; rollover accumulation declared
  - canUndo/historyCount declared as derived response fields (summaries + OperationResult), never stored
  - If-Match required on destructive operations; redocly lint passes
---

# SC-C6 — Retained contract corrections

## Target

Edit `contract/openapi.yaml` ONLY in these regions (do not touch other blocks; SC-C2 owns import/repair/retire/lifecycle/clock blocks — if a correction you need sits in a SC-C2 region, message SC_C2 via hub): `dossier.update` request schema, `cohort.add` request schema, `upgrade.mark`/`upgrade.unmark` descriptions, XP op descriptions (`playbook-xp.add`, `attribute-xp.add`, `crew-xp.add`, `attribute.levelup`, `action.set-rating`), components.parameters.ifMatch required flags, components.responses.OpResult description (canUndo/historyCount), and `contract/schemas/campaign.json` (add `canUndo`/`historyCount` to characterSummary and crewSummary AFTER SC-C1 has added the total-row fields — coordinate with SC_C1 via hub if its files are mid-flight). Read-only everywhere else.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` section "SC-C6 — retained contract corrections" (the six retained items verbatim) and "Client obligations and parity".
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` §9 — canUndo/historyCount derivation (never stored; historyCount = retained snapshot count 0..50; canUndo = historyCount > 0).
- `docs/pages/contract/wave0/limit-inventory.mdx` §1.1 rows for action rating caps, upgrade TotalBoxes, XP tracks (signed deltas), and the "gaps" section items 1-2, 6.
- Current openapi lines cited by the inventory: openapi.yaml:1398 (upgrade.mark UPGRADE_MAXED promise), :721 (gear.set-commitment note — NOT yours; leave it), dossier.update vice ref, cohort.add request schema, action.set-rating/attribute.levelup declarations, If-Match parameter.
- Decision Q8 (draft Part 3 C9): vice property points at `$defs.vice` (not namedDescription).

## Changes

1. **dossier.update**: vice property `$ref` → `common.json#/$defs/vice` (full vice incl. purveyor; purveyor required).
2. **cohort.add**: request body accepts `hasArmor` (boolean), `edges` (array), `flaws` (array), `description` (string) alongside the existing fields; keep additionalProperties: false so true unknowns are still rejected.
3. **Action cap parity**: `action.set-rating` and `attribute.levelup` both declare enforcement against the same effective cap (settings `ActionCap` Base/Mastery-derived; the exact value is server-computed — declare the shared-cap rule, referencing the SC-C3 capability endpoint for the published value).
4. **upgrade.mark**: declare enforcement of settings `TotalBoxes` per upgrade with `UPGRADE_MAXED` when boxesMarked = total; unmark stays box-wise.
5. **Signed XP deltas**: playbook-xp.add, attribute-xp.add, crew-xp.add declare signed deltas (negative applies below, clamps at zero) with the signed-delta result family; clear ops unchanged.
6. **Rollover accumulation**: clock.progress declares accumulation across calls (only if not already declared by SC-C2's clock region — coordinate).
7. **canUndo/historyCount**: add `canUndo` (boolean) and `historyCount` (integer minimum 0) to characterSummary/crewSummary (required, derived at response time, never stored — note in description); declare in components.responses.OpResult description that entity-targeted operation results carry them as derived response fields (the orchestrator's resolution of the byte-identity constraint: GET detail stays raw; summaries + operation results carry the derived fields).
8. **If-Match required**: set `required: true` on the ifMatch parameter usage for delete/undo (import-apply and repair-apply If-Match is SC-C2's region — coordinate).

## Red

Today: vice typed as namedDescription; cohort.add rejects contract-allowed fields; set-rating/levelup caps differ; upgrade.mark promises UPGRADE_MAXED without declaring enforcement; XP ops don't declare signed deltas; summaries lack canUndo/historyCount; If-Match optional on undo/delete.

## Green

- Redocly lint passes (`npx @redocly/cli lint contract/openapi.yaml`).
- Orchestrator greps: `dossier.update` vice refs `$defs.vice`; cohort.add body contains the four fields; canUndo/historyCount in both summary defs and the OpResult description; If-Match required on undo/delete.
- No entity schema edits outside campaign.json summaries.

Report the exact commands and outputs. Do NOT run project-wide gates.

## Metrics

`tasks/metrics/contract/SC-C6.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/contract/SC-C6.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
