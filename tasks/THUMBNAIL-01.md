---
id: THUMBNAIL-01
title: Human-supplied paperclip thumbnail and social imagery
track: frontend
outputs:
  - frontend/index.html
  - frontend/public/site.webmanifest
  - frontend/public/favicon-32.png
  - frontend/public/apple-touch-icon.png
  - frontend/public/icon-192.png
  - frontend/public/icon-512.png
  - frontend/public/og-image.jpg
  - frontend/src/head.test.ts
  - docs/pages/frontend/thumbnail.mdx
  - docs/public/mockups/thumbnail-01/chromium-icons.png
  - tasks/metrics/frontend/THUMBNAIL-01.json
acceptance:
  - cd frontend && npm test -- --run
  - cd frontend && node_modules/.bin/tsc --noEmit
  - cd frontend && npm run build
  - cd conformance && npm run test:browser
---

# THUMBNAIL-01

The inherited uncommitted head test is retained; PNG signature/dimension checks
are added. Initial RED: 5 failed/1 passed (6). Final complete frontend vitest:
**933/933**, 32 files, including the strengthened 7-case head suite. Standalone
TypeScript passes, production build passes, and Chromium journeys pass **6/6**.

Square source crop: **[390,10,1290,910)**, 900×900, center840/460. Full clip with
padding; Lanczos and light sharpening, optimized256-color PNG. Original Downloads
image untouched. The 32px asset was inspected directly and in real Chromium;
the outline remains recognizable without a separate brightness adjustment.
Social source crop [0,0,1672,878), resize1200×630, progressive JPEG quality88,
no chroma subsampling; nearly the complete original scene remains.

Sizes: favicon32 **1904 bytes**, apple180 **28635**, icon192 **32319**, icon512
**187859**, socialJPEG **148631**. The manifest references the new PNG icons.
SVG removed because browser preference could override the new photographic icon.
Root-relative Open Graph/Twitter URLs are intentional without canonical origin;
external crawlers may need absolute URLs once deployment chooses one.

All five image URLs and manifest return **HTTP200 from built dist**, verified
in Chromium. Captured evidence: docs/public/mockups/thumbnail-01/chromium-icons.png.
This shows native32-CSS-pixel icon rendering and a title/icon preview inside the
page, not OS browser chrome. Actual built document title and favicon link were
verified separately. HTTP evidence and full gate logs are under
 tasks/metrics/frontend/THUMBNAIL-01-*.log.

Only assets, head, head regression, documentation and records changed. None is a
mutation target (catalog inspected), so no pins need refreshing and no new28/28
campaign is required by this card's conditional acceptance. Backend and concurrent
styles/playbook-description work are untouched.

User explicitly authorizes scoped jj commit, main bookmark, origin and Radicle
push plus Radicle fetch. Push outputs are reported directly from the commands;
no unobserved push or force-push is claimed.
