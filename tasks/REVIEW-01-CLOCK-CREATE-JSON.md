---
id: REVIEW-01-CLOCK-CREATE-JSON
title: Preserve clock names as JSON data and prevent ID injection
deps:
  - REVIEW-01
track: ada
outputs:
  - backend-ada/server/src/pitd_ops.adb
  - conformance/suites/semantics/clocks.test.ts
  - docs/pages/contract/wave0/clock-taxonomy.mdx
  - tasks/metrics/ada/REVIEW-01-CLOCK-CREATE-JSON.json
acceptance:
  - CLOCK-CREATE-016 through CLOCK-CREATE-018 fail before the fix for name rejection, double decoding, and existing-clock overwrite
  - Ada build and focused clock/idempotency suites pass
  - full seeded Ada conformance passes with all five corrective regression tests
  - live HTTP smoke verifies exact persisted names and unchanged existing clock
---

# REVIEW-01-CLOCK-CREATE-JSON — clock name/identity correction

**Status:** implementation acceptance passed; independent corrected-candidate review remains owned by REVIEW-01.
**Source:** independent blind review of candidate `48b19881405fb59d351d2d45037151ca636eca2b`, user-reported defect A (P1). This descriptive corrective task ID is not a new FV/AR finding identifier. Card format and metrics follow `tasks/README.md`; parent-linked corrective-card precedent is `REVIEW-01-B1-happydom.md`.

## Log

- 2026-09-24: Read PAPERCLIPS, root/Ada AGENTS, `Models/Game/ProjectClock.cs`, clock-taxonomy reference analysis, and OpenAPI createClock. The model defines mechanical behavior, not standalone name restrictions; OpenAPI's name is a nonempty string without quote/backslash exclusions. User authorized regression additions in existing conformance directories; no schema or frozen contract test was edited.
- 2026-09-24 06:23 UTC: **RED**, `cd conformance && npm run test:ada -- --run suites/semantics/clocks.test.ts suites/persistence/idempotency.test.ts -t 'CLOCK-CREATE-01[678]|PERSISTENCE-IDEMPOTENCY-00[56]'`, exit 1; all 5 added tests failed before implementation. `CLOCK-CREATE-016`: expected false to be true (quoted/control-character request rejected). `CLOCK-CREATE-017`: literal `C:\new\tunnel\u0041\\end` was decoded again, becoming newline/tab and A. `CLOCK-CREATE-018`: generated result ID equaled the existing ID; original bytes changed; revision **1 instead of 2**, segments **0 instead of 3**. Full command output is session artifact `artifact://10351`.
- 2026-09-24 06:24 UTC: Replaced New_Clock JSON source concatenation/reparse with GNATCOLL `Create_Object` and typed `Set_Field` calls for all fields. Server-generated ID cannot be replaced by text in a name. Existing metadata/defaults/schema admission remain unchanged.
- 2026-09-24 06:24 UTC: **GREEN**, `cd backend-ada/server && XDG_RUNTIME_DIR=/tmp alr --non-interactive build`, exit 0, compile/bind/link successful. Focused command `cd conformance && npm run test:ada -- --run suites/semantics/clocks.test.ts suites/persistence/idempotency.test.ts`, exit 0: **2 files / 24 tests passed** (`artifact://10354`).
- 2026-09-24 06:26 UTC: A separate throwaway live HTTP process verified JSON-looking name gets a distinct ID, original clock bytes stay unchanged after progress, quote/Unicode/control/literal-backslash name survives GET and disk JSON, identical retry is byte-identical, and distinct-key creation is independent; exactly **4 stored clock documents** for the four intended creations. Process terminated and throwaway directory removed.
- 2026-09-24 06:27 UTC: Full seeded `cd conformance && npm run test:ada -- --run`, exit 0: **58 files / 476 tests passed** (471 baseline + 5 additions), 53.53 s Vitest duration (`artifact://10357`). No test fixture wiring changed, so no separate tooling run was required for this slice. No core changes or proof claims. No VCS mutations; unrelated state and mutation-catalog/shared tooling files untouched.
