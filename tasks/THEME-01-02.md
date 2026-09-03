---
id: THEME-01-02
title: THEME-01 residual roster-span contrast fix
deps:
  - THEME-01
track: frontend
outputs:
  - frontend/src/styles/components.css
acceptance:
  - roster character-row span text meets 4.5:1 in light and Hi-C; frontend unit suite + build + browser suite green
---

# THEME-01-02 — THEME-01 residual roster-span contrast fix

**Wave 9 follow-up.** Residual of THEME-01 (UX-015), found after the original fix.
**Status:** complete — see metrics notes (per `tasks/metrics/frontend/THEME-01-02.json`)
**Metrics:** `tasks/metrics/frontend/THEME-01-02.json` (implementation `hic-roster-fast` task subagent)

## Log

- 2026-09-01: red-first — the THEME-01 fix added `--band-text-muted` and covered character/crew header identity lines (kicker, alias, crew-type) inside torn-foot plates, but the torn-foot selector at `frontend/src/styles/components.css:1255` omitted `.roster-characters.torn-foot span`. The roster character row renders `<strong>Name</strong><span> alias • playbook</span>`; the span fell through to `.character-list a span { color: var(--text-muted) }`, which in light+HiC resolves to `--ink` `#1a1a1a` on the `#1a1a1a` band (1:1).
- 2026-09-01: fixed by adding `.roster-characters.torn-foot span` to a dedicated `--band-text-muted` block (secondary span `#d6cdb8`, primary strong `--band-text` `#efe7d6`).
- 2026-09-01: green — self-verifying: frontend unit suite 783/783 + `npm run build` + managed-Chromium browser suite (6/6 journeys, 0 console errors).
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. No new implementation; no sessions/results invented.
