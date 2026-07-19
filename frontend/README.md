# frontend/

Static Vite + TypeScript + Effect client for Paperclips in the Dark.
Talks **only** to relative `/api/*` paths (same-origin with the backend;
Vite dev proxies `/api` → `http://localhost:9657`).

## Commands

```bash
npm ci
npm test -- --run          # decoder tests against conformance/fixtures
npm run build              # tsc --noEmit && vite build → dist/
npm run dev                # http://localhost:5173  (needs backend or stub on :9657)
```

## Layout

```
src/
  api/client.ts          Effect HTTP helpers (relative /api/*)
  lib/dom.ts             plain-DOM helpers (el, setChildren)
  pages/health.ts        health-check page
  schema/                effect/Schema decoders mirroring contract/schemas/
  main.ts
```

Framework decision: plain DOM — see `docs/pages/frontend/f0-framework-decision.mdx`.
