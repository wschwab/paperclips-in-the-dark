---
id: REVIEW-01-CLOCK-CREATE-REPLAY
title: Replay immediate identical clock creation retries
deps:
  - REVIEW-01
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb
  - conformance/suites/persistence/idempotency.test.ts
  - docs/pages/contract/wave0/clock-taxonomy.mdx
  - tasks/metrics/ada/REVIEW-01-CLOCK-CREATE-REPLAY.json
acceptance:
  - PERSISTENCE-IDEMPOTENCY-005 and PERSISTENCE-IDEMPOTENCY-006 demonstrate duplicate creation before implementation
  - identical immediate clock-create retry returns original result and persists only one clock
  - distinct keys create independently and failed validation does not poison replay
  - focused Ada build and suites plus full seeded Ada conformance pass
---

# REVIEW-01-CLOCK-CREATE-REPLAY — exact retry correction

**Status:** implementation acceptance passed; same-key/different-body policy remains a separate contract decision. Independent corrected-candidate review remains owned by REVIEW-01.
**Source:** independent blind review of candidate `48b19881405fb59d351d2d45037151ca636eca2b`, user-reported defect B (P2). Descriptive corrective task ID, not a newly invented finding-register ID; frontmatter/log/metrics follow `tasks/README.md` and the parent-linked `REVIEW-01-B1` precedent.

## Scope and contract decision

PAPERCLIPS §7.1 promises optional best-effort key-to-result replay, but does not choose a mismatch status. OpenAPI createClock declares **200/400 only** (2452–2454); existing entity mutations emit **409 VALIDATION** for same-key/different-body (pre-change callback 1055–1057). The user explicitly limited this correction to exact same-key/same-body retries and distinct-key independence. No contract files were changed and no new mismatch branch, 409 response, or mismatch regression policy was added. Nonmatching requests continue through the pre-existing create path; this is not approval or documentation of a mismatch contract. A dedicated contract decision is required before standardizing that behavior.

## Log

- 2026-09-24 06:23 UTC: **RED**, `cd conformance && npm run test:ada -- --run suites/semantics/clocks.test.ts suites/persistence/idempotency.test.ts -t 'CLOCK-CREATE-01[678]|PERSISTENCE-IDEMPOTENCY-00[56]'`, exit 1, **5 added tests failed**. `PERSISTENCE-IDEMPOTENCY-005`: response IDs differed, collection had **2 rows instead of 1** after exact retry and **3 instead of 2** after a distinct key. `PERSISTENCE-IDEMPOTENCY-006`: validation remained 400, but subsequent successful request retry returned another ID. Exact failure output retained as session artifact `artifact://10351`.
- 2026-09-24 06:24 UTC: Added clock-collection create lookup using existing method/route/key scope, SHA-256 raw body comparison, bounded in-memory Idempotency_Store, and existing JSON response serialization. Lookup follows request shape validation, before clock reference checks/construction; successful writes store their exact result before returning. Errors are not stored. Existing declared 128-character key limit is enforced with allowed 400 VALIDATION. Character/crew creates and existing-entity mutation replay are unchanged. No broad replay abstraction or concurrency guarantee was added.
- 2026-09-24 06:24 UTC: `cd backend-ada/server && XDG_RUNTIME_DIR=/tmp alr --non-interactive build`, exit 0. Focused `cd conformance && npm run test:ada -- --run suites/semantics/clocks.test.ts suites/persistence/idempotency.test.ts`, exit 0: **24/24**, **2/2 files** (`artifact://10354`). This also retained all four existing entity-mutation scope/concurrency/replay cases.
- 2026-09-24 06:26 UTC: Separate live HTTP smoke: immediate exact retry bytes identical, existing injection target unchanged, literal names preserved in disk JSON, distinct key yields another ID; **4 persisted clocks** for four intended creations. Temporary server stopped and storage removed.
- 2026-09-24 06:27 UTC: Full seeded `cd conformance && npm run test:ada -- --run`, exit 0: **58/58 files, 476/476 tests** (471 baseline + 5 new), 53.53 s Vitest duration (`artifact://10357`). No fixture wiring/tooling modifications. Shared mutation catalog untouched; no VCS mutation.
