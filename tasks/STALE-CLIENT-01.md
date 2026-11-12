# STALE-CLIENT-01 — Revalidate application HTML and recover stale sheet clients

## Authorized scope

User-approved public main fix: `Cache-Control: no-cache` on index.html and SPA
fallback HTML; clear refresh guidance with full-document Reload for initial
sheet DecodeErrors; preserve strict decoders and generic Retry behavior. No
DTO/persistence change, no repairs, no user-data migration. Hashed assets keep
the existing cache behavior. All implementation tests use isolated managed
servers, never the playtest server on 9657 or any default-port instance.

## Implementation

- Ada static-serving branches add the literal no-cache response header for GET
  and HEAD HTML shell responses only.
- The shared error card accepts an explicit reload callback. Character and crew
  initial DecodeErrors display “This page is out of date — refresh to load the
  latest version” and Reload; transport/server errors retain Retry. Technical
  details stay collapsed and Back to roster remains available.
- Existing strict schema decoding is unchanged. Other response errors do not
  become automatic repairs or retries. The card uses incumbent styling.
- Two pre-existing conformance TypeScript errors in crew-sheet.test.ts were
  exposed by the typecheck gate. Narrow existing settingValue-based access and
  type annotations correct them without changing test expectations.

## Red-first evidence

Frontend command: `npm test -- --run src/pages/stale-client.test.ts`.
Before the UI change: **4 failed / 4 passed**, both schema-mismatch and invalid
JSON cases on both sheet types failed solely on the old generic headline.
Generic transport/server recovery cases passed. Session output: artifact 15305.

Header command: managed-run with `--build`, the new
`suites/contract/stale-client-headers.test.ts`, and a temporary self-owned static
fixture. Before the Ada change: **10 failed / 6 passed**; all HTML GET/HEAD cases
failed because cache-control was null, and all non-HTML controls passed.
Owned managed port 46021; temporary fixture removed after red. The permanent
regression discovers the actual hashed bundle from normal built index.html.

## Acceptance evidence

- Frontend: **1084/1084**, tsc and Vite production build passed.
- Managed Ada two-cycle: **734 passed / 1 skipped per cycle**; the skipped
  managed transaction crash/restart case is not enabled by the ordinary run.
- Tooling: **240/240**. Conformance tsc passed after the two narrow type fixes.
- Managed browser journeys: **6/6**.
- Chromium evidence: **18/18** states, character and crew, three real viewports
  by light/dark/high-contrast light. Every state verified a real document Reload
  and successful sheet recovery after removing the incompatible-response
  injection. Numeric containment and screenshots are in
  `docs/public/evidence/stale-client-01/`.
- Impeccable mechanical detector: no findings on the three changed UI modules.

Documentation: `docs/pages/frontend/stale-client.mdx`, linked from the sidebar.
Independent review, mutation results and final validation are recorded in the
metrics and verdict files when those gates finish; this card does not claim
release approval before those results exist.
