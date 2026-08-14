---
id: SC-S1
title: "Amend PAPERCLIPS — canonical data, lifecycle, limits, finding closure"
deps: [SC-R0, SC-R1, SC-R2, SC-R3, SC-R4, SC-R5, SC-R6]
track: contract
outputs:
  - PAPERCLIPS.md (amended)
acceptance:
  - Every locked decision in the governing work spec appears normatively exactly once
  - No normative sentence relies on the superseded draft (docs/pages/contract/spec-change-draft.mdx)
  - Terminology matches the Wave 0 matrices (docs/pages/contract/wave0/)
  - The four invalidated claims are removed or replaced: "normalise on write only", "no repair path", top-level-only validation, trauma-only retirement
---

# SC-S1 — Amend PAPERCLIPS

## Target

Edit ONLY `PAPERCLIPS.md`. One editor, one change. Read-only everywhere else (no `contract/`, `conformance/`, source, or other docs edits). Do NOT rewrite the document wholesale — amend the named sections, preserving the existing voice, structure, and untouched sections.

## Inputs

- `docs/pages/contract/spec-change-work-spec.mdx` — the authority. Read it fully. Its sections "Locked product and technical decisions", "Wave 0 outcomes (frozen research)", and "Wave 1" are normative for this card.
- `docs/pages/contract/wave0/canonicalization-matrix.mdx` — terminology: canonical/repairable/needs-input/unreadable; HTTP outcomes; legacy rules.
- `docs/pages/contract/wave0/lifecycle-matrix.mdx` — lifecycle state machine terminology and the SC-O6 case list.
- `docs/pages/contract/wave0/clock-taxonomy.mdx` — clock ownership/purpose/behavior terms; ClockPurposes values.
- `docs/pages/contract/wave0/limit-inventory.mdx` — limit taxonomy (game-domain/derived/request/service/internal) and capabilities.
- `docs/pages/contract/wave0/completeness-audit.mdx` — exact pointer lists and predicate vocabulary.
- `docs/pages/contract/wave0/validator-spike.mdx` — validation implementation verdict (schema-generated entity validators).

## Contract (what the amended spec must state, normatively and exactly once)

Amend these PAPERCLIPS.md sections:

1. **§4 Persistence** — add a canonical-shape rule: every schema-declared property is present in stored documents; `null` never stored; missing/null normalize to schema-valid canonical defaults at the write boundary; version 1 is redefined in place (pre-release; no format-version bump); canonicalisation is not a migration and never changes `formatVersion`. Extend the `If-Match` rule: undo, delete, import-apply, and repair-apply MUST send `If-Match` (or the degraded `deleteToken`).
2. **§6 DTO format** — key presence ("no nulls and no absent keys"); byte-identity preserved; sparse `claimOverrides` exception (outer array always present, items require only `claimId`); crew `contacts`/`factions` required canonical arrays; completeness is derived at response time from `x-requiredWhenComplete` predicate records, never stored, orthogonal to retirement/deadish; the exact initial field sets (8 character pointers, 5 crew pointers, clocks none — from the completeness audit); the four normalizer outcomes.
3. **§7 API** — add: preview/confirm normalization (repair preview computes without writing; apply requires confirmation + opaque content token, atomic; unparseable bytes stay degraded and cannot be normalized); partial import through preview/apply (`If-Match` + confirmation + preview token; unknown properties rejected unless the preview classifies and displays removal); total collections (one bad member never changes `200`; uniform row schema with route-derived `id`/`kind`, canonical empties, `isReadable`, `isRepairable`, `isComplete` when readable, `deleteToken` = `sha256:<hex>` bound to raw bytes; deleting/repairing after bytes change → `409 STALE_REVISION`; deleting an unreadable crew atomically clears readable members' `dossier.crewId`); full recursive admission (schema-generated entity validators, not top-level key lists — the spike verdict); typed error/recovery semantics (`INVALID_ENTRY` 400 vs `INVALID_ENTITY` 422 vs `NORMALIZATION_REQUIRED` 409; one discriminated error union with status/detail/recovery/retryable, `retryable` = success may follow the documented recovery action); numeric result families (signed delta / absolute setter / quantity / clock progress with `visibleApplied`/`overflowAdded`; clients report requested/effective differences); limit publication taxonomy (game-domain in settings, derived in server-computed capabilities, request bounds in request schemas, service limits in service capabilities, internal capacities never API promises); clock model (storage ownership `ownerKind`/`ownerId`, narrative `purpose` from settings `ClockPurposes` with the 10 exact values, mechanical `behavior` bounded|rollover, `relatedClockIds`; embedded healing clocks stay monitor state; owner deletion reassigns to campaign; related-clock deletion unlinks; rollover accumulates and reset retains overflow).
4. **§5 Domain model** — replace the trauma-only retirement and stress-overflow wording with the lifecycle state machine: stress max → `traumaPending` + typed attention (never auto-trauma); trauma resolution records trauma, keeps stress full, sets `isOutOfAction` + `stressClearPending`; `end-score` rejects `TRAUMA_REQUIRED` while pending, clears stress to zero and both flags in one snapshot; explicit confirmed retirement (not restricted to max trauma) and final-trauma retirement share one cleanup (clears stress/harm/healing clock/armor, preserves dossier/playbook/trauma history/notes/gear/fund); deadish is fatal-harm-caused, preserves harm, clears stress and pending state, distinct from retirement; retired characters remain readable/deletable with the frozen allow-list (dossier, name, notes, notebook, trauma.remove, undo, delete, import, reads) and deny-list (gameplay → `RETIRED`); `isRetired` never recomputed from trauma count; `isDeadish` write-derived from fatal harm; `canUndo`/`historyCount` derived at response time, never stored; removing trauma never silently reverses retirement (undo is the recovery path).
5. **§8 Conformance** — conformance categories covering canonicalization/import/repair, recursive admission, total collections, completeness, limits/numeric ops, clocks, lifecycle, errors/concurrency/parity; Track Z's explicit halted status (expected red, does not block Track A).
6. **§9/§10 where needed** — Track A: full recursive validation via generated entity validators (the SC-R1 verdict); Track Z: halted status per its section.
7. **§12 Frontend** — client obligations: every destructive/lifecycle operation reachable behind explicit confirmation; outstanding fields rendered from `x-requiredWhenComplete`; clamped values announced; generated completeness metadata consumed (no hand-copied lists); typed error decoding without raw-JSON leakage; `Unnamed {playbook|crewType}` labels.

Remove or replace, explicitly: "normalise on write only" (draft E1 framing), "no repair path" (draft Q2 discussion option D), top-level-only validation (draft Part 8 "no recursive JSON-Schema validator"), trauma-only retirement (any sentence implying retirement only at max trauma).

## Red

Today's `PAPERCLIPS.md` does not state any of the above; the four invalidated claims are present in the superseded draft but check that no PAPERCLIPS sentence contradicts the new rules (e.g. §5.1.3 "Stress overflow does not auto-trauma" stays, but check §5.1.9 wording on retired mutations vs the allow-list).

## Green

`PAPERCLIPS.md` amended with all items above; the exit gate checks:

1. Every locked decision appears normatively exactly once (grep-able: `traumaPending`, `INVALID_ENTITY`, `NORMALIZATION_REQUIRED`, `deleteToken`, `x-requiredWhenComplete`, `ClockPurposes`, `OUT_OF_ACTION`, `If-Match` on undo/delete/import/repair, the four normalizer outcomes, the exact pointer lists).
2. No sentence references the superseded draft as authority.
3. Terminology matches the Wave 0 matrices (canonical/repairable/needs-input/unreadable; `INVALID_ENTRY` vs `INVALID_ENTITY`).
4. The four invalidated claims are absent or replaced.

Report a checklist mapping each required statement to its PAPERCLIPS.md section in your final message.

## Evidence

- Section-by-section diff summary.
- The checklist mapping statement → section.

## Metrics

`tasks/metrics/contract/SC-S1.json` is written by the orchestrator — do not create it.

## Log

Timestamped dispatch entry when work starts.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
