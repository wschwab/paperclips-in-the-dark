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
