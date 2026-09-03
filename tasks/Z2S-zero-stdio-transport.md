---
id: Z2S
title: "Zero neutral stdio transport escape hatch"
deps: [Z1, C1]
track: zero
outputs:
  - backend-zero/ stdio JSONL adapter
  - docs/pages/zero/ transport-boundary documentation
acceptance:
  - "Zero stdin/stdout capability is demonstrated by an actual zero run, or a precise toolchain diagnostic is archived"
  - "If viable, pitd-http-stdio-shim serves GET /api/health through the Zero JSONL child"
  - "No native Zero HTTP process is required by the shim path"
---

Spec §10.3 escape hatch. Node owns HTTP transport and translates requests to
one-line JSON messages. Zero owns backend semantics and persistence behind the
line-delimited stdin/stdout protocol. Keep the direct HTTP server available and
label the shim path honestly.

First prove Zero 0.3.4 can read a line from stdin and write a line to stdout in
an actual runtime. Do not build a broad adapter on an assumed capability. If the
capability is absent or blocked by the compiler/runtime, archive the exact
diagnostic and stop at a resumable design boundary.

Current boundary (2026-07-21): `std.io` only scans caller-owned buffers and
`std.fs.readOrRaise` against `/dev/stdin` does not yield a line while the pipe
remains open. The proof and bounded shim probe are archived in
`backend-zero/spike/stdio-jsonl-20260721T1731/`,
`backend-zero/spike/stdio-stream-probe-20260721T1758.mjs`, and
`backend-zero/spike/shim-stream-probe-20260721T1759.mjs`; notes are in
`docs/pages/zero/z2-notes.mdx`. Resume with:

```sh
cd backend-zero/spike/stdio-child-attempt-20260721T1756-560795
~/.zero/bin/zero import . && ~/.zero/bin/zero check --json
node ../stdio-stream-probe-20260721T1758.mjs
node ../shim-stream-probe-20260721T1759.mjs
```

If a future release remains one-shot-only, use a neutral Node line dispatcher
that invokes `zero run` once per complete request with stdin closed per child;
keep this explicitly process-per-request rather than claiming persistent Zero
JSONL transport.

## Log

- 2026-07-21: Luna/xhigh probe (session 019f8515, 19 min wall-clock) — one-line echo PASS at EOF; persistent-stdio probes BLOCKED (`std.io` scans caller-owned buffers only; `std.fs` `/dev/stdin` read yields no line while the pipe stays open); frozen shim GET /api/health timed out after 2s. Result `blocked-at-persistent-stdio-boundary`, expected-red, Track Z non-blocking. Metrics: `tasks/metrics/zero/Z2S.json`; probes archived under `backend-zero/spike/`.
- 2026-09-04 (finding-6 backfill): this `## Log` added so the tracked metrics record has its required task log per work-spec §3.3 (`## Log`) and §5. Entries above mirror the tracked metrics record; no sessions/results invented.
