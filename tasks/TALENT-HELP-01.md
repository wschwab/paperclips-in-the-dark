---
id: TALENT-HELP-01
title: Readable Talent action descriptions during creation and play
deps: []
track: frontend
outputs:
  - frontend/src/pages/character-create.ts
  - frontend/src/pages/character-sections/talents.ts
  - docs/pages/frontend/talent-help.mdx
acceptance:
  - Frontend vitest, TypeScript and production build pass
  - Browser conformance journeys pass on isolated managed server
  - Real Chromium evidence at three viewport sizes in light, dark and high contrast
  - Independent openai-codex/gpt-6.1-sol xhigh review returns PASS
  - Metrics, traceability and audit reconciliation validators pass
  - Documentation build passes
---

# TALENT-HELP-01

## Mapping and scope

The user's corrected meaning is **action dots**, labelled Talents by the UI:
Hunt, Study, Survey, Tinker, Finesse, Prowl, Skirmish, Wreck, Attune, Command,
Consort and Sway. The contract's `talent.attributes[].actions[]` agrees;
`playbook.name` is separate and already has picker blurbs. No playbook help was
changed.

Existing `data/games/*.json` already supplies a short description per action in
`Attributes[].Actions[].ShortDescription`, including translated and S&V editions.
Reuse that data rather than add a second glossary. Data, backend and contract are
intentionally unchanged, so the conditional Ada two-cycle gate does not apply.
No files under `campaign-data/` or `blades-in-the-sheets/` were edited.

## Implementation

- Shared settings lookup replaces the sheet-local action-summary lookup.
- Creation and sheet rows show their own edition's summary as a visible paragraph.
- Dot interactions, locked defaults, allocation budgets and existing tooltip stay
  unchanged; absent/blank descriptions produce no fabricated help.
- Data guard tests cover summaries for every action in all four shipped editions.
- Repeatable Chromium probe uses the existing managed launcher and a free port,
  never the playtesting server. Screenshots and geometry live under
  `docs/public/evidence/talent-help-01/`.

## Red / green evidence

Focused tests failed first: creation and sheet expected their data-sourced help,
but both received undefined. After implementation both passed (2 passed,
175 skipped). Initial complete frontend gate: 1045 tests across 43 files,
TypeScript and production build passed. Browser conformance: 6/6 journeys passed
on managed port 43379; owned server PID 2642851 was cleaned up by the launcher.
Talent probe: 18/18 surface/viewport/theme cases passed on managed port 35645;
owned server PID 2650584 was cleaned up. No horizontal overflow or page errors.

## Final acceptance

- Full frontend vitest: **1049/1049 tests, 44/44 files passed**.
- TypeScript and production build passed; data guards **4/4** passed.
- Browser conformance **6/6 journeys** and supplied Chromium matrix **18/18** passed.
- Metrics **192 files, 0 errors**; traceability **231/231** checks; audit
  reconciliation **0 errors, 0 warnings**.
- Docs build passed with **169 files generated**. An initial evidence-JSON link
  was rejected by the docs link checker; using the existing HTML evidence-link
  pattern fixed it. Metrics initially required a scaffolding LOC note; corrected.
- Independent **GPT 6.1 Sol / openai-codex / xhigh: PASS**, pinned to
  `112b9f792afc98b4937136c27f67e52c2023cea5`, no findings. Reviewer inspected all
  18 supplied screenshots, repeated the 18-case matrix, checked scrolling past
  the fixed dock, touch/keyboard interactions, persistence and missing/blank
  descriptions; independently ran **181/181 focused tests** and frontend/docs
  builds. Verdict: `tasks/metrics/frontend/TALENT-HELP-01-sol-verdict.txt`.
- Final follow-up contains only this acceptance record, task metrics, and the
  independent verdict; the reviewed implementation and screenshots are unchanged.
