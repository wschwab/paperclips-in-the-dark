---
id: REVIEW-02
title: Final Luna browser gate
deps:
  - REVIEW-01
track: contract
outputs:
  - agent-docs/test-audit/browser-evidence/9879bf76-luna-ordered/review02-luna-ordered-verdict.md
acceptance:
  - exactly one explicit outcome line (VERDICT: PASS / VERDICT: FAIL); every FAIL finding gets its own corrective card, red-green fix, affected-gate reruns, repeat Luna review until PASS
---

# REVIEW-02 — final Luna browser gate

**Wave 9.** Finding AR-006. GPT 5.6 Luna via openai-codex at xhigh reasoning effort, harness inspecting source, numeric evidence, screenshots, independently driving the live browser path. Prompt persisted first.
**Status:** DONE — Wave 10 `bc63af5f0cdb30391b7e86c31333d6041f825273`, 2026-10-05, `openai-codex/gpt-5.6-luna` xhigh, `VERDICT: PASS`. Earlier gates are historical.
**Metrics:** `tasks/metrics/contract/REVIEW-02.json`

## Log
- 2026-10-05 ordered Wave 10 correctness review after accepted REVIEW-01: blind disposable jj workspace `/tmp/pitd-review02-bc63af5f`, exact candidate parent independently verified; `openai-codex/gpt-5.6-luna`, thinking xhigh, no-session, stdin `/dev/null`. Exit 0, 494.60 seconds. Raw output: `agent-docs/test-audit/browser-evidence/bc63af5f-luna-wave10/review02-luna-raw-output.txt`; verbatim `VERDICT: PASS`; no FAIL findings.
- Baseline run `2026-10-05T12-01-59-909Z-ead6b2a6` archived with checksums under `bc63af5f-luna-wave10/baseline/`: 6/6 journeys, 77 screenshots, 45 matrix JSONs. Luna inspected source/numeric evidence/screenshots and independently ran fresh Chromium `2026-10-05T12-04-18-542Z-b9538262`: 6/6 journeys, 83/83 checkpoints, 77 screenshots, 45/45 matrix containment/focusVisible across roster 9 / character-detail 27 / crew-detail 9, viewports 1440×1000 / 768×1024 / 390×844, light/dark/high-contrast. Zero console/page/unexpected-request/decode errors; 13 declared negative HTTP fixtures. Deliberate claims-map internal scroller is contained (clientWidth 308 / scrollWidth 560 / overflowX auto, page 390px).
- Fresh THEME-01 managed run `2026-10-05T12-06-36-369Z-aef073d8`: 25/25 checkpoints, 24 ratios 8.13:1–12.71:1, 12/12 combinations, no unexpected errors/overflow. Focused write-reference-admission suite 11/11. Fresh archive `agent-docs/test-audit/browser-evidence/bc63af5f-luna-wave10/luna-fresh/`: provenance, logs, screenshots/numeric data and 165-file checksum manifest (`2c4b75982a6a882843bb46b7ce4c340598b1c9862462b77ead24010587550fa1`). Next: fresh VET-01; no whole-release PASS claim.

- Ordered final gate on candidate 9879bf76 (session 01a06bad): fresh run exit 0, passed=true, 0 problems, 6/6 journeys (checkpoints 17/8/28/6/10/14); 0 console/page errors, 0 unexpected requests, 0 horizontal overflow; 13 deliberate expected negative-path HTTP fixtures (10×409/1×422/2×500); matrix 45 numeric JSON + 45 screenshots, 45/45 containment + 45/45 Tab focus probes; theme01-fresh PASS (25 checkpoints); decoder unit suite 73/73. Verdict: `agent-docs/test-audit/browser-evidence/9879bf76-luna-ordered/review02-luna-ordered-verdict.md`.
- History preserved: pre-gate session 01a06b5b run retained as diagnostic only (superseded as gate evidence); earlier session 01a057a3 corrected-candidate rerun on 9c837bde superseded. REVIEW-01 DONE (calibration 01a068e6 + sequence clean 01a06ba3) precedes this gate per spec order. Next: fresh VET-01.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. Session IDs cited are tracked evidence from the metrics record, not new claims; no sessions/results invented.
