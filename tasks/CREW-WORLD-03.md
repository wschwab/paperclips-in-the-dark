---
id: CREW-WORLD-03
title: Complete the twelve Doskvol districts with original descriptions and confirmed locations
track: frontend + data + docs
deps:
  - CREW-WORLD-02
outputs:
  - data/world/doskvol.json
  - frontend/src/pages/crew-sections/doskvol-world.ts
  - frontend/src/pages/crew-world-03.test.ts
  - frontend/src/pages/crew-world-02.test.ts
  - docs/pages/contract/setting-content-register.mdx
  - docs/pages/contract/crew-world-sources.mdx
  - docs/pages/backlog/setting-content-open-items.mdx
  - docs/public/evidence/crew-world-03/
  - tasks/metrics/frontend/CREW-WORLD-03.json
---

# CREW-WORLD-03 — twelve districts, meaningful summaries, canonical places

## Scope and decisions

- Correct the CREW-WORLD-02 baseline (`62e31b07`): **49 factions / 11 districts → 48 factions / 12 districts**. A fresh rendering of the official Factions sheet v8.2 confirms Whitecrown in the twelve-row Citizenry block, at **Tier V, strong hold**. Move it into the districts and remove the now-empty Citizenry stock-picker group. Saved crews' manually entered factions are not changed.
- Include exactly the canonical district set: Barrowcleft, Brightstone, Charhollow, Charterhall, Coalridge, Crow's Foot, The Docks, Dunslough, Nightmarket, Silkshore, Six Towers and Whitecrown.
- Replace every tier/hold template with a short original summary describing the district's canonical character. All summaries remain explicitly `summaryAuthor: "app"`.
- Add **27 confirmed locations**, two or three per district. Locations are structured records containing a canonical `name`, original `description`, `descriptionAuthor: "app"` and publication `sources`. The disclosure renders the name prominently, followed by its description, and states that descriptions are app-written.
- Verify names and facts against the official Player's Kit vice list/city map and the core-book district gazetteer, printed pp. 256–279. The [setting-content register](../docs/pages/contract/setting-content-register.mdx) lists every included place and its reference. Publisher links identify the source publication; they do not imply that its product page reproduces the gazetteer.
- Use the book's **Dunvil Labor Camp** spelling and **Red Sash Sword Academy** name rather than fan-map variants. A supplementary fan reference mixes in alterations; uncertain or fan-created names and claims were omitted.
- Keep the existing attribution and licence decision unchanged. These are modest, human-approved fan-project setting references, not a new SRD/CC-BY claim. No book paragraph, map or source PDF is shipped.
- No API, backend, game-setting, faction-status or starting-relationship change is needed. Existing manual faction editing remains unchanged.

## Red → green

The new `frontend/src/pages/crew-world-03.test.ts` failed **4/4** against the shipped dataset before implementation:

1. The canonical district set lacked Whitecrown, which appeared among factions.
2. Eleven summaries collapsed to six unique tier/hold templates instead of twelve meaningful descriptions.
3. Every noteworthy-location list was empty.
4. The disclosure rendered eleven districts and no named, described locations.

Evidence: `tasks/metrics/frontend/CREW-WORLD-03-red.log`.

After implementation the new four checks and the six existing CREW-WORLD-02 checks passed **10/10**. The existing tests were updated from 49/11 to 48/12, from empty lists to named descriptions, and from a Tier-IV ceiling to integer district tiers (Whitecrown is V). No frozen conformance assertion was changed.

## Acceptance evidence

| Gate | Observed result | Evidence under `tasks/metrics/frontend/` |
| --- | --- | --- |
| Focused district tests | 10/10 | `CREW-WORLD-03-focused.log` |
| Full Vitest | **983/983**, 38 files | `CREW-WORLD-03-vitest.log` |
| `npx tsc --noEmit` | exit 0 | `CREW-WORLD-03-tsc.log` |
| Production build | exit 0; 686 modules | `CREW-WORLD-03-build.log` |
| Canonical managed browser suite | **6/6** | `CREW-WORLD-03-browser-journeys.log` |
| Real Chromium matrix | **9/9** | `CREW-WORLD-03-chromium.log`, `CREW-WORLD-03-chromium-managed.log` |
| Impeccable detector | exit 0, no findings (`[]`) | `CREW-WORLD-03-detector.log` |
| Metrics validator | **188 files**, 0 errors | `CREW-WORLD-03-metrics.log` |
| Finding traceability | **231/231** | `CREW-WORLD-03-traceability.log` |
| Audit reconciliation | **17/17**, 0 errors / warnings | `CREW-WORLD-03-reconcile.log` |
| Vocs production build | exit 0; **161 files generated** | `CREW-WORLD-03-vocs.log` |

The Chromium matrix uses **1440×1000, 768×1024 and 390×844**, each in light, dark and high-contrast light. Every row checks all twelve districts, all 27 locations, 49 stock-picker options (48 factions plus the placeholder), no Whitecrown stock faction, authorship text, and Enter/Space/click disclosure operation. Document, disclosure, district and location horizontal overflow are all **0px**; no text exceeds the disclosure or viewport horizontally, no district is vertically clipped, and there are **0 browser errors**. It ran against managed temporary data, not campaign-data.

All nine viewport PNGs were inspected visually: long names and prose wrap legibly and Whitecrown's three places remain intact. Long content uses normal page scrolling. Eighteen PNGs (one viewport and one complete disclosure for each matrix row) live in `docs/public/evidence/crew-world-03/`; the register links them all.

Capture command:

```sh
node conformance/scripts/managed-browser-smoke.mjs --seed-defaults -- node /tmp/pitd-crew-world-03-chromium.mjs
```

The probe and downloaded research/rendering scratch files are temporary and are not part of the delivered code.

## Mutation scope

The canonical `conformance/fixtures/mutation-catalog.json` names eighteen unique pinned source paths. None is changed by this card: the world JSON, its disclosure renderer, focused tests and docs are not pinned targets. **No pin refresh or mutation campaign is required by the card's “28/28 if pins change” condition.** No new 28/28 result is claimed.

## Review and remaining scope

**Sol 6.1 xhigh: PASS — no blocking findings.** The independent review ran after the implementation was pushed, pinned to immutable revision `52c532e51ee853cc3cea38b660eeadf6286025d2` against `62e31b07115c`. The provider response confirms `openai-codex/gpt-6.1-sol`; the invocation explicitly selects `xhigh`. The reviewer inspected all eighteen PNGs and committed evidence, requested no corrections, changed no files and reran no checks.

- Verdict: `tasks/metrics/frontend/CREW-WORLD-03-sol-6.1-verdict.txt`.
- Exact invocation: `tasks/metrics/frontend/CREW-WORLD-03-sol-6.1-invocation.log`.
- Compact observed provider/session/final-verdict proof: `tasks/metrics/frontend/CREW-WORLD-03-sol-6.1-proof.jsonl`.
- The oversized raw transport (duplicated tool payloads, image data and opaque reasoning signatures) is not shipped. Temporary research, rendering and probe files were removed.

## Delivery

The explicit-path implementation commit is `52c532e51ee853cc3cea38b660eeadf6286025d2`. Before review, `main` was moved forward from `62e31b07115c` and pushed to both mirrors:

- `jj git push --remote origin`: reported `main` moving `62e31b07115c → 52c532e51ee8`, exit 0.
- Radicle push: `62e31b07..52c532e5 main -> main`, canonical reference updated to `52c532e51ee853cc3cea38b660eeadf6286025d2`, synced with one seed, exit 0.
- `jj git fetch --remote rad`: nothing changed; its ignored tag-refspec warning is non-blocking.

The subsequent records-only commit closes this card with the actual PASS and provider proof; application/data bytes remain exactly those reviewed.

There is no unresolved canonical-name question for the included 27 places. Additional locations are deliberately not guessed. The separate existing licence-confirmation, playbook-Rolodex and historical test/log questions remain in `docs/pages/backlog/setting-content-open-items.mdx`.

Final review-record metrics were revalidated: **188 files, 0 errors** (`tasks/metrics/frontend/CREW-WORLD-03-metrics-final.log`). No application or data bytes changed after the reviewed implementation.
