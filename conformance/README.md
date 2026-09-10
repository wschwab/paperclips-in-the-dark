# Paperclips in the Dark conformance suite

The suite is a black-box HTTP client. Set `BASE_URL` to the server under test;
the client adds `/api` unless the URL already ends in `/api`.

```sh
npm ci
BASE_URL=http://localhost:9657 npm test -- --run
```

The scoring command emits only the stable JSON report on stdout. It exits
non-zero when any conformance test fails, including the expected all-red run
before a backend exists:

```sh
npx conformance run --against http://localhost:9657 --report json
```

The report format is documented at `docs/pages/conformance/report-json.mdx`.
Tooling tests for the report normalizer and shim run separately with
`npm run test:tooling`.

The mutation harness requires the versioned input
`conformance/fixtures/mutation-catalog.json` (28 curated mutants, expected test
IDs, and restoration hashes). It is not generated audit output and must be
available from the checkout; do not copy it into `agent-docs/` as setup.
`npm run test:tooling` includes both harness-importing test files through
`src/**/*.test.ts`; `test:run` and the managed `test:ada` select only
`suites/**/*.test.ts`. `test:mutation` invokes the harness directly and runs the
appropriate layer suites, including tooling tests for conformance mutants.

For a fresh checkout, install conformance and frontend dependencies (`npm ci` in
each directory), build the Ada server (`alr --non-interactive build` in
`backend-ada/server`), and build the frontend (`npm run build` in `frontend`)
before the tooling integration tests. Then run `npm run test:tooling` and
`npm run test:ada` from `conformance`. These commands need no local audit input
directory. Mutation run results remain local output under `agent-docs/test-audit/`.

## Browser journeys (`npm run test:browser`)

Drives real Chromium against the managed server:

```sh
npm run test:browser              # headless
npm run test:browser -- --headed  # diagnostic mode: headless:false ONLY —
                                  # seeds, probes, allowlist, and exit
                                  # semantics are identical
```

`scripts/browser-suite.mjs` reuses `scripts/managed-browser-smoke.mjs` as the
launch boundary (build/port/seed/readiness/exact-PID cleanup) and fails unless
the launcher prints its `success; …` line, which asserts no server or temp
data leaked. Frontend/dist is rebuilt via `vite build` when it is not newer
than every input under frontend/src (+ index.html/tsconfig/vite config);
browse with `--force-frontend-build` to rebuild unconditionally.

Journeys live in `suites-browser/*.journey.mjs`, each exporting
`{ id, checkpoints, run(page, ctx) }`. `ctx.goto(path)` also probes the route;
after each journey the final page is probed again. The run fails on: any
unmet/undeclared checkpoint, any console or uncaught page error (Chromium's
automatic /favicon.ico 404 noise is suppressed and counted separately), any
request outside the allowlist (same-origin `/api/**` plus same-origin static
GET/HEAD), any UI decode-failure notice ("Invalid roster response", or the
shared "The server answered in an unexpected format"), and horizontal overflow
(scrollWidth > innerWidth on any visited route). Chromium resolves from
`~/.cache/ms-playwright/chromium-*`, else `/usr/bin/chromium`; override with
`PITD_BROWSER_EXECUTABLE`. Artifacts (journey-results.json,
console-network-errors.json, per-journey screenshots) land under
`${TMPDIR}/pitd-browser/<runId>/` and the path is printed.

## HTTP-to-stdio escape hatch

The neutral shim forwards one HTTP request per JSONL message to a backend
process. The request message is:

```json
{
  "id": "request-id",
  "method": "POST",
  "path": "/api/characters",
  "headers": { "content-type": "application/json" },
  "body": { "...": "..." }
}
```

The backend replies with the matching `id`, an HTTP status, optional headers,
and a JSON body. Start it with:

```sh
npx pitd-http-stdio-shim --command ./backend-zero-stdio --port 9657
```

Arguments after `--` are passed to the stdio backend. This keeps the same
conformance suite usable when Track Z exposes line-delimited JSON instead of
HTTP.
