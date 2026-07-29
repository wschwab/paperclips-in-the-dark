---
id: A4
title: "Ada server: request-body validation + trauma DUPLICATE enforcement"
deps: [A2]
track: ada
outputs:
  - backend-ada/server request-body schema enforcement (required fields, additionalProperties: false) for op endpoints
  - trauma.add duplicate → DUPLICATE error per contract
  - conformance additions covering both (via the C3 contract-task session, which is already sanctioned to touch conformance/)
acceptance:
  - "trauma.add with {\"name\":...} (unknown field, missing required trauma) → 400 VALIDATION, nothing stored"
  - "duplicate trauma.add → DUPLICATE error, ok:false, no state change"
  - "full conformance suite green incl. new cases; gnatprove gate stays green"
---

Found 2026-07-29 during F2m live acceptance probing (orchestrator sent a
wrong field name and the server accepted it):

1. `trauma.add` with body `{"name":"Haunted"}` — contract requires `trauma`,
   `additionalProperties: false` — returned ok:true and stored an EMPTY
   STRING trauma. No request-body validation at all on this path; likely
   systemic across op endpoints.
2. Duplicate `trauma.add` returns ok:true with no change; contract mandates
   DUPLICATE. (Contract §: "Duplicate → DUPLICATE. Adding the max-th trauma
   retires the character".)

Both are conformance-suite blind spots — the suite is 131/131 green against
this behavior. E0-relevant: black-box suites don't catch what they don't
assert; live probing caught both.

## Log
- 2026-07-29: task created from F2m probe findings. Not yet dispatched.
