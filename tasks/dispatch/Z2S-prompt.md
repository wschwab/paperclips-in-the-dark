# Z2S bounded implementation: neutral stdio transport

Read `PAPERCLIPS.md`, repository `AGENTS.md`, `backend-zero/AGENTS.md`,
`tasks/Z2S-zero-stdio-transport.md`, and these existing neutral-shim files:

- `conformance/src/stdio-shim.ts`
- `conformance/src/stdio-shim-cli.ts`
- `conformance/src/mock-stdio.mjs`
- `conformance/src/stdio-shim.test.ts`

Context: native Zero HTTP returns `handler_failed` when an accumulated roster
response approaches roughly 6 KiB. Raising the roster-local builder from 14 KiB
to 30 KiB did not lift the boundary and risks the documented handler stack
limit. Fresh focused repeatability is 2/2 green; the next transport step is spec
§10.3.

This is a 40-minute maximum implementation slice within a 60-minute wave.

1. Inspect Zero 0.3.4 stdlib/language skills for stdin/stdout or stream APIs.
2. Prove capability with the smallest actual `zero run` JSONL echo/request
   program before designing the adapter.
3. If viable, implement the smallest Zero child and launcher needed for the
   existing `pitd-http-stdio-shim` to serve `GET /api/health`. Reuse existing
   domain/store modules where possible; do not proxy to native Zero HTTP.
4. If not viable, stop implementation, archive exact diagnostics in the vocs
   Z2 notes, and leave a concrete alternative design/resumption command.

Scope and safety:

- You may edit `backend-zero/`, `docs/pages/zero/`, this task, and Zero metrics.
- Do not edit `contract/`, API conformance suites, game data, or reference
  material. The existing shim is frozen for this backend implementation slice.
- Do not use `rm`, `rm -rf`, `pkill`, `killall`, or broad process kills.
- Use new uniquely named temporary/verification paths; preserve them rather than
  deleting them.
- Stop children and servers only by exact PIDs you captured.
- Use `jj` for read-only diff/status if helpful, but perform no VCS mutations.
- Do not start a broad conformance run. Acceptance is capability proof plus
  health through the shim.

Report exact files, commands, diagnostics, process IDs stopped, and next gap.
