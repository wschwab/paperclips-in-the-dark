---
id: LOADOUT-ATOMIC-01
title: Atomically replace a scoundrel's committed loadout
track: contract
deps:
  - UNKNOWN-OP-01
  - XP-TRACKER-03
outputs:
  - contract/openapi.yaml
  - backend-ada/server/src/pitd_ops.adb
  - backend-ada/server/src/pitd_callback.adb
  - conformance/suites/semantics/loadout-atomic.test.ts
  - conformance/src/endpoint-schema-map.test.ts
  - conformance/suites/parity/capability-parity.test.ts
  - skill/generate-capability-manifest.mjs
  - skill/api-reference/capability-manifest.json
  - skill/api-reference/README.md
  - conformance/generated/contract-coverage.json
  - docs/pages/contract/game-mode-proposal.mdx
  - frontend/src/api/client.ts
  - frontend/src/api/loadout-atomic.test.ts
  - frontend/src/pages/character-detail.ts
  - frontend/src/pages/game-mode.ts
  - frontend/src/pages/game-mode-sheet.test.ts
  - tasks/GAME-MODE-03.md
acceptance:
  - cd conformance && npm run test:ada -- --run
  - cd conformance && npm run test:ada -- --cycles 2 -- --run
  - cd conformance && npm run test:tooling
  - cd conformance && npm run typecheck
  - cd backend-ada/core && XDG_RUNTIME_DIR=/tmp alr exec -- gnatprove -P paperclips_core.gpr --level=2 --checks-as-errors=on
  - cd frontend && npm run test -- --run
  - cd frontend && npx tsc --noEmit
  - cd frontend && npm run build
  - cd conformance && npm run test:mutation
  - cd docs && npm run build
---

# LOADOUT-ATOMIC-01

## Approved interface

`POST /api/characters/{id}/ops/gear.set-loadout`, operation ID
`characterGearSetLoadout`, accepts exactly `{commitment, items}`. Commitment uses
the existing enum; items are a unique array of nonempty owned item names, not
client-supplied item records or bulk. Resolve stored available gear first, then
current-only committed items for legacy compatibility. Preserve available gear.
`none` requires an empty selection, including when an item would have zero bulk.

All checks precede gear mutation. Capacity comes from the existing
`Commitment_Max_Bulk` settings helper; subtracting each fitting stored bulk from
remaining room avoids overflowing an accumulated sum. No new literal game
maximum, HTTP status, code, state field, projection, persistence abstraction or
mode gate. Selection/capacity failures use existing VALIDATION400 with `/items/i`
or `/items` issues; commitment locks retain their existing domain convention.

Success uses existing revision/If-Match, idempotency, snapshots, undo and batch
infrastructure. A complete level/item replacement is one persisted revision and
one history entry. Failed batch members cause no writes. The callback's existing
xp.resolve apply-phase VALIDATION400 mapping also covers this op.

## Red → green: backend

New suite: `conformance/suites/semantics/loadout-atomic.test.ts`.

| ID | Check | Observed red |
|---|---|---|
| LOADOUT-ATOMIC-001 | Complete replacement, one revision/history, authoritative armor, inventory preserved, undo | 400 instead of 200 |
| LOADOUT-ATOMIC-002 | Bad late selection leaves full entity/history unchanged | missing `/items/1` issue |
| LOADOUT-ATOMIC-003 | Overflow against loaded Light limit | missing `/items` issue |
| LOADOUT-ATOMIC-004 | Duplicate, malformed, unsupported-level and extra-field controls | Passed from the start |
| LOADOUT-ATOMIC-005 | Replay old revision with same idempotency key, one write | 400 instead of 200 |
| LOADOUT-ATOMIC-006 | Stale revision and commitment lock | VALIDATION instead of COMMITMENT_LOCKED |
| LOADOUT-ATOMIC-007 | Successful member then failed member rolls back whole batch | false/false instead of true/false |
| LOADOUT-ATOMIC-008 | none/empty clears committed set, keeps ownership | 400 instead of 200 |
| LOADOUT-ATOMIC-009 | Exact Normal settings boundary, lower Light boundary rejects unchanged | 400 instead of 200 |
| LOADOUT-ATOMIC-010 | none rejects selected zero-bulk gear | missing `/items` issue |

Initial eight-case run: **7 failed / 1 passed**, canonical run
`2026-10-14T12-29-01-647Z-1a32e6c6`. Added boundary cases were then exercised
separately before implementation: **2 failed / 8 skipped**, run
`2026-10-14T12-32-06-280Z-cdc1a84b`. No test was weakened to obtain green.
After canonical regeneration and Ada build: **10/10 green**, run
`2026-10-14T12-34-16-191Z-61c40fc1`. SPARK: **246/246 checks proved**.
Full contract tooling: **233/233**, 18 files. Conformance typecheck initially
caught three implicit-any issue callbacks in the new tests; external issues now
use an `unknown` runtime guard instead of a cast. Typecheck then passed, and the
unchanged ten behaviors passed again in run
`2026-10-14T12-45-58-347Z-1b42a6c8`.

Shared record/documentation gates: metrics **184 files / 0 errors**, traceability
**231/231**, reconciliation **17/17**, Vocs **155 files generated**.

## Additive frozen tooling changes

- ENDPOINT-MAP-001 exact POST/GET route count: **113 → 114** for this per-op path;
  the equality assertion remains strict.
- PARITY-HUMAN-003 REQUIRED_HUMAN_OPS gains only
  **`characterGearSetLoadout`**; exact-list equality remains strict.
- Character/operation-result DTO schemas and their conformance mirror remain
  unchanged: this is a request operation, not new stored state.

Canonical Ada validators, API reference, capability manifest and contract
coverage regenerated in place. The capability maps to the existing human
sheet-management surface and the `characterGearSetLoadout` client export.

## Frontend cutover and exercised acceptance

The human released the frontend hold after the fast worker's landing. Confirm
now calls `characterGearSetLoadout` once with the proposed commitment, complete
item-name list and observed revision. The level/removal/addition chain and its
diff sets are removed. Ordinary item declarations retain their existing ops.
The public client parameter retains the contract commitment enum; the existing
`commitmentFor` mapping now returns literal lowercase enum values rather than
an unnecessarily broad string. No decoder or contract constraint was loosened.

Frontend red: **4 failed / 72 skipped** — three missing-client-function cases,
and the old Confirm handler made two writes rather than the required one.
The existing frontend expectation of separate uncommit/commit requests is
replaced by strict one-request path/body/If-Match assertions, not weakened.
An additional rejection test proves the proposal and original committed items
remain, with no fallback writes. Focused client/sheet tests: **77/77**.

- Full canonical Ada two-cycle: **607/607 each**, 72 files; 1,214 executions.
- Full frontend Vitest: **957/957**, 34 files.
- Frontend and conformance TypeScript: pass; production frontend build: pass.
- Canonical managed browser journeys: **6/6**.
- Real Chromium loadout matrix: **9/9** at 1440×1000, 768×1024, 390×844 ×
  Light, Dark, Light/high contrast. **0 horizontal overflows, 0 page errors,
  0 console errors**. Each changed level and item set in exactly one real
  `gear.set-loadout` request, one revision, with correct If-Match; no chain.
  All nine confirmation buttons were reachable inside the real viewport.

Numeric evidence/source hashes and screenshots:
`agent-docs/test-audit/browser-evidence/loadout-atomic-01/measurements.json` and
`{1440,768,390}-{light,dark,hic}.png`. The probe added real Lurk items using
gear.add from served settings, because newly created inventory is empty;
only canonical managed temporary data was used.

## Publication and combined mutation sequencing

Independent Sol 6.1/openai-codex/xhigh review is pinned to the immutable
implementation revision before final acceptance. No PASS is claimed until
the review produces its evidence-backed verdict.

The human assigned this worker the **one combined full mutation campaign**
after these cards are committed and the working copy is empty. Refresh all
stale pins, including M26 for character-detail.ts, then run 28/28 once, commit
pin/record results, and push both mirrors (also carrying fast-worker commits
through `0421dc56`). No campaign has started. The four backend ops pins were
already refreshed to `c58045834d8082a1e918fcdb82c1abaa0b5ee81b3394f68333af5eb7e55ea510`.
No jj abandon, jj restore, force push or campaign-data modification.

Evidence: `tasks/metrics/contract/LOADOUT-ATOMIC-01-*.log`.

## Gap found in Chromium and fixed (takeover verification)

The takeover checked the cutover and the Chromium matrix. The matrix first showed a real gap: with
the level still at the character's current `none`, checking an item and pressing Confirm sent
`commitment: none` with items, and the server refused it (400 VALIDATION). The UI gave only the
generic notice. The fix (`renderLoadoutConfirm`, `frontend/src/pages/character-sections/gameMode.ts`):
Confirm is disabled while the effective level is `none` and items are checked, and a status line says
"Choose Light, Normal or Heavy to carry these items. None carries nothing." Red first:
`game-mode-sheet.test.ts` "LOADOUT-ATOMIC-01 frontend gap" failed (1 failed, 74 skipped) before the change.

## Final gates on the takeover tree

| Gate | Result |
|---|---|
| Ada two-cycle (`npm run test:ada -- --cycles 2 -- --run`) | 607/607 in each cycle (`tasks/metrics/contract/LOADOUT-ATOMIC-01-ada-two-cycle-rerun.log`) |
| tooling (`npm run test:tooling`) | 233/233 |
| conformance typecheck | exit 0 |
| gnatprove (`paperclips_core.gpr --level=2`) | 246 checks proved |
| vitest (frontend) | 958/958, 34 files |
| tsc / build | exit 0 / exit 0 |
| browser journeys (`npm run test:browser`) | 6/6 on the gap-fix build (`tasks/metrics/contract/LOADOUT-ATOMIC-01-browser-final.log`) |
| Chromium 3×3 of the loadout popup (`agent-docs/.../loadout-atomic-01/chromium-3x3-check.mjs`) | 9/9: one `gear.set-loadout` per case, body keys exactly `commitment,items`, If-Match present, 0 chain writes, 200, popup closed, Confirm inside the viewport, 0 page errors |

The probe's first run (before the gap fix) recorded the 400 described above in all nine cases, as the
evidence for the gap.

Sol 6.1 xhigh review: **NOT-RUN**. The takeover ran the review prompt pinned to `844520f5c470`
(`agent-docs/test-audit/browser-evidence/loadout-atomic-01/sol-6.1/takeover/`). The Codex CLI
returned `usage_limit_reached` at once (`stderr.txt`), so no verdict exists. No other reviewer was
substituted. The frontend acceptance review therefore remains open until Codex is available.

## Combined mutation campaign (takeover)

Run once, after the other worker's commits and the pin refresh, from an empty working copy at
`2b36dd64`: `npm run test:mutation` **28/28** (P0 19/19, P1 9/9). Stale pins refreshed first: M26
`frontend/src/pages/character-detail.ts` (`e8f7f30e9b12…`), `frontend/src/api/client.ts`
(`9b0986bcf31c…`), and `backend-ada/server/src/pitd_callback.adb` (`d05ed43da951…`). Log:
`tasks/metrics/contract/LOADOUT-ATOMIC-01-mutation-combined.log`.
