---
id: CREW-WORLD-02
title: Fold approved Doskvol setting data into the crew sheet and launch screen
track: frontend + data + docs
deps:
  - CREW-WORLD-01
outputs:
  - data/world/doskvol.json
  - frontend/src/pages/crew-sections/doskvol-world.ts
  - frontend/src/pages/crew-sections/contacts.ts
  - frontend/src/pages/about-licence.ts
  - frontend/src/pages/roster.ts
  - frontend/src/styles/components.css
  - docs/pages/contract/crew-world-sources.mdx
  - docs/pages/contract/setting-content-register.mdx
  - docs/pages/backlog/setting-content-open-items.mdx
  - README.md
  - tasks/metrics/frontend/CREW-WORLD-02.json
---

# CREW-WORLD-02 — human-approved Doskvol fold-back

## Decision

The human approved folding the licensed-scope Doskvol content back into the app for
a free fan project. Conditions: no large copied book text, the licence and the SRD
are linked, noteworthy locations only if sourceable (otherwise empty, and say so).
This is not an SRD licence grant. The licensing page excludes setting material from
CC-BY. See `docs/pages/contract/crew-world-sources.mdx`.

## Scope

1. `data/world/doskvol.json`: 49 faction rows and 11 district rows from the official
   Factions of Doskvol sheet, plus app-written district summaries and empty
   locations. The 49/11 split is provisional.
2. Crew sheet: a stock faction picker that fills the manual entry (it does not save
   a record), and a Doskvol districts disclosure.
3. Launch screen: an About & licence aside with attribution, the CC-BY 3.0 statement,
   and links to the licence and the publisher.
4. Docs: register, sources, open-items backlog page, README provenance.

## Acceptance evidence

- Red first: `frontend/src/pages/crew-world-02.test.ts` and `about-licence.test.ts`
  failed before implementation (7 and 1 failing).
- Vitest 979/979 across 37 files; `tsc --noEmit` 0; `npm run build` 0.
- Browser journeys 6/6 PASS (`conformance` `npm run test:browser`).
- Chromium 9/9: 390/768/1440 × light/dark/high contrast, for the crew sheet and the
  launch screen. Zero horizontal overflow, zero page errors. Record:
  `tasks/metrics/frontend/CREW-WORLD-02-chromium.log` (check output, 9/9 pass).

## Defect caught in this card

The aside used an explicit `grid-row: 3`. That overlapped the crews block below
840px, because the single-column layout placed it above the crews block. Fixed by
moving the explicit row into a `min-width: 840px` rule, so the single-column flow
places the aside last. The Chromium check caught it before commit.

## Mutation and review

- Mutation campaign 28/28: P0 19/19, P1 9/9 (`tasks/metrics/contract/CREW-WORLD-02-mutation-combined.log`). Pins refreshed in `c2f6116c` only where they matched the pre-change bytes at `d4a2ac4f`.
- Sol 6.1 xhigh review pinned to `d4a2ac4f7a82..c2f6116c`: see the verdict record and metrics.
