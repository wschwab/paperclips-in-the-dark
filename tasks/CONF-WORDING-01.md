---
id: CONF-WORDING-01
title: Update five frozen browser wording expectations for scoundrel terminology
deps:
  - BROWSER-02
  - UI-CREATE-01
track: contract
outputs:
  - conformance/suites-browser/character-create-edit.journey.mjs
  - conformance/suites-browser/lifecycle.journey.mjs
  - conformance/suites-browser/checkpoints/roster-recovery.mjs
acceptance:
  - Original frozen UI assertions fail against renamed UI before expectation changes
  - Only five explicitly authorized expected strings change; selectors, flow and every other assertion stay byte-identical
  - Six BROWSER-02 journeys pass after expected wording updates
---

# CONF-WORDING-01 — dedicated UI wording conformance change

**Status:** DONE
**Metrics:** `tasks/metrics/contract/CONF-WORDING-01.json`

## Authorization and exact scope

On 2026-10-05 the human requested scoundrel wording throughout visible UI and explicitly authorized this separate conformance-change card for the five frozen text expectations reported by UI-CREATE-01. API/backend/routes/code identifiers/DTO fields stay unchanged. No contract schema or HTTP status changes.

| Frozen assertion (pre-change line) | Before | After |
| --- | --- | --- |
| `conformance/suites-browser/character-create-edit.journey.mjs:93` | `Open character sheet` | `Open scoundrel sheet` |
| `conformance/suites-browser/lifecycle.journey.mjs:140` | `This character is out of action` | `This scoundrel is out of action` |
| `conformance/suites-browser/lifecycle.journey.mjs:153` | `This character is out of action` | `This scoundrel is out of action` |
| `conformance/suites-browser/checkpoints/roster-recovery.mjs:137` | `Repairable character` | `Repairable scoundrel` |
| `conformance/suites-browser/checkpoints/roster-recovery.mjs:145` | `Unreadable character` | `Unreadable scoundrel` |

No other frozen file asserting character UI text has been authorized. Report any newly found assertion before touching it. Selectors, routes, flow, comments, and all other assertions in these frozen files must remain byte-identical.

## Log

- 2026-10-05: Read original frozen assertions and reported exact file/line conflicts before editing. Human granted five-string-only scope via dedicated card.
- Original frozen browser suite against renamed UI: three journeys failed (character-create-edit, lifecycle, roster-recovery), three passed. Persisted `conformance-wording-red.log` and the complete `conformance-wording-red/` artifacts before editing expected strings.
- Changed exactly the five authorized strings. `frozen-wording-integrity.json` records reverse-replacement SHA-256 reconstruction matching each original baseline; every other byte in all three files is unchanged.
- Green: six BROWSER-02 journeys passed against real Ada/Chromium using managed isolated data. Evidence: `conformance-wording-green.log`, `conformance-wording-green/`. Combined independent Luna review and closing gates remain pending.
- Final combined Luna xhigh review explicitly **VERDICT: PASS** after inspecting the five authorized updates and reconstructed hashes, independently exercising real browser paths, and visually inspecting screenshots. Evidence: `luna-review-final-raw.txt`, `luna-final-independent/`.
- Closing gates after review: browser **6/6 PASS**, frontend **806/806 PASS**, build PASS; metrics **163 files / 0 errors**, traceability **231/231**, strict reconciliation **PASS / 0 errors / 0 warnings**. All logs are persisted in the shared UI-CREATE-01 evidence directory.
