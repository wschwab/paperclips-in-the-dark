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
  components/            sheet furniture (action dots, stress, clocks, …)
  lib/dom.ts             plain-DOM helpers (el, setChildren)
  lib/theme.ts           light/dark/auto + high-contrast controller
  pages/health.ts        health-check page (F0)
  pages/styleguide.ts    /styleguide component library (F1)
  pages/shell.ts         app bar + nav chrome
  schema/                effect/Schema decoders mirroring contract/schemas/
  styles/                fonts.css · theme.css · base.css · components.css
  main.ts                client router
public/fonts/            self-hosted OFL/Apache woff2 + licenses
```

Framework decision: plain DOM — see `docs/pages/frontend/f0-framework-decision.mdx`.
Style guide: `docs/pages/frontend/f1-styleguide.mdx`.

## Routes

| Path | Page |
|---|---|
| `/` | Health check (F0) |
| `/styleguide` | Component library (F1) — build sheets against this |
