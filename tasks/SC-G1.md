---
id: SC-G1
title: "Agent reference and capability parity"
deps: [SC-C5, SC-F1, SC-C2, SC-C3, SC-C4]
track: skill
outputs:
  - skill/SKILL.md (updated)
  - skill/api-reference/README.md (regenerated — normalization preview/apply, roster-first degraded recovery, lifecycle attention, capabilities, requested/effective families, manifest dispositions)
acceptance:
  - An agent can complete each workflow from generated documentation only (no backend source, no guessing IDs/limits/recovery/follow-ups)
  - Regenerated artifacts byte-identical on second run
---

# SC-G1 — Agent reference and capability parity

## Target

Edit: `skill/SKILL.md` (workflow guidance) and regenerate `skill/api-reference/` via the SC-C5 generators (skill/generate-api-reference.mjs + skill/generate-capability-manifest.mjs). Do NOT hand-edit generated files. Do NOT edit `contract/`, `conformance/`, or frontend source.

## Inputs (normative)

- `docs/pages/contract/spec-change-work-spec.mdx` SC-G1; "Client obligations and parity"; Q29/Q31/Q32; W9.
- Frozen contract: all ops incl. preview/apply, repair, retire, clock ops, capability endpoints; the error union (recovery instructions); the capability manifest (108 dispositions: 85 agent, 23 human, 0 exempt — check the generated manifest).
- Frozen oracle expectations: parity tests (every operation has an agent path).
- Current `skill/SKILL.md` + api-reference README (regenerate; the README is generated).

## Changes

1. **SKILL.md**: add/refresh workflow sections — normalization preview/apply (import/repair: preview first, confirm with token + If-Match), roster-first degraded recovery (rows carry isReadable/isRepairable/isComplete/deleteToken; repair or delete with the token; never guess), lifecycle attention (traumaPending/out-of-action explanation, retire is explicit and confirm-guarded, undo is the recovery path), capabilities (fetch projections before mutation; mutations authoritative; requested/effective clamp reporting), numeric families (signed deltas accepted where declared; report clamps). Keep the existing "never invent IDs — roster first", rulebook-ephemeral, and no-rules-text-memory rules.
2. **Regenerate api-reference**: run the generators; the README gains the sections the generator emits (completeness predicates, capability endpoints, recovery instructions + 26 union codes, lifecycle attention codes, manifest).
3. **Parity check**: every operation's agent reference entry exists in the manifest (85 agent entries); human-required ops documented with their control.
4. **No durable-replay promise**: idempotency described as best-effort (W9).

## Red

No manifest/agent entries for the new ops (the old generated reference lacks the new sections).

## Green

- Generators run twice; second run changes zero bytes (idempotency proven by command, not claim).
- `(cd conformance && npm run test:tooling)` green (generator parity tests cover the manifest).
- SKILL.md updated; no contract/conformance/frontend edits.

Report exact commands and outputs.

## Metrics

`tasks/metrics/skill/SC-G1.json` is written by the orchestrator — do not create it.

## Log

- **2026-08-14:** Dispatched to deepseek-v4-flash-0731 (nous, omp task worker). Outcome recorded in tasks/metrics/skill/SC-G1.json; acceptance gates verified by the orchestrator.

Before you finish, answer in your report:
1. Was anything in these instructions contradicted by what you found in the codebase?
2. What did you have to guess at?
3. What did you need that you weren't given?
