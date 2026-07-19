# Task F1 — style guide

You are GLM 5.2, implementing task F1 of paperclips-in-the-dark.

Read first: PAPERCLIPS.md §12 (the aesthetic section is your spec — palette,
type stack, texture, sheet furniture, accessibility), tasks/F1-styleguide.md
(acceptance), frontend/ as F0 left it (Vite + TS + Effect, plain-DOM
decision documented in docs/pages/frontend/f0-framework-decision.mdx).

Build in frontend/ only:
- A /styleguide route rendering EVERY component before any sheet page
  exists: action dots, stress track (heavy boxes), trauma stamps, harm
  table, SVG clock component (4/6/8 segments), inked checkboxes, palette
  and type specimens.
- Fonts: League Gothic, Oswald, Alegreya Sans, Alegreya, Special Elite,
  IM Fell English — ALL self-hosted under frontend/public/fonts/ (download
  OFL files from Google Fonts/github), subset latin+latin-ext (+cyrillic
  for Oswald/Alegreya Sans), every face declared with system fallback.
  NEVER hotlink; no commercial faces (no Kirsty).
- Palette per §12: ink #1a1a1a, paper #e8e0d0, blood #a02c2c; dark mode =
  lamplit (#141210 ground, paper-toned text). Prefers-color-scheme +
  manual toggle.
- Accessibility: visible focus, prefers-reduced-motion respected,
  high-contrast theme variant.
- Keep it framework-free per F0's decision. CSS custom properties for the
  theme system. Components as small TS modules the sheets (F2) will import.

Rules: touch ONLY frontend/ and docs/pages/frontend/. No git/jj. Do not
break the existing health page, decoders, or tests: `npm test -- --run`
and `npm run build` must stay green.

Acceptance (orchestrator-run): build + existing tests green; /styleguide
renders all listed components in dev server; fonts served locally (no
external requests); dark/high-contrast variants and focus states present
(I will inspect in a browser).

When done print: component inventory, font files + licenses, how to view.
