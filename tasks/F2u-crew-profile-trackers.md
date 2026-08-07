---
id: F2u
title: "Crew sheet: Profile + trackers (rep/heat/wanted/hold/tier/coin)"
deps: [F2c, F2y]
track: frontend
outputs:
  - client methods + red-green tests: crewFieldsUpdate, repAdd, heatAdd, wantedAdd, holdSet, tierAdd, crewCoinAdd, crewStashAdd
  - crew-detail.ts Profile + trackers sections per f2-sheet-plan.mdx (name/lair/hunting grounds/reputation/notes editable; rep w/ turf rendering; heat/wanted trackers; hold select; tier +/-; coin/stash)
  - page tests (happy-dom)
  - docs/pages/frontend/f2u-crew-profile-trackers.mdx
acceptance:
  - "client tests red-first then green per method; verified by grep"
  - "menus (hold) from game data; turf fills rep boxes per SRD (decision 5); no hardcoded maxima"
  - "npm test -- --run and npm run build green"
  - "live Ada probe (orchestrator): fields.update, rep/heat/wanted add, hold.set, tier.add, coin/stash add, revision advance"
  - "docs page present and accurate"
---

Per f2-sheet-plan.mdx: Crew Profile→crewFieldsUpdate; Rep/Turf→repAdd; Heat→
heatAdd; Wanted→wantedAdd; Hold→holdSet; Tier→tierAdd; Coin→coinAdd (loose) /
stashAdd (vaults). Contract bodies: fields.update {name?, lair?, reputation?,
huntingGrounds?, notes?}; rep.add {delta}; heat.add {delta}; wanted.add
{delta}; hold.set {hold}; tier.add {delta}; coin.add {delta}; stash.add
{delta}. Crew DTO: name, lair, reputation, huntingGrounds, hold, tier, heat
{current,max}, wanted {current,max}, rep {current,max}, coin, stash, notes.

## Log
- 2026-08-07: filed + dispatched to deepseek-v4-flash-0731.
- 2026-08-07: DONE (frontend). deepseek-v4-flash-0731 child (f2u-crew-profile2;
  first attempt died silently researching SRD turf lore — redispatch pre-answered
  it via plan decision 5). Orchestrator verification: 313/313 tests + build green
  by rerun (278→313 = +24 client +11 page, counts match); docs page 118 lines;
  hold select from contract literal (strong/weak), turf display-only; probe port
  9729 — fields.update/rep/heat/wanted/hold.set work; tier.add/coin.add/stash.add
  (crew) are VALIDATION unknown operation → filed tasks/A11-ada-missing-ops.md
  (also covers cohorts + crew XP + rolodex.remove). Live tier/coin/stash paths
  deferred to A11.
