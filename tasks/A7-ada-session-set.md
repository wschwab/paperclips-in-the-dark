---
id: A7
title: "Ada server: session.set op (Score XP expression tracks)"
deps: [A2]
track: ada
outputs:
  - backend-ada/server: session.set branch in Mutate per contract/openapi.yaml
  - conformance: semantics test for session.set (shape-only coverage allowed the gap through — add a red-green semantics case)
acceptance:
  - "live probe: session.set with each field updates the track and reports applied; revision advance; unknown field rejected"
  - "full conformance suite green; gnatprove gate stays green"
---

Found 2026-08-07 during F2o live acceptance probing. The F2o frontend slice
ships Score XP (session.set) client methods + UI; the Ada server has NO
session.set branch in Mutate (server/src/pitd_callback.adb) — returns 200
ok:false VALIDATION "unknown operation". The conformance suite's endpoint
coverage only asserts the OperationResult SHAPE, which an unknown-op error
satisfies, so the suite was green anyway. Third instance of the pattern
(A4 trauma validation, A5 revision gate): black-box shape coverage misses
live semantics — E0-relevant.

Contract: session.set body {playbookExpressions?, characterExpressions?,
struggleExpressions?} (minProperties 1; each integer >= 0, clamped to the
track max 3 like stress). Success_Result with Requested/Effective for the
changed track.

## Log
- 2026-08-07: filed from F2o probe findings.
- 2026-08-07: DONE. deepseek-v4-flash-0731 child. Child deliberately chose
  clamped-SET semantics over the orchestrator prompt's clamp-add — correct:
  the F2o frontend sends absolute values (box click N → {field: N}), and
  clamp-add would make max unrecoverable. Orchestrator verified: build green,
  own probe (clamp 99→3, multi-field, unknown-field VALIDATION, revisions
  monotonic), conformance 150/150 (149 prior + SEMANTICS-SESSION-SET-001,
  red-then-green shown by child).
