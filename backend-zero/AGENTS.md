# Zero backend agent rules

This backend targets Zero 0.3.4. The pinned executable is
`~/.zero/bin/zero`; verify the version before diagnosing a toolchain problem.
The bundled skills are authoritative for this version:

```text
zero skills get stdlib
zero skills get diagnostics
zero skills get language
zero skills get graph
```

## Required diagnostic loop

Run the importer first and read its stderr. Only after import succeeds, run
the JSON checker:

```text
~/.zero/bin/zero import .
~/.zero/bin/zero check --json
```

`zero check --json` can mask parse errors until the import has succeeded, so a
JSON result by itself is not evidence that the source parsed. When the graph
reports ambiguous source identity after a substantial rewrite, preserve the
generated graph as a recoverable temporary copy and re-import; do not edit
the frozen contract or conformance sources.

## Zero 0.3.4 language and runtime traps

- Struct literals must be on one physical line. Multi-line literals fail with
  `PAR100`; keep even small records single-line.
- The runtime rejects `mutref<Vec>` with `BLD004`, and mutable/nested record
  fields are not a safe handler ABI. `jbuf.0` therefore uses caller-owned
  `MutSpan` storage with an explicit in-band length, and the native state
  boundary uses packed scalar records.
- A successful `zero check` is not enough for runtime validation. Exercise the
  actual `zero run`/HTTP server path after changing ABI-sensitive code.
- `std.fs.ensureDir` is not available in 0.3.4. Use the supported
  `isDir`/`makeDir` sequence.
- Prefer fixed-size buffers and small helper functions; split large handlers
  and keep local buffers comfortably below the runtime's practical limits.

## Native HTTP launch

`std.http.listen` re-executes a bare `zero` and does not perform PATH search.
Run the server through `server/run.sh`, which adds `~/.zero/bin` to PATH and
creates the temporary `./zero` symlink in the server working directory. The
wrapper removes that symlink on normal exit; after an externally delivered
interrupt, verify the link and unlink it if the shell was terminated before
its trap ran. Kill every server after verification.

## Data and persistence

- Numeric limits and game semantics come from the game-settings JSON under
  `data/games/*.json`; never add hardcoded game maxima. When extending the
  backend, prefer loading those files at startup over expanding the historical
  hand-transcribed `game_data.0` table.
- Persist one record per entity and allocate IDs from the persisted index.
  The conformance suite can issue requests in parallel, so fixed IDs are not
  safe even for a minimal implementation.
- Keep generated runtime state under `backend-zero/server/campaign-data` out of
  source semantics and reset it with `PITD_RESET=1` for a cold-start run.

## Tests and scope

Implementation work is red-green: add the narrow failing test or conformance
case first, then make it pass. The conformance suite is the source of truth;
do not edit `contract/`, `conformance/`, or `data/`, and never edit the
`blades-in-the-sheets/` reference material. Documentation belongs in the
vocs site under `docs/pages/zero/`.

For the Z1 acceptance run:

```text
cd backend-zero/server
~/.zero/bin/zero import .
~/.zero/bin/zero check --json
PITD_RESET=1 ./run.sh
cd ../../conformance
BASE_URL=http://localhost:9657 npx vitest run suites/semantics
```

Also run `~/.zero/bin/zero fix --plan --json` when diagnosing a toolchain
failure. Treat its output as advisory: it may identify a precise repair and
require human review, but it is not an automatic fix for runtime ABI errors.

This handover deliberately makes no VCS mutations. Use the repository's
Jujutsu policy for any later version-control operation.
