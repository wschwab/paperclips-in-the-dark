---
id: REVIEW-01
title: Calibrated independent review
deps: []
track: contract
outputs:
  - agent-docs/review01-calibrated-review.md
acceptance:
  - planted P0/P1 defect reproduced and identified with mechanism + outcome (CALIBRATION: PASS) before the clean review; clean candidate reviewed only after the isolated workspace is discarded and candidate hashes verified
---

# REVIEW-01 — calibrated independent review

**Wave 9.** Finding AR-006. Depends on all implementation and documentation cards (work-spec §17): isolated disposable workspace, one realistic planted defect from the P0/P1 mutant catalog, reviewer given spec/source/commands/numeric browser evidence/screenshots but not the defect location.
**Status:** DONE — 9879bf76 calibration PASS + clean PASS (per `tasks/metrics/contract/REVIEW-01.json`)
**Metrics:** `tasks/metrics/contract/REVIEW-01.json`

## Log

- 9879 cycle calibration (session 01a068e6): planted P0 FV-023 transport-classification regression located with mechanism + failing test — CALIBRATION: PASS.
- Quota abort (session 01a068f0) → clean retry FAIL (3 blockers, corrected: traceability AR-006 refresh, canonical VET reruns, provenance fix) → final FAIL (2 P0 ordering blockers; downstream reset to BLOCKED/PENDING) → sequence clean review PASS (Sol/xhigh session 01a06ba3, CLEAN-CANDIDATE: PASS, `/tmp/review01-9879-clean-sequence-verdict-full.md`), order intact (REVIEW-02/VET-01 stay BLOCKED/PENDING).
- History preserved: 10bb87fb cycle blocked on 5 corrective cards. Next required after the sequence PASS: fresh REVIEW-02, then fresh VET-01; release NOT PASS until then. Recorded in `agent-docs/review01-calibrated-review.md`.
- 2026-09-04 (finding-6 backfill): this tracked card created to mirror the canonical metrics record per work-spec §3.3 (`## Log`) and §5. Session IDs cited are tracked evidence from the metrics record, not new claims; no sessions/results invented.
- 2026-09-06 (user-authorized routing change): ALL future reviews previously delegated to GPT Sol move to GPT 6 Astra at explicit OMP route `openai-codex/gpt-6-astra`, thinking xhigh (listed xhigh/max; no mapping needed). Verified by discovery (`omp models` openai-codex table) + live probe: `omp -p --model openai-codex/gpt-6-astra --no-lsp --thinking=xhigh --max-time=5m --approval-mode yolo` with detached stdin → exit 0, exact `ASTRA-OMP-PROBE-OK`. Citable artifacts: `/tmp/astra-omp-probe-command.txt` (exact command), `/tmp/astra-omp-probe-run.log` (stdout), `/tmp/astra-omp-probe-err.log` (stderr), `/tmp/astra-omp-probe-db.txt` (discovery table + agent.db `model_usage` latest row `openai-codex/gpt-6-astra`). Native `codex exec` prints provider `openai` (internal Codex label) — NOT equated by assumption; the working command for all future Astra reviews is the explicit OMP route above. (Earlier probes `01a0777a`/`01a07787` via native codex left no raw logs — superseded.) Historical Sol sessions/results preserved verbatim above and in metrics; only prospective routing changes. No review started under Astra yet. Luna gate untouched.
