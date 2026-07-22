---
id: F2a
title: "First playable UI slice: campaign roster"
deps: [F1, A2]
track: frontend
outputs:
  - tested roster API client
  - /roster page with loading, error, empty, and populated states
  - roster navigation in the shared shell
acceptance:
  - "a focused frontend test fails before getRoster exists and passes afterward"
  - "GET /api/campaign/roster is decoded through the existing Roster schema"
  - "/roster renders character and crew summaries with useful links or stable IDs"
  - "loading, API/decode error, empty, and populated states are explicit"
  - "npm test -- --run and npm run build pass"
  - "the built /roster route is served by backend-ada and loads its roster"
---

This is the first bounded slice of F2, not a replacement for the parent task.
Do not add creation, editing, history, or stale-revision behavior in this slice.

## Log

- 2026-07-22: 30-minute Claude subscription wave. Haiku 4.5/high implements
  the red-green slice; Sonnet 5/medium is reserved for a short diff review.
- Red: `npm test -- --run src/api/client.test.ts` failed because `getRoster`
  was not exported. Green: 3 focused client tests and 21 full frontend tests.
- Review: removed links to not-yet-implemented detail routes and made async
  roster state changes an accessible live region.
- Live acceptance found a second red: Ada returned 404 for `/roster` while
  `/` and `/api/campaign/roster` returned 200. `test-spa-routes.sh` now guards
  the deep-link fallback and missing-asset 404 behavior; it passes after the
  minimal static-serving fix.
