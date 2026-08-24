---
id: TEST-03
title: Frontend transport and page test surgery
deps:
  - TEST-01
  - TEST-02
  - MUT-01
  - EDGE-02
track: contract
outputs:
  - frontend/src/api/client.test.ts
  - frontend/src/pages/character-detail.test.ts
  - frontend/src/pages/character-create.test.ts
  - frontend/src/pages/crew-create.test.ts
  - agent-docs/test-audit/deletion-log.md
acceptance:
  - cd frontend && npm test -- --run
  - cd frontend && npm run build
  - all frontend ledger decisions enacted with unique signal per retained row
---

# TEST-03 — frontend transport and page test surgery

**Status:** complete (all 8 frontend non-keep ledger rows enacted)
**Revision:** qkptlwzx (working copy; finalized before next card)

## Log

- 2026-08-24: six upgrades — armorSet uncheck now pins the exact armor.set
  wire call; the misplaced no-If-Match clockProgress case moved out of the
  deleteClock describe and renamed; F2m personal edit now drives Edit → save →
  dossier.update wire assertion; F2m stress box asserts computed delta
  (target − current) in the request body; F2m trauma resolve/remove both halves
  are real (the old row passed vacuously — it clicked resolve without selecting
  a trauma); F2n armor toggle replaced fetch-count assertion with exact
  endpoint/body/If-Match checks.
- 2026-08-24: two merges deleted (character-create and crew-create
  "does not re-post a second …" rows). Deletion gate: canonical FV-017 rows
  assert create-POST count stays 1 across two failing update rounds plus
  recovery UI; both canonical rows additionally gained an exactly-one-create-
  POST happy-path kill. Evidence in `agent-docs/test-audit/deletion-log.md`.
- 2026-08-24: acceptance — affected four files 402/402 (= baseline 404 − 2
  duplicates), full suite 16 files/614 tests green, production build clean.
  Orchestrator independently re-ran full suite + build and spot-checked the
  claimed edits by grep.

## Worker

Implemented by opencode-go/ox-alpha-free (omp -p, yolo, max thinking) from a
bounded brief; report at /tmp/test03-report.md. Notable worker finding: change
5's premise was half-wrong — the page's remove path is live; only the test was
vacuous. Fixed by exercising both halves.
