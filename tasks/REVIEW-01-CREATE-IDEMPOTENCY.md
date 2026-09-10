---
id: REVIEW-01-CREATE-IDEMPOTENCY
title: Serialize and replay exact retries across all four create routes
deps:
  - REVIEW-01
track: ada
outputs:
  - backend-ada/server/src/pitd_callback.adb
  - conformance/suites/persistence/create-boundary.test.ts
  - docs/pages/contract/wave0/clock-taxonomy.mdx
  - tasks/metrics/ada/REVIEW-01-CREATE-IDEMPOTENCY.json
acceptance:
  - New create retries fail before implementation for ignored character/crew/PC keys and duplicate concurrent clock writes
  - Concurrent identical keyed requests persist one entity and replay identical successful response bytes on every create route
  - Validation failures do not consume keys and distinct routes or keys remain independent
  - Full Ada conformance, tooling, frontend, and audit validators pass
---

# REVIEW-01-CREATE-IDEMPOTENCY — one serialized create boundary

**Status:** implementation acceptance recorded in the metrics file; independent director diff review pending.
**Source:** REVIEW-01 follow-up review, P2 concurrent clock duplicate persistence and P2 ignored Idempotency-Key on ordinary character, crew, and dedicated PC creation. These are parent-linked corrective findings, not new FV/AR identifiers.

## Log

- 2026-10-04: Added `PERSISTENCE-IDEMPOTENCY-007`–`019` in a new regression file in the existing persistence suite directory. Each route covers sequential exact replay/distinct keys, twelve concurrent identical requests with collection membership proving exactly one persisted entity, and repeated validation failures followed by a successful keyed retry. The final case reuses one key across all four routes to prove independent route scoping. PC starting allocations are derived from published game settings rather than hardcoded maxima.
- **RED:** `cd conformance && npm run test:ada -- --run suites/lifecycle/creation.test.ts suites/persistence/create-boundary.test.ts -t 'LIFECYCLE-CREATION-00[4-9]|PERSISTENCE-IDEMPOTENCY-0(0[7-9]|1[0-9])'`, exit 1: **17 failed / 2 passed / 3 skipped**, including **11 failed / 2 passed** idempotency additions. Each non-clock route ignored keys, twelve concurrent requests persisted twelve entities, and concurrent clock requests persisted **two** entities. Existing sequential clock behavior passed. Evidence: `artifact://10421`.
- Added `Handle_Create` around all four POST create routes. It claims a namespaced method/route/key scope through the existing protected lock registry before lookup and releases it after persistence plus successful response storage, including exception exits. Other scopes remain independent. `Persist_Create` is the only shared successful-create persistence/response-store boundary for ordinary entities and PC creation; removed the obsolete clock-only lookup/store path and duplicate PC persistence pipeline.
- Retained the bounded process-local exact-body SHA-256 retry cache and existing different-body create behavior. No durable replay guarantee, new HTTP status, or same-key/different-body mismatch policy was added. Validation failures are not stored as successful responses.
- **GREEN:** focused `cd conformance && npm run test:ada -- --run suites/lifecycle/creation.test.ts suites/persistence/create-boundary.test.ts suites/persistence/idempotency.test.ts`, exit 0: **3 files / 28 tests passed**, `artifact://10424`. Final `XDG_RUNTIME_DIR=/tmp alr --non-interactive build` succeeded (1.63 s).
- Full acceptance commands, observed counts, and artifacts are recorded in `tasks/metrics/ada/REVIEW-01-CREATE-IDEMPOTENCY.json`. No contract, mutation catalog, campaign-data, or `.omo/` edits; no commits or mutating Git operations.
