---
id: BROWSER-01
title: Repository-owned managed Chromium runner
deps:
  - SAFE-02
  - GATE-01
track: contract
outputs:
  - conformance/scripts/browser-suite.mjs
  - conformance/suites-browser/roster-smoke.journey.mjs
  - conformance/package.json
acceptance:
  - cd conformance && npm run test:browser exits 0 with stable artifacts
  - server-startup, strict-decode, horizontal-overflow, missing-checkpoint drills each exit non-zero naming the cause
  - no default-data change
---

# BROWSER-01 — managed Chromium runner

**Status:** complete (smoke journey; six real journeys are BROWSER-02)
**Revision:** working copy at completion

## Log

- 2026-08-24: delivered `npm run test:browser`. Parent mode ensures frontend
  dist freshness then reuses `managed-browser-smoke.mjs` as the sole launch
  boundary; child mode drives real headless Chromium (playwright-core +
  executable resolution: env override → ms-playwright cache → /usr/bin/chromium;
  no download path). Artifacts survive outside the launcher's cleaned run dir:
  journey-results.json, console-network-errors.json, screenshots.
- 2026-08-24: enforced failure modes — unmet/undeclared/duplicate/non-numeric
  checkpoints, console/page errors, request allowlist violations, UI decode
  notices, horizontal overflow probed per navigation and at journey end,
  launcher success-line assertion (no leaked data).
- 2026-08-24: acceptance — green run exit 0 (roster-smoke PASS, 3 row links,
  0 console errors); all four defect drills exit non-zero with named causes and
  byte-exact restores. Drill-b finding: seeding a decoder-invalid fixture CANNOT
  produce a whole-page decode failure because locked decision E11 degrades such
  entities to unreadable rows inside an always-contract-shaped roster response;
  the decode detector was proven via journey-scoped route interception feeding a
  genuinely malformed roster payload. Spec question recorded for BROWSER-02.
- 2026-08-24: orchestrator independently ran `npm run test:browser` — exit 0,
  launcher cleanup line present. data/ md5 manifest unchanged.

## Worker

Implemented by opencode-go/ox-alpha-free; report at /tmp/browser01-report.md.
